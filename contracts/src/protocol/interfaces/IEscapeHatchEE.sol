// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IEscapeHatchEE
interface IEscapeHatchEE {
    /// @notice The caller is not the vault's owner.
    error NotOwner();

    /// @notice A withdrawal was recorded.
    event Withdrawn(address indexed token, address indexed to, uint256 amount);
}
