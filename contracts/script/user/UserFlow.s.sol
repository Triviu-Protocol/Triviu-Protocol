// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script} from "@forge-std/Script.sol";
import {VmSafe} from "@forge-std/Vm.sol";
import {console} from "@forge-std/console.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {TriviuVault} from "../../src/vault/TriviuVault.sol";
import {VaultFactory} from "../../src/protocol/VaultFactory.sol";
import {IProtocolRegistry} from "../../src/protocol/interfaces/IProtocolRegistry.sol";

import {CreateVaultLib} from "./actions/01_CreateVault.s.sol";
import {SetAllowedAssetLib} from "./actions/02_SetAllowedAsset.s.sol";
import {SetBaseCurrencyLib} from "./actions/03_SetBaseCurrency.s.sol";
import {SetStrategyLib} from "./actions/04_SetStrategy.s.sol";
import {SetLimitsLib} from "./actions/05_SetLimits.s.sol";
import {AddGuardLib} from "./actions/06_AddGuard.s.sol";
import {DepositLib} from "./actions/08_Deposit.s.sol";
import {Deployments} from "../util/Deployments.sol";

/// @notice The onboarding parameters, already resolved.
struct UserConfig {
    address owner;
    uint256 index;
    address asset;
    uint256 ticket;
    uint256 minOutPerTicket;
    address strategy;
    address guard;
    uint64 cooldown;
    uint64 maxValidity;
    uint16 minRatioBps;
    uint112 quantum;
    uint256 depositAmount;
}

/// @title UserFlow
/// @notice The whole onboarding in one run: creates the vault, configures, approves and deposits.
///         `forge script script/user/UserFlow.s.sol --tc UserFlow --rpc-url polygon --account <alias> --broadcast --slow`
contract UserFlow is Script {
    /// @notice Runs the onboarding reading everything from the `.env`, and records the created vault.
    /// @return The address of the ready vault.
    function run() external returns (address) {
        UserConfig memory config = UserConfig({
            owner: msg.sender,
            index: vm.envOr("VAULT_INDEX", uint256(0)),
            asset: vm.envAddress("ASSET"),
            ticket: vm.envOr("TICKET", uint256(0)),
            // No default: this is the buy floor, and on a buy it is the only floor the owner
            // controls. Read only when the example strategy is the one being assembled.
            minOutPerTicket: vm.envOr("STRATEGY", address(0)) == address(0) ? vm.envUint("MIN_OUT_PER_TICKET") : 0,
            strategy: vm.envOr("STRATEGY", address(0)),
            guard: vm.envOr("GUARD", address(0)),
            cooldown: uint64(vm.envUint("COOLDOWN")),
            maxValidity: uint64(vm.envUint("MAX_VALIDITY")),
            // No default on purpose: zero disables the ratio floor, and that has to be a decision
            // the owner types, not one the script makes for them. `MIN_RATIO_BPS=0` is a valid
            // answer when the strategy declares its own `minOut`, which the example one now does.
            minRatioBps: uint16(vm.envUint("MIN_RATIO_BPS")),
            quantum: uint112(vm.envOr("QUANTUM", uint256(0))),
            depositAmount: vm.envUint("DEPOSIT_AMOUNT")
        });

        vm.startBroadcast();
        TriviuVault vault = flow(config);
        vm.stopBroadcast();

        if (vm.isContext(VmSafe.ForgeContext.ScriptBroadcast) || vm.isContext(VmSafe.ForgeContext.ScriptResume)) {
            Deployments.saveVault(block.chainid, config.owner, config.index, address(vault));
        }

        console.log("");
        console.log("vault ready .......... ", address(vault));

        return address(vault);
    }

    /// @notice The onboarding with the configuration ready, without broadcast.
    /// @param config The onboarding parameters.
    /// @return vault The configured and funded vault.
    function flow(UserConfig memory config) public returns (TriviuVault vault) {
        VaultFactory factory = VaultFactory(Deployments.read(block.chainid, "factory"));
        IERC20 base = IERC20(Deployments.read(block.chainid, "baseCurrency"));
        uint16 feeBps = IProtocolRegistry(Deployments.read(block.chainid, "protocolRegistry")).feeBps();

        vault = CreateVaultLib.run(factory, config.owner, config.index);

        SetAllowedAssetLib.run(vault, config.asset, true);
        SetBaseCurrencyLib.run(vault, address(base), true);
        SetStrategyLib.run(vault, config.strategy, config.asset, address(base), config.ticket, config.minOutPerTicket);
        SetLimitsLib.run(vault, config.cooldown, config.maxValidity, config.minRatioBps, config.quantum);

        if (config.guard != address(0)) AddGuardLib.run(vault, config.guard);

        DepositLib.run(vault, base, config.owner, config.depositAmount, config.ticket, feeBps);
    }
}
