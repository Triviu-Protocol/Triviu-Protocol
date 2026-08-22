// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity <0.9.0;

import {VaultView} from "./types/VaultView.sol";
import {Intent} from "./types/Intent.sol";

/// @title IGuard
/// @notice Approves or vetoes the intent proposed for a vault.
interface IGuard {
    /// @notice Evaluates the proposed intent.
    /// @param v Vault state in this block, identical to the one received by the strategy.
    /// @param i Proposed intent, with `amountIn` already quantized.
    /// @dev Run in a `staticcall` with a gas cap, therefore with no state between executions.
    ///      Reverting is the way to veto; the vault wraps the reason in `GuardRejected`.
    function check(VaultView calldata v, Intent calldata i) external view;
}
