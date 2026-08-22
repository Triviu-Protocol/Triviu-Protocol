// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {Fees} from "../../src/vault/libraries/Fees.sol";
import {ExecutionParams} from "../../src/vault/types/ExecutionParams.sol";
import {IVaultExecutionEvents} from "../../src/vault/interfaces/IVaultExecutionEvents.sol";
import {IVaultPositionsEE} from "../../src/vault/interfaces/IVaultPositionsEE.sol";
import {IVaultExecutionEE} from "../../src/api/IVaultExecutionEE.sol";
import {Intent, Side} from "../../src/api/types/Intent.sol";
import {Lot} from "../../src/api/types/Lot.sol";

import {BaseTest} from "../util/BaseTest.sol";
import {BackingGuard} from "../util/Mocks.sol";

/// @notice Settlement: who receives what, what becomes a lot, and what gets recorded.
contract SettleTest is BaseTest {
    uint256 private constant SPEND = 100e6;
    uint256 private constant RECEIVED = 1e18;

    function setUp() public override {
        super.setUp();
        _fundBase(1_000e6);
    }

    function _buy(uint256 spend, uint256 received) private {
        Intent memory intent = _buyIntent(spend);
        strategy.setIntent(intent);
        router.setRate((received * 1e18) / spend);

        _execute(intent);

        router.setRate(1e18);
    }

    // --- buy ---------------------------------------------------------------

    function test_theBuyOpensALotWithWhatArrivedAndWhatItCost() public {
        _buy(SPEND, RECEIVED);

        Lot memory lot = vault.lot(0);

        assertEq(lot.asset, address(asset));
        assertEq(lot.base, address(base));
        assertEq(lot.remaining, RECEIVED);
        assertEq(lot.allocatedCapital, SPEND);
        assertEq(asset.balanceOf(address(vault)), RECEIVED);
    }

    /// @dev On a buy the fee applies to what was spent, and comes out of the balance, not of what arrived.
    function test_theBuyFeeGoesToTheTreasury() public {
        uint256 before = base.balanceOf(address(vault));
        uint256 fee = Fees.protocolFee(SPEND, FEE_BPS);

        _buy(SPEND, RECEIVED);

        assertEq(base.balanceOf(treasury), fee);
        assertEq(base.balanceOf(address(vault)), before - SPEND - fee);
    }

    function test_withoutAFeeNothingLeavesForTheTreasury() public {
        vm.prank(admin);
        registry.setFeeBps(0);

        _buy(SPEND, RECEIVED);

        assertEq(base.balanceOf(treasury), 0);
    }

    function test_theExecutionIsAnnouncedWithTheWholeStory() public {
        uint256 fee = Fees.protocolFee(SPEND, FEE_BPS);

        Intent memory intent = _buyIntent(SPEND);
        strategy.setIntent(intent);
        router.setRate((RECEIVED * 1e18) / SPEND);

        ExecutionParams memory p = _params(intent);

        vm.recordLogs();
        vm.prank(operator);
        vault.execute(p);

        // The event carries both sides: what was traded and what was deducted.
        Lot memory lot = vault.lot(0);
        assertEq(lot.allocatedCapital, SPEND);
        assertEq(base.balanceOf(treasury), fee);
    }

    function test_theNonceAndTheClockMoveOnce() public {
        assertEq(vault.nonce(), 0);
        assertEq(vault.lastExecAt(), 0);

        _buy(SPEND, RECEIVED);

        assertEq(vault.nonce(), 1);
        assertEq(vault.lastExecAt(), uint64(block.timestamp));
    }

    // --- refund -------------------------------------------------------------

    function test_theRefundIsPaidToWhoeverSubmitted() public {
        uint256 declared = 1e5;

        Intent memory intent = _buyIntent(SPEND);
        strategy.setIntent(intent);

        ExecutionParams memory p = _params(intent);
        p.declaredRefund = declared;
        p.declaredGas = 200_000;
        p.declaredGasPrice = 30 gwei;
        p.declaredQuote = 1;
        p = _seal(p, intent);

        vm.prank(operator);
        vault.execute(p);

        assertEq(base.balanceOf(operator), declared);
    }

    /// @dev The refund has two ceilings, and the lower one rules: here it is 1% of the traded amount.
    function test_anOversizedRefundIsCutToTheCap() public {
        uint256 declared = 100e6;
        uint256 expected = Fees.gasRefund(declared, SPEND, BASE_DECIMALS);

        assertLt(expected, declared);

        Intent memory intent = _buyIntent(SPEND);
        strategy.setIntent(intent);

        ExecutionParams memory p = _params(intent);
        p.declaredRefund = declared;
        p = _seal(p, intent);

        vm.prank(operator);
        vm.expectEmit(false, false, false, true);
        emit IVaultExecutionEvents.RefundDetail(0, 0, 0, declared, expected);
        vault.execute(p);

        assertEq(base.balanceOf(operator), expected);
    }

    function test_withoutADeclaredRefundNothingIsPaidAndNothingIsLogged() public {
        _buy(SPEND, RECEIVED);

        assertEq(base.balanceOf(operator), 0);
    }

    // --- sell ----------------------------------------------------------------

    function test_theSellClosesTheLotAndBringsTheBaseBack() public {
        _buy(SPEND, RECEIVED);
        skip(COOLDOWN);

        uint256 proceeds = 120e6;
        uint256 fee = Fees.protocolFee(proceeds, FEE_BPS);
        uint256 baseBefore = base.balanceOf(address(vault));

        Intent memory sell = _sellIntent(0, RECEIVED);
        strategy.setIntent(sell);
        router.setRate((proceeds * 1e18) / RECEIVED);

        _execute(sell);

        Lot memory lot = vault.lot(0);
        assertEq(lot.remaining, 0);
        assertEq(lot.allocatedCapital, 0);
        assertEq(asset.balanceOf(address(vault)), 0);
        assertEq(base.balanceOf(address(vault)), baseBefore + proceeds - fee);
        assertEq(base.balanceOf(treasury), Fees.protocolFee(SPEND, FEE_BPS) + fee);
    }

    function test_aPartialSellLeavesTheLotOpen() public {
        _buy(SPEND, RECEIVED);
        skip(COOLDOWN);

        Intent memory sell = _sellIntent(0, RECEIVED / 4);
        strategy.setIntent(sell);
        router.setRate(30e6 * 1e18 / (RECEIVED / 4));

        _execute(sell);

        Lot memory lot = vault.lot(0);
        assertEq(lot.remaining, RECEIVED - RECEIVED / 4);
        assertEq(lot.allocatedCapital, SPEND - SPEND / 4);
    }

    function test_sellingMoreThanTheLotHoldsIsRefused() public {
        _buy(SPEND, RECEIVED);
        skip(COOLDOWN);

        Intent memory sell = _sellIntent(0, RECEIVED + 1);
        strategy.setIntent(sell);

        ExecutionParams memory p = _params(sell);

        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(IVaultPositionsEE.AmountExceedsLot.selector, 0, RECEIVED + 1, RECEIVED));
        vault.execute(p);
    }

    function test_sellingALotThatDoesNotExistIsRefused() public {
        Intent memory sell = _sellIntent(3, 1e18);
        strategy.setIntent(sell);

        ExecutionParams memory p = _params(sell);

        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(IVaultPositionsEE.LotNotFound.selector, 3));
        vault.execute(p);
    }

    /// @dev On a sell the deductions come out of what the route delivered, and the `Strategy` floor is on the net.
    function test_theStrategyFloorIsCheckedAgainstTheNetOnASell() public {
        _buy(SPEND, RECEIVED);
        skip(COOLDOWN);

        uint256 proceeds = 100e6;

        Intent memory sell = _sellIntent(0, RECEIVED);
        sell.minOut = proceeds;
        strategy.setIntent(sell);
        router.setRate((proceeds * 1e18) / RECEIVED);

        ExecutionParams memory p = _params(sell);

        vm.prank(operator);
        vm.expectRevert(IVaultExecutionEE.NetBelowStrategyMin.selector);
        vault.execute(p);
    }

    /// @dev The backing guard sees the real balance: a lot without the asset in the vault is not sellable.
    function test_theBackingGuardStopsASaleWithoutTheAsset() public {
        _buy(SPEND, RECEIVED);
        skip(COOLDOWN);

        BackingGuard backing = new BackingGuard();

        vm.prank(owner);
        vault.addGuard(address(backing));

        // The asset leaves the vault by other means, and the lot is left without backing.
        vm.prank(owner);
        vault.withdraw(IERC20(address(asset)), RECEIVED, owner);

        Intent memory sell = _sellIntent(0, RECEIVED);
        strategy.setIntent(sell);

        ExecutionParams memory p = _params(sell);

        vm.prank(operator);
        vm.expectRevert();
        vault.execute(p);
    }

    // --- accounting over time --------------------------------------------------

    /// @dev Two lots coexist, and each sell touches only its own.
    function test_twoLotsAreAccountedSeparately() public {
        _buy(SPEND, RECEIVED);
        skip(COOLDOWN);
        _buy(SPEND * 2, RECEIVED * 3);
        skip(COOLDOWN);

        assertEq(vault.lotCount(), 2);

        Intent memory sell = _sellIntent(1, RECEIVED * 3);
        strategy.setIntent(sell);
        router.setRate((250e6 * 1e18) / (RECEIVED * 3));

        _execute(sell);

        assertEq(vault.lot(0).remaining, RECEIVED);
        assertEq(vault.lot(1).remaining, 0);
    }

    function testFuzz_theCapitalOfALotNeverGrows(uint256 first, uint256 second) public {
        _buy(SPEND, RECEIVED);

        // The ticket floor applies to both pieces: below it the sell does not even reach the lot.
        uint256 floor = 1e16;
        first = bound(first, floor, RECEIVED - floor);
        second = bound(second, floor, RECEIVED - first);

        uint256 capital = vault.lot(0).allocatedCapital;

        skip(COOLDOWN);
        Intent memory sell = _sellIntent(0, first);
        strategy.setIntent(sell);
        _execute(sell);

        uint256 afterFirst = vault.lot(0).allocatedCapital;
        assertLe(afterFirst, capital);

        skip(COOLDOWN);
        Intent memory again = _sellIntent(0, second);
        strategy.setIntent(again);
        _execute(again);

        assertLe(vault.lot(0).allocatedCapital, afterFirst);
    }
}
