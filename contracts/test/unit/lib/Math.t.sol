// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "@forge-std/Test.sol";

import {Fees} from "../../../src/vault/libraries/Fees.sol";
import {Floors} from "../../../src/vault/libraries/Floors.sol";
import {LotLib} from "../../../src/vault/libraries/LotLib.sol";
import {Quantize} from "../../../src/vault/libraries/Quantize.sol";

/// @notice The protocol fee and the gas refund, with its two ceilings.
contract FeesTest is Test {
    function test_protocolFeeIsBasisPointsOfTraded() public pure {
        assertEq(Fees.protocolFee(1_000_000, 50), 5_000);
        assertEq(Fees.protocolFee(1_000_000, 0), 0);
    }

    function test_protocolFeeRoundsDown() public pure {
        assertEq(Fees.protocolFee(199, 50), 0);
        assertEq(Fees.protocolFee(201, 50), 1);
    }

    /// @dev `mulDiv` is the point: the product of two large numbers must not overflow.
    function test_protocolFeeSurvivesHugeAmounts() public pure {
        assertEq(Fees.protocolFee(type(uint256).max, 0), 0);
        assertEq(Fees.protocolFee(type(uint256).max, 100), type(uint256).max / 100);
    }

    function testFuzz_protocolFeeNeverExceedsTraded(uint256 traded, uint16 feeBps) public pure {
        feeBps = uint16(bound(feeBps, 0, 10_000));
        assertLe(Fees.protocolFee(traded, feeBps), traded);
    }

    function test_gasRefundIsZeroWhenNothingWasDeclared() public pure {
        assertEq(Fees.gasRefund(0, 1_000_000, 6), 0);
    }

    function test_gasRefundIsCappedByOneWholeUnit() public pure {
        // 1% of 10,000 whole units is greater than one unit: the absolute ceiling rules.
        assertEq(Fees.gasRefund(type(uint256).max, 10_000e6, 6), 1e6);
    }

    function test_gasRefundIsCappedByOneHundredBps() public pure {
        // In small trades the relative ceiling is lower than one whole unit.
        assertEq(Fees.gasRefund(type(uint256).max, 10e6, 6), 10e6 / 100);
    }

    function test_gasRefundPaysTheDeclaredWhenItFitsBothCaps() public pure {
        assertEq(Fees.gasRefund(1_000, 10_000e6, 6), 1_000);
    }

    function testFuzz_gasRefundNeverExceedsEitherCap(uint256 declared, uint256 traded, uint8 baseDecimals) public pure {
        baseDecimals = uint8(bound(baseDecimals, 1, 18));
        traded = bound(traded, 0, type(uint128).max);

        uint256 refund = Fees.gasRefund(declared, traded, baseDecimals);

        assertLe(refund, declared);
        assertLe(refund, 10 ** baseDecimals);
        assertLe(refund, (traded * 100) / 10_000);
    }
}

/// @notice The shape floors: minimum ticket and minimum ratio.
contract FloorsTest is Test {
    function test_minTicketIsTwoDecimalsBelowTheUnit() public pure {
        assertEq(Floors.minTicket(6), 1e4);
        assertEq(Floors.minTicket(18), 1e16);
    }

    /// @dev Below three decimals the shift does not fit, and the floor becomes one base unit.
    function test_minTicketIsOneForVeryShallowTokens() public pure {
        assertEq(Floors.minTicket(0), 1);
        assertEq(Floors.minTicket(1), 1);
        assertEq(Floors.minTicket(2), 1);
        assertEq(Floors.minTicket(3), 10);
    }

    function testFuzz_minTicketIsAlwaysPositive(uint8 decimals) public pure {
        decimals = uint8(bound(decimals, 0, 18));
        assertGt(Floors.minTicket(decimals), 0);
    }

    function test_zeroRatioDisablesTheCheck() public pure {
        assertTrue(Floors.meetsMinRatio(1e18, 0, 18, 6, 0));
    }

    function test_ratioComparesWholeUnitsAcrossDecimals() public pure {
        // 1 unit of 18 places for at least 0.5 unit of 6 places: 5,000 bps.
        assertTrue(Floors.meetsMinRatio(1e18, 0.5e6, 18, 6, 5_000));
        assertFalse(Floors.meetsMinRatio(1e18, 0.5e6 - 1, 18, 6, 5_000));
    }

    /// @dev The legs swap sides: the same pair with inverted decimals requires a different number.
    function test_theLegsAreNotSymmetric() public pure {
        assertTrue(Floors.meetsMinRatio(1e6, 1e18, 6, 18, 10_000));
        assertFalse(Floors.meetsMinRatio(1e6, 1e18 - 1, 6, 18, 10_000));
    }

    function testFuzz_higherMinOutNeverFailsWhenLowerPassed(uint256 minOut, uint16 minRatioBps) public pure {
        minOut = bound(minOut, 0, type(uint128).max);
        minRatioBps = uint16(bound(minRatioBps, 1, 10_000));

        if (Floors.meetsMinRatio(1e18, minOut, 18, 18, minRatioBps)) {
            assertTrue(Floors.meetsMinRatio(1e18, minOut + 1, 18, 18, minRatioBps));
        }
    }
}

