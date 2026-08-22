// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script} from "@forge-std/Script.sol";
import {console} from "@forge-std/console.sol";

import {TriviuVault} from "../../../src/vault/TriviuVault.sol";
import {Limits, LimitsLib} from "../../../src/api/types/Limits.sol";

/// @notice Step 5: writes the vault's limits, if they are not already these.
library SetLimitsLib {
    /// @param vault The vault.
    /// @param cooldown The minimum interval between executions.
    /// @param maxValidity The maximum validity of an order.
    /// @param minRatioBps The minimum accepted ratio, in basis points.
    /// @param quantum The minimum amount step.
    function run(TriviuVault vault, uint64 cooldown, uint64 maxValidity, uint16 minRatioBps, uint112 quantum) internal {
        Limits target = LimitsLib.pack(cooldown, maxValidity, minRatioBps, quantum);

        if (Limits.unwrap(vault.limits()) == Limits.unwrap(target)) {
            console.log("  limits already set");
            return;
        }

        vault.setLimits(cooldown, maxValidity, minRatioBps, quantum);
        console.log("  limits written ..... cooldown", cooldown);
    }
}

/// @notice `forge script script/user/actions/05_SetLimits.s.sol --tc SetLimits --rpc-url polygon --account <alias> --broadcast`
contract SetLimits is Script {
    function run() external {
        TriviuVault vault = TriviuVault(vm.envAddress("VAULT"));

        uint64 cooldown = uint64(vm.envUint("COOLDOWN"));
        uint64 maxValidity = uint64(vm.envUint("MAX_VALIDITY"));
        // No default on purpose: see the note in `UserFlow.s.sol`.
        uint16 minRatioBps = uint16(vm.envUint("MIN_RATIO_BPS"));
        uint112 quantum = uint112(vm.envOr("QUANTUM", uint256(0)));

        vm.startBroadcast();
        SetLimitsLib.run(vault, cooldown, maxValidity, minRatioBps, quantum);
        vm.stopBroadcast();
    }
}
