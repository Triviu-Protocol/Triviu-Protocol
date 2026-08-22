// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script} from "@forge-std/Script.sol";
import {VmSafe} from "@forge-std/Vm.sol";
import {console} from "@forge-std/console.sol";

import {TriviuVault} from "../../../src/vault/TriviuVault.sol";
import {VaultFactory} from "../../../src/protocol/VaultFactory.sol";

import {Deployments} from "../../util/Deployments.sol";

/// @notice Step 1: creates the vault through the factory, or reuses the one already at the predicted address.
library CreateVaultLib {
    /// @param factory The protocol factory.
    /// @param owner The owner of the vault.
    /// @param index The index of the vault for this owner.
    /// @return vault The vault, created now or already existing.
    function run(VaultFactory factory, address owner, uint256 index) internal returns (TriviuVault vault) {
        address predicted = factory.vaultAddress(owner, index);

        if (predicted.code.length != 0) {
            console.log("  vault exists ....... ", predicted);
            return TriviuVault(predicted);
        }

        vault = TriviuVault(factory.createVault(owner, index));
        console.log("  vault created ...... ", address(vault));
    }
}

/// @notice `forge script script/user/actions/01_CreateVault.s.sol --tc CreateVault --rpc-url polygon --account <alias> --broadcast`
contract CreateVault is Script {
    /// @return The address of the vault.
    function run() external returns (address) {
        VaultFactory factory = VaultFactory(Deployments.read(block.chainid, "factory"));
        uint256 index = vm.envOr("VAULT_INDEX", uint256(0));
        address owner = msg.sender;

        vm.startBroadcast();
        TriviuVault vault = CreateVaultLib.run(factory, owner, index);
        vm.stopBroadcast();

        if (_isRealRun()) Deployments.saveVault(block.chainid, owner, index, address(vault));

        return address(vault);
    }

    /// @return Whether the run touches the chain, and is not a dry run.
    function _isRealRun() private view returns (bool) {
        return vm.isContext(VmSafe.ForgeContext.ScriptBroadcast) || vm.isContext(VmSafe.ForgeContext.ScriptResume);
    }
}
