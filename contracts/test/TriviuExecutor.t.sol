// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

// Requires: forge install foundry-rs/forge-std
import {Test} from "forge-std/Test.sol";
import {TriviuExecutor} from "../src/TriviuExecutor.sol";
import {ParameterRegistry} from "../src/ParameterRegistry.sol";

/// v0 test skeleton. The protocol's core invariant:
/// a cycle without minimum profit reverts ENTIRELY — no leg is left exposed.
contract TriviuExecutorTest is Test {
    ParameterRegistry registry;
    TriviuExecutor executor;

    function setUp() public {
        registry = new ParameterRegistry(30, 0);
        executor = new TriviuExecutor(address(registry));
    }

    function test_RevertWhen_TokenNotAllowed() public {
        TriviuExecutor.Step[] memory steps = new TriviuExecutor.Step[](0);
        vm.expectRevert(
            abi.encodeWithSelector(TriviuExecutor.TokenNotAllowed.selector, address(0xBEEF))
        );
        executor.executeCycle(address(0xBEEF), 1e18, 0, steps);
    }

    // TODO v0:
    // - test_RevertWhen_UnprofitableCycle (token mock + allowed target)
    // - test_Stateless_HoldsNoBalance
    // - test_ReturnsEverythingToCaller
    // - fuzz minProfit and principal
}
