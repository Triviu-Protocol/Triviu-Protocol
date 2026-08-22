// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script} from "@forge-std/Script.sol";
import {VmSafe} from "@forge-std/Vm.sol";
import {console} from "@forge-std/console.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import {TriviuVault} from "../src/vault/TriviuVault.sol";
import {VaultFactory} from "../src/protocol/VaultFactory.sol";
import {EscapeHatch} from "../src/protocol/EscapeHatch.sol";
import {Executor} from "../src/protocol/Executor.sol";
import {ImplementationRegistry} from "../src/protocol/ImplementationRegistry.sol";
import {ProtocolRegistry} from "../src/protocol/ProtocolRegistry.sol";

import {Deployments} from "./util/Deployments.sol";

/// @notice Everything the genesis needs to know, and nothing that can be derived.
struct Config {
    address deployer;
    address governance;
    address treasury;
    address operator;
    address baseToken;
    uint16 feeBps;
}

/// @notice The six genesis contracts, in the order they are born.
struct Deployment {
    EscapeHatch escapeHatch;
    Executor executor;
    ProtocolRegistry registry;
    ImplementationRegistry implRegistry;
    TriviuVault implementation;
    VaultFactory factory;
}

/// @title Deploy
/// @notice The protocol genesis, in one run: the six contracts, the three acts of curation, and the
///         handover of `DEFAULT_ADMIN_ROLE` to whoever will actually govern.
contract Deploy is Script {
    /// @notice The deployer is forge's default sender, i.e. `--account` was forgotten.
    error DeployerIsTheDefaultSender();

    /// @notice `GOVERNANCE` is the zero address.
    error GovernanceIsZero();

    /// @notice `GOVERNANCE` is the deployer, and the renouncement of the last admin would revert with `LastAdmin`.
    error GovernanceIsTheDeployer();

    /// @notice `TREASURY` is the zero address.
    error TreasuryIsZero();

    /// @notice `OPERATOR` is the zero address.
    error OperatorIsZero();

    /// @notice The operator key holds another role; the hot key must stand alone.
    /// @param other The role it collides with.
    error OperatorCollidesWith(address other);

    /// @notice `BASE_TOKEN` has no code on this chain.
    /// @param token The address provided.
    error BaseTokenIsNotAContract(address token);

    /// @notice The base currency has a different scale, which would recalibrate the refund ceiling.
    /// @param got The decimals read from the token.
    /// @param want The decimals the genesis requires.
    error BaseTokenHasWrongDecimals(uint8 got, uint8 want);

    /// @notice `FEE_BPS` exceeds what the registry constructor would accept.
    /// @param got The fee provided.
    /// @param cap The maximum accepted.
    error FeeAboveCap(uint16 got, uint16 cap);

    /// @notice A registry finished the run with a number of admins other than one.
    /// @param registry The registry checked.
    /// @param count The count read.
    error AdminCountIsNotOne(address registry, uint256 count);

    /// @notice Governance did not receive the `DEFAULT_ADMIN_ROLE`.
    /// @param registry The registry checked.
    error GovernanceIsNotAdmin(address registry);

    /// @notice The deployer still holds the `DEFAULT_ADMIN_ROLE`.
    /// @param registry The registry checked.
    error DeployerStillHasAdmin(address registry);

    /// @notice The implementation points at another escape hatch, i.e. the constructor received
    ///         the arguments in the wrong order.
    /// @param got The hatch wired to the implementation.
    /// @param want The freshly deployed hatch.
    error EscapeHatchNotWired(address got, address want);

    /// @notice The decimals the genesis base currency must have: the refund ceiling in `Fees` is
    ///         one whole unit, and a different scale would silently recalibrate it.
    uint8 internal constant BASE_DECIMALS = 6;

    /// @notice Copy of `FEE_BPS_MAX` from `ProtocolRegistry`, which is only readable per instance — and here
    ///         the instance does not exist yet. `DeployTest.test_theFeeCapCopyMatchesTheRegistry` ties the two together.
    uint16 public constant FEE_BPS_MAX = 100;

    /// @notice Reads the `.env`, validates, deploys and hands over the admin.
    ///         `forge script script/01_Deploy.s.sol --tc Deploy --rpc-url polygon --account <alias> --broadcast --slow`
    /// @return The six genesis addresses.
    function run() external returns (Deployment memory) {
        Config memory config = Config({
            deployer: msg.sender,
            governance: vm.envAddress("GOVERNANCE"),
            treasury: vm.envAddress("TREASURY"),
            operator: vm.envAddress("OPERATOR"),
            baseToken: vm.envAddress("BASE_TOKEN"),
            feeBps: uint16(vm.envUint("FEE_BPS"))
        });

        validate(config);

        vm.startBroadcast(config.deployer);
        Deployment memory deployment = deploy(config);
        vm.stopBroadcast();

        _assertHandover(deployment, config);
        _save(deployment, config);
        _report(deployment, config);

        return deployment;
    }

    /// @notice Writes `deployments/{chainId}.json`, and only when this was a real broadcast.
    /// @param deployment The six genesis addresses.
    /// @param config The configuration, from which the base currency comes.
    function _save(Deployment memory deployment, Config memory config) internal {
        if (!vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) return;

        Deployments.save(block.chainid, records(deployment, config));
    }

    /// @notice The genesis record as it goes to disk: each address with the key under which the
    ///         actions in `script/user/` will look it up.
    /// @param deployment The six genesis addresses.
    /// @param config The configuration, from which the base currency comes.
    /// @return rs The six contracts, in the order they are born, plus the curated base currency.
    function records(Deployment memory deployment, Config memory config)
        public
        pure
        returns (Deployments.Record[] memory rs)
    {
        rs = new Deployments.Record[](7);
        rs[0] = Deployments.Record("escapeHatch", address(deployment.escapeHatch));
        rs[1] = Deployments.Record("executor", address(deployment.executor));
        rs[2] = Deployments.Record("protocolRegistry", address(deployment.registry));
        rs[3] = Deployments.Record("implementationRegistry", address(deployment.implRegistry));
        rs[4] = Deployments.Record("implementation", address(deployment.implementation));
        rs[5] = Deployments.Record("factory", address(deployment.factory));
        rs[6] = Deployments.Record("baseCurrency", config.baseToken);
    }

    /// @notice Refuses a config before it costs gas.
    /// @param config The genesis configuration.
    function validate(Config memory config) public view {
        if (config.deployer == DEFAULT_SENDER) revert DeployerIsTheDefaultSender();

        if (config.governance == address(0)) revert GovernanceIsZero();
        if (config.governance == config.deployer) revert GovernanceIsTheDeployer();
        if (config.treasury == address(0)) revert TreasuryIsZero();

        if (config.operator == address(0)) revert OperatorIsZero();
        if (config.operator == config.deployer) revert OperatorCollidesWith(config.deployer);
        if (config.operator == config.governance) revert OperatorCollidesWith(config.governance);

        if (config.baseToken.code.length == 0) revert BaseTokenIsNotAContract(config.baseToken);
        uint8 decimals = IERC20Metadata(config.baseToken).decimals();
        if (decimals != BASE_DECIMALS) revert BaseTokenHasWrongDecimals(decimals, BASE_DECIMALS);

        if (config.feeBps > FEE_BPS_MAX) revert FeeAboveCap(config.feeBps, FEE_BPS_MAX);
    }

    /// @notice Deploys the genesis and hands over the admin, with the current sender as deployer.
    /// @param config The already-validated configuration.
    /// @return deployment The six addresses.
    function deploy(Config memory config) public returns (Deployment memory deployment) {
        deployment.escapeHatch = new EscapeHatch();
        deployment.executor = new Executor();

        deployment.registry = new ProtocolRegistry(config.deployer, config.treasury, config.feeBps);
        deployment.implRegistry = new ImplementationRegistry(config.deployer);

        deployment.implementation =
            new TriviuVault(deployment.registry, deployment.implRegistry, address(deployment.escapeHatch));

        deployment.factory = new VaultFactory(address(deployment.implementation));

        deployment.implRegistry.publish(address(deployment.implementation));
        deployment.registry.setBaseCurrency(config.baseToken, true);
        deployment.registry.setExecutor(address(deployment.executor), true);
        deployment.registry.grantRole(deployment.registry.OPERATOR_ROLE(), config.operator);

        _handOverAdmin(deployment.registry, config);
        _handOverAdmin(deployment.implRegistry, config);
    }

    /// @param governed The registry changing owner.
    /// @param config The genesis configuration.
    function _handOverAdmin(ProtocolRegistry governed, Config memory config) private {
        bytes32 adminRole = governed.DEFAULT_ADMIN_ROLE();
        governed.grantRole(adminRole, config.governance);
        governed.renounceRole(adminRole, config.deployer);
    }

    /// @param governed The catalog.
    /// @param config The genesis configuration.
    function _handOverAdmin(ImplementationRegistry governed, Config memory config) private {
        bytes32 adminRole = governed.DEFAULT_ADMIN_ROLE();
        governed.grantRole(adminRole, config.governance);
        governed.renounceRole(adminRole, config.deployer);
    }

    /// @notice Asserts that the handover happened in full, on both registries.
    /// @param deployment The six addresses.
    /// @param config The genesis configuration.
    function _assertHandover(Deployment memory deployment, Config memory config) internal view {
        _assertSingleAdmin(address(deployment.registry), deployment.registry.adminCount());
        _assertSingleAdmin(address(deployment.implRegistry), deployment.implRegistry.adminCount());

        bytes32 adminRole = deployment.registry.DEFAULT_ADMIN_ROLE();

        if (!deployment.registry.hasRole(adminRole, config.governance)) {
            revert GovernanceIsNotAdmin(address(deployment.registry));
        }
        if (deployment.registry.hasRole(adminRole, config.deployer)) {
            revert DeployerStillHasAdmin(address(deployment.registry));
        }
        if (!deployment.implRegistry.hasRole(adminRole, config.governance)) {
            revert GovernanceIsNotAdmin(address(deployment.implRegistry));
        }
        if (deployment.implRegistry.hasRole(adminRole, config.deployer)) {
            revert DeployerStillHasAdmin(address(deployment.implRegistry));
        }

        address wired = deployment.implementation.ESCAPE_HATCH();
        if (wired != address(deployment.escapeHatch)) {
            revert EscapeHatchNotWired(wired, address(deployment.escapeHatch));
        }
    }

    /// @param registry The contract checked.
    /// @param count The count read.
    function _assertSingleAdmin(address registry, uint256 count) private pure {
        if (count != 1) revert AdminCountIsNotOne(registry, count);
    }

    /// @notice Logs the six addresses and the configuration in a single output.
    /// @param deployment The six addresses.
    /// @param config The genesis configuration.
    function _report(Deployment memory deployment, Config memory config) internal pure {
        console.log("EscapeHatch           ", address(deployment.escapeHatch));
        console.log("Executor              ", address(deployment.executor));
        console.log("ProtocolRegistry      ", address(deployment.registry));
        console.log("ImplementationRegistry", address(deployment.implRegistry));
        console.log("TriviuVault v1     ", address(deployment.implementation));
        console.log("VaultFactory        ", address(deployment.factory));
        console.log("governance (admin)    ", config.governance);
        console.log("operator              ", config.operator);
        console.log("treasury              ", config.treasury);
        console.log("base currency         ", config.baseToken);
        console.log("feeBps                ", config.feeBps);
    }
}
