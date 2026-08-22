// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IVaultCustodyEE} from "../../../src/vault/interfaces/IVaultCustodyEE.sol";
import {IVaultUpgradeEE} from "../../../src/vault/interfaces/IVaultUpgradeEE.sol";
import {EscapeHatch} from "../../../src/protocol/EscapeHatch.sol";

import {BaseTest} from "../../util/BaseTest.sol";
import {FailingMigrationImplementation, ImplementationV2} from "../../util/Mocks.sol";

/// @notice The vault upgrade: catalog, timelock, window, and the refuge with none of the three.
contract VaultUpgradeTest is BaseTest {
    uint64 private constant TIMELOCK = 2 days;
    uint64 private constant WINDOW = 7 days;

    ImplementationV2 private v2;

    function setUp() public override {
        super.setUp();

        v2 = new ImplementationV2();

        vm.prank(admin);
        implRegistry.publish(address(v2));
    }

    function test_nothingIsPendingOnANewVault() public view {
        (address implementation_, uint64 eta) = vault.pendingUpgrade();

        assertEq(implementation_, address(0));
        assertEq(eta, 0);
    }

    function test_onlyAnAdoptableImplementationCanBeProposed() public {
        address unpublished = address(new ImplementationV2());

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(IVaultUpgradeEE.ImplementationNotAdoptable.selector, unpublished));
        vault.proposeUpgrade(unpublished);
    }

    function test_theProposalStartsTheClock() public {
        uint64 expectedEta = uint64(block.timestamp) + TIMELOCK;

        vm.prank(owner);
        vm.expectEmit(true, false, false, true);
        emit IVaultUpgradeEE.UpgradeProposed(address(v2), expectedEta);
        vault.proposeUpgrade(address(v2));

        (address implementation_, uint64 eta) = vault.pendingUpgrade();
        assertEq(implementation_, address(v2));
        assertEq(eta, expectedEta);
    }

    function test_theUpgradeCannotRunBeforeTheEta() public {
        vm.startPrank(owner);
        vault.proposeUpgrade(address(v2));

        uint64 eta = uint64(block.timestamp) + TIMELOCK;

        skip(TIMELOCK - 1);
        vm.expectRevert(abi.encodeWithSelector(IVaultUpgradeEE.UpgradeNotReady.selector, eta));
        vault.executeUpgrade();
        vm.stopPrank();
    }

    function test_theUpgradeRunsAtTheEta() public {
        vm.startPrank(owner);
        vault.proposeUpgrade(address(v2));
        skip(TIMELOCK);
        vault.executeUpgrade();
        vm.stopPrank();

        assertEq(ImplementationV2(address(vault)).interfaceVersion(), 2);
        assertTrue(ImplementationV2(address(vault)).migrated());
    }

    /// @dev The upgrade moves the epoch: any in-flight proposal from the `Operator` dies with it.
    function test_theUpgradeBumpsTheConfigEpoch() public {
        uint64 epoch = vault.configEpoch();

        vm.startPrank(owner);
        vault.proposeUpgrade(address(v2));
        skip(TIMELOCK);

        vm.expectEmit(true, false, false, true);
        emit IVaultUpgradeEE.UpgradeExecuted(address(v2), epoch + 1);
        vault.executeUpgrade();
        vm.stopPrank();
    }

    function test_theWindowClosesSevenDaysAfterTheEta() public {
        vm.startPrank(owner);
        vault.proposeUpgrade(address(v2));

        uint64 deadline = uint64(block.timestamp) + TIMELOCK + WINDOW;

        skip(TIMELOCK + WINDOW + 1);
        vm.expectRevert(abi.encodeWithSelector(IVaultUpgradeEE.UpgradeExpired.selector, deadline));
        vault.executeUpgrade();
        vm.stopPrank();
    }

    function test_theLastSecondOfTheWindowStillWorks() public {
        vm.startPrank(owner);
        vault.proposeUpgrade(address(v2));
        skip(TIMELOCK + WINDOW);
        vault.executeUpgrade();
        vm.stopPrank();

        assertEq(ImplementationV2(address(vault)).interfaceVersion(), 2);
    }

    /// @dev The catalog is consulted twice: proposing and executing. Deprecating in between blocks the adoption.
    function test_anImplementationDeprecatedInTheMeantimeIsRefused() public {
        vm.prank(owner);
        vault.proposeUpgrade(address(v2));

        vm.prank(admin);
        implRegistry.deprecate(address(v2));

        skip(TIMELOCK);

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(IVaultUpgradeEE.ImplementationNotAdoptable.selector, address(v2)));
        vault.executeUpgrade();
    }

    function test_theProposalCanBeCancelled() public {
        vm.startPrank(owner);
        vault.proposeUpgrade(address(v2));

        vm.expectEmit(true, false, false, false);
        emit IVaultUpgradeEE.UpgradeCancelled(address(v2));
        vault.cancelUpgrade();

        (address implementation_, uint64 eta) = vault.pendingUpgrade();
        assertEq(implementation_, address(0));
        assertEq(eta, 0);

        skip(TIMELOCK);
        vm.expectRevert(IVaultUpgradeEE.NoPendingUpgrade.selector);
        vault.executeUpgrade();
        vm.stopPrank();
    }

    function test_cancellingWithoutAProposalIsRefused() public {
        vm.prank(owner);
        vm.expectRevert(IVaultUpgradeEE.NoPendingUpgrade.selector);
        vault.cancelUpgrade();
    }

    function test_executingWithoutAProposalIsRefused() public {
        vm.prank(owner);
        vm.expectRevert(IVaultUpgradeEE.NoPendingUpgrade.selector);
        vault.executeUpgrade();
    }

    /// @dev The migration is part of the upgrade: if it reverts, the vault stays on the previous version.
    function test_aFailingMigrationRollsTheWholeUpgradeBack() public {
        address broken = address(new FailingMigrationImplementation());

        vm.prank(admin);
        implRegistry.publish(broken);

        vm.startPrank(owner);
        vault.proposeUpgrade(broken);
        skip(TIMELOCK);

        vm.expectRevert(FailingMigrationImplementation.MigrationFailed.selector);
        vault.executeUpgrade();
        vm.stopPrank();

        assertEq(vault.interfaceVersion(), 1);
    }

    function test_theWholeUpgradePathIsOwnerOnly() public {
        vm.prank(owner);
        vault.proposeUpgrade(address(v2));

        vm.startPrank(stranger);

        vm.expectRevert(IVaultCustodyEE.NotOwner.selector);
        vault.proposeUpgrade(address(v2));

        vm.expectRevert(IVaultCustodyEE.NotOwner.selector);
        vault.executeUpgrade();

        vm.expectRevert(IVaultCustodyEE.NotOwner.selector);
        vault.cancelUpgrade();

        vm.expectRevert(IVaultCustodyEE.NotOwner.selector);
        vault.adoptEscapeHatch();

        vm.stopPrank();
    }

    // --- refuge --------------------------------------------------------------

    /// @dev The refuge goes through neither the catalog nor the timelock: it is the constructor's immutable address.
    function test_theHatchIsAdoptedImmediately() public {
        _fundBase(100e6);

        vm.prank(owner);
        vm.expectEmit(true, false, false, false);
        emit IVaultUpgradeEE.EscapeHatchAdopted(address(hatch));
        vault.adoptEscapeHatch();

        EscapeHatch escaped = EscapeHatch(address(vault));

        assertEq(escaped.owner(), owner);

        vm.prank(owner);
        escaped.withdraw(IERC20(address(base)), 100e6, owner);

        assertEq(base.balanceOf(owner), 100e6);
    }

    /// @dev After the refuge the vault no longer trades: the surface is withdrawing, and nothing beyond that.
    function test_afterTheHatchTheVaultStopsTrading() public {
        vm.prank(owner);
        vault.adoptEscapeHatch();

        vm.prank(owner);
        vm.expectRevert();
        vault.setStrategy(address(strategy));
    }
}
