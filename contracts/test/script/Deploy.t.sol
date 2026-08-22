// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {Test} from "@forge-std/Test.sol";

import {Config, Deploy, Deployment} from "../../script/01_Deploy.s.sol";
import {Deployments} from "../../script/util/Deployments.sol";
import {IImplementationRegistry} from "../../src/protocol/interfaces/IImplementationRegistry.sol";

import {MockERC20} from "../util/Mocks.sol";

/// @notice The genesis: the validation that runs before gas, and the handover that runs after it.
/// @dev The test **inherits** the script: that is what makes the calls to the registries come out of this
///      contract, the same way they come out of the script contract in production. `startPrank` in place of
///      `startBroadcast`, and the body exercised is the same.
contract DeployTest is Test, Deploy {
    MockERC20 private usdc;

    address private deployer = makeAddr("deployer");
    address private governance = makeAddr("governance");
    address private treasury = makeAddr("treasury");
    address private operator = makeAddr("operator");

    function setUp() public {
        usdc = new MockERC20("USD Coin", "USDC", 6);
    }

    /// @notice Deploys as `run` would: the sender of the transactions is the validated deployer.
    function _deploy(Config memory config) private returns (Deployment memory deployment) {
        vm.startPrank(config.deployer);
        deployment = deploy(config);
        vm.stopPrank();
    }

    function _config() private view returns (Config memory) {
        return Config({
            deployer: deployer,
            governance: governance,
            treasury: treasury,
            operator: operator,
            baseToken: address(usdc),
            feeBps: 50
        });
    }

    // --- validation ------------------------------------------------------------

    function test_aWellFormedConfigPasses() public view {
        this.validate(_config());
    }

    function test_theDefaultSenderMeansTheAccountFlagWasForgotten() public {
        Config memory config = _config();
        config.deployer = DEFAULT_SENDER;

        vm.expectRevert(Deploy.DeployerIsTheDefaultSender.selector);
        this.validate(config);
    }

    function test_theGovernanceCannotBeZeroOrTheDeployer() public {
        Config memory config = _config();

        config.governance = address(0);
        vm.expectRevert(Deploy.GovernanceIsZero.selector);
        this.validate(config);

        config.governance = deployer;
        vm.expectRevert(Deploy.GovernanceIsTheDeployer.selector);
        this.validate(config);
    }

    function test_theTreasuryCannotBeZero() public {
        Config memory config = _config();
        config.treasury = address(0);

        vm.expectRevert(Deploy.TreasuryIsZero.selector);
        this.validate(config);
    }

    /// @dev The operator key is hot and signs forever: it does not hold another role.
    function test_theOperatorStandsAlone() public {
        Config memory config = _config();

        config.operator = address(0);
        vm.expectRevert(Deploy.OperatorIsZero.selector);
        this.validate(config);

        config.operator = deployer;
        vm.expectRevert(abi.encodeWithSelector(Deploy.OperatorCollidesWith.selector, deployer));
        this.validate(config);

        config.operator = governance;
        vm.expectRevert(abi.encodeWithSelector(Deploy.OperatorCollidesWith.selector, governance));
        this.validate(config);
    }

    function test_theBaseTokenMustBeAContract() public {
        Config memory config = _config();
        config.baseToken = makeAddr("nothing");

        vm.expectRevert(abi.encodeWithSelector(Deploy.BaseTokenIsNotAContract.selector, config.baseToken));
        this.validate(config);
    }

    /// @dev A different scale would silently recalibrate the refund ceiling.
    function test_theBaseTokenMustHaveSixDecimals() public {
        MockERC20 wrong = new MockERC20("Eighteen", "E18", 18);

        Config memory config = _config();
        config.baseToken = address(wrong);

        vm.expectRevert(abi.encodeWithSelector(Deploy.BaseTokenHasWrongDecimals.selector, 18, 6));
        this.validate(config);
    }

    function test_theFeeCannotPassTheCap() public {
        uint16 cap = FEE_BPS_MAX;

        Config memory config = _config();
        config.feeBps = cap + 1;

        vm.expectRevert(abi.encodeWithSelector(Deploy.FeeAboveCap.selector, cap + 1, cap));
        this.validate(config);
    }

    /// @dev The local copy of the ceiling exists because the instance does not exist yet at validation time.
    function test_theFeeCapCopyMatchesTheRegistry() public {
        Deployment memory deployment = _deploy(_config());

        assertEq(FEE_BPS_MAX, deployment.registry.FEE_BPS_MAX());
    }

    // --- deployment -------------------------------------------------------------

    function test_theSixContractsAreBornWired() public {
        Deployment memory d = _deploy(_config());

        assertGt(address(d.escapeHatch).code.length, 0);
        assertGt(address(d.executor).code.length, 0);
        assertGt(address(d.registry).code.length, 0);
        assertGt(address(d.implRegistry).code.length, 0);
        assertGt(address(d.implementation).code.length, 0);
        assertGt(address(d.factory).code.length, 0);

        assertEq(d.factory.IMPLEMENTATION(), address(d.implementation));
        assertEq(d.implementation.ESCAPE_HATCH(), address(d.escapeHatch));
        assertEq(address(d.implementation.REGISTRY()), address(d.registry));
        assertEq(address(d.implementation.IMPL_REGISTRY()), address(d.implRegistry));
    }

    /// @dev The four acts of curation come out in the same run, rehearsed here. The count is in the
    ///      name on purpose: a fifth act added to the genesis without a line here would ship
    ///      uncurated and the suite would stay green.
    function test_theFourActsOfCurationHappen() public {
        Config memory config = _config();
        Deployment memory d = _deploy(config);

        assertTrue(d.implRegistry.isAdoptable(address(d.implementation)));
        assertTrue(d.registry.isBaseCurrency(config.baseToken));
        assertTrue(d.registry.isOperator(config.operator));

        // Without this one the genesis hands over a protocol where every execution reverts with
        // `ExecutorNotCurated`, and only governance could revive it.
        assertTrue(d.registry.isExecutor(address(d.executor)), "the genesis left its executor uncurated");
    }

    function test_theDeployerWalksAwayFromBothRegistries() public {
        Config memory config = _config();
        Deployment memory d = _deploy(config);

        bytes32 adminRole = d.registry.DEFAULT_ADMIN_ROLE();

        assertTrue(d.registry.hasRole(adminRole, governance));
        assertTrue(d.implRegistry.hasRole(adminRole, governance));
        assertFalse(d.registry.hasRole(adminRole, address(this)));
        assertFalse(d.implRegistry.hasRole(adminRole, address(this)));

        assertEq(d.registry.adminCount(), 1);
        assertEq(d.implRegistry.adminCount(), 1);
    }

    /// @dev The hatch stays out of the catalog: the exemption is the immutable address, not a status.
    function test_theHatchIsNotInTheCatalogue() public {
        Deployment memory d = _deploy(_config());

        assertFalse(d.implRegistry.isAdoptable(address(d.escapeHatch)));
        assertTrue(d.implRegistry.statusOf(address(d.escapeHatch)) == IImplementationRegistry.Status.Unknown);
    }

    // --- record --------------------------------------------------------------------

    function test_theRecordCarriesEveryAddressUnderItsKey() public {
        Config memory config = _config();
        Deployment memory d = _deploy(config);

        Deployments.Record[] memory rs = this.records(d, config);

        assertEq(rs.length, 7);
        assertEq(rs[0].addr, address(d.escapeHatch));
        assertEq(rs[1].addr, address(d.executor));
        assertEq(rs[2].addr, address(d.registry));
        assertEq(rs[3].addr, address(d.implRegistry));
        assertEq(rs[4].addr, address(d.implementation));
        assertEq(rs[5].addr, address(d.factory));
        assertEq(rs[6].addr, config.baseToken);

        assertEq(rs[0].key, "escapeHatch");
        assertEq(rs[5].key, "factory");
        assertEq(rs[6].key, "baseCurrency");
    }

    /// @dev Solidity cannot see struct fields: the artifact is what counts. A seventh contract in the
    ///      genesis without an entry in the record breaks here, and not months later.
    function test_everyDeployedContractIsInTheRecord() public {
        Config memory config = _config();
        Deployment memory d = _deploy(config);

        string memory artifact = vm.readFile("out/01_Deploy.s.sol/Deploy.json");

        uint256 fields;
        for (uint256 i = 0; i < 32; i++) {
            string memory pointer =
                string.concat(".abi[?(@.name == 'records')].inputs[0].components[", vm.toString(i), "].name");
            if (!vm.keyExistsJson(artifact, pointer)) break;
            fields++;
        }

        assertEq(fields, 6);
        assertEq(this.records(d, config).length, fields + 1);
    }
}
