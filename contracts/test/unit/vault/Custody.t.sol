// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IVaultCustodyEE} from "../../../src/vault/interfaces/IVaultCustodyEE.sol";

import {BaseTest} from "../../util/BaseTest.sol";
import {FeeOnTransferERC20, MockERC20} from "../../util/Mocks.sol";

/// @notice The labeled way in and out for the funds.
contract VaultCustodyTest is BaseTest {
    function test_theDepositMovesTheFundsAndIsAnnounced() public {
        base.mint(owner, 100e6);

        vm.startPrank(owner);
        base.approve(address(vault), 100e6);

        vm.expectEmit(true, true, false, true);
        emit IVaultCustodyEE.Deposited(address(base), owner, 100e6);
        vault.deposit(IERC20(address(base)), 100e6);
        vm.stopPrank();

        assertEq(base.balanceOf(address(vault)), 100e6);
        assertEq(base.balanceOf(owner), 0);
    }

    function test_onlyTheOwnerDeposits() public {
        base.mint(stranger, 100e6);

        vm.startPrank(stranger);
        base.approve(address(vault), 100e6);

        vm.expectRevert(IVaultCustodyEE.NotOwner.selector);
        vault.deposit(IERC20(address(base)), 100e6);
        vm.stopPrank();
    }

    /// @dev Without allowance `safeTransferFrom` brings the transaction down — that is what step 7 of the script covers.
    function test_theDepositWithoutAllowanceReverts() public {
        base.mint(owner, 100e6);

        vm.prank(owner);
        vm.expectRevert();
        vault.deposit(IERC20(address(base)), 100e6);
    }

    /// @dev A direct transfer is the other way in: the funds are the same, it just does not emit `Deposited`.
    function test_aDirectTransferAlsoFundsTheVault() public {
        base.mint(stranger, 50e6);

        vm.prank(stranger);
        base.transfer(address(vault), 50e6);

        assertEq(base.balanceOf(address(vault)), 50e6);
    }

    function test_theWithdrawalGoesWhereTheOwnerSaid() public {
        _fundBase(100e6);

        vm.prank(owner);
        vm.expectEmit(true, true, false, true);
        emit IVaultCustodyEE.Withdrawn(address(base), stranger, 40e6);
        vault.withdraw(IERC20(address(base)), 40e6, stranger);

        assertEq(base.balanceOf(stranger), 40e6);
        assertEq(base.balanceOf(address(vault)), 60e6);
    }

    function test_onlyTheOwnerWithdraws() public {
        _fundBase(100e6);

        vm.prank(stranger);
        vm.expectRevert(IVaultCustodyEE.NotOwner.selector);
        vault.withdraw(IERC20(address(base)), 1, stranger);
    }

    function test_withdrawingMoreThanTheBalanceReverts() public {
        _fundBase(10e6);

        vm.prank(owner);
        vm.expectRevert();
        vault.withdraw(IERC20(address(base)), 11e6, owner);
    }

    /// @dev Custody knows no list: any token that arrived may leave through the owner.
    function test_anUnlistedTokenCanStillBeWithdrawn() public {
        MockERC20 airdrop = new MockERC20("Air", "AIR", 18);
        airdrop.mint(address(vault), 5e18);

        vm.prank(owner);
        vault.withdraw(IERC20(address(airdrop)), 5e18, owner);

        assertEq(airdrop.balanceOf(owner), 5e18);
    }

    /// @dev A fee-on-transfer token is out of scope: what arrives is less than declared,
    ///      and the vault does not try to fix that — the test exists to pin the behavior.
    function test_aFeeOnTransferTokenArrivesShort() public {
        FeeOnTransferERC20 weird = new FeeOnTransferERC20(100);
        weird.mint(owner, 100e18);

        vm.startPrank(owner);
        weird.approve(address(vault), 100e18);
        vault.deposit(IERC20(address(weird)), 100e18);
        vm.stopPrank();

        assertEq(weird.balanceOf(address(vault)), 99e18);
    }
}
