// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {GasTank} from "../src/GasTank.sol";

contract GasTankTest is Test {
    GasTank tank;
    address alice;
    address bob;

    function setUp() public {
        tank = new GasTank();
        alice = makeAddr("alice");
        bob = makeAddr("bob");
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
    }

    function test_DepositCreditsSender() public {
        vm.prank(alice);
        vm.expectEmit(true, false, false, true, address(tank));
        emit GasTank.Deposited(alice, 1 ether);
        tank.deposit{value: 1 ether}();

        assertEq(tank.balanceOf(alice), 1 ether);
        assertEq(address(tank).balance, 1 ether);
    }

    function test_ReceiveCreditsSender() public {
        vm.prank(alice);
        (bool ok, ) = address(tank).call{value: 2 ether}("");
        assertTrue(ok);
        assertEq(tank.balanceOf(alice), 2 ether);
    }

    function test_WithdrawReturnsOwnFunds() public {
        vm.startPrank(alice);
        tank.deposit{value: 3 ether}();
        tank.withdraw(1 ether);
        vm.stopPrank();

        assertEq(tank.balanceOf(alice), 2 ether);
        assertEq(alice.balance, 8 ether); // 10 - 3 deposited + 1 withdrawn
    }

    function test_RevertWhen_WithdrawMoreThanBalance() public {
        vm.startPrank(alice);
        tank.deposit{value: 1 ether}();
        vm.expectRevert(
            abi.encodeWithSelector(GasTank.InsufficientBalance.selector, 2 ether, 1 ether)
        );
        tank.withdraw(2 ether);
        vm.stopPrank();
    }

    function test_CannotTouchAnotherAccountsReserve() public {
        vm.prank(alice);
        tank.deposit{value: 5 ether}();

        // Bob has no balance; his withdraw cannot reach Alice's funds.
        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(GasTank.InsufficientBalance.selector, 1, 0)
        );
        tank.withdraw(1);

        assertEq(tank.balanceOf(alice), 5 ether, "Alice's reserve is untouched");
    }

    function testFuzz_DepositThenWithdrawIsConservative(uint96 depRaw, uint96 wRaw) public {
        uint256 dep = bound(uint256(depRaw), 0, 10 ether);
        vm.deal(alice, dep);
        vm.startPrank(alice);
        tank.deposit{value: dep}();
        uint256 w = bound(uint256(wRaw), 0, dep);
        tank.withdraw(w);
        vm.stopPrank();

        assertEq(tank.balanceOf(alice), dep - w);
        assertEq(address(tank).balance, dep - w, "tank holds exactly what was not withdrawn");
    }
}

/// A malicious receiver that tries to reenter withdraw during its callback.
contract ReentrantAttacker {
    GasTank public immutable tank;
    uint256 public reentries;

    constructor(GasTank _tank) {
        tank = _tank;
    }

    function fund() external payable {
        tank.deposit{value: msg.value}();
    }

    function attack() external {
        tank.withdraw(1 ether);
    }

    receive() external payable {
        // Try to reenter; CEI means our balance is already zero, so this reverts
        // and is swallowed — no double-spend.
        if (reentries < 1) {
            reentries++;
            try tank.withdraw(1 ether) {} catch {}
        }
    }
}

contract GasTankReentrancyTest is Test {
    GasTank tank;
    ReentrantAttacker attacker;

    function setUp() public {
        tank = new GasTank();
        attacker = new ReentrantAttacker(tank);
        vm.deal(address(this), 10 ether);
    }

    function test_ReentrancyCannotDoubleSpend() public {
        attacker.fund{value: 1 ether}();
        attacker.attack();

        // Attacker deposited 1 and could withdraw only 1 — no double-spend.
        assertEq(tank.balanceOf(address(attacker)), 0);
        assertEq(address(attacker).balance, 1 ether);
        assertEq(address(tank).balance, 0);
    }
}
