// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {IVaultExecutionEE} from "../../api/IVaultExecutionEE.sol";

/// @title PluginCall
/// @notice Calls the owner's plugins in read-only mode, with a gas cap and truncated return.
library PluginCall {
    /// @dev Gas cap of one call. The aggregate cap is this value times `MAX_GUARDS + 1`.
    uint256 internal constant GAS_CAP = 300_000;

    /// @dev Gas reserved for the vault, so that it reverts with a typed error.
    uint256 internal constant GAS_BUFFER = 20_000;

    /// @dev Maximum bytes copied from a plugin's return.
    uint256 internal constant MAX_RETURNDATA = 512;

    /// @notice Performs the call and returns the result without interpreting it.
    /// @param plugin Plugin address; code validation happens at configuration.
    /// @param data Already-encoded calldata.
    /// @return ok `false` when the call reverted.
    /// @return ret Returndata, truncated to `MAX_RETURNDATA` bytes.
    function staticcallCapped(address plugin, bytes memory data) internal view returns (bool ok, bytes memory ret) {
        if (gasleft() < (GAS_CAP * 64) / 63 + GAS_BUFFER) revert IVaultExecutionEE.InsufficientGasForPlugin();

        assembly ("memory-safe") {
            ok := staticcall(GAS_CAP, plugin, add(data, 0x20), mload(data), 0, 0)

            let size := returndatasize()
            if gt(size, MAX_RETURNDATA) { size := MAX_RETURNDATA }

            ret := mload(0x40)
            mstore(ret, size)
            returndatacopy(add(ret, 0x20), 0, size)

            // Length plus `size` rounded up to the next multiple of 32: without it the next
            // allocation would start misaligned and the `memory-safe` annotation would be a lie.
            mstore(0x40, add(ret, and(add(size, 0x3f), not(0x1f))))
        }
    }
}
