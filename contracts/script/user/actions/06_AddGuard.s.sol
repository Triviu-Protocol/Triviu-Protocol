// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {Script} from "@forge-std/Script.sol";
import {console} from "@forge-std/console.sol";

import {TriviuVault} from "../../../src/vault/TriviuVault.sol";

import {ExampleFullBackingGuard} from "../ExamplePlugins.sol";

/// @notice Step 6: plugs in the declared `Guard`, or deploys an `ExampleFullBackingGuard` when there is none.
library AddGuardLib {
    /// @param vault The vault.
    /// @param declared The user's `Guard`, or zero to use the example one.
    /// @return plugged The `Guard` left on the vault.
    function run(TriviuVault vault, address declared) internal returns (address plugged) {
        address[] memory current = vault.guards();

        if (declared != address(0)) {
            for (uint256 i = 0; i < current.length; i++) {
                if (current[i] == declared) {
                    console.log("  guard already set .. ", declared);
                    return declared;
                }
            }

            vault.addGuard(declared);
            console.log("  guard plugged ...... ", declared);
            return declared;
        }

        if (current.length != 0) {
            console.log("  guard already set .. ", current[0]);
            return current[0];
        }

        plugged = address(new ExampleFullBackingGuard());
        vault.addGuard(plugged);
        console.log("  ExampleGuard ....... ", plugged);
    }
}

/// @notice `forge script script/user/actions/06_AddGuard.s.sol --tc AddGuard --rpc-url polygon --account <alias> --broadcast`
contract AddGuard is Script {
    /// @return The plugged-in `Guard`.
    function run() external returns (address) {
        TriviuVault vault = TriviuVault(vm.envAddress("VAULT"));
        address declared = vm.envOr("GUARD", address(0));

        vm.startBroadcast();
        address plugged = AddGuardLib.run(vault, declared);
        vm.stopBroadcast();

        return plugged;
    }
}
