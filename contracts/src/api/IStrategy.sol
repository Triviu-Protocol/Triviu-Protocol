// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity <0.9.0;

import {VaultView} from "./types/VaultView.sol";
import {Intent} from "./types/Intent.sol";

/// @title IStrategy
interface IStrategy {
    /// @notice Returns the trade intent for the vault's current state.
    /// @param v Vault state in this block.
    /// @return Proposed intent.
    function propose(VaultView calldata v) external view returns (Intent memory);
}
