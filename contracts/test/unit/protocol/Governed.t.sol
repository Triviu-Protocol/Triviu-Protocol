// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {Test} from "@forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

import {Governed} from "../../../src/protocol/Governed.sol";
import {IGovernedEE} from "../../../src/protocol/interfaces/IGovernedEE.sol";

contract GovernedHarness is Governed {
    bytes32 public constant SOME_ROLE = keccak256("SOME_ROLE");

    constructor(address admin) Governed(admin) {}
}

/// @notice The last-admin guard: it is what prevents an immutable and ownerless registry.
contract GovernedTest is Test {
    GovernedHarness private governed;

    address private admin = makeAddr("admin");
    address private second = makeAddr("second");
    address private stranger = makeAddr("stranger");

    bytes32 private adminRole;

    function setUp() public {
        governed = new GovernedHarness(admin);
        adminRole = governed.DEFAULT_ADMIN_ROLE();
    }

    function test_theConstructorAdminIsCounted() public view {
        assertTrue(governed.hasRole(adminRole, admin));
        assertEq(governed.adminCount(), 1);
    }

    function test_theConstructorRefusesTheZeroAdmin() public {
        vm.expectRevert(IGovernedEE.AdminIsZero.selector);
        new GovernedHarness(address(0));
    }

    function test_grantingTheZeroAddressIsRefused() public {
        vm.prank(admin);
        vm.expectRevert(IGovernedEE.AdminIsZero.selector);
        governed.grantRole(adminRole, address(0));
    }

    function test_theCountFollowsGrantAndRevoke() public {
        vm.startPrank(admin);
        governed.grantRole(adminRole, second);
        assertEq(governed.adminCount(), 2);

        governed.revokeRole(adminRole, second);
        assertEq(governed.adminCount(), 1);
        vm.stopPrank();
    }

    /// @dev Granting twice does not count twice: `_grantRole` only increments when something changes.
    function test_grantingTwiceCountsOnce() public {
        vm.startPrank(admin);
        governed.grantRole(adminRole, second);
        governed.grantRole(adminRole, second);
        vm.stopPrank();

        assertEq(governed.adminCount(), 2);
    }

    function test_theLastAdminCannotRenounce() public {
        vm.prank(admin);
        vm.expectRevert(IGovernedEE.LastAdmin.selector);
        governed.renounceRole(adminRole, admin);
    }

    function test_theLastAdminCannotBeRevoked() public {
        vm.prank(admin);
        vm.expectRevert(IGovernedEE.LastAdmin.selector);
        governed.revokeRole(adminRole, admin);
    }

    /// @dev The genesis sequence: grant first, renounce afterwards.
    function test_theHandoverWorksInTheRightOrder() public {
        vm.startPrank(admin);
        governed.grantRole(adminRole, second);
        governed.renounceRole(adminRole, admin);
        vm.stopPrank();

        assertFalse(governed.hasRole(adminRole, admin));
        assertTrue(governed.hasRole(adminRole, second));
        assertEq(governed.adminCount(), 1);
    }

    function test_otherRolesDoNotMoveTheAdminCount() public {
        vm.startPrank(admin);
        governed.grantRole(governed.SOME_ROLE(), second);
        assertEq(governed.adminCount(), 1);

        governed.revokeRole(governed.SOME_ROLE(), second);
        assertEq(governed.adminCount(), 1);
        vm.stopPrank();
    }

    function test_anotherRoleCanBeRenouncedByItsLastHolder() public {
        bytes32 role = governed.SOME_ROLE();

        vm.prank(admin);
        governed.grantRole(role, second);

        vm.prank(second);
        governed.renounceRole(role, second);

        assertFalse(governed.hasRole(role, second));
    }

    function test_aStrangerCannotGrant() public {
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, adminRole)
        );
        governed.grantRole(adminRole, stranger);
    }

    function test_revokingSomebodyWhoIsNotAdminDoesNotTouchTheCount() public {
        vm.prank(admin);
        governed.revokeRole(adminRole, stranger);

        assertEq(governed.adminCount(), 1);
    }
}