/// @notice Quantization always rounds down, and zero switches it off.
contract QuantizeTest is Test {
    function test_zeroQuantumLeavesTheAmountAlone() public pure {
        assertEq(Quantize.down(12_345, 0), 12_345);
    }

    function test_roundsDownToTheStep() public pure {
        assertEq(Quantize.down(12_345, 100), 12_300);
        assertEq(Quantize.down(12_300, 100), 12_300);
    }

    function test_amountBelowTheStepBecomesZero() public pure {
        assertEq(Quantize.down(99, 100), 0);
    }

    function testFuzz_neverRoundsUpAndStaysOnTheStep(uint256 amount, uint112 quantum) public pure {
        uint256 quantized = Quantize.down(amount, quantum);

        assertLe(quantized, amount);
        if (quantum != 0) {
            assertEq(quantized % quantum, 0);
            assertLt(amount - quantized, quantum);
        }
    }
}

/// @notice Closing a lot releases proportional capital, and never more than exists.
contract LotLibTest is Test {
    function test_fullCloseReleasesEverything() public pure {
        (uint128 remaining, uint128 capital, uint128 released) = LotLib.close(100, 250, 100);

        assertEq(remaining, 0);
        assertEq(capital, 0);
        assertEq(released, 250);
    }

    function test_partialCloseIsProportional() public pure {
        (uint128 remaining, uint128 capital, uint128 released) = LotLib.close(100, 250, 40);

        assertEq(remaining, 60);
        assertEq(released, 100);
        assertEq(capital, 150);
    }

    /// @dev The division truncates down, so the remainder stays in the lot and does not vanish.
    function test_theRoundingLeftoverStaysInTheLot() public pure {
        (, uint128 capital, uint128 released) = LotLib.close(3, 10, 1);

        assertEq(released, 3);
        assertEq(capital, 7);
    }

    function testFuzz_releasedNeverExceedsCapital(uint128 remaining, uint128 capital, uint128 sold) public pure {
        remaining = uint128(bound(remaining, 1, type(uint128).max));
        sold = uint128(bound(sold, 0, remaining));

        (uint128 newRemaining, uint128 newCapital, uint128 released) = LotLib.close(remaining, capital, sold);

        assertLe(released, capital);
        assertEq(newCapital + released, capital);
        assertEq(newRemaining, remaining - sold);
    }

    function testFuzz_closingInTwoStepsNeverReleasesMoreThanClosingAtOnce(uint128 capital, uint128 first) public pure {
        uint128 remaining = 1_000;
        first = uint128(bound(first, 1, remaining - 1));

        (uint128 leftRemaining, uint128 leftCapital, uint128 releasedFirst) = LotLib.close(remaining, capital, first);
        (,, uint128 releasedSecond) = LotLib.close(leftRemaining, leftCapital, leftRemaining);

        assertLe(uint256(releasedFirst) + releasedSecond, capital);
    }
}
