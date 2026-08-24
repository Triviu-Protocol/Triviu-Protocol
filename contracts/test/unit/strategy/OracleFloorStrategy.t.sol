// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";

import {IStrategy} from "../../../src/api/IStrategy.sol";
import {Intent, Side} from "../../../src/api/types/Intent.sol";
import {Limits} from "../../../src/api/types/Limits.sol";
import {Lot} from "../../../src/api/types/Lot.sol";
import {VaultView} from "../../../src/api/types/VaultView.sol";
import {IPriceFeed, OracleFloorStrategy} from "../../../src/strategy/OracleFloorStrategy.sol";

/// @notice Aggregator whose answer and age the test drives.
contract FeedStub is IPriceFeed {
    uint8 private immutable DECIMALS;
    int256 public answer;
    uint256 public updatedAt;

    constructor(uint8 decimals_, int256 answer_, uint256 updatedAt_) {
        DECIMALS = decimals_;
        answer = answer_;
        updatedAt = updatedAt_;
    }

    function decimals() external view returns (uint8) {
        return DECIMALS;
    }

    function set(int256 answer_, uint256 updatedAt_) external {
        answer = answer_;
        updatedAt = updatedAt_;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (1, answer, updatedAt, updatedAt, 1);
    }
}

/// @notice Aggregator that always reverts, to prove a path never touches it.
contract FeedThatReverts is IPriceFeed {
    error NeverCallMe();

    function decimals() external pure returns (uint8) {
        return 8;
    }

    function latestRoundData() external pure returns (uint80, int256, uint256, uint256, uint80) {
        revert NeverCallMe();
    }
}

/// @notice The slice of `IVaultViews` the strategy uses, with `lot` and `backing` INDEPENDENT.
/// @dev They are set separately on purpose. Making `backing` derive from `lot` would let a
///      strategy that reads the wrong one pass, which is the defect this stub exists to expose.
contract VaultViewsStub {
    Lot private _lot;
    uint256 private _backing;

    function setLot(Lot memory l) external {
        _lot = l;
    }

    function setBacking(uint256 b) external {
        _backing = b;
    }

    function lot(uint256) external view returns (Lot memory) {
        return _lot;
    }

    function backing(uint256) external view returns (uint256) {
        return _backing;
    }

    function lotCount() external pure returns (uint256) {
        return 1;
    }

    function limits() external pure returns (Limits) {
        return Limits.wrap(bytes32(0));
    }

    function configEpoch() external pure returns (uint64) {
        return 4;
    }

    function lastExecAt() external pure returns (uint64) {
        return 0;
    }

    function nonce() external pure returns (uint64) {
        return 0;
    }

    function interfaceVersion() external pure returns (uint16) {
        return 1;
    }
}

