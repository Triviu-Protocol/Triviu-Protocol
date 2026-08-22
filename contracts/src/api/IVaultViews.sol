// SPDX-License-Identifier: MIT
pragma solidity <0.9.0;

import {Limits} from "./types/Limits.sol";
import {Lot} from "./types/Lot.sol";

/// @title IVaultViews
/// @notice Reads a plugin may perform on the vault that is calling it.
interface IVaultViews {
    /// @notice Returns a lot by identifier.
    /// @param lotId Lot identifier.
    /// @return Corresponding lot, open or closed.
    function lot(uint256 lotId) external view returns (Lot memory);

    /// @notice Returns how many lots the vault has opened so far.
    /// @return Total lots created.
    function lotCount() external view returns (uint256);

    /// @notice Returns how much of a lot is backed by balance in the vault.
    /// @param lotId Lot identifier.
    /// @return Lesser of `remaining` and the asset balance.
    function backing(uint256 lotId) external view returns (uint256);

    /// @notice Returns the vault's operational limits.
    /// @return Packed limits; use the `LimitsLib` accessors.
    function limits() external view returns (Limits);

    /// @notice Returns the current configuration epoch.
    /// @return Current epoch.
    /// @dev Increments on every configuration change and invalidates proposals assembled before it.
    function configEpoch() external view returns (uint64);

    /// @notice Returns the timestamp of the last execution.
    /// @return Timestamp, or zero if the vault has never executed.
    function lastExecAt() external view returns (uint64);

    /// @notice Returns the vault's execution nonce.
    /// @return Current nonce.
    function nonce() external view returns (uint64);

    /// @notice Returns the version of this public surface.
    /// @return Interface version.
    function interfaceVersion() external pure returns (uint16);
}
