// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IVaultCustodyEE
/// @notice Errors and events of deposit and withdrawal.
interface IVaultCustodyEE {
    /// @notice The caller is not the vault's owner.
    /// @dev The only withdrawal error: there is no balance check, which reverts in the token itself.
    error NotOwner();

    /// @notice A deposit was recorded.
    /// @dev Direct transfers credit the vault without emitting this event.
    event Deposited(address indexed token, address indexed from, uint256 amount);

    /// @notice A withdrawal was recorded.
    event Withdrawn(address indexed token, address indexed to, uint256 amount);
}
