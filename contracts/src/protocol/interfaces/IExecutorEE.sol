// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

/// @title IExecutorEE
interface IExecutorEE {
    /// @notice An execution tried to nest inside another.
    error Reentrancy();

    /// @notice Allowance remained after the route ran.
    error AllowanceNotCleared();

    /// @notice The executor's balance did not return to the baseline.
    error BalanceDeltaNonZero();
}