/// @notice Unit tests for the relative floor.
/// @dev Every number here was measured on Polygon on 2026-08-24 or derived from those
///      measurements by an independent path, never by calling the contract under test.
contract OracleFloorStrategyTest is Test {
    address internal constant WMATIC = 0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270;
    address internal constant USDC = 0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359;

    /* Read from 0xAB594600376Ec9fD91F8e885dADF0CE036862dE0 and
       0xfE4A8cc5b5B2366C1B58Bea3858e81843581b2F7 — MATIC/USD at US$ 0.115456 and USDC/USD at
       US$ 0.999983, both in 8 decimals. */
    int256 internal constant MATIC_USD = 11_545_600;
    int256 internal constant USDC_USD = 99_998_300;

    uint256 internal constant TICKET = 100_000; /* 0.1 USDC */
    uint256 internal constant MAX_AGE = 3600;
    uint16 internal constant BUY_TOL = 1030; /* 30 days at 95% survival, buy leg */
    uint16 internal constant SELL_TOL = 2295; /* 30 days at 95% survival, sell leg */
    uint16 internal constant MAX_LOSS = 3000; /* the owner's declared band: absorb up to 30% */

    /* Computed OUTSIDE this contract before the test existed, then confirmed by a second,
       different path: 0.1 / 0.115456 = 0.86613082 whole WMATIC, times the USDC/USD factor of
       0.999983 gives 0.86611610 — which is this integer. A test that derived the expectation by
       calling the strategy would agree with any bug the strategy has. */
    uint256 internal constant EXPECTED_BUY_OUT = 866_116_096_175_166_297;

    /* 0.89 * 0.115456 / 0.999983 = 0.1027576 USDC, floored to 6 decimals. */
    uint256 internal constant SELL_AMOUNT = 890_000_000_000_000_000;
    uint256 internal constant EXPECTED_SELL_OUT = 102_757;

    FeedStub internal assetFeed;
    FeedStub internal baseFeed;
    VaultViewsStub internal vault;
    OracleFloorStrategy internal strategy;

    function setUp() public {
        vm.warp(1_787_582_481);
        assetFeed = new FeedStub(8, MATIC_USD, block.timestamp);
        baseFeed = new FeedStub(8, USDC_USD, block.timestamp);
        vault = new VaultViewsStub();
        strategy = _deploy(address(assetFeed), address(baseFeed), TICKET, MAX_AGE, BUY_TOL, SELL_TOL);
    }

    function _deploy(address af, address bf, uint256 ticket, uint256 maxAge, uint16 buyTol, uint16 sellTol)
        internal
        returns (OracleFloorStrategy)
    {
        return new OracleFloorStrategy(WMATIC, USDC, 18, 6, af, bf, ticket, maxAge, buyTol, sellTol, MAX_LOSS);
    }

    function _deployWithLoss(uint16 maxLoss) internal returns (OracleFloorStrategy) {
        return new OracleFloorStrategy(
            WMATIC, USDC, 18, 6, address(assetFeed), address(baseFeed), TICKET, MAX_AGE, BUY_TOL, SELL_TOL, maxLoss
        );
    }

    function _view(uint256 lotId, uint256 baseBalance) internal view returns (VaultView memory) {
        return VaultView({
            vault: address(vault),
            configEpoch: 4,
            lastExecAt: 0,
            candidateLotId: lotId,
            baseBalance: baseBalance
        });
    }

    function _openLot(address asset, address base, uint128 remaining, uint256 backing_) internal {
        _openLot(asset, base, remaining, backing_, 0);
    }

    function _openLot(address asset, address base, uint128 remaining, uint256 backing_, uint128 capital) internal {
        vault.setLot(
            Lot({
                asset: asset,
                openedAt: uint48(block.timestamp),
                base: base,
                remaining: remaining,
                allocatedCapital: capital
            })
        );
        vault.setBacking(backing_);
    }

    /* ---------------------------------------------------------------- the buy */

    function test_buy_floorIsRelativeToTheOracle() public view {
        Intent memory i = strategy.propose(_view(0, TICKET));

        assertEq(uint256(i.side), uint256(Side.Buy));
        assertEq(i.asset, WMATIC);
        assertEq(i.base, USDC);
        assertEq(i.amountIn, TICKET);
        assertEq(i.lotId, 0, "a buy opens a lot; it does not name one");
        assertEq(i.minOut, EXPECTED_BUY_OUT * (10_000 - BUY_TOL) / 10_000);
    }

    /// @dev The whole point of the contract: the floor MOVES with the price. The strategy it
    ///      replaces held 8.9e17 fixed, and died in 1.65 days when WMATIC rose 12.09%.
    function test_buy_floorFollowsThePrice() public {
        uint256 before = strategy.propose(_view(0, TICKET)).minOut;

        /* Exactly the move that killed the previous strategy. */
        assetFeed.set(MATIC_USD * 11_209 / 10_000, block.timestamp);
        uint256 afterRise = strategy.propose(_view(0, TICKET)).minOut;

        assertLt(afterRise, before, "the asset got dearer, so a ticket buys less of it");
        /* And it tracks proportionally: 12.09% dearer buys 1/1.1209 of the units. */
        assertApproxEqRel(afterRise, before * 10_000 / 11_209, 1e12);
    }

    /// @dev `ExampleStrategy`, the contract this one replaces, buys what there is when the
    ///      balance does not cover a whole ticket. Refusing it here would be a regression and
    ///      would strand a balance the vault can trade.
    function test_buy_takesAPartialTicket() public view {
        uint256 half = TICKET / 2;
        Intent memory i = strategy.propose(_view(0, half));

        assertEq(i.amountIn, half);
        /* And the floor scales exactly, because it comes from the price of THIS amount.
           `ExampleStrategy` had to round its proportional floor up to keep it off zero; a
           relative floor never needs that. */
        assertEq(i.minOut, (EXPECTED_BUY_OUT / 2) * (10_000 - BUY_TOL) / 10_000);
    }

    function test_buy_proposesNothingOnAnEmptyVault() public view {
        Intent memory i = strategy.propose(_view(0, 0));
        assertEq(i.amountIn, 0, "the vault answers AmountQuantizedToZero, which reads as deposit more");
        assertEq(i.minOut, 0);
    }

    /* --------------------------------------------------------------- the sell */

    function test_sell_usesBackingAndNotRemaining() public {
        /* Different values ON PURPOSE. `backing` is the lesser of `remaining` and the balance
           actually held; proposing `remaining` when the vault holds less produces a route that
           reverts on transfer. With the two equal, a strategy reading either one passes. */
        _openLot(WMATIC, USDC, uint128(SELL_AMOUNT * 2), SELL_AMOUNT);

        Intent memory i = strategy.propose(_view(7, 0));

        assertEq(uint256(i.side), uint256(Side.Sell));
        assertEq(i.amountIn, SELL_AMOUNT, "backing, not remaining");
        assertEq(i.lotId, 7, "the sell names the lot it closes");
        assertEq(i.minOut, EXPECTED_SELL_OUT * (10_000 - SELL_TOL) / 10_000);
    }

    /// @dev Closing frees capital. Buying while a closable lot sits open spends base on a second
    ///      position instead of realising the first.
    function test_sell_takesPriorityOverBuy() public {
        _openLot(WMATIC, USDC, uint128(SELL_AMOUNT), SELL_AMOUNT);

        Intent memory i = strategy.propose(_view(7, TICKET * 100));

        assertEq(uint256(i.side), uint256(Side.Sell));
    }

    function test_sell_ignoresALotOfAnotherPair() public {
        address weth = 0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619;
        _openLot(weth, USDC, uint128(SELL_AMOUNT), SELL_AMOUNT);

        Intent memory i = strategy.propose(_view(7, TICKET));

        assertEq(uint256(i.side), uint256(Side.Buy), "a lot this strategy cannot price is not its lot");
    }

    function test_sell_ignoresALotWithNoBacking() public {
        _openLot(WMATIC, USDC, uint128(SELL_AMOUNT), 0);

        Intent memory i = strategy.propose(_view(7, TICKET));

        assertEq(uint256(i.side), uint256(Side.Buy));
    }

    /* ------------------------------------------------------- the loss cap */

    /// @dev `MAX_LOSS_BPS == 0` must reproduce `ExampleStrategy` byte for byte: the floor is the
    ///      lot's entry capital and the position never closes below what it cost. This is what
    ///      makes the parameter a safe migration instead of a one-way door.
    function test_loss_zeroReproducesTheOldStrategy() public {
        uint128 capital = 100_000; /* the lot cost 0.1 USDC */
        _openLot(WMATIC, USDC, uint128(SELL_AMOUNT), SELL_AMOUNT, capital);

        Intent memory i = _deployWithLoss(0).propose(_view(7, 0));

        assertEq(i.minOut, capital, "never below what the lot cost");
        assertEq(i.amountIn, SELL_AMOUNT, "and the same size, when the lot is fully backed");
    }

    /// @dev AND HERE IT DOES NOT REPRODUCE IT, which is the honest half of the claim.
    ///
    ///      `ExampleStrategy` proposes `candidate.remaining` and demands the WHOLE
    ///      `allocatedCapital`. This one proposes `backing` and demands capital pro rata. When
    ///      the lot is fully backed the two agree — which is the only case the test above
    ///      exercises, and the reason this one exists.
    ///
    ///      Under-backed, they diverge on purpose: the old pair would propose more asset than
    ///      the vault holds and be stopped by `ExampleFullBackingGuard`, or revert on transfer
    ///      where no guard is configured. Proposing what is actually there is the better
    ///      behaviour — but "reproduces byte for byte" was too strong a claim and is corrected
    ///      here rather than left standing.
    function test_loss_zeroDivergesWhenTheLotIsUnderBacked() public {
        uint128 capital = 100_000;
        uint128 remaining = uint128(SELL_AMOUNT);
        uint256 backed = SELL_AMOUNT / 4; /* the vault holds a quarter of the lot */
        _openLot(WMATIC, USDC, remaining, backed, capital);

        Intent memory i = _deployWithLoss(0).propose(_view(7, 0));

        assertEq(i.amountIn, backed, "ExampleStrategy would have proposed `remaining` here");
        assertEq(i.minOut, uint256(capital) / 4, "and would have demanded the whole capital");
    }

    /// @dev The owner's band: absorb a fall of up to 30%, refuse beyond it.
    function test_loss_capBindsWhenTheMarketFell() public {
        uint128 capital = 100_000;
        _openLot(WMATIC, USDC, uint128(SELL_AMOUNT), SELL_AMOUNT, capital);

        /* Halve the price. The oracle floor collapses; the loss cap is what holds. */
        assetFeed.set(MATIC_USD / 2, block.timestamp);

        Intent memory i = _deployWithLoss(3000).propose(_view(7, 0));

        assertEq(i.minOut, uint256(capital) * 7000 / 10_000, "70% of entry, and not a penny less");
        /* And that floor is ABOVE what the market offers, so the sell correctly refuses. */
        assertGt(i.minOut, EXPECTED_SELL_OUT / 2);
    }

    /// @dev In a healthy market the oracle floor is the binding one, and the cap is slack.
    function test_loss_oracleFloorBindsWhenTheMarketHeld() public {
        uint128 capital = 50_000; /* the lot cost half of what it is now worth */
        _openLot(WMATIC, USDC, uint128(SELL_AMOUNT), SELL_AMOUNT, capital);

        Intent memory i = _deployWithLoss(3000).propose(_view(7, 0));

        assertEq(i.minOut, EXPECTED_SELL_OUT * (10_000 - SELL_TOL) / 10_000, "the oracle floor is higher");
    }

    /// @dev Selling half a lot must not demand what the whole lot cost. A floor that cannot be
    ///      met by construction makes every partial close revert while looking like a bad market.
    function test_loss_isProRatedAcrossAPartialSell() public {
        uint128 capital = 100_000;
        uint128 remaining = uint128(SELL_AMOUNT);
        _openLot(WMATIC, USDC, remaining, SELL_AMOUNT / 2, capital);

        Intent memory i = _deployWithLoss(0).propose(_view(7, 0));

        assertEq(i.amountIn, SELL_AMOUNT / 2);
        assertEq(i.minOut, uint256(capital) / 2, "half the lot answers for half the capital");
    }

    function test_loss_hundredPercentAlwaysClosesAtTheOraclePrice() public {
        _openLot(WMATIC, USDC, uint128(SELL_AMOUNT), SELL_AMOUNT, type(uint128).max);

        Intent memory i = _deployWithLoss(10_000).propose(_view(7, 0));

        assertEq(i.minOut, EXPECTED_SELL_OUT * (10_000 - SELL_TOL) / 10_000, "entry stops mattering");
    }

    function test_loss_refusesAboveOneHundredPercent() public {
        vm.expectRevert(abi.encodeWithSelector(OracleFloorStrategy.MaxLossOutOfRange.selector, uint16(10_001)));
        _deployWithLoss(10_001);

        /* And zero is ACCEPTED — unlike a tolerance, zero here is a meaningful policy. */
        _deployWithLoss(0);
    }

    /* --------------------------------------------------------------- the feeds */

    function test_feed_staleAssetIsRefused() public {
        assetFeed.set(MATIC_USD, block.timestamp - MAX_AGE - 1);

        vm.expectRevert(
            abi.encodeWithSelector(OracleFloorStrategy.FeedStale.selector, address(assetFeed), MAX_AGE + 1)
        );
        strategy.propose(_view(0, TICKET));
    }

    /// @dev The base feed is checked too. Reading only MATIC/USD and assuming USDC is worth a
    ///      dollar is exactly what breaks during a depeg, which is when the floor matters most.
    function test_feed_staleBaseIsRefused() public {
        baseFeed.set(USDC_USD, block.timestamp - MAX_AGE - 1);

        vm.expectRevert(
            abi.encodeWithSelector(OracleFloorStrategy.FeedStale.selector, address(baseFeed), MAX_AGE + 1)
        );
        strategy.propose(_view(0, TICKET));
    }

    function test_feed_exactlyAtMaxAgeIsAccepted() public {
        assetFeed.set(MATIC_USD, block.timestamp - MAX_AGE);
        assertGt(strategy.propose(_view(0, TICKET)).minOut, 0, "the bound is inclusive, and the check is > not >=");
    }

    function test_feed_nonPositiveIsRefused() public {
        assetFeed.set(0, block.timestamp);
        vm.expectRevert(abi.encodeWithSelector(OracleFloorStrategy.FeedNotPositive.selector, address(assetFeed), int256(0)));
        strategy.propose(_view(0, TICKET));

        assetFeed.set(-1, block.timestamp);
        vm.expectRevert(abi.encodeWithSelector(OracleFloorStrategy.FeedNotPositive.selector, address(assetFeed), int256(-1)));
        strategy.propose(_view(0, TICKET));
    }

    /// @dev An empty vault must not be reported as an oracle failure. The vault swallows this
    ///      contract's revert reason into `StrategyCallFailed`, so the two refusals become
    ///      indistinguishable if this path ever touches a feed.
    function test_feed_notReadWhenThereIsNothingToDo() public {
        FeedThatReverts dead = new FeedThatReverts();
        OracleFloorStrategy s = _deploy(address(dead), address(dead), TICKET, MAX_AGE, BUY_TOL, SELL_TOL);

        Intent memory i = s.propose(_view(0, 0));

        assertEq(i.amountIn, 0);
    }

    function test_feed_aFutureTimestampIsFreshAndNotAnError() public {
        assetFeed.set(MATIC_USD, block.timestamp + 5);
        assertGt(strategy.propose(_view(0, TICKET)).minOut, 0);
    }

    /// @dev The indulgence for clock skew was UNBOUNDED in the first version: any `updatedAt`
    ///      at or after `block.timestamp` skipped the staleness check entirely, so a timestamp
    ///      ten years ahead passed as fresh forever. Not producible by an aggregator writing
    ///      from this chain's clock — and "not producible by normal operation" is the argument
    ///      that turns a hole into a habit. Found by the auditor, not by this suite.
    function test_feed_aTimestampBeyondTheSkewIsRefused() public {
        /* 60s is the bound and is accepted; 61 is not. Testing only the far case would let a
           bound of a year pass. */
        assetFeed.set(MATIC_USD, block.timestamp + 60);
        assertGt(strategy.propose(_view(0, TICKET)).minOut, 0, "the bound itself is accepted");

        assetFeed.set(MATIC_USD, block.timestamp + 61);
        vm.expectRevert(abi.encodeWithSelector(OracleFloorStrategy.FeedStale.selector, address(assetFeed), uint256(0)));
        strategy.propose(_view(0, TICKET));

        assetFeed.set(MATIC_USD, block.timestamp + 365 days);
        vm.expectRevert(abi.encodeWithSelector(OracleFloorStrategy.FeedStale.selector, address(assetFeed), uint256(0)));
        strategy.propose(_view(0, TICKET));
    }

    /* --------------------------------------------------------- the constructor */

    function test_constructor_refusesToleranceOutsideTheBand() public {
        vm.expectRevert(abi.encodeWithSelector(OracleFloorStrategy.ToleranceOutOfRange.selector, uint16(99)));
        _deploy(address(assetFeed), address(baseFeed), TICKET, MAX_AGE, 99, SELL_TOL);

        vm.expectRevert(abi.encodeWithSelector(OracleFloorStrategy.ToleranceOutOfRange.selector, uint16(0)));
        _deploy(address(assetFeed), address(baseFeed), TICKET, MAX_AGE, 0, SELL_TOL);

        vm.expectRevert(abi.encodeWithSelector(OracleFloorStrategy.ToleranceOutOfRange.selector, uint16(5001)));
        _deploy(address(assetFeed), address(baseFeed), TICKET, MAX_AGE, BUY_TOL, 5001);

        /* And the bounds themselves are accepted — a guard that refuses the normal is not a guard. */
        _deploy(address(assetFeed), address(baseFeed), TICKET, MAX_AGE, 100, 5000);
    }

    function test_constructor_refusesTheDegenerateArguments() public {
        vm.expectRevert(OracleFloorStrategy.TicketIsZero.selector);
        _deploy(address(assetFeed), address(baseFeed), 0, MAX_AGE, BUY_TOL, SELL_TOL);

        vm.expectRevert(OracleFloorStrategy.MaxAgeIsZero.selector);
        _deploy(address(assetFeed), address(baseFeed), TICKET, 0, BUY_TOL, SELL_TOL);

        vm.expectRevert(OracleFloorStrategy.ZeroAddress.selector);
        _deploy(address(0), address(baseFeed), TICKET, MAX_AGE, BUY_TOL, SELL_TOL);

        vm.expectRevert(OracleFloorStrategy.ZeroAddress.selector);
        _deploy(address(assetFeed), address(0), TICKET, MAX_AGE, BUY_TOL, SELL_TOL);
    }

    function test_constructor_refusesDecimalsTheVaultWouldRefuse() public {
        vm.expectRevert(abi.encodeWithSelector(OracleFloorStrategy.DecimalsOutOfRange.selector, uint8(19)));
        new OracleFloorStrategy(
            WMATIC, USDC, 19, 6, address(assetFeed), address(baseFeed), TICKET, MAX_AGE, BUY_TOL, SELL_TOL, MAX_LOSS
        );

        vm.expectRevert(abi.encodeWithSelector(OracleFloorStrategy.DecimalsOutOfRange.selector, uint8(0)));
        new OracleFloorStrategy(
            WMATIC, USDC, 18, 0, address(assetFeed), address(baseFeed), TICKET, MAX_AGE, BUY_TOL, SELL_TOL, MAX_LOSS
        );
    }

    /* ------------------------------------------------------------------ the gas */

    /// @dev `PluginCall.GAS_CAP` is 300_000 and the vault reverts `StrategyCallFailed` on
    ///      exhaustion — with no reason, so an over-budget strategy looks like a broken one.
    function test_gas_fitsUnderThePluginCap() public {
        _openLot(WMATIC, USDC, uint128(SELL_AMOUNT), SELL_AMOUNT);
        VaultView memory v = _view(7, TICKET);

        uint256 before = gasleft();
        strategy.propose(v);
        uint256 spent = before - gasleft();

        emit log_named_uint("propose gas (sell path, warm)", spent);
        assertLt(spent, 300_000, "over the cap the vault answers StrategyCallFailed and says nothing else");
    }

    /* ----------------------------------------------------------------- the fuzz */

    /// @dev The floor must never sit above what the oracle itself implies. If it did, every
    ///      execution would revert on a market behaving exactly as the oracle describes.
    function testFuzz_floorNeverExceedsTheOraclePrice(uint96 balance, uint16 tol) public {
        tol = uint16(bound(tol, 100, 5000));
        vm.assume(balance >= TICKET);

        OracleFloorStrategy s = _deploy(address(assetFeed), address(baseFeed), TICKET, MAX_AGE, tol, SELL_TOL);
        uint256 floor_ = s.propose(_view(0, balance)).minOut;

        assertLe(floor_, EXPECTED_BUY_OUT, "a floor above the oracle price reverts on a healthy market");
        assertGt(floor_, 0, "and a floor of zero is no floor at all");
    }

    /// @dev A looser tolerance can never produce a tighter floor.
    function testFuzz_looserToleranceIsNeverTighter(uint16 a, uint16 b) public {
        a = uint16(bound(a, 100, 5000));
        b = uint16(bound(b, 100, 5000));
        vm.assume(a < b);

        uint256 tight = _deploy(address(assetFeed), address(baseFeed), TICKET, MAX_AGE, a, SELL_TOL)
            .propose(_view(0, TICKET)).minOut;
        uint256 loose = _deploy(address(assetFeed), address(baseFeed), TICKET, MAX_AGE, b, SELL_TOL)
            .propose(_view(0, TICKET)).minOut;

        assertGe(tight, loose);
    }

    function test_interface_isTheOneTheVaultCalls() public view {
        assertEq(
            IStrategy(address(strategy)).propose(_view(0, TICKET)).amountIn,
            TICKET,
            "the vault calls through IStrategy, not through the concrete type"
        );
    }
}
