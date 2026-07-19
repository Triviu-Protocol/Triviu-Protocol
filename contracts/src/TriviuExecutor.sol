// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

/*//////////////////////////////////////////////////////////////////////////
                                 TRIVIU v0.2
      Atomic cycle executor — EDUCATIONAL, PRE-MAINNET, NOT YET AUDITED.
      Use on local forks only, until the external audit clears.
      Whitepaper: /whitepaper · Risk notice: /README.md
//////////////////////////////////////////////////////////////////////////*/

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}

interface IParameterRegistry {
    function isAllowedTarget(address target) external view returns (bool);
    function isAllowedToken(address token) external view returns (bool);
    function feeBps() external view returns (uint16);
    function treasury() external view returns (address);
}

/// @notice Minimal typed router interfaces. The Executor only ever constructs
///         calldata for THESE signatures — never arbitrary bytes (F-02).
interface IUniV2Router {
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);
}

interface IUniV3Router {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        payable
        returns (uint256 amountOut);
}

/// @title  TriviuExecutor
/// @author Triviu Contributors
/// @notice Executes a triangular arbitrage cycle (A→B→C→A) in ONE transaction.
///         Non-custodial: it pulls the principal from the caller at the start,
///         returns principal + net result to the caller at the end, and keeps
///         none of the caller's funds between transactions. If the realized
///         delta is below `principal + minProfit`, the whole transaction
///         reverts — no leg is ever left exposed.
///
///         TYPED SWAP ADAPTERS (v0.2 · F-02): each leg is a TYPED swap on a
///         whitelisted router — UniswapV2-style `swapExactTokensForTokens` or
///         UniswapV3 `exactInputSingle`. The Executor builds the calldata
///         itself from the leg's fields; it never accepts arbitrary bytes, so a
///         whitelisted target can only ever be asked to perform a swap, not an
///         arbitrary call. Legs chain by measured balance: leg N spends exactly
///         what leg N−1 produced, and the cycle must open and close on `asset`.
///
///         BALANCE-DELTA ACCOUNTING (v0.2 · F-01 · Tradeoff Record 0002):
///         profit is measured as `finalBalance − startBalance`. A stray token
///         donation (of any token in the path) is preserved in place and can
///         never trip a cycle — the contract ends every cycle holding EXACTLY
///         what it held before, never the caller's principal or profit.
///
///         REENTRANCY: `executeCycle` is `nonReentrant` (storage-based guard;
///         solc 0.8.24 shanghai target, so no transient storage).
///
///         SUCCESS FEE (whitepaper §5): a percentage of the PROFIT only, never
///         the principal, routed to the Registry treasury in the SAME
///         transaction. No entry fee; a revert or break-even pays nothing.
///         Clamped in bytecode to MAX_FEE_BPS (half of profit).
/// @dev    Decisions in /decisions (0001 Polygon PoS; 0002 balance-delta).
///
///         KNOWN v0.2 LIMITATIONS (honesty > marketing):
///         - Two adapters only (UniV2 / UniV3). Other venues arrive as new
///           typed adapters, never as arbitrary calldata.
///         - No flash-loan support yet (Aave v3 / Balancer: later).
///         - Fee-on-transfer tokens are NOT supported and must not enter the
///           token whitelist (they would break delta accounting).
contract TriviuExecutor {
    /// @notice On-chain parameter registry (whitelists, caps).
    IParameterRegistry public immutable registry;

    /// @notice Hardcoded ceiling on the success fee: 50% of profit (5000 bps).
    uint16 public constant MAX_FEE_BPS = 5000;

    /// @dev Reentrancy guard: 1 = not entered, 2 = entered. Holds no funds.
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;
    uint256 private _status;

    /// @notice Which typed adapter a leg uses.
    enum Dex {
        UniV2,
        UniV3
    }

    /// @notice One leg of the cycle: a typed swap on an allowed router. The
    ///         Executor derives the input amount (principal for the first leg,
    ///         the measured output of the prior leg for the rest), so the leg
    ///         carries no amount — only the route and its per-leg floor.
    struct Leg {
        Dex dex;             // adapter to use
        address router;      // must pass registry.isAllowedTarget
        address tokenIn;     // must equal the prior leg's tokenOut (asset for leg 0)
        address tokenOut;    // must pass registry.isAllowedToken
        uint24 fee;          // UniV3 pool fee tier; ignored for UniV2
        uint256 amountOutMin; // per-leg floor; 0 defers to the final minProfit gate
    }

    error TokenNotAllowed(address token);
    error TargetNotAllowed(address target);
    error NoLegs();
    error CycleNotClosed(address open, address close, address asset);
    error BrokenChain(uint256 index);
    error UnprofitableCycle(uint256 realizedDelta, uint256 required);
    error Reentrancy();
    error TransferFailed(address token);

    /// @notice Emitted on every successful cycle. `profit` is what the caller
    ///         keeps (net of fee); `fee` is what went to the treasury. The
    ///         public dashboard aggregates the reverts too — failures included.
    event CycleExecuted(
        address indexed caller,
        address indexed asset,
        uint256 principal,
        uint256 profit,
        uint256 fee
    );

    constructor(address _registry) {
        registry = IParameterRegistry(_registry);
        _status = _NOT_ENTERED;
    }

    modifier nonReentrant() {
        if (_status == _ENTERED) revert Reentrancy();
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }

    /// @notice Executes the cycle. The caller must have approved `principal`
    ///         of `asset` to this contract before calling.
    /// @param asset      Token A — the cycle opens and closes here.
    /// @param principal  Volume V in token A.
    /// @param minProfit  Minimum profit required (in token A units).
    /// @param legs       Typed cycle legs, in order (a closed A→…→A route).
    function executeCycle(
        address asset,
        uint256 principal,
        uint256 minProfit,
        Leg[] calldata legs
    ) external nonReentrant {
        if (!registry.isAllowedToken(asset)) revert TokenNotAllowed(asset);
        uint256 len = legs.length;
        if (len == 0) revert NoLegs();
        // The cycle MUST open and close on `asset` — no leg can leave value
        // stranded in another token.
        if (legs[0].tokenIn != asset || legs[len - 1].tokenOut != asset) {
            revert CycleNotClosed(legs[0].tokenIn, legs[len - 1].tokenOut, asset);
        }

        // Balance-delta accounting: record the starting balance (may include a
        // donation) and preserve it untouched.
        uint256 startBalance = IERC20(asset).balanceOf(address(this));

        // Pull the principal from the caller (non-custody: this tx only).
        _safeTransferFrom(asset, msg.sender, address(this), principal);

        // Run the legs. `amountIn` chains by MEASURED output, so intermediate
        // donations are never swapped and the input is never over-spent.
        uint256 amountIn = principal;
        for (uint256 i = 0; i < len; ++i) {
            Leg calldata leg = legs[i];
            if (!registry.isAllowedTarget(leg.router)) revert TargetNotAllowed(leg.router);
            if (!registry.isAllowedToken(leg.tokenOut)) revert TokenNotAllowed(leg.tokenOut);
            if (i != 0 && leg.tokenIn != legs[i - 1].tokenOut) revert BrokenChain(i);

            uint256 balBefore = IERC20(leg.tokenOut).balanceOf(address(this));
            _swap(leg, amountIn);
            // Only the swap's own output counts — a donation sitting in tokenOut
            // is excluded, so it stays put and is never fed into the next leg.
            amountIn = IERC20(leg.tokenOut).balanceOf(address(this)) - balBefore;
        }

        // The whitepaper §3 condition on the realized delta, underflow-safe.
        uint256 finalBalance = IERC20(asset).balanceOf(address(this));
        uint256 required = principal + minProfit;
        if (finalBalance < startBalance + required) {
            uint256 realized = finalBalance > startBalance ? finalBalance - startBalance : 0;
            revert UnprofitableCycle(realized, required);
        }

        uint256 delta = finalBalance - startBalance;
        uint256 profit = delta - principal;

        // Success fee — profit only, clamped, routed this transaction.
        uint256 fee = 0;
        address treasury = registry.treasury();
        // treasury == 0 disables the fee; treasury == this would strand the fee
        // and break the balance-preservation invariant, so it also disables it.
        if (treasury != address(0) && treasury != address(this)) {
            uint16 bps = registry.feeBps();
            if (bps > MAX_FEE_BPS) bps = MAX_FEE_BPS;
            fee = (profit * bps) / 10_000;
            if (fee != 0) {
                _safeTransfer(asset, treasury, fee);
            }
        }

        // Return principal + net profit; the contract is left holding exactly
        // `startBalance` (a donation, if any; otherwise zero).
        _safeTransfer(asset, msg.sender, delta - fee);

        emit CycleExecuted(msg.sender, asset, principal, profit - fee, fee);
    }

    /// @dev Builds and sends the typed swap for one leg. The Executor grants an
    ///      exact-amount approval and resets it to zero afterwards, so no
    ///      standing allowance is ever left on a router (also handles tokens
    ///      that require a 0-reset before the next approval).
    function _swap(Leg calldata leg, uint256 amountIn) private {
        _safeApprove(leg.tokenIn, leg.router, amountIn);

        if (leg.dex == Dex.UniV2) {
            address[] memory path = new address[](2);
            path[0] = leg.tokenIn;
            path[1] = leg.tokenOut;
            IUniV2Router(leg.router).swapExactTokensForTokens(
                amountIn, leg.amountOutMin, path, address(this), block.timestamp
            );
        } else {
            IUniV3Router(leg.router).exactInputSingle(
                IUniV3Router.ExactInputSingleParams({
                    tokenIn: leg.tokenIn,
                    tokenOut: leg.tokenOut,
                    fee: leg.fee,
                    recipient: address(this),
                    deadline: block.timestamp,
                    amountIn: amountIn,
                    amountOutMinimum: leg.amountOutMin,
                    sqrtPriceLimitX96: 0
                })
            );
        }

        _safeApprove(leg.tokenIn, leg.router, 0);
    }

    /*//////////////////////////////////////////////////////////////////////
        SafeERC20-style wrappers: tolerate tokens that return no value on
        transfer/approve (USDT-family) as well as standard bool-returning ones,
        and reject a silent failure or a non-contract token.
    //////////////////////////////////////////////////////////////////////*/

    function _safeTransfer(address token, address to, uint256 value) private {
        _callOptionalReturn(token, abi.encodeCall(IERC20.transfer, (to, value)));
    }

    function _safeTransferFrom(address token, address from, address to, uint256 value) private {
        _callOptionalReturn(token, abi.encodeCall(IERC20.transferFrom, (from, to, value)));
    }

    function _safeApprove(address token, address spender, uint256 value) private {
        _callOptionalReturn(token, abi.encodeCall(IERC20.approve, (spender, value)));
    }

    function _callOptionalReturn(address token, bytes memory data) private {
        (bool ok, bytes memory ret) = token.call(data);
        if (!ok) revert TransferFailed(token);
        if (ret.length != 0) {
            if (!abi.decode(ret, (bool))) revert TransferFailed(token);
        } else if (token.code.length == 0) {
            revert TransferFailed(token);
        }
    }

    /*//////////////////////////////////////////////////////////////////////
        TODO before mainnet (each gets its own Tradeoff Record in /decisions):
        - flashExecuteCycle(): capital via Aave v3 / Balancer Vault; gas stays
          on the caller — no profit means revert, only gas is lost.
        - Additional typed adapters (Curve, Balancer) as new Dex variants.
    //////////////////////////////////////////////////////////////////////*/
}
