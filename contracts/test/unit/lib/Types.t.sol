// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "@forge-std/Test.sol";

import {Limits, LimitsLib} from "../../../src/api/types/Limits.sol";
import {ExecConfig, ExecConfigLib} from "../../../src/protocol/types/ExecConfig.sol";

/// @notice The four fields packed into one word come back identical.
contract LimitsTest is Test {
    function test_packAndReadRoundTrips() public pure {
        Limits l = LimitsLib.pack(1 hours, 15 minutes, 250, 1e6);

        assertEq(l.cooldown(), 1 hours);
        assertEq(l.maxValidity(), 15 minutes);
        assertEq(l.minRatioBps(), 250);
        assertEq(l.quantum(), 1e6);
    }

    function testFuzz_packAndReadRoundTrips(uint64 cooldown, uint64 maxValidity, uint16 minRatioBps, uint112 quantum)
        public
        pure
    {
        Limits l = LimitsLib.pack(cooldown, maxValidity, minRatioBps, quantum);

        assertEq(l.cooldown(), cooldown);
        assertEq(l.maxValidity(), maxValidity);
        assertEq(l.minRatioBps(), minRatioBps);
        assertEq(l.quantum(), quantum);
    }

    function test_zeroIsAllFieldsZero() public pure {
        Limits l = Limits.wrap(bytes32(0));

        assertEq(l.cooldown(), 0);
        assertEq(l.maxValidity(), 0);
        assertEq(l.minRatioBps(), 0);
        assertEq(l.quantum(), 0);
    }

    /// @dev Each field at its extreme cannot invade its neighbors.
    function test_maxValuesDoNotBleedIntoNeighbours() public pure {
        Limits l = LimitsLib.pack(type(uint64).max, type(uint64).max, type(uint16).max, type(uint112).max);

        assertEq(l.cooldown(), type(uint64).max);
        assertEq(l.maxValidity(), type(uint64).max);
        assertEq(l.minRatioBps(), type(uint16).max);
        assertEq(l.quantum(), type(uint112).max);
    }
}

/// @notice The `ExecConfig` is a hand-written bit-mask: each `withX` may only touch its own field.
contract ExecConfigTest is Test {
    function testFuzz_packAndReadRoundTrips(bool paused, bool isOperator, uint16 feeBps, address treasury) public pure {
        ExecConfig c = ExecConfigLib.pack(paused, isOperator, feeBps, treasury);

        assertEq(c.paused(), paused);
        assertEq(c.callerIsOperator(), isOperator);
        assertEq(c.feeBps(), feeBps);
        assertEq(c.treasury(), treasury);
    }

    function testFuzz_withPausedKeepsEveryOtherField(bool paused, bool newPaused, uint16 feeBps, address treasury)
        public
        pure
    {
        ExecConfig c = ExecConfigLib.pack(paused, true, feeBps, treasury).withPaused(newPaused);

        assertEq(c.paused(), newPaused);
        assertEq(c.callerIsOperator(), true);
        assertEq(c.feeBps(), feeBps);
        assertEq(c.treasury(), treasury);
    }

    function testFuzz_withCallerIsOperatorKeepsEveryOtherField(bool isOperator, uint16 feeBps, address treasury)
        public
        pure
    {
        ExecConfig c = ExecConfigLib.pack(true, false, feeBps, treasury).withCallerIsOperator(isOperator);

        assertEq(c.paused(), true);
        assertEq(c.callerIsOperator(), isOperator);
        assertEq(c.feeBps(), feeBps);
        assertEq(c.treasury(), treasury);
    }

    function testFuzz_withFeeBpsKeepsEveryOtherField(uint16 feeBps, uint16 newFeeBps, address treasury) public pure {
        ExecConfig c = ExecConfigLib.pack(true, true, feeBps, treasury).withFeeBps(newFeeBps);

        assertEq(c.paused(), true);
        assertEq(c.callerIsOperator(), true);
        assertEq(c.feeBps(), newFeeBps);
        assertEq(c.treasury(), treasury);
    }

    function testFuzz_withTreasuryKeepsEveryOtherField(uint16 feeBps, address treasury, address newTreasury)
        public
        pure
    {
        ExecConfig c = ExecConfigLib.pack(true, true, feeBps, treasury).withTreasury(newTreasury);

        assertEq(c.paused(), true);
        assertEq(c.callerIsOperator(), true);
        assertEq(c.feeBps(), feeBps);
        assertEq(c.treasury(), newTreasury);
    }

    /// @dev The two booleans occupy one byte each; writing to one cannot light up the other.
    function test_theTwoFlagsAreIndependent() public pure {
        ExecConfig c = ExecConfigLib.pack(false, false, 0, address(0));

        assertFalse(c.withPaused(true).callerIsOperator());
        assertFalse(c.withCallerIsOperator(true).paused());
    }
}
