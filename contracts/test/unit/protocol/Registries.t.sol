// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {Test} from "@forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

import {ImplementationRegistry} from "../../../src/protocol/ImplementationRegistry.sol";
import {ProtocolRegistry} from "../../../src/protocol/ProtocolRegistry.sol";
import {IImplementationRegistry} from "../../../src/protocol/interfaces/IImplementationRegistry.sol";
import {IImplementationRegistryEE} from "../../../src/protocol/interfaces/IImplementationRegistryEE.sol";
import {IProtocolRegistryEE} from "../../../src/protocol/interfaces/IProtocolRegistryEE.sol";
import {ExecConfig} from "../../../src/protocol/types/ExecConfig.sol";

/// @notice The registry that `VaultExecution` reads on every execution.
contract ProtocolRegistryTest is Test {
    ProtocolRegistry private registry;

    address private admin = makeAddr("admin");
    address private treasury = makeAddr("treasury");
    address private operator = makeAddr("operator");
    address private stranger = makeAddr("stranger");
    address private token = makeAddr("token");
    address private executor = makeAddr("executor");

    function setUp() public {
        vm.prank(admin);
        registry = new ProtocolRegistry(admin, treasury, 50);
    }

    function test_theConstructorPublishesTheOpeningState() public view {
        assertEq(registry.treasury(), treasury);
        assertEq(registry.feeBps(), 50);
        assertFalse(registry.paused());
        assertTrue(registry.hasRole(registry.DEFAULT_ADMIN_ROLE(), admin));
    }

    function test_theConstructorRefusesTheZeroTreasury() public {
        vm.expectRevert(IProtocolRegistryEE.TreasuryIsZero.selector);
        new ProtocolRegistry(admin, address(0), 50);
    }

    function test_theConstructorRefusesAFeeAboveTheCap() public {
        uint16 cap = registry.FEE_BPS_MAX();

        vm.expectRevert(abi.encodeWithSelector(IProtocolRegistryEE.FeeAboveCap.selector, cap + 1, cap));
        new ProtocolRegistry(admin, treasury, cap + 1);
    }

    function test_theFeeCanBeSetUpToTheCap() public {
        uint16 cap = registry.FEE_BPS_MAX();

        vm.prank(admin);
        registry.setFeeBps(cap);

        assertEq(registry.feeBps(), cap);
    }

    function test_theFeeCannotPassTheCap() public {
        uint16 cap = registry.FEE_BPS_MAX();

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(IProtocolRegistryEE.FeeAboveCap.selector, cap + 1, cap));
        registry.setFeeBps(cap + 1);
    }

    function test_theTreasuryCannotBecomeZero() public {
        vm.prank(admin);
        vm.expectRevert(IProtocolRegistryEE.TreasuryIsZero.selector);
        registry.setTreasury(address(0));
    }

    function test_theTreasuryCanBeMoved() public {
        address newTreasury = makeAddr("newTreasury");

        vm.prank(admin);
        vm.expectEmit(true, false, false, false);
        emit IProtocolRegistryEE.TreasurySet(newTreasury);
        registry.setTreasury(newTreasury);

        assertEq(registry.treasury(), newTreasury);
        assertEq(registry.execConfig(operator).treasury(), newTreasury);
    }

    function test_theBaseCurrencyCannotBeTheZeroToken() public {
        vm.prank(admin);
        vm.expectRevert(IProtocolRegistryEE.TokenIsZero.selector);
        registry.setBaseCurrency(address(0), true);
    }

    function test_curatingAndUncuratingABaseCurrency() public {
        vm.startPrank(admin);

        vm.expectEmit(true, false, false, true);
        emit IProtocolRegistryEE.BaseCurrencySet(token, true);
        registry.setBaseCurrency(token, true);
        assertTrue(registry.isBaseCurrency(token));

        registry.setBaseCurrency(token, false);
        assertFalse(registry.isBaseCurrency(token));

        vm.stopPrank();
    }

    function test_theExecutorCannotBeTheZeroAddress() public {
        vm.prank(admin);
        vm.expectRevert(IProtocolRegistryEE.ExecutorIsZero.selector);
        registry.setExecutor(address(0), true);
    }

    /// @dev The vault hands `amountIn` to the executor before the route runs, and the submitter
    ///      picks that address. This curation is what stands between the two.
    function test_curatingAndUncuratingAnExecutor() public {
        assertFalse(registry.isExecutor(executor), "an unknown address starts uncurated");

        vm.startPrank(admin);

        vm.expectEmit(true, false, false, true);
        emit IProtocolRegistryEE.ExecutorSet(executor, true);
        registry.setExecutor(executor, true);
        assertTrue(registry.isExecutor(executor));

        vm.expectEmit(true, false, false, true);
        emit IProtocolRegistryEE.ExecutorSet(executor, false);
        registry.setExecutor(executor, false);
        assertFalse(registry.isExecutor(executor));

        vm.stopPrank();
    }

    function test_pausingIsVisibleInTheExecConfig() public {
        vm.prank(admin);
        registry.setPaused(true);

        assertTrue(registry.paused());
        assertTrue(registry.execConfig(operator).paused());
    }

    /// @dev The `execConfig` is read with the caller: it is what stamps `callerIsOperator`.
    function test_theExecConfigMarksOnlyTheOperator() public {
        bytes32 operatorRole = registry.OPERATOR_ROLE();

        vm.prank(admin);
        registry.grantRole(operatorRole, operator);

        ExecConfig forOperator = registry.execConfig(operator);
        ExecConfig forStranger = registry.execConfig(stranger);

        assertTrue(forOperator.callerIsOperator());
        assertFalse(forStranger.callerIsOperator());

        assertEq(forOperator.feeBps(), 50);
        assertEq(forOperator.treasury(), treasury);
    }

    function test_theOperatorCanWalkAway() public {
        bytes32 operatorRole = registry.OPERATOR_ROLE();

        vm.prank(admin);
        registry.grantRole(operatorRole, operator);
        assertTrue(registry.isOperator(operator));

        vm.prank(operator);
        registry.renounceOperator();

        assertFalse(registry.isOperator(operator));
    }

    /// @dev The name of this test is a promise, and the list below is what keeps it. A setter added
    ///      to `ProtocolRegistry` without a line here leaves a privileged function with no guard
    ///      against losing its modifier — and nothing fails to say so, because a shorter list is
    ///      still a green list. Adding the line is part of adding the setter.
    function test_everySetterIsAdminOnly() public {
        bytes32 role = registry.DEFAULT_ADMIN_ROLE();
        bytes memory expected =
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, role);

        vm.startPrank(stranger);

        vm.expectRevert(expected);
        registry.setPaused(true);

        vm.expectRevert(expected);
        registry.setFeeBps(10);

        vm.expectRevert(expected);
        registry.setTreasury(stranger);

        vm.expectRevert(expected);
        registry.setBaseCurrency(token, true);

        vm.expectRevert(expected);
        registry.setExecutor(executor, true);

        vm.stopPrank();
    }
}

