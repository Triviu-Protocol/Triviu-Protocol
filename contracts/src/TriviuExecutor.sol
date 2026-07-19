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
}

interface IParameterRegistry {
    function isAllowedTarget(address target) external view returns (bool);
    function isAllowedToken(address token) external view returns (bool);
    function feeBps() external view returns (uint16);
    function treasury() external view returns (address);
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
///         BALANCE-DELTA ACCOUNTING (v0.2 · Tradeoff Record 0002): profit is
///         measured as `finalBalance − startBalance`, not against a hardcoded
///         zero. A stray token donation to this contract is preserved in place
///         and can no longer trip a cycle — the v0 donation-griefing DoS is
///         closed. The contract ends every cycle holding EXACTLY what it held
///         before it (a donation, if any; otherwise zero) — never the caller's
///         principal or profit.
///
///         REENTRANCY: `executeCycle` is `nonReentrant`. v0 relied on the
///         strict `balanceOf(this) == 0` entry check as an implicit guard;
///         balance-delta accounting removes that check, so an explicit
///         storage-based guard replaces it. The guard slot is the only
///         persistent storage that changes at runtime and holds no funds.
///
///         SUCCESS FEE (whitepaper §5): when the cycle profits, a fee — a
///         percentage of the PROFIT only, never the principal — is routed to
///         the Registry's treasury in the SAME transaction, and the rest
///         returns to the caller. No entry fee; a revert or break-even cycle
///         pays nothing. The fee rate is a Registry parameter, clamped here to
///         MAX_FEE_BPS so it can never exceed half of profit. If the treasury
///         is unset, the whole result returns to the caller.
/// @dev    This is the contract from whitepaper §4.1. Decisions are recorded in
///         /decisions (Record 0001: Polygon PoS; Record 0002: balance-delta).
///
///         KNOWN v0.2 LIMITATIONS (honesty > marketing):
///         - Steps carry arbitrary calldata to Registry-whitelisted targets;
///           safety depends on the curation of that whitelist. Typed per-DEX
///           swap adapters (F-02) land next and are gated before mainnet.
///         - No flash-loan support yet (Aave v3 / Balancer: later).
///         - Fee-on-transfer tokens are NOT supported and must not enter the
///           token whitelist (they would break delta accounting).
contract TriviuExecutor {
    /// @notice On-chain parameter registry (whitelists, caps).
    IParameterRegistry public immutable registry;

    /// @notice Hardcoded ceiling on the success fee: 50% of profit (5000 bps).
    ///         The Registry's feeBps is clamped to this on every use, so a
    ///         compromised or mistaken owner can NEVER take more than half of a
    ///         cycle's profit — verifiable in bytecode, not just in docs.
    uint16 public constant MAX_FEE_BPS = 5000;

    /// @dev Reentrancy guard states. 1 = not entered, 2 = entered. Kept at 1
    ///      between transactions; holds no funds and does not affect the
    ///      non-custody claim.
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;
    uint256 private _status;

    /// @notice One leg of the cycle: a call to an allowed target (router/pool).
    struct Step {
        address target; // must pass registry.isAllowedTarget
        bytes data;     // leg calldata (swap), built off-chain by the engine
    }

    error TokenNotAllowed(address token);
    error TargetNotAllowed(address target);
    error StepFailed(uint256 index);
    error UnprofitableCycle(uint256 realizedDelta, uint256 required);
    error Reentrancy();

    /// @notice Emitted on every successful cycle. `profit` is what the caller
    ///         keeps (net of fee); `fee` is what went to the treasury in the
    ///         same transaction. The public dashboard also aggregates the
    ///         reverts — failures included, always.
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

    /// @dev Storage-based reentrancy guard (no transient storage: keeps the
    ///      contract portable across EVM versions, since foundry.toml pins
    ///      solc 0.8.24 without an explicit cancun target).
    modifier nonReentrant() {
        if (_status == _ENTERED) revert Reentrancy();
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }

    /// @notice Executes the cycle. The caller must have approved `principal`
    ///         of `asset` to this contract before calling.
    /// @param asset      Token A — start and end of the cycle.
    /// @param principal  Volume V in token A.
    /// @param minProfit  Minimum profit required (in token A units).
    /// @param steps      Cycle legs, in order (typically 3).
    function executeCycle(
        address asset,
        uint256 principal,
        uint256 minProfit,
        Step[] calldata steps
    ) external nonReentrant {
        if (!registry.isAllowedToken(asset)) revert TokenNotAllowed(asset);

        // Balance-delta accounting: record the starting balance. It may be
        // non-zero (a donation); the cycle is measured relative to it, and it
        // is preserved untouched — never returned to the caller.
        uint256 startBalance = IERC20(asset).balanceOf(address(this));

        // 1. Pull the principal from the caller (non-custody: this tx only).
        require(
            IERC20(asset).transferFrom(msg.sender, address(this), principal),
            "transferFrom failed"
        );

        // 2. Execute the legs — Registry-allowed targets only.
        uint256 len = steps.length;
        for (uint256 i = 0; i < len; ++i) {
            address target = steps[i].target;
            if (!registry.isAllowedTarget(target)) revert TargetNotAllowed(target);
            (bool ok, ) = target.call(steps[i].data);
            if (!ok) revert StepFailed(i);
        }

        // 3. The whitepaper §3 condition: the realized delta must cover
        //    principal + minProfit, or the whole transaction reverts. Written
        //    as finalBalance >= startBalance + required to rule out an
        //    underflow if the cycle ever LOST funds (loss → revert all).
        uint256 finalBalance = IERC20(asset).balanceOf(address(this));
        uint256 required = principal + minProfit;
        if (finalBalance < startBalance + required) {
            uint256 realized = finalBalance > startBalance ? finalBalance - startBalance : 0;
            revert UnprofitableCycle(realized, required);
        }

        // delta = principal + gross profit; both subtractions are now safe.
        uint256 delta = finalBalance - startBalance;
        uint256 profit = delta - principal;

        // 4. Success fee — charged ONLY on profit, and only when there is
        //    profit. Clamped to MAX_FEE_BPS and routed to the treasury in THIS
        //    transaction. Nothing is charged on reverts or break-even.
        uint256 fee = 0;
        address treasury = registry.treasury();
        // treasury == 0 disables the fee; treasury == this would strand the fee
        // inside the executor and break the balance-preservation invariant, so
        // it also disables the fee rather than trapping funds.
        if (treasury != address(0) && treasury != address(this)) {
            uint16 bps = registry.feeBps();
            if (bps > MAX_FEE_BPS) bps = MAX_FEE_BPS;
            fee = (profit * bps) / 10_000;
            if (fee != 0) {
                require(IERC20(asset).transfer(treasury, fee), "fee transfer failed");
            }
        }

        // 5. Return principal + net profit to the caller. Exactly `delta` leaves
        //    the contract (fee + caller share), so it is left holding precisely
        //    `startBalance` — the donation, if any; otherwise zero.
        require(IERC20(asset).transfer(msg.sender, delta - fee), "transfer failed");

        emit CycleExecuted(msg.sender, asset, principal, profit - fee, fee);
    }

    /*//////////////////////////////////////////////////////////////////////
        TODO before mainnet (each gets its own Tradeoff Record in /decisions):
        - F-02: typed per-DEX swap adapters, replacing arbitrary step calldata.
        - flashExecuteCycle(): capital via Aave v3 / Balancer Vault; gas stays
          on the caller — no profit means revert, only gas is lost.
    //////////////////////////////////////////////////////////////////////*/
}
