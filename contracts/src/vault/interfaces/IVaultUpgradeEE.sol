// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

/// @title IVaultUpgradeEE
/// @notice Errors and events of a vault's upgrade flow.
interface IVaultUpgradeEE {
    /// @notice The implementation is not published, or has already been deprecated.
    /// @dev Checked at proposal and again at adoption.
    error ImplementationNotAdoptable(address implementation);

    /// @notice There is no pending proposal.
    error NoPendingUpgrade();

    /// @notice The `EscapeHatch` given at deploy has no code.
    error EscapeHatchIsNotAContract();

    /// @notice The timelock has not yet elapsed.
    error UpgradeNotReady(uint64 eta);

    /// @notice The proposal's validity window has expired.
    error UpgradeExpired(uint64 deadline);

    /// @notice An adoption was scheduled.
    event UpgradeProposed(address indexed implementation, uint64 eta);

    /// @notice The vault changed implementation.
    /// @dev Carries the resulting `configEpoch`, since the upgrade invalidates in-flight proposals.
    event UpgradeExecuted(address indexed implementation, uint64 epoch);

    /// @notice A pending proposal was cancelled.
    event UpgradeCancelled(address indexed implementation);

    /// @notice The vault adopted the `EscapeHatch`.
    /// @dev Dedicated event, to distinguish the terminal adoption from an ordinary upgrade.
    event EscapeHatchAdopted(address indexed escapeHatch);
}
