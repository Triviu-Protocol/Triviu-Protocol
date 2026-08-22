// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script} from "@forge-std/Script.sol";
import {console} from "@forge-std/console.sol";

import {TriviuVault} from "../../../src/vault/TriviuVault.sol";

/// @notice Step 2: allows (or removes) a tradable asset on the vault.
library SetAllowedAssetLib {
    /// @param vault The vault.
    /// @param asset The asset.
    /// @param allowed Whether it becomes tradable.
    function run(TriviuVault vault, address asset, bool allowed) internal {
        if ((vault.assetDecimals(asset) != 0) == allowed) {
            console.log("  asset already set .. ", asset);
            return;
        }

        vault.setAllowedAsset(asset, allowed);
        console.log(allowed ? "  asset allowed ...... " : "  asset removed ...... ", asset);
    }
}

/// @notice `forge script script/user/actions/02_SetAllowedAsset.s.sol --tc SetAllowedAsset --rpc-url polygon --account <alias> --broadcast`
contract SetAllowedAsset is Script {
    function run() external {
        TriviuVault vault = TriviuVault(vm.envAddress("VAULT"));
        address asset = vm.envAddress("ASSET");

        vm.startBroadcast();
        SetAllowedAssetLib.run(vault, asset, true);
        vm.stopBroadcast();
    }
}
