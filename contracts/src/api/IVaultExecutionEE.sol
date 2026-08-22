// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity <0.9.0;

/// @title IVaultExecutionEE
interface IVaultExecutionEE {
    /// @notice The caller is not an operator authorized in the global registry.
    error NotOperator();

    /// @notice Execution is paused in the protocol.
    /// @dev The pause does not reach withdrawals.
    error Paused();

    error Reentrancy();

    /// @notice `block.timestamp` is already past `validUntil`.
    error ProposalExpired();

    /// @notice `validUntil` exceeds the window allowed by `Limits.maxValidity()`.
    error ValidityTooLong();

    /// @notice The declared epoch is not the current one.
    error ConfigEpochStale();

    /// @notice The received `executionHash` differs from the one recomputed on-chain.
    error CommitmentMismatch();

    /// @notice `Limits.cooldown()` seconds have not yet passed since the last execution.
    error CooldownActive();

    /// @notice The input amount is below the minimum ticket.
    error TicketTooSmall();

    /// @notice The output/input ratio fell below `Limits.minRatioBps()`.
    error RatioTooLow();

    /// @notice Quantization zeroed `amountIn`.
    error AmountQuantizedToZero();

    /// @notice The call to the strategy reverted, ran out of gas or returned undecodable data.
    error StrategyCallFailed();

    /// @notice A guard vetoed the intent.
    error GuardRejected(address guard, bytes reason);

    /// @notice The available gas does not allow calling the plugin with the required cap.
    error InsufficientGasForPlugin();

    /// @notice The executor declared is not curated by the protocol.
    /// @dev The vault hands it the input amount before the route runs. Without this check the
    ///      submitter would choose who receives the funds.
    error ExecutorNotCurated();

    /// @notice The route target is a forbidden address.
    error ForbiddenTarget();

    /// @notice The route spender is a forbidden address, by the `ForbiddenTarget` list.
    error ForbiddenSpender();

    /// @notice The gross result fell below the floor declared by the submitter.
    error GrossBelowOperatorMin();

    /// @notice The net result fell below `Intent.minOut`.
    error NetBelowStrategyMin();

    /// @notice The balance does not cover `amountIn` plus fee and refund.
    error InsufficientBalanceForFees();
}