/// @notice The implementation catalog: publishing is curation, deprecating is final.
contract ImplementationRegistryTest is Test {
    ImplementationRegistry private catalog;

    address private admin = makeAddr("admin");
    address private stranger = makeAddr("stranger");
    address private implementation;

    function setUp() public {
        vm.prank(admin);
        catalog = new ImplementationRegistry(admin);

        implementation = address(new Dummy());
    }

    function test_anUnknownImplementationIsNotAdoptable() public view {
        assertFalse(catalog.isAdoptable(implementation));
        assertTrue(catalog.statusOf(implementation) == IImplementationRegistry.Status.Unknown);
    }

    function test_publishingMakesItAdoptable() public {
        vm.prank(admin);
        vm.expectEmit(true, false, false, false);
        emit IImplementationRegistryEE.ImplementationPublished(implementation);
        catalog.publish(implementation);

        assertTrue(catalog.isAdoptable(implementation));
        assertTrue(catalog.statusOf(implementation) == IImplementationRegistry.Status.Published);
    }

    function test_publishingSomethingWithoutCodeIsRefused() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(IImplementationRegistryEE.NotAContract.selector, stranger));
        catalog.publish(stranger);
    }

    function test_publishingTwiceIsRefused() public {
        vm.startPrank(admin);
        catalog.publish(implementation);

        vm.expectRevert(abi.encodeWithSelector(IImplementationRegistryEE.AlreadyPublished.selector, implementation));
        catalog.publish(implementation);
        vm.stopPrank();
    }

    function test_deprecatingWhatWasNeverPublishedIsRefused() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(IImplementationRegistryEE.NotPublished.selector, implementation));
        catalog.deprecate(implementation);
    }

    function test_deprecatingStopsAdoption() public {
        vm.startPrank(admin);
        catalog.publish(implementation);
        catalog.deprecate(implementation);
        vm.stopPrank();

        assertFalse(catalog.isAdoptable(implementation));
        assertTrue(catalog.statusOf(implementation) == IImplementationRegistry.Status.Deprecated);
    }

    /// @dev Deprecated is a final state: it is neither deprecated again nor republished.
    function test_deprecatedIsATerminalState() public {
        vm.startPrank(admin);
        catalog.publish(implementation);
        catalog.deprecate(implementation);

        vm.expectRevert(abi.encodeWithSelector(IImplementationRegistryEE.AlreadyDeprecated.selector, implementation));
        catalog.deprecate(implementation);

        vm.expectRevert(abi.encodeWithSelector(IImplementationRegistryEE.AlreadyDeprecated.selector, implementation));
        catalog.publish(implementation);
        vm.stopPrank();
    }

    function test_bothWritersAreAdminOnly() public {
        bytes32 role = catalog.DEFAULT_ADMIN_ROLE();
        bytes memory expected =
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, role);

        vm.startPrank(stranger);

        vm.expectRevert(expected);
        catalog.publish(implementation);

        vm.expectRevert(expected);
        catalog.deprecate(implementation);

        vm.stopPrank();
    }
}

contract Dummy {
    uint256 public x;
}
