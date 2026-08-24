// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {IStrategy} from "../api/IStrategy.sol";
import {IVaultViews} from "../api/IVaultViews.sol";
import {Intent, Side} from "../api/types/Intent.sol";
import {Lot} from "../api/types/Lot.sol";
import {VaultView} from "../api/types/VaultView.sol";

/// @title IPriceFeed
/// @notice The two functions of a Chainlink aggregator that this strategy uses.
/// @dev Declared here on purpose instead of adding the Chainlink package as a dependency.
///      The full `AggregatorV3Interface` carries five functions and a whole repository behind
///      it; two of them are used, and a dependency that large for two signatures is supply
///      chain surface without a matching gain.
interface IPriceFeed {
    /// @notice Decimals of the reported answer.
    function decimals() external view returns (uint8);

    /// @notice Latest round published by the aggregator.
    /// @return roundId Identifier of the round.
    /// @return answer Reported price, in `decimals()` fixed point.
    /// @return startedAt Timestamp the round started.
    /// @return updatedAt Timestamp the answer was written.
    /// @return answeredInRound Round the answer was computed in.
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}

/// @title OracleFloorStrategy
/// @notice Proposes one ticket per execution, with a floor RELATIVE to an oracle price.
///
/// @dev WHY THIS CONTRACT EXISTS
///
/// The strategy it replaces declared `MIN_OUT_PER_TICKET = 8.9e17` — an absolute quantity in
/// an `immutable`. Deployed at block 92,490,041 with 7.83% of slack, it went underwater in
/// 1.65 days because WMATIC rose 12.09%. Measured over 4,317 hourly points across 179.9 days,
/// 7.83% of slack survives 1.65 days in 96.1% of windows: the failure was a 3.9% event, about
/// one deployment in 26. Expected, not unlucky.
///
/// The defect was never the number. It was that an absolute floor ages, and an `immutable`
/// cannot be re-aimed. Over the same 4,317 hours, an absolute floor passes between 62.4% and
/// 99.1% of the time depending on the horizon, while a relative floor at 12% passes 100% at
/// every horizon. The finding is not that the relative floor is looser — it is that its column
/// does not vary with the horizon. Term stops being a variable of the problem.
///
/// @dev WHY CHAINLINK AND NOT THE POOL
///
/// An AMM price is derived from balances, and balances can be borrowed: a flash loan moves it.
/// Moving an oracle means corrupting the network that publishes it. Measured on Polygon: two
/// feeds cost 66,664 gas — 22% of the 300k cap this contract is called under — against 136,613
/// for a 15-minute TWAP, which is 45.5%. Half the cost, and it does not move with borrowed money.
///
/// Reading only MATIC/USD and assuming USDC = US$ 1 costs 11% instead of 22%. It is refused:
/// assuming the base's peg is exactly what breaks during a depeg, and a depeg is when the floor
/// matters most.
///
/// @dev THE DIVISION OF LABOUR, AND WHY THIS FLOOR IS DELIBERATELY LOOSE
///
/// This floor is a SHAPE guard. It refuses the absurd; it does not chase fair value. What
/// tightens execution is the submitter's `operatorMinOut`, which is a `uint256`, is per
/// execution, and locks into the `executionHash` at signing time — so it can carry the depth of
/// the moment, which an on-chain read cannot afford.
///
/// The vault's own `minRatioBps` cannot do this job at all: its `10 ** decimals` cancel, so
/// `bps / 10_000` is an absolute exchange rate rather than a tolerance, a buy needs `P` while a
/// sell needs `1 / P`, and `uint16` caps the whole thing at 6.5535. At the largest global value
/// that does not freeze the sell of WMATIC/USDC, the buy is protected at 1.19% of fair value.
///
/// @dev THE VAULT SWALLOWS THIS CONTRACT'S REVERT REASON
///
/// `VaultExecution._askStrategy` does `if (!ok || returned.length < INTENT_ENCODED_SIZE) revert
/// StrategyCallFailed()`. A named error raised here reaches the caller as `StrategyCallFailed`
/// and nothing else. That shapes the two refusals below and they are NOT interchangeable:
///
///   reverting        the oracle is unusable (stale, or a non-positive answer). The caller sees
///                    `StrategyCallFailed` and must call `propose` directly to learn why.
///   `amountIn == 0`  there is simply nothing to do. The vault answers
///                    `AmountQuantizedToZero`, which already means "deposit more".
///
/// Collapsing the two would make an empty vault indistinguishable from a frozen feed.
contract OracleFloorStrategy is IStrategy {
    /// @notice Basis points denominator.
    uint256 internal constant BPS = 10_000;

    /// @notice Smallest tolerance the constructor accepts, in basis points.
    /// @dev Not a round number chosen by taste, and not zero. Zero would demand the executed
    ///      amount equal the oracle's own number exactly, which reverts on every normal
    ///      execution — and a guard that refuses zero while accepting 1 teaches the workaround
    ///      instead of closing it, because 1 bps is functionally zero here.
    ///
    ///      A Chainlink feed lags the market between updates, by design: it republishes on a
    ///      deviation threshold or a heartbeat, whichever comes first, so the floor has to clear
    ///      that lag before it can say anything about execution quality.
    ///
    ///      Measured over 120 contiguous 30-minute points — 2.5 days, 100% coverage, both sides
    ///      read AT THE SAME BLOCK — the deviation between the price derived from the feeds and
    ///      the pool the vault trades against has a median of 4.0 bps, a p99 of 27.5, and a
    ///      maximum of 32.5. At 100 bps this bound sits 3.1x above the largest deviation
    ///      observed: deliberate slack, not a fitted number. No value tested between 50 and 300
    ///      bps would have rejected a single point.
    ///
    ///      THE SAMPLE IS CALM MARKET, and that is why the slack is there. A USDC depeg, a
    ///      halted feed, or an extreme volatility event all sit outside this distribution; 2.5
    ///      days of quiet cannot speak for them.
    ///
    ///      This comment replaces an earlier one citing 117 bps from a single reading. That
    ///      number came from comparing the feed at one block against the pool at another, so it
    ///      measured lag PLUS price movement and reported the sum as lag. It was carried here
    ///      marked PENDING precisely so the auditor would check it, and the check moved it.
    uint16 internal constant MIN_TOLERANCE_BPS = 100;

    /// @notice Largest tolerance the constructor accepts, in basis points.
    /// @dev Above 50% the floor stops being protection and becomes a formality: it would admit
    ///      losing more than half of fair value while still reporting that a floor was checked.
    uint16 internal constant MAX_TOLERANCE_BPS = 5_000;

    /// @notice How far ahead of this chain's clock a feed answer may be dated, in seconds.
    /// @dev A Polygon block is 1.5 seconds, measured over 721,813 blocks. Sixty seconds absorbs
    ///      any ordering skew between the aggregator's write and this read, and refuses anything
    ///      that could only come from a clock that is not this chain's.
    uint256 internal constant MAX_SKEW = 60;

    /// @notice Bounds the vault itself enforces on token decimals in `_readDecimals`.
    uint8 internal constant MIN_DECIMALS = 1;

    /// @notice Upper decimals bound, matching the vault.
    uint8 internal constant MAX_DECIMALS = 18;

    /// @notice Non-base token this strategy trades.
    address public immutable ASSET;

    /// @notice Base currency this strategy trades against.
    address public immutable BASE;

    /// @notice Decimals of `ASSET`.
    uint8 public immutable ASSET_DECIMALS;

    /// @notice Decimals of `BASE`.
    uint8 public immutable BASE_DECIMALS;

    /// @notice Feed reporting `ASSET` in a reference currency.
    address public immutable ASSET_FEED;

    /// @notice Feed reporting `BASE` in the same reference currency.
    address public immutable BASE_FEED;

    /// @notice Input amount of a buy, in `BASE` units.
    uint256 public immutable TICKET;

    /// @notice Oldest feed answer accepted, in seconds.
    uint256 public immutable MAX_AGE;

    /// @notice Tolerance applied to the floor of a buy, in basis points.
    uint16 public immutable BUY_TOLERANCE_BPS;

    /// @notice Tolerance applied to the floor of a sell, in basis points.
    /// @dev Separate from the buy on purpose. Over 30-day windows at 95% survival the two legs
    ///      want 10.30% and 22.95%; a single number wastes 2.23x on one of them, and the sell is
    ///      the leg that has been left uncovered before.
    uint16 public immutable SELL_TOLERANCE_BPS;

    /// @notice How much of a lot's entry capital this strategy will realise as a loss, in bps.
    ///
    /// @dev THE SELL CHANGED ITS NATURE HERE, AND THE CHANGE IS DELIBERATE.
    ///
    /// `ExampleStrategy`, the contract this one replaces, set the sell floor to
    /// `lot.allocatedCapital` — it never sold a lot below what the lot cost. That is genuine
    /// capital protection and losing it silently would be the kind of change nobody discovers
    /// by reading the diff, so it is written here rather than left to be inferred.
    ///
    /// It also carried exactly the disease this contract exists to cure: `allocatedCapital` is
    /// an absolute quantity in base units, fixed at the moment the lot opened. A lot bought
    /// into a market that then fell could never be sold — not at a loss, not at any price —
    /// because the floor demanded a number the market no longer offered. The only exit was
    /// `withdraw`, which hands the owner the asset instead of the money.
    ///
    /// So the sell floor is now the HIGHER of two things: the oracle floor, which protects
    /// against a bad fill, and the entry capital reduced by this parameter, which bounds how
    /// much of a bad market the strategy will absorb.
    ///
    ///   `0`      never realises a loss, which is `ExampleStrategy`'s policy.
    ///   `3000`   closes a position down to 30% below entry, and refuses beyond that.
    ///   `10000`  always closes at the oracle price, whatever the entry was.
    ///
    /// AT ZERO THE POLICY MATCHES, THE PROPOSAL DOES NOT ALWAYS. `ExampleStrategy` proposes
    /// `lot.remaining` and demands the whole `allocatedCapital`; this one proposes `backing` and
    /// demands capital pro rata. On a fully backed lot the two are identical. On an under-backed
    /// one they diverge, and deliberately: proposing more asset than the vault holds is stopped
    /// by `ExampleFullBackingGuard` where it is configured and reverts on transfer where it is
    /// not. The earlier claim of reproducing it "byte for byte" was too strong — it held only
    /// for the case the first test happened to exercise.
    ///
    /// BE CLEAR ABOUT WHAT THIS DOES NOT FIX: any value below `10000` is still an absolute
    /// floor anchored to the entry price. It ages more slowly than a hardcoded constant does,
    /// because it moves with each lot, but a market that falls further than this parameter
    /// locks the position again. The buffer is a buffer, not a cure.
    uint16 public immutable MAX_LOSS_BPS;

    /// @dev Precomputed so `propose` does no exponentiation. Buy: `BASE` in, `ASSET` out.
    uint256 private immutable BUY_NUMERATOR;

    /// @dev Denominator scale of a buy.
    uint256 private immutable BUY_DENOMINATOR;

    /// @dev Numerator scale of a sell: `ASSET` in, `BASE` out.
    uint256 private immutable SELL_NUMERATOR;

    /// @dev Denominator scale of a sell.
    uint256 private immutable SELL_DENOMINATOR;

    /// @notice A constructor argument that must not be the zero address was zero.
    error ZeroAddress();

    /// @notice Token decimals outside the range the vault itself accepts.
    /// @param decimals The offending value.
    error DecimalsOutOfRange(uint8 decimals);

    /// @notice A tolerance outside `[MIN_TOLERANCE_BPS, MAX_TOLERANCE_BPS]`.
    /// @param toleranceBps The offending value.
    error ToleranceOutOfRange(uint16 toleranceBps);

    /// @notice A max loss above 100%, which has no meaning.
    /// @param maxLossBps The offending value.
    error MaxLossOutOfRange(uint16 maxLossBps);

    /// @notice `TICKET` was zero, which would propose a trade that cannot execute.
    error TicketIsZero();

    /// @notice `MAX_AGE` was zero, which would reject every answer including a fresh one.
    error MaxAgeIsZero();

    /// @notice A feed answer is older than `MAX_AGE`.
    /// @param feed Address of the offending feed.
    /// @param age Age of the answer in seconds.
    error FeedStale(address feed, uint256 age);

    /// @notice A feed answered zero or a negative price.
    /// @param feed Address of the offending feed.
    /// @param answer The offending answer.
    error FeedNotPositive(address feed, int256 answer);

    /// @param asset Non-base token to trade.
    /// @param base Base currency to trade against.
    /// @param assetDecimals Decimals of `asset`.
    /// @param baseDecimals Decimals of `base`.
    /// @param assetFeed Feed reporting `asset`.
    /// @param baseFeed Feed reporting `base` in the same reference currency.
    /// @param ticket Input amount of a buy, in `base` units.
    /// @param maxAge Oldest feed answer accepted, in seconds.
    /// @param buyToleranceBps Tolerance of the buy floor.
    /// @param sellToleranceBps Tolerance of the sell floor.
    /// @dev Decimals are arguments rather than reads because `IERC20Metadata.decimals` is
    ///      optional in the standard and some tokens do not implement it. The vault records
    ///      them the same way, so a mismatch here is a mismatch with the vault and the
    ///      deployment script is where the two are compared.
    constructor(
        address asset,
        address base,
        uint8 assetDecimals,
        uint8 baseDecimals,
        address assetFeed,
        address baseFeed,
        uint256 ticket,
        uint256 maxAge,
        uint16 buyToleranceBps,
        uint16 sellToleranceBps,
        uint16 maxLossBps
    ) {
        if (asset == address(0) || base == address(0) || assetFeed == address(0) || baseFeed == address(0)) {
            revert ZeroAddress();
        }
        if (assetDecimals < MIN_DECIMALS || assetDecimals > MAX_DECIMALS) revert DecimalsOutOfRange(assetDecimals);
        if (baseDecimals < MIN_DECIMALS || baseDecimals > MAX_DECIMALS) revert DecimalsOutOfRange(baseDecimals);
        if (ticket == 0) revert TicketIsZero();
        if (maxAge == 0) revert MaxAgeIsZero();
        if (buyToleranceBps < MIN_TOLERANCE_BPS || buyToleranceBps > MAX_TOLERANCE_BPS) {
            revert ToleranceOutOfRange(buyToleranceBps);
        }
        if (sellToleranceBps < MIN_TOLERANCE_BPS || sellToleranceBps > MAX_TOLERANCE_BPS) {
            revert ToleranceOutOfRange(sellToleranceBps);
        }
        /* Zero is ACCEPTED here, unlike the tolerances, and the difference is not an oversight.
           A tolerance of zero is a floor that can never be met; a max loss of zero is a
           meaningful policy — it is exactly what `ExampleStrategy` does today. Refusing it
           would remove the one value that makes this parameter a safe migration. */
        if (maxLossBps > BPS) revert MaxLossOutOfRange(maxLossBps);

        ASSET = asset;
        BASE = base;
        ASSET_DECIMALS = assetDecimals;
        BASE_DECIMALS = baseDecimals;
        ASSET_FEED = assetFeed;
        BASE_FEED = baseFeed;
        TICKET = ticket;
        MAX_AGE = maxAge;
        BUY_TOLERANCE_BPS = buyToleranceBps;
        SELL_TOLERANCE_BPS = sellToleranceBps;
        MAX_LOSS_BPS = maxLossBps;

        uint8 assetFeedDecimals = IPriceFeed(assetFeed).decimals();
        uint8 baseFeedDecimals = IPriceFeed(baseFeed).decimals();

        /* Read once, here, and never at execution: a feed's `decimals()` is fixed for the life
           of the aggregator, and two extra calls inside `propose` would spend gas from a 300k
           budget to learn a constant. */
        BUY_NUMERATOR = 10 ** assetFeedDecimals * 10 ** assetDecimals;
        BUY_DENOMINATOR = 10 ** baseFeedDecimals * 10 ** baseDecimals;
        SELL_NUMERATOR = BUY_DENOMINATOR;
        SELL_DENOMINATOR = BUY_NUMERATOR;
    }

    /// @inheritdoc IStrategy
    /// @dev Closing comes before opening. A sell returns capital to the base balance, and
    ///      proposing a buy while a lot the vault can close is sitting open would spend base on
    ///      a second position instead of realising the first.
    function propose(VaultView calldata v) external view returns (Intent memory) {
        Lot memory candidate = IVaultViews(v.vault).lot(v.candidateLotId);

        if (candidate.remaining > 0 && candidate.asset == ASSET && candidate.base == BASE) {
            /* `backing` and not `remaining`: it is the lesser of the two, and proposing more
               asset than the vault actually holds produces a route that reverts on transfer. */
            uint256 amountIn = IVaultViews(v.vault).backing(v.candidateLotId);
            if (amountIn > 0) {
                uint256 oracleFloor =
                    _floor(amountIn, SELL_NUMERATOR, SELL_DENOMINATOR, SELL_TOLERANCE_BPS, false);

                /* PRO RATA, and not the whole lot's capital. Selling half a lot must not demand
                   what the whole lot cost — that floor is unmeetable by construction and would
                   make every partial close revert while looking like a market problem. */
                uint256 capitalAtRisk = Math.mulDiv(
                    uint256(candidate.allocatedCapital), amountIn, uint256(candidate.remaining)
                );
                uint256 lossFloor = Math.mulDiv(capitalAtRisk, BPS - MAX_LOSS_BPS, BPS);

                return Intent({
                    side: Side.Sell,
                    asset: ASSET,
                    base: BASE,
                    amountIn: amountIn,
                    /* The HIGHER of the two: the oracle floor guards the fill, the loss floor
                       bounds how much of a fallen market the strategy absorbs. With
                       `MAX_LOSS_BPS == 0` the second is the entry capital itself and this is
                       `ExampleStrategy` exactly. */
                    minOut: oracleFloor > lossFloor ? oracleFloor : lossFloor,
                    lotId: v.candidateLotId
                });
            }
        }

        /* A partial ticket buys what there is, matching `ExampleStrategy`. Refusing anything
           below a whole ticket would be a regression against the strategy this one replaces,
           and it would strand a balance the vault can perfectly well trade. The vault's own
           `Floors.minTicket` refuses genuine dust below `10 ** (decimals - 2)`.

           The floor needs no special handling for the partial case: it is computed from the
           price of the actual `amountIn`, so it scales exactly. `ExampleStrategy` had to round
           its proportional floor UP to stop it reaching zero on small buys — a fixed floor
           divided proportionally can truncate to nothing, and a constructor that refuses zero
           becomes a check satisfiable without protecting. A relative floor cannot land there. */
        uint256 amountIn = v.baseBalance < TICKET ? v.baseBalance : TICKET;

        if (amountIn > 0) {
            return Intent({
                side: Side.Buy,
                asset: ASSET,
                base: BASE,
                amountIn: amountIn,
                minOut: _floor(amountIn, BUY_NUMERATOR, BUY_DENOMINATOR, BUY_TOLERANCE_BPS, true),
                lotId: 0
            });
        }

        /* Nothing to do. `amountIn == 0` makes the vault answer `AmountQuantizedToZero`, which
           already reads as "deposit more" — see the note on the two refusals at the top. The
           feeds are deliberately NOT read on this path: an empty vault must not be reported as
           an oracle failure. */
        return Intent({side: Side.Buy, asset: ASSET, base: BASE, amountIn: 0, minOut: 0, lotId: 0});
    }

    /// @notice Price the two feeds imply, checked for staleness and sign.
    /// @return assetAnswer Price of `ASSET`.
    /// @return baseAnswer Price of `BASE`.
    function prices() external view returns (uint256 assetAnswer, uint256 baseAnswer) {
        return (_read(ASSET_FEED), _read(BASE_FEED));
    }

    /// @notice Floor of a trade, relative to the oracle price.
    /// @param amountIn Input amount in the input token's units.
    /// @param numerator Precomputed scale numerator.
    /// @param denominator Precomputed scale denominator.
    /// @param toleranceBps Tolerance to subtract, in basis points.
    /// @param isBuy Whether `ASSET` is the output.
    /// @return Floor in the output token's units.
    /// @dev A single `mulDiv` and not two: chaining them would truncate the intermediate and
    ///      lose precision that the 512-bit intermediate keeps for free.
    function _floor(uint256 amountIn, uint256 numerator, uint256 denominator, uint16 toleranceBps, bool isBuy)
        private
        view
        returns (uint256)
    {
        uint256 assetAnswer = _read(ASSET_FEED);
        uint256 baseAnswer = _read(BASE_FEED);

        /* On a buy the base is paid and the asset is received, so the base's price is on top;
           on a sell the two swap places. */
        (uint256 top, uint256 bottom) = isBuy ? (baseAnswer, assetAnswer) : (assetAnswer, baseAnswer);

        uint256 expected = Math.mulDiv(amountIn, top * numerator, bottom * denominator);

        return Math.mulDiv(expected, BPS - toleranceBps, BPS);
    }

    /// @notice Reads a feed, refusing a stale or non-positive answer.
    /// @param feed Aggregator to read.
    /// @return Answer as an unsigned value.
    /// @dev The two checks are not decoration. A frozen feed does not report that it is frozen:
    ///      it keeps answering the last price it knew, and a floor computed from it looks
    ///      perfectly well formed while pointing at a market that no longer exists. A negative
    ///      answer is a documented failure mode of an aggregator, and casting it unsigned
    ///      without the check would turn it into an enormous positive price.
    function _read(address feed) private view returns (uint256) {
        (, int256 answer,, uint256 updatedAt,) = IPriceFeed(feed).latestRoundData();

        if (answer <= 0) revert FeedNotPositive(feed, answer);

        /* `updatedAt` a little into the future is treated as fresh rather than as an error: the
           aggregator and this chain share a clock, and a one-second skew is not a reason to
           freeze a vault.

           BUT THE INDULGENCE IS BOUNDED. The first version skipped the whole staleness check
           whenever `updatedAt >= block.timestamp`, which let a timestamp ten years ahead pass
           as fresh forever. Reaching that state is not producible by an aggregator writing from
           this chain's own clock — and "not producible by normal operation" is the argument
           that turns a hole into a habit. `MAX_SKEW` makes it impossible instead of unlikely. */
        if (updatedAt > block.timestamp + MAX_SKEW) revert FeedStale(feed, 0);

        // comparing against 'block.timestamp' is the intended behaviour here: staleness is a
        // measurement in seconds, and the seconds a validator can shift cannot turn a feed that
        // is minutes fresh into one that is minutes stale. The window is chosen far above that
        // margin at deployment, which is what makes the comparison safe rather than the clock.
        // forge-lint: disable-next-line(block-timestamp)
        if (updatedAt < block.timestamp) {
            uint256 age = block.timestamp - updatedAt;
            if (age > MAX_AGE) revert FeedStale(feed, age);
        }

        // casting to 'uint256' is safe because the line above reverts on 'answer <= 0', so the
        // value reaching here is strictly positive and the conversion is lossless. Without that
        // check the cast is precisely the bug it looks like: a negative answer would become an
        // enormous positive price and the floor would pass anything.
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint256(answer);
    }
}
