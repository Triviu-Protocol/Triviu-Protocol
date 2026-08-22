// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IVaultMigration
/// @notice Migration contract required of every adoptable implementation.
interface IVaultMigration {
    /// @notice Prepares the vault's storage for the adopted version.
    /// @dev Run exactly once per vault, via `delegatecall`, under `reinitializer`. A version
    ///      without migration exposes an empty body; without the method, `executeUpgrade` reverts.
    function migrate() external;
}
