// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {Script} from "@forge-std/Script.sol";
import {console} from "@forge-std/console.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import {Floors} from "../../src/vault/libraries/Floors.sol";
import {IPriceFeed, OracleFloorStrategy} from "../../src/strategy/OracleFloorStrategy.sol";

/// @notice Checks that belong to the moment of deployment and not to the contract.
/// @dev The strategy's constructor guards what it can see from inside: bounds, zeros, ranges.
///      It cannot see whether the decimals it was handed match the tokens, whether the feeds
///      answer at all, or whether the tolerance is a number anybody should operate. Those are
///      facts about the world at the moment of deployment, and this is where they get checked.
library DeployChecks {
    uint256 internal constant BPS = 10_000;

    /// @notice Largest tolerance this script deploys without an explicit override.
    ///
    /// @dev The contract's own ceiling is 50%, and that ceiling is correct as a TYPE bound: it is
    ///      the only value that reaches 30 days of shelf life at 99% confidence. It would be a
    ///      terrible configuration.
    ///
    ///      At 50% the vault accepts receiving HALF of the reference value. That passes in every
    ///      window measured, not because it is safe but because it is not a floor — it accepts
    ///      any price that is not absurd. The trap is that a large tolerance READS as caution and
    ///      is the opposite, so the number most likely to be chosen by someone being careful is
    ///      the one that protects least.
    ///
    ///      2500 bps is where the measured shelf life reaches 30 days on BOTH legs. Above it, the
    ///      caller states the intent explicitly rather than arriving there by looking prudent.
    uint16 internal constant OPERATIONAL_TOLERANCE_BPS = 2_500;

    /// @notice Declared decimals do not match what the token reports.
    /// @param token The token.
    /// @param declared What the deployer passed.
    /// @param actual What the token answers.
    error DecimalsMismatch(address token, uint8 declared, uint8 actual);

    /// @notice A feed did not answer, or answered something unusable.
    /// @param feed The feed.
    error FeedUnusable(address feed);

    /// @notice A feed's latest answer is already older than the `MAX_AGE` being deployed.
    /// @param feed The feed.
    /// @param age Age of the answer at deployment.
    /// @param maxAge The `MAX_AGE` argument.
    error FeedAlreadyStale(address feed, uint256 age, uint256 maxAge);

    /// @notice A tolerance above the operational band, without the override.
    /// @param toleranceBps The requested tolerance.
    error ToleranceAboveOperationalBand(uint16 toleranceBps);

    /// @notice The ticket is below the vault's own `Floors.minTicket`.
    /// @param ticket The requested ticket.
    /// @param floor The vault's floor.
    error TicketBelowVaultFloor(uint256 ticket, uint256 floor);

    /// @notice Confirms the declared decimals against the tokens themselves.
    /// @param token The token to read.
    /// @param declared The value being passed to the constructor.
    /// @dev The constructor takes decimals as arguments because `IERC20Metadata.decimals` is
    ///      optional in ERC-20 and some tokens do not implement it. That makes it the deployer's
    ///      job to confirm — and a silent mismatch of 18 against 6 moves every floor by 1e12.
    function checkDecimals(address token, uint8 declared) internal view {
        uint8 actual = IERC20Metadata(token).decimals();
        if (actual != declared) revert DecimalsMismatch(token, declared, actual);
    }

    /// @notice Confirms a feed answers, answers positive, and is not already stale.
    /// @param feed The aggregator.
    /// @param maxAge The `MAX_AGE` being deployed.
    /// @dev Deploying a strategy pointed at a feed that is already stale produces a contract that
    ///      reverts on its first call, and the vault reports that as `StrategyCallFailed` with no
    ///      reason. Finding it here costs one `eth_call`; finding it there costs the deployment.
    function checkFeed(address feed, uint256 maxAge) internal view {
        (, int256 answer,, uint256 updatedAt,) = IPriceFeed(feed).latestRoundData();
        if (answer <= 0 || updatedAt == 0) revert FeedUnusable(feed);

        if (updatedAt < block.timestamp) {
            uint256 age = block.timestamp - updatedAt;
            if (age > maxAge) revert FeedAlreadyStale(feed, age, maxAge);
        }
    }

    /// @notice Refuses a tolerance outside the band anyone should operate, absent an override.
    /// @param toleranceBps The requested tolerance.
    /// @param override_ Whether the caller stated the intent explicitly.
    function checkTolerance(uint16 toleranceBps, bool override_) internal pure {
        if (toleranceBps > OPERATIONAL_TOLERANCE_BPS && !override_) {
            revert ToleranceAboveOperationalBand(toleranceBps);
        }
    }

    /// @notice Refuses a ticket the vault would quantize away.
    /// @param ticket The requested ticket, in base units.
    /// @param baseDecimals Decimals of the base currency.
    function checkTicket(uint256 ticket, uint8 baseDecimals) internal pure {
        uint256 floor = Floors.minTicket(baseDecimals);
        if (ticket < floor) revert TicketBelowVaultFloor(ticket, floor);
    }
}

