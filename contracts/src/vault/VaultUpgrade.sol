// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {ERC1967Utils} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Utils.sol";

import {IImplementationRegistry} from "../protocol/interfaces/IImplementationRegistry.sol";

import {IVaultMigration} from "./interfaces/IVaultMigration.sol";
import {IVaultUpgradeEE} from "./interfaces/IVaultUpgradeEE.sol";

/// @title VaultUpgrade
/// @notice Proposes, adopts and cancels implementations, and adopts the `EscapeHatch`.
abstract contract VaultUpgrade is IVaultUpgradeEE {
    /// @dev Longest timelock for loosening the vault's configuration.
    uint64 internal constant LOOSENING_TIMELOCK = 0;

    /// @dev Must exceed any loosening an upgrade could imitate, hence the sum.
    uint64 internal constant UPGRADE_TIMELOCK = LOOSENING_TIMELOCK + 2 days;

    uint64 internal constant UPGRADE_WINDOW = 7 days;

    /// @custom:storage-location erc7201:triviu.storage.VaultUpgrade
    /// @dev `pendingImplementation` at zero means there is no proposal.
    struct VaultUpgradeStorage {
        address pendingImplementation;
        uint64 eta;
    }

    /// @dev ERC-7201 slot of the `triviu.storage.VaultUpgrade` namespace.
    bytes32 private constant VAULT_UPGRADE_STORAGE = 0x507a51b025ea4e2f83dcd59480abba332129fcf02e575636abce8322a611c200;

    function _upgradeStorage() private pure returns (VaultUpgradeStorage storage $) {
        assembly ("memory-safe") {
            $.slot := VAULT_UPGRADE_STORAGE
        }
    }

    /// @notice Returns the pending upgrade proposal.
    /// @return implementation Scheduled implementation, or zero.
    /// @return eta Timestamp from which the adoption becomes executable.
    function _pendingUpgrade() internal view returns (address implementation, uint64 eta) {
        VaultUpgradeStorage storage $ = _upgradeStorage();
        return ($.pendingImplementation, $.eta);
    }

    /// @notice Schedules the adoption of a published implementation.
    /// @param implementation Implementation to adopt.
    /// @dev Proposing over a pending proposal replaces it and restarts the wait.
    function _proposeUpgrade(address implementation) internal {
        if (!_implementationCatalog().isAdoptable(implementation)) revert ImplementationNotAdoptable(implementation);

        uint64 eta = uint64(block.timestamp) + UPGRADE_TIMELOCK;

        VaultUpgradeStorage storage $ = _upgradeStorage();
        $.pendingImplementation = implementation;
        $.eta = eta;

        emit UpgradeProposed(implementation, eta);
    }

    /// @notice Adopts the scheduled implementation and runs the storage migration.
    function _executeUpgrade() internal {
        VaultUpgradeStorage storage $ = _upgradeStorage();

        address implementation = $.pendingImplementation;
        if (implementation == address(0)) revert NoPendingUpgrade();

        uint64 eta = $.eta;
        if (block.timestamp < eta) revert UpgradeNotReady(eta);

        uint64 deadline = eta + UPGRADE_WINDOW;
        if (block.timestamp > deadline) revert UpgradeExpired(deadline);

        if (!_implementationCatalog().isAdoptable(implementation)) revert ImplementationNotAdoptable(implementation);

        $.pendingImplementation = address(0);
        $.eta = 0;

        emit UpgradeExecuted(implementation, _bumpMandateConfigEpoch());

        ERC1967Utils.upgradeToAndCall(implementation, abi.encodeCall(IVaultMigration.migrate, ()));
    }

    /// @notice Cancels the pending upgrade proposal.
    function _cancelUpgrade() internal {
        VaultUpgradeStorage storage $ = _upgradeStorage();

        address implementation = $.pendingImplementation;
        if (implementation == address(0)) revert NoPendingUpgrade();

        $.pendingImplementation = address(0);
        $.eta = 0;

        emit UpgradeCancelled(implementation);
    }

    /// @notice Adopts the `EscapeHatch`, terminating the vault's trading functions.
    /// @dev Irreversible: does not consult the catalog, does not wait for the timelock and does not migrate storage.
    function _adoptEscapeHatch() internal {
        address hatch = _escapeHatch();

        ERC1967Utils.upgradeToAndCall(hatch, "");

        emit EscapeHatchAdopted(hatch);
    }

    function _implementationCatalog() internal view virtual returns (IImplementationRegistry);

    function _escapeHatch() internal view virtual returns (address);

    function _bumpMandateConfigEpoch() internal virtual returns (uint64);
}
