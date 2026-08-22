// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "@forge-std/Test.sol";

import {PluginCall} from "../../../src/vault/libraries/PluginCall.sol";
import {IVaultExecutionEE} from "../../../src/api/IVaultExecutionEE.sol";

/// @notice Exposes the capped call, so the test controls the gas of the outer frame.
contract PluginCallHarness {
    function call(address plugin, bytes memory data) external view returns (bool ok, bytes memory ret) {
        return PluginCall.staticcallCapped(plugin, data);
    }

    /// @notice Calls the plugin and then allocates memory, to catch a misaligned pointer.
    function callThenAllocate(address plugin, bytes memory data)
        external
        view
        returns (bytes memory ret, bytes32 canary)
    {
        (, ret) = PluginCall.staticcallCapped(plugin, data);

        bytes memory scratch = new bytes(64);
        for (uint256 i = 0; i < 64; i++) {
            scratch[i] = 0xff;
        }

        canary = keccak256(ret);
    }
}

contract Echo {
    /// @notice Returns exactly `size` raw bytes, via assembly.
    /// @dev No loop on purpose: assembling the return byte by byte would make the cost depend on the optimizer,
    ///      and a gas cap checked against a variable cost measures the mock instead of the library.
    function blob(uint256 size) external pure returns (bytes memory) {
        assembly ("memory-safe") {
            return(0, size)
        }
    }

    function boom() external pure {
        revert("nope");
    }

    function burn() external pure {
        uint256 x = 1;
        while (x != 0) {
            x = uint256(keccak256(abi.encode(x)));
        }
    }
}

contract PluginCallTest is Test {
    PluginCallHarness private harness;
    Echo private echo;

    function setUp() public {
        harness = new PluginCallHarness();
        echo = new Echo();
    }

    function test_returnsTheDataWhenThePluginAnswers() public view {
        (bool ok, bytes memory ret) = harness.call(address(echo), abi.encodeCall(Echo.blob, (32)));

        assertTrue(ok);
        assertEq(ret.length, 32);
    }

    function test_aRevertingPluginIsNotAnException() public view {
        (bool ok,) = harness.call(address(echo), abi.encodeCall(Echo.boom, ()));

        assertFalse(ok);
    }

    /// @dev The plugin that burns everything returns `false`, and the outer frame stays alive — it is the 1/64.
    ///      The total spend stays in the order of the cap: without the cap, the loop would take the whole block.
    function test_aGasBurningPluginCannotTakeTheCallerDown() public view {
        uint256 before = gasleft();
        (bool ok,) = harness.call(address(echo), abi.encodeCall(Echo.burn, ()));
        uint256 spent = before - gasleft();

        assertFalse(ok);
        assertLt(spent, PluginCall.GAS_CAP + PluginCall.GAS_BUFFER);
    }

    function test_theReturnDataIsTruncated() public view {
        (, bytes memory ret) = harness.call(address(echo), abi.encodeCall(Echo.blob, (1024)));

        assertEq(ret.length, PluginCall.MAX_RETURNDATA);
    }

    function test_aShortAnswerIsNotPadded() public view {
        (, bytes memory ret) = harness.call(address(echo), abi.encodeCall(Echo.blob, (64)));

        assertEq(ret.length, 64);
    }

    /// @dev The free pointer moves up rounded to 32: the next allocation cannot step on the return.
    function test_theNextAllocationDoesNotClobberTheReturn() public view {
        bytes memory data = abi.encodeCall(Echo.blob, (37));

        (, bytes memory direct) = harness.call(address(echo), data);
        (bytes memory ret, bytes32 canary) = harness.callThenAllocate(address(echo), data);

        assertEq(keccak256(direct), keccak256(ret));
        assertEq(canary, keccak256(direct));
    }

    function test_refusesToCallWithoutEnoughGas() public {
        vm.expectRevert(IVaultExecutionEE.InsufficientGasForPlugin.selector);
        harness.call{gas: 200_000}(address(echo), abi.encodeCall(Echo.blob, (32)));
    }

    /// @dev The slack must be enough for the cap plus the buffer, otherwise the guard makes no sense.
    function test_acceptsTheCallJustAboveTheThreshold() public view {
        (bool ok,) = harness.call{gas: 400_000}(address(echo), abi.encodeCall(Echo.blob, (32)));

        assertTrue(ok);
    }
}
