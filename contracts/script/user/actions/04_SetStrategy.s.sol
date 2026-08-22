// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {Script} from "@forge-std/Script.sol";
import {console} from "@forge-std/console.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import {TriviuVault} from "../../../src/vault/TriviuVault.sol";
import {Floors} from "../../../src/vault/libraries/Floors.sol";

import {Deployments} from "../../util/Deployments.sol";
import {ExampleStrategy} from "../ExamplePlugins.sol";

/// @notice Step 4: plugs in the declared `Strategy`, or deploys an `ExampleStrategy` when there is none.
library SetStrategyLib {
    /// @notice With no `Strategy` declared and no asset, there is no way to assemble the example one.
    error ExampleAssetIsZero();

    /// @notice The `ExampleStrategy` ticket is below the base currency floor.
    /// @param ticket The requested ticket.
    /// @param floor The `Floors.minTicket` floor.
    error ExampleTicketBelowFloor(uint256 ticket, uint256 floor);

    /// @param vault The vault.
    /// @param declared The user's `Strategy`, or zero to use the example one.
    /// @param asset The `ExampleStrategy` asset.
    /// @param base The `ExampleStrategy` base currency.
    /// @param ticket The `ExampleStrategy` buy size, checked against `Floors.minTicket`.
    /// @param minOutPerTicket The `ExampleStrategy` buy floor for a whole ticket. Zero is refused
    ///        by the strategy's own constructor: it is the only floor the owner controls.
    /// @return plugged The `Strategy` left on the vault.
    function run(
        TriviuVault vault,
        address declared,
        address asset,
        address base,
        uint256 ticket,
        uint256 minOutPerTicket
    ) internal returns (address plugged) {
        address current = vault.strategy();

        if (declared != address(0)) {
            if (current == declared) {
                console.log("  strategy already set ", current);
                return current;
            }

            vault.setStrategy(declared);
            console.log("  strategy plugged ... ", declared);
            return declared;
        }

        if (current != address(0)) {
            console.log("  strategy already set ", current);
            return current;
        }

        if (asset == address(0)) revert ExampleAssetIsZero();

        uint256 floor = Floors.minTicket(IERC20Metadata(base).decimals());
        if (ticket < floor) revert ExampleTicketBelowFloor(ticket, floor);

        plugged = address(new ExampleStrategy(asset, base, ticket, minOutPerTicket));
        vault.setStrategy(plugged);
        console.log("  ExampleStrategy .... ", plugged);
    }
}

/// @notice `forge script script/user/actions/04_SetStrategy.s.sol --tc SetStrategy --rpc-url polygon --account <alias> --broadcast`
contract SetStrategy is Script {
    /// @return The plugged-in `Strategy`.
    function run() external returns (address) {
        TriviuVault vault = TriviuVault(vm.envAddress("VAULT"));
        address declared = vm.envOr("STRATEGY", address(0));
        address base = Deployments.read(block.chainid, "baseCurrency");

        address asset = vm.envOr("ASSET", address(0));
        uint256 ticket = vm.envOr("TICKET", uint256(0));

        // No default: the buy floor is the owner's only defence against a route that returns too
        // little, so it is declared rather than assumed. Only read when the example is assembled.
        uint256 minOutPerTicket = declared == address(0) ? vm.envUint("MIN_OUT_PER_TICKET") : 0;

        vm.startBroadcast();
        address plugged = SetStrategyLib.run(vault, declared, asset, base, ticket, minOutPerTicket);
        vm.stopBroadcast();

        return plugged;
    }
}
