// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

/// @title IImplementationRegistryEE
interface IImplementationRegistryEE {
    /// @notice An implementation was published.
    event ImplementationPublished(address indexed implementation);

    /// @notice An implementation was deprecated.
    /// @dev Blocks future adoptions and does not affect existing vaults.
    event ImplementationDeprecated(address indexed implementation);

    /// @notice The address is already published.
    error AlreadyPublished(address implementation);

    /// @notice The address has already been deprecated.
    error AlreadyDeprecated(address implementation);

    /// @notice Only published implementations may be deprecated.
    error NotPublished(address implementation);

    /// @notice The address has no code.
    /// @dev Prevents publishing an empty address, whose adoption would leave the vault inoperable.
    error NotAContract(address implementation);
}
