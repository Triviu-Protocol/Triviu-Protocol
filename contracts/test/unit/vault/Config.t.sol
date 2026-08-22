// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {Limits, LimitsLib} from "../../../src/api/types/Limits.sol";
import {IVaultConfigEE} from "../../../src/vault/interfaces/IVaultConfigEE.sol";
import {IVaultCustodyEE} from "../../../src/vault/interfaces/IVaultCustodyEE.sol";

import {BaseTest} from "../../util/BaseTest.sol";
import {MockERC20, MockGuard} from "../../util/Mocks.sol";

/// @notice The vault's mandate: who is in charge, what may be traded, and the epoch that protects it.
contract VaultConfigTest is BaseTest {
    function test_theOwnerIsWhoTheFactorySaid() public view {
        assertEq(vault.owner(), owner);
        assertEq(vault.pendingOwner(), address(0));
    }

    // --- ownership ---------------------------------------------------------

    function test_ownershipMovesInTwoSteps() public {
        vm.prank(owner);
        vault.transferOwnership(stranger);

        assertEq(vault.owner(), owner);
        assertEq(vault.pendingOwner(), stranger);

        vm.prank(stranger);
        vault.acceptOwnership();

        assertEq(vault.owner(), stranger);
        assertEq(vault.pendingOwner(), address(0));
    }

    function test_onlyThePendingOwnerAccepts() public {
        vm.prank(owner);
        vault.transferOwnership(stranger);

        vm.prank(makeAddr("intruder"));
        vm.expectRevert(IVaultConfigEE.NotPendingOwner.selector);
        vault.acceptOwnership();
    }

    function test_aStrangerCannotStartTheTransfer() public {
        vm.prank(stranger);
        vm.expectRevert(IVaultCustodyEE.NotOwner.selector);
        vault.transferOwnership(stranger);
    }

    /// @dev The transfer can be redone: proposing again replaces the pending one.
    function test_theTransferCanBeRedirectedBeforeItIsAccepted() public {
        address other = makeAddr("other");

        vm.startPrank(owner);
        vault.transferOwnership(stranger);
        vault.transferOwnership(other);
        vm.stopPrank();

        assertEq(vault.pendingOwner(), other);

        vm.prank(stranger);
        vm.expectRevert(IVaultConfigEE.NotPendingOwner.selector);
        vault.acceptOwnership();
    }

    // --- strategy and guards -----------------------------------------------

    function test_theStrategyMustBeAContract() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(IVaultConfigEE.NotAContract.selector, stranger));
        vault.setStrategy(stranger);
    }

    /// @dev Zero is legitimate: it is how the `Strategy` is switched off without changing vault.
    function test_theStrategyCanBeUnplugged() public {
        vm.prank(owner);
        vault.setStrategy(address(0));

        assertEq(vault.strategy(), address(0));
    }

    function test_guardsAreAddedAndRemoved() public {
        MockGuard second = new MockGuard(false);

        vm.startPrank(owner);
        vault.addGuard(address(guard));
        vault.addGuard(address(second));
        assertEq(vault.guards().length, 2);

        vault.removeGuard(address(guard));
        vm.stopPrank();

        address[] memory left = vault.guards();
        assertEq(left.length, 1);
        assertEq(left[0], address(second));
    }

    function test_theSameGuardCannotBeAddedTwice() public {
        vm.startPrank(owner);
        vault.addGuard(address(guard));

        vm.expectRevert(abi.encodeWithSelector(IVaultConfigEE.GuardAlreadyAdded.selector, address(guard)));
        vault.addGuard(address(guard));
        vm.stopPrank();
    }

    function test_removingSomethingThatIsNotAGuardIsRefused() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(IVaultConfigEE.GuardNotFound.selector, address(guard)));
        vault.removeGuard(address(guard));
    }

    function test_theGuardListIsCapped() public {
        vm.startPrank(owner);
        for (uint256 i = 0; i < 8; i++) {
            vault.addGuard(address(new MockGuard(false)));
        }

        address ninth = address(new MockGuard(false));

        vm.expectRevert(IVaultConfigEE.TooManyGuards.selector);
        vault.addGuard(ninth);
        vm.stopPrank();
    }

    /// @dev Removal is swap-and-pop: the order changes, and the rest of the list stays intact.
    function test_removingFromTheMiddleKeepsEverybodyElse() public {
        address a = address(new MockGuard(false));
        address b = address(new MockGuard(false));
        address c = address(new MockGuard(false));

        vm.startPrank(owner);
        vault.addGuard(a);
        vault.addGuard(b);
        vault.addGuard(c);
        vault.removeGuard(b);
        vm.stopPrank();

        address[] memory left = vault.guards();
        assertEq(left.length, 2);
        assertTrue(left[0] == a || left[1] == a);
        assertTrue(left[0] == c || left[1] == c);
    }

    // --- token lists --------------------------------------------------------

    function test_theAssetDecimalsAreReadFromTheToken() public view {
        assertEq(vault.assetDecimals(address(asset)), ASSET_DECIMALS);
        assertEq(vault.baseCurrencyDecimals(address(base)), BASE_DECIMALS);
    }

    function test_delistingZeroesTheDecimals() public {
        vm.prank(owner);
        vault.setAllowedAsset(address(asset), false);

        assertEq(vault.assetDecimals(address(asset)), 0);
    }

    function test_delistingTheBaseCurrencyZeroesTheDecimals() public {
        vm.prank(owner);
        vault.setBaseCurrency(address(base), false);

        assertEq(vault.baseCurrencyDecimals(address(base)), 0);
    }

    function test_aTokenWithoutCodeIsRefused() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(IVaultConfigEE.NotAContract.selector, stranger));
        vault.setAllowedAsset(stranger, true);
    }

    /// @dev Zero decimals and more than 18 stay out: the floors make no sense outside that range.
    function test_decimalsOutOfRangeAreRefused() public {
        MockERC20 tooDeep = new MockERC20("Deep", "DEEP", 19);
        MockERC20 tooShallow = new MockERC20("Flat", "FLAT", 0);

        vm.startPrank(owner);

        vm.expectRevert(abi.encodeWithSelector(IVaultConfigEE.DecimalsOutOfRange.selector, 19));
        vault.setAllowedAsset(address(tooDeep), true);

        vm.expectRevert(abi.encodeWithSelector(IVaultConfigEE.DecimalsOutOfRange.selector, 0));
        vault.setAllowedAsset(address(tooShallow), true);

        vm.stopPrank();
    }

    // --- epoch --------------------------------------------------------------

    /// @dev Every setter moves the epoch: it is what `ConfigEpochStale` uses to invalidate proposals.
    function test_everySetterBumpsTheConfigEpoch() public {
        MockERC20 other = new MockERC20("Other", "OTH", 8);

        uint64 epoch = vault.configEpoch();

        vm.startPrank(owner);

        vault.setStrategy(address(strategy));
        assertEq(vault.configEpoch(), ++epoch);

        vault.addGuard(address(guard));
        assertEq(vault.configEpoch(), ++epoch);

        vault.removeGuard(address(guard));
        assertEq(vault.configEpoch(), ++epoch);

        vault.setLimits(1, 2, 3, 4);
        assertEq(vault.configEpoch(), ++epoch);

        vault.setAllowedAsset(address(other), true);
        assertEq(vault.configEpoch(), ++epoch);

        vault.setBaseCurrency(address(other), true);
        assertEq(vault.configEpoch(), ++epoch);

        vm.stopPrank();
    }

    /// @dev Transferring ownership does **not** move the epoch: the mandate read by the `Operator` is the same.
    function test_theOwnershipTransferDoesNotBumpTheEpoch() public {
        uint64 epoch = vault.configEpoch();

        vm.prank(owner);
        vault.transferOwnership(stranger);

        vm.prank(stranger);
        vault.acceptOwnership();

        assertEq(vault.configEpoch(), epoch);
    }

    function test_theLimitsRoundTripThroughStorage() public {
        vm.prank(owner);
        vault.setLimits(2 hours, 30 minutes, 125, 1e6);

        Limits stored = vault.limits();

        assertEq(stored.cooldown(), 2 hours);
        assertEq(stored.maxValidity(), 30 minutes);
        assertEq(stored.minRatioBps(), 125);
        assertEq(stored.quantum(), 1e6);
        assertEq(Limits.unwrap(stored), Limits.unwrap(LimitsLib.pack(2 hours, 30 minutes, 125, 1e6)));
    }

    function test_everySetterIsOwnerOnly() public {
        vm.startPrank(stranger);

        vm.expectRevert(IVaultCustodyEE.NotOwner.selector);
        vault.setStrategy(address(strategy));

        vm.expectRevert(IVaultCustodyEE.NotOwner.selector);
        vault.addGuard(address(guard));

        vm.expectRevert(IVaultCustodyEE.NotOwner.selector);
        vault.removeGuard(address(guard));

        vm.expectRevert(IVaultCustodyEE.NotOwner.selector);
        vault.setLimits(1, 2, 3, 4);

        vm.expectRevert(IVaultCustodyEE.NotOwner.selector);
        vault.setAllowedAsset(address(asset), false);

        vm.expectRevert(IVaultCustodyEE.NotOwner.selector);
        vault.setBaseCurrency(address(base), false);

        vm.stopPrank();
    }

    /// @dev The owner lives in the slot the `EscapeHatch` reads: if it moves, the refuge goes blind.
    function test_theOwnerLivesInTheSlotTheHatchReads() public view {
        bytes32 raw = vm.load(address(vault), OWNER_SLOT);

        assertEq(address(uint160(uint256(raw))), owner);
    }
}
