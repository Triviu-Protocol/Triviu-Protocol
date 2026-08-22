// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IGovernedEE
interface IGovernedEE {
    /// @notice The removal would leave the contract without an admin.
    /// @dev Applies to `revokeRole` and `renounceRole`.
    error LastAdmin();

    /// @notice Attempt to grant `DEFAULT_ADMIN_ROLE` to the zero address.
    /// @dev Without this restriction the last-admin guard would be circumventable.
    error AdminIsZero();
}
