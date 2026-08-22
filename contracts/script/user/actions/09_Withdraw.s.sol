// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script} from "@forge-std/Script.sol";
import {console} from "@forge-std/console.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {TriviuVault} from "../../../src/vault/TriviuVault.sol";

import {Deployments} from "../../util/Deployments.sol";

/// @notice Withdrawal of the base currency; `amount == 0` withdraws the whole balance.
library WithdrawLib {
    /// @notice The requested amount exceeds the vault's balance.
    /// @param balance The available balance.
    /// @param amount The requested amount.
    error WithdrawAboveBalance(uint256 balance, uint256 amount);

    /// @notice The vault has no balance of this currency.
    /// @param token The currency queried.
    error NothingToWithdraw(address token);

    /// @notice The withdrawal destination is the zero address.
    error WithdrawToIsZero();

    /// @param vault The vault.
    /// @param base The base currency.
    /// @param amount The amount to withdraw, or zero for the whole balance.
    /// @param to The withdrawal destination.
    /// @return withdrawn The amount actually withdrawn.
    function run(TriviuVault vault, IERC20 base, uint256 amount, address to) internal returns (uint256 withdrawn) {
        if (to == address(0)) revert WithdrawToIsZero();

        uint256 balance = base.balanceOf(address(vault));

        if (balance == 0) revert NothingToWithdraw(address(base));
        if (amount > balance) revert WithdrawAboveBalance(balance, amount);

        withdrawn = amount == 0 ? balance : amount;

        vault.withdraw(base, withdrawn, to);
        console.log("  withdrawn .......... ", withdrawn);
        console.log("  destination ........ ", to);
    }
}

/// @notice `forge script script/user/actions/09_Withdraw.s.sol --tc Withdraw --rpc-url polygon --account <alias> --broadcast`
contract Withdraw is Script {
    function run() external {
        TriviuVault vault = TriviuVault(vm.envAddress("VAULT"));
        uint256 amount = vm.envOr("WITHDRAW_AMOUNT", uint256(0));
        address to = vm.envOr("WITHDRAW_TO", msg.sender);

        IERC20 base = IERC20(Deployments.read(block.chainid, "baseCurrency"));

        vm.startBroadcast();
        WithdrawLib.run(vault, base, amount, to);
        vm.stopBroadcast();
    }
}
