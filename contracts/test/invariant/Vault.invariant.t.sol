// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "@forge-std/Test.sol";

import {Handler} from "./Handler.sol";

/// @notice What must hold after any sequence of deposits, trades and withdrawals.
contract VaultInvariantTest is Test {
    Handler private handler;

    function setUp() public {
        handler = new Handler();

        targetContract(address(handler));
    }

    /// @notice Handler sanity: without this, the invariants could be passing vacuously.
    function test_theHandlerActuallyTrades() public {
        handler.deposit(10_000e6);
        handler.buy(1_000e6, 1e18);

        assertGt(handler.executions(), 0);
        assertGt(handler.vault().lotCount(), 0);
    }

    /// @dev The `Executor` is a pass-through: no token may sleep in it between transactions.
    function invariant_theExecutorNeverHoldsAnything() public view {
        assertEq(handler.base().balanceOf(address(handler.executor())), 0);
        assertEq(handler.asset().balanceOf(address(handler.executor())), 0);
    }

    /// @dev What the lots say exists cannot exceed what the vault really holds.
    function invariant_theLotsNeverClaimMoreThanTheVaultHolds() public view {
        assertLe(handler.totalRemaining(), handler.asset().balanceOf(address(handler.vault())));
    }

    /// @dev Allocated capital is buy history: it never grows on its own.
    function invariant_theAllocatedCapitalNeverExceedsWhatWasDeposited() public view {
        assertLe(handler.totalAllocatedCapital(), handler.deposited());
    }

    /// @dev The nonce is the counter of executions that went through — not one more.
    function invariant_theNonceMatchesTheExecutionsThatWentThrough() public view {
        assertEq(handler.vault().nonce(), handler.executions());
    }

    /// @dev The vault leaves no allowance standing for anyone: the `Executor` is the one that approves, per call.
    function invariant_theVaultNeverLeavesAnAllowanceBehind() public view {
        address vault = address(handler.vault());

        assertEq(handler.base().allowance(vault, address(handler.router())), 0);
        assertEq(handler.asset().allowance(vault, address(handler.router())), 0);
        assertEq(handler.base().allowance(vault, address(handler.executor())), 0);
        assertEq(handler.asset().allowance(vault, address(handler.executor())), 0);
    }

    /// @dev The vault's clock never moves backwards.
    function invariant_theExecutionClockNeverGoesBackwards() public view {
        assertLe(handler.vault().lastExecAt(), block.timestamp);
    }

    /// @dev A lot with no balance is also without capital: both zero out together.
    function invariant_anEmptyLotHoldsNoCapital() public view {
        uint256 count = handler.vault().lotCount();

        for (uint256 i = 0; i < count; i++) {
            if (handler.vault().lot(i).remaining == 0) {
                assertEq(handler.vault().lot(i).allocatedCapital, 0);
            }
        }
    }
}
