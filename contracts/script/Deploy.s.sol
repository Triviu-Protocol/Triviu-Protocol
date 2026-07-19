// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {ParameterRegistry} from "../src/ParameterRegistry.sol";
import {TriviuExecutor} from "../src/TriviuExecutor.sol";
import {GasTank} from "../src/GasTank.sol";

/// @title  Deploy
/// @notice Deploys ParameterRegistry, then TriviuExecutor pointing at it, then
///         the standalone GasTank. The official path is
///         **local fork → audit → mainnet** — there is no separate public-testnet
///         phase (whitepaper §9 / §14, SECURITY.md). This script never decides
///         the network; the operator's --rpc-url does.
/// @dev    Local fork rehearsal (free mistakes):
///           forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 \
///             --broadcast --private-key $DEPLOYER_KEY
///
///         Mainnet (only after the runbook gates in docs/mainnet-deploy-runbook.md):
///           TRIVIU_OWNER_MULTISIG=0x... TRIVIU_MAINNET_ACK=audit-and-trust-gates-done \
///           forge script script/Deploy.s.sol --rpc-url $POLYGON_RPC \
///             --broadcast --verify --private-key $DEPLOYER_KEY
///
///         Constructor parameters come from the environment (the whitepaper's
///         teaching defaults). The success fee starts DISABLED (no treasury);
///         whitelists start EMPTY. Both are set afterwards, each via a Registry
///         PR that records its own URL on-chain.
///
///         Trust gate (audit laudo): if TRIVIU_OWNER_MULTISIG is set, the script
///         STARTS the two-step ownership handoff; the multisig must then call
///         `acceptOwner()` to finish it. Deploying without it leaves the
///         deployer EOA as owner — flagged loudly, and forbidden on mainnet.
contract Deploy is Script {
    uint256 internal constant POLYGON_MAINNET = 137;

    function run()
        external
        returns (ParameterRegistry registry, TriviuExecutor executor, GasTank gasTank)
    {
        uint256 maxSlippageBps = vm.envOr("TRIVIU_MAX_SLIPPAGE_BPS", uint256(30));
        uint256 defaultMinProfit = vm.envOr("TRIVIU_DEFAULT_MIN_PROFIT", uint256(3.1e15));
        require(maxSlippageBps <= type(uint16).max, "slippage bps out of range");

        address ownerMultisig = vm.envOr("TRIVIU_OWNER_MULTISIG", address(0));

        // Mainnet gate: a real deployment must be explicitly acknowledged AND
        // hand ownership to a multisig from block one — never to a bare EOA.
        if (block.chainid == POLYGON_MAINNET) {
            string memory ack = vm.envOr("TRIVIU_MAINNET_ACK", string(""));
            require(
                keccak256(bytes(ack)) == keccak256("audit-and-trust-gates-done"),
                "mainnet refused: set TRIVIU_MAINNET_ACK=audit-and-trust-gates-done (docs/mainnet-deploy-runbook.md)"
            );
            require(ownerMultisig != address(0), "mainnet refused: TRIVIU_OWNER_MULTISIG must be set");
        }

        vm.startBroadcast();
        registry = new ParameterRegistry(uint16(maxSlippageBps), defaultMinProfit);
        executor = new TriviuExecutor(address(registry));
        gasTank = new GasTank();
        // Start the two-step handoff to the timelocked multisig; it must then
        // call acceptOwner() (a required pre-mainnet trust gate).
        if (ownerMultisig != address(0)) {
            registry.transferOwner(ownerMultisig);
        }
        vm.stopBroadcast();

        console2.log("ParameterRegistry:", address(registry));
        console2.log("TriviuExecutor:  ", address(executor));
        console2.log("GasTank:         ", address(gasTank));
        if (ownerMultisig != address(0)) {
            console2.log("Owner handoff STARTED -> multisig must call acceptOwner():", ownerMultisig);
        } else {
            console2.log("WARNING: owner is the deployer EOA - hand off to the timelocked multisig before mainnet.");
        }
    }
}
