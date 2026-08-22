// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

/// @title IVaultFactoryEE
interface IVaultFactoryEE {
    /// @notice The implementation given in the constructor has no code.
    error ImplementationIsNotAContract();

    /// @notice A vault was created.
    event VaultCreated(address indexed vault, address indexed owner, uint256 indexed index);
}
