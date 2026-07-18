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
}

/// @title  TriviuExecutor
/// @author Triviu Contributors
/// @notice Executes a triangular arbitrage cycle (A→B→C→A) in ONE transaction.
///         Non-custodial and stateless: pulls the principal from the caller at
///         the start, returns principal + result to the caller at the end, and
///         never holds a balance between transactions. If
///         `finalBalance < principal + minProfit`, the whole transaction
///         reverts — no leg is ever left exposed.
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
contract TriviuExecutor {
    /// @notice On-chain parameter registry (whitelists, caps).
    IParameterRegistry public immutable registry;

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

    /// @notice Emitted on every successful cycle. The public dashboard (Dune)
    ///         also aggregates the reverts — failures included, always.
    event CycleExecuted(
        address indexed caller,
        address indexed asset,
        uint256 principal,
        uint256 profit
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

        // 4. Return EVERYTHING to the caller in the same transaction.
        require(IERC20(asset).transfer(msg.sender, finalBalance), "transfer failed");

        emit CycleExecuted(msg.sender, asset, principal, finalBalance - principal);
    }

    /*//////////////////////////////////////////////////////////////////////
        TODO v0.2 (each item gets its own Tradeoff Record in /decisions):
        - flashExecuteCycle(): capital via Aave v3 / Balancer Vault; gas is
          still on the caller — no profit means revert, only gas is lost.
        - Typed per-DEX swap adapters (replacing arbitrary calldata).
        - Explicit per-leg approval management (exact approve + reset).
    //////////////////////////////////////////////////////////////////////*/
}
