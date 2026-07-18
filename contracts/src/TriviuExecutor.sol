// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

/*//////////////////////////////////////////////////////////////////////////
                                 TRIVIU v0
      Atomic cycle executor — EDUCATIONAL SKELETON, NOT AUDITED.
      Use on local forks and testnet (Amoy) only, until external audit.
      Litepaper: /docs/triviu-litepaper-v0.1.md · Risk notice: /README.md
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
///         Non-custodial and stateless: pulls the principal from the caller at
///         the start, returns principal + net result to the caller at the end,
///         and never holds a balance between transactions. If
///         `finalBalance < principal + minProfit`, the whole transaction
///         reverts — no leg is ever left exposed.
///
///         SUCCESS FEE (litepaper §8): when the cycle profits, a fee — a
///         percentage of the PROFIT only, never the principal — is routed to the
///         Registry's treasury in the SAME transaction, and the rest returns to
///         the caller. There is no entry fee; a revert or a break-even cycle
///         pays nothing. The fee rate is a Registry parameter, clamped here to
///         MAX_FEE_BPS so it can never exceed half of profit. If the treasury is
///         unset, the whole result returns to the caller.
/// @dev    This is the contract from litepaper §4.1. Decisions are recorded in
///         /decisions (Record No. 0001: Polygon PoS).
///
///         KNOWN v0 LIMITATIONS (honesty > marketing):
///         - Steps carry arbitrary calldata to Registry-whitelisted targets;
///           safety depends entirely on the curation of that whitelist
///           (typed swap adapters arrive in v0.2).
///         - No flash-loan support yet (Aave v3 / Balancer: v0.2).
///         - Fee-on-transfer tokens are NOT supported and must not enter the
///           token whitelist.
///         - A direct token donation to this contract permanently trips the
///           stateless check for that token (griefing DoS — no sweep function
///           exists in v0). v0.2 moves to balance-delta accounting; the
///           tradeoff is recorded in /decisions/0002-donation-griefing.md and
///           pinned by test_KnownLimitation_DonationTripsStatelessCheck.
contract TriviuExecutor {
    /// @notice On-chain parameter registry (whitelists, caps).
    IParameterRegistry public immutable registry;

    /// @notice Hardcoded ceiling on the success fee: 50% of profit (5000 bps).
    ///         The Registry's feeBps is clamped to this on every use, so a
    ///         compromised or mistaken owner can NEVER take more than half of a
    ///         cycle's profit — verifiable in bytecode, not just in docs.
    uint16 public constant MAX_FEE_BPS = 5000;

    /// @notice One leg of the cycle: a call to an allowed target (router/pool).
    struct Step {
        address target; // must pass registry.isAllowedTarget
        bytes data;     // leg calldata (swap), built off-chain by the engine
    }

    error TokenNotAllowed(address token);
    error TargetNotAllowed(address target);
    error StepFailed(uint256 index);
    error UnprofitableCycle(uint256 finalBalance, uint256 required);
    error NotStateless(uint256 danglingBalance);

    /// @notice Emitted on every successful cycle. `profit` is what the caller
    ///         keeps (net of fee); `fee` is what went to the treasury in the
    ///         same transaction. The public dashboard (Dune) also aggregates the
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
    ) external {
        if (!registry.isAllowedToken(asset)) revert TokenNotAllowed(asset);

        // Stateless invariant: the contract must not carry a prior balance.
        uint256 startBalance = IERC20(asset).balanceOf(address(this));
        if (startBalance != 0) revert NotStateless(startBalance);

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

        // 3. The litepaper §3 condition: close with minimum profit, or revert all.
        uint256 finalBalance = IERC20(asset).balanceOf(address(this));
        uint256 required = principal + minProfit;
        if (finalBalance < required) {
            revert UnprofitableCycle(finalBalance, required);
        }

        // 4. Success fee — charged ONLY on profit, and only when there is profit
        //    (guaranteed here, since finalBalance >= principal + minProfit).
        //    Nothing is charged on reverts or break-even: those never reach here.
        //    The fee is clamped to MAX_FEE_BPS so the Registry can never
        //    over-charge, and it is routed to the treasury in THIS transaction —
        //    the contract keeps no balance afterwards (stateless invariant holds).
        uint256 profit = finalBalance - principal;
        uint256 fee = 0;
        address treasury = registry.treasury();
        // treasury == 0 disables the fee; treasury == this is a misconfiguration
        // that would strand the fee and brick the stateless check, so it also
        // disables the fee rather than trapping funds.
        if (treasury != address(0) && treasury != address(this)) {
            uint16 bps = registry.feeBps();
            if (bps > MAX_FEE_BPS) bps = MAX_FEE_BPS;
            fee = (profit * bps) / 10_000;
            if (fee != 0) {
                require(IERC20(asset).transfer(treasury, fee), "fee transfer failed");
            }
        }

        // 5. Return the rest to the caller — principal + net profit.
        require(IERC20(asset).transfer(msg.sender, finalBalance - fee), "transfer failed");

        emit CycleExecuted(msg.sender, asset, principal, profit - fee, fee);
    }

    /*//////////////////////////////////////////////////////////////////////
        TODO v0.2 (each item gets its own Tradeoff Record in /decisions):
        - flashExecuteCycle(): capital via Aave v3 / Balancer Vault; gas is
          still on the caller — no profit means revert, only gas is lost.
        - Typed per-DEX swap adapters (replacing arbitrary calldata).
        - Explicit per-leg approval management (exact approve + reset).
    //////////////////////////////////////////////////////////////////////*/
}
