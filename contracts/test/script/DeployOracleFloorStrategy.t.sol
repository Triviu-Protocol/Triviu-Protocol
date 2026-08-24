// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";

import {DeployChecks} from "../../script/strategy/DeployOracleFloorStrategy.s.sol";
import {IPriceFeed} from "../../src/strategy/OracleFloorStrategy.sol";

/// @notice Token whose `decimals()` the test drives.
contract TokenStub {
    uint8 private immutable D;

    constructor(uint8 d) {
        D = d;
    }

    function decimals() external view returns (uint8) {
        return D;
    }
}

/// @notice Aggregator whose answer and age the test drives.
contract FeedStub is IPriceFeed {
    int256 private answer_;
    uint256 private updatedAt_;

    constructor(int256 a, uint256 u) {
        answer_ = a;
        updatedAt_ = u;
    }

    function decimals() external pure returns (uint8) {
        return 8;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (1, answer_, updatedAt_, updatedAt_, 1);
    }
}

/// @notice Harness, because a library's internal functions cannot be called with `expectRevert`.
contract ChecksHarness {
    function decimalsOf(address t, uint8 d) external view {
        DeployChecks.checkDecimals(t, d);
    }

    function feed(address f, uint256 maxAge) external view {
        DeployChecks.checkFeed(f, maxAge);
    }

    function tolerance(uint16 bps, bool override_) external pure {
        DeployChecks.checkTolerance(bps, override_);
    }

    function ticket(uint256 t, uint8 d) external pure {
        DeployChecks.checkTicket(t, d);
    }
}

/// @notice The checks that belong to the moment of deployment.
/// @dev These guard facts the constructor cannot see from inside: whether the decimals match the
///      tokens, whether the feeds answer, and whether the tolerance is a number anyone should
///      operate. A constructor bound and a deployment bound are different jobs.
contract DeployOracleFloorStrategyTest is Test {
    ChecksHarness internal checks;

    function setUp() public {
        vm.warp(1_787_595_498);
        checks = new ChecksHarness();
    }

    /// @dev A silent 18-for-6 mismatch moves every floor by 1e12 and nothing complains. The
    ///      constructor takes decimals as arguments because `IERC20Metadata.decimals` is optional
    ///      in ERC-20, which makes confirming them the deployer's job rather than nobody's.
    function test_decimals_mustMatchTheTokenItself() public {
        address usdc = address(new TokenStub(6));

        checks.decimalsOf(usdc, 6);

        vm.expectRevert(abi.encodeWithSelector(DeployChecks.DecimalsMismatch.selector, usdc, uint8(18), uint8(6)));
        checks.decimalsOf(usdc, 18);
    }

    /// @dev A strategy deployed against an already-stale feed reverts on its first call, and the
    ///      vault reports that as `StrategyCallFailed` with no reason. One `eth_call` here.
    function test_feed_mustAnswerAndNotBeStaleAlready() public {
        address fresh = address(new FeedStub(11_570_763, block.timestamp));
        checks.feed(fresh, 3600);

        address old = address(new FeedStub(11_570_763, block.timestamp - 3601));
        vm.expectRevert(
            abi.encodeWithSelector(DeployChecks.FeedAlreadyStale.selector, old, uint256(3601), uint256(3600))
        );
        checks.feed(old, 3600);

        address negative = address(new FeedStub(-1, block.timestamp));
        vm.expectRevert(abi.encodeWithSelector(DeployChecks.FeedUnusable.selector, negative));
        checks.feed(negative, 3600);

        /* `updatedAt == 0` is a feed that has never published, and it reads as infinitely old
           rather than as an error unless it is named. */
        address never = address(new FeedStub(11_570_763, 0));
        vm.expectRevert(abi.encodeWithSelector(DeployChecks.FeedUnusable.selector, never));
        checks.feed(never, 3600);
    }

    /// @dev The contract's own ceiling is 50% and is right as a TYPE bound — it is the only value
    ///      reaching 30 days at 99% confidence. It is a terrible configuration: at 50% the vault
    ///      accepts half of reference value, which passes every window because it is not a floor.
    ///      A wide tolerance READS as caution and is the opposite, so the deployment band exists
    ///      to make the careless-careful choice impossible without saying so out loud.
    function test_tolerance_wideNeedsTheCallerToSayItOutLoud() public {
        checks.tolerance(1800, false); /* the owner's ratified choice */
        checks.tolerance(2500, false); /* the band itself is inclusive */

        vm.expectRevert(abi.encodeWithSelector(DeployChecks.ToleranceAboveOperationalBand.selector, uint16(2501)));
        checks.tolerance(2501, false);

        vm.expectRevert(abi.encodeWithSelector(DeployChecks.ToleranceAboveOperationalBand.selector, uint16(5000)));
        checks.tolerance(5000, false);

        /* And with the intent stated, the contract's own ceiling is the only limit left. */
        checks.tolerance(5000, true);
    }

    /// @dev `Floors.minTicket(6)` is 10_000 — one cent of a six-decimal base. Below it the vault
    ///      quantizes the amount to zero and answers `AmountQuantizedToZero`.
    function test_ticket_mustClearTheVaultsOwnFloor() public {
        checks.ticket(100_000, 6);
        checks.ticket(10_000, 6);

        vm.expectRevert(
            abi.encodeWithSelector(DeployChecks.TicketBelowVaultFloor.selector, uint256(9_999), uint256(10_000))
        );
        checks.ticket(9_999, 6);
    }
}
