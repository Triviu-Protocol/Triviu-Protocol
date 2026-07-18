// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {ParameterRegistry} from "../src/ParameterRegistry.sol";
import {TriviuExecutor} from "../src/TriviuExecutor.sol";

/// @title  Deploy
/// @notice Deploys ParameterRegistry, then TriviuExecutor pointing at it.
///         The official path is fork → testnet (Amoy) → audit → mainnet
///         (sim/README.md, SECURITY.md) — this script never decides the
///         network; the operator's --rpc-url does.
/// @dev    Local fork rehearsal (free mistakes):
///           forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 \
///             --broadcast --private-key $DEPLOYER_KEY
///         Testnet (Amoy), then verify both contracts on Polygonscan (§16.2):
///           forge script script/Deploy.s.sol --rpc-url $AMOY_RPC \
///             --broadcast --private-key $DEPLOYER_KEY
///         Constructor parameters come from the environment, with the
///         litepaper's teaching defaults.
contract Deploy is Script {
    function run() external returns (ParameterRegistry registry, TriviuExecutor executor) {
        uint256 maxSlippageBps = vm.envOr("TRIVIU_MAX_SLIPPAGE_BPS", uint256(30));
        uint256 defaultMinProfit = vm.envOr("TRIVIU_DEFAULT_MIN_PROFIT", uint256(3.1e15));
        require(maxSlippageBps <= type(uint16).max, "slippage bps out of range");

        vm.startBroadcast();
        registry = new ParameterRegistry(uint16(maxSlippageBps), defaultMinProfit);
        executor = new TriviuExecutor(address(registry));
        vm.stopBroadcast();
    }
}
