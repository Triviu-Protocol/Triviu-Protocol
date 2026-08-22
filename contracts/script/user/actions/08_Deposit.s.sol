// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {Script} from "@forge-std/Script.sol";
import {console} from "@forge-std/console.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {TriviuVault} from "../../../src/vault/TriviuVault.sol";
import {IProtocolRegistry} from "../../../src/protocol/interfaces/IProtocolRegistry.sol";

import {Deployments} from "../../util/Deployments.sol";
import {ApproveBaseCurrencyLib} from "./07_ApproveBaseCurrency.s.sol";

/// @notice Step 8: ensures the allowance and deposits the base currency into the vault.
library DepositLib {
    /// @notice The resulting balance does not sustain one whole ticket plus its fee.
    /// @param balance The balance the vault would have after this deposit.
    /// @param required The floor `ticket + fee(ticket)`: below it the `ExampleStrategy` trades the whole
    ///                 balance and the buy reverts because nothing is left for fee and refund. It is a
    ///                 floor and not a guarantee — the refund is declared by the `Operator`.
    error DepositBelowTicket(uint256 balance, uint256 required);

    /// @param vault The vault.
    /// @param token The base currency.
    /// @param owner Who signs, and from whom the amount comes.
    /// @param amount The amount to deposit.
    /// @param ticket The `Strategy` ticket, or zero to skip the check.
    /// @param feeBps The protocol fee, in basis points, read from the registry.
    function run(TriviuVault vault, IERC20 token, address owner, uint256 amount, uint256 ticket, uint16 feeBps)
        internal
    {
        if (ticket != 0) {
            uint256 balance = token.balanceOf(address(vault)) + amount;
            uint256 required = ticket + (ticket * feeBps) / 10_000;

            if (balance <= required) revert DepositBelowTicket(balance, required);
        }

        ApproveBaseCurrencyLib.run(token, owner, address(vault), amount);

        vault.deposit(token, amount);
        console.log("  deposited .......... ", amount);
    }
}

/// @notice `forge script script/user/actions/08_Deposit.s.sol --tc Deposit --rpc-url polygon --account <alias> --broadcast`
contract Deposit is Script {
    function run() external {
        TriviuVault vault = TriviuVault(vm.envAddress("VAULT"));
        uint256 amount = vm.envUint("DEPOSIT_AMOUNT");
        uint256 ticket = vm.envOr("TICKET", uint256(0));

        IERC20 base = IERC20(Deployments.read(block.chainid, "baseCurrency"));
        uint16 feeBps = IProtocolRegistry(Deployments.read(block.chainid, "protocolRegistry")).feeBps();

        vm.startBroadcast();
        DepositLib.run(vault, base, msg.sender, amount, ticket, feeBps);
        vm.stopBroadcast();
    }
}
