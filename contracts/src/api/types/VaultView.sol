// SPDX-License-Identifier: MIT
pragma solidity <0.9.0;

/// @title VaultView
/// @notice Vault state handed to each plugin during an execution.
/// @param vault Address of the vault itself, for access to `IVaultViews`.
/// @param configEpoch Current configuration epoch.
/// @param lastExecAt Timestamp of the last execution, or zero.
/// @param candidateLotId Lot suggested for closing.
/// @param baseBalance Vault balance in the declared base currency.
struct VaultView {
    address vault;
    uint64 configEpoch;
    uint64 lastExecAt;
    uint256 candidateLotId;
    uint256 baseBalance;
}
