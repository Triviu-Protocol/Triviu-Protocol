// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IVaultFactory
interface IVaultFactory {
    /// @notice Creates a vault with the owner already set.
    /// @param owner Initial owner.
    /// @param index Index of the owner's mandate.
    /// @return vault Address of the created vault.
    function createVault(address owner, uint256 index) external returns (address vault);

    /// @notice Computes the address of a vault before creating it.
    /// @param owner Initial owner.
    /// @param index Mandate index.
    /// @return Predicted address.
    function vaultAddress(address owner, uint256 index) external view returns (address);

    /// @notice Returns the implementation used by this factory's vaults.
    /// @return Implementation address.
    function IMPLEMENTATION() external view returns (address);
}
