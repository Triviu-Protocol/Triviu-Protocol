// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {Script} from "@forge-std/Script.sol";
import {console} from "@forge-std/console.sol";

import {TriviuVault} from "../../../src/vault/TriviuVault.sol";

import {Deployments} from "../../util/Deployments.sol";

/// @notice Step 3: enables (or disables) the vault's base currency.
library SetBaseCurrencyLib {
    /// @param vault The vault.
    /// @param token The base currency.
    /// @param enabled Whether it becomes accepted.
    function run(TriviuVault vault, address token, bool enabled) internal {
        if ((vault.baseCurrencyDecimals(token) != 0) == enabled) {
            console.log("  base already set ... ", token);
            return;
        }

        vault.setBaseCurrency(token, enabled);
        console.log(enabled ? "  base enabled ....... " : "  base disabled ...... ", token);
    }
}

/// @notice `forge script script/user/actions/03_SetBaseCurrency.s.sol --tc SetBaseCurrency --rpc-url polygon --account <alias> --broadcast`
contract SetBaseCurrency is Script {
    function run() external {
        TriviuVault vault = TriviuVault(vm.envAddress("VAULT"));
        address base = Deployments.read(block.chainid, "baseCurrency");

        vm.startBroadcast();
        SetBaseCurrencyLib.run(vault, base, true);
        vm.stopBroadcast();
    }
}