/// @notice Deploys `OracleFloorStrategy`. Does NOT plug it into any vault.
///
/// @dev `forge script script/strategy/DeployOracleFloorStrategy.s.sol --tc DeployOracleFloorStrategy
///       --rpc-url polygon --account <alias> --broadcast`
///
/// Deploying and plugging in are two steps and stay two steps. `setStrategy` bumps the vault's
/// config epoch and invalidates every proposal already assembled against the old one; doing it in
/// the same transaction as the deployment removes the window in which the new strategy can be
/// called read-only and compared against the old one before anything depends on it.
///
/// Every argument is declared. There are no defaults for the numbers that decide behaviour: a
/// default tolerance is a number nobody chose, and this contract's whole reason for existing is
/// that the last strategy carried a number nobody re-examined.
contract DeployOracleFloorStrategy is Script {
    /// @return strategy The deployed strategy.
    function run() external returns (address strategy) {
        address asset = vm.envAddress("ASSET");
        address base = vm.envAddress("BASE");
        uint8 assetDecimals = uint8(vm.envUint("ASSET_DECIMALS"));
        uint8 baseDecimals = uint8(vm.envUint("BASE_DECIMALS"));
        address assetFeed = vm.envAddress("ASSET_FEED");
        address baseFeed = vm.envAddress("BASE_FEED");
        uint256 ticket = vm.envUint("TICKET");
        uint256 maxAge = vm.envUint("MAX_AGE");
        uint16 buyToleranceBps = uint16(vm.envUint("BUY_TOLERANCE_BPS"));
        uint16 sellToleranceBps = uint16(vm.envUint("SELL_TOLERANCE_BPS"));
        uint16 maxLossBps = uint16(vm.envUint("MAX_LOSS_BPS"));
        bool wideToleranceIsIntended = vm.envOr("I_MEAN_THIS_TOLERANCE", false);

        DeployChecks.checkDecimals(asset, assetDecimals);
        DeployChecks.checkDecimals(base, baseDecimals);
        DeployChecks.checkFeed(assetFeed, maxAge);
        DeployChecks.checkFeed(baseFeed, maxAge);
        DeployChecks.checkTolerance(buyToleranceBps, wideToleranceIsIntended);
        DeployChecks.checkTolerance(sellToleranceBps, wideToleranceIsIntended);
        DeployChecks.checkTicket(ticket, baseDecimals);

        console.log("  asset .............. ", asset);
        console.log("  base ............... ", base);
        console.log("  asset feed ......... ", assetFeed);
        console.log("  base feed .......... ", baseFeed);
        console.log("  ticket ............. ", ticket);
        console.log("  max age (s) ........ ", maxAge);
        console.log("  buy tolerance (bps)  ", buyToleranceBps);
        console.log("  sell tolerance (bps) ", sellToleranceBps);
        console.log("  max loss (bps) ..... ", maxLossBps);

        vm.startBroadcast();
        strategy = address(
            new OracleFloorStrategy(
                asset,
                base,
                assetDecimals,
                baseDecimals,
                assetFeed,
                baseFeed,
                ticket,
                maxAge,
                buyToleranceBps,
                sellToleranceBps,
                maxLossBps
            )
        );
        vm.stopBroadcast();

        console.log("  OracleFloorStrategy  ", strategy);
        console.log("  NOT plugged in. Run 04_SetStrategy with STRATEGY set to this address.");
    }
}
