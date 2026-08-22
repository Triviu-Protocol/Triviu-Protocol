// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script} from "@forge-std/Script.sol";
import {console} from "@forge-std/console.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {Deployments} from "../../util/Deployments.sol";

/// @notice Step 7: the allowance the deposit consumes — `deposit` does `safeTransferFrom` and reverts without it.
library ApproveBaseCurrencyLib {
    /// @param token The base currency.
    /// @param owner Who signs, and from whom the amount comes.
    /// @param vault The vault that will pull.
    /// @param amount The amount to cover.
    function run(IERC20 token, address owner, address vault, uint256 amount) internal {
        uint256 current = token.allowance(owner, vault);

        if (current >= amount) {
            console.log("  allowance covers ... ", current);
            return;
        }

        SafeERC20.forceApprove(token, vault, amount);
        console.log("  allowance approved . ", amount);
    }
}

/// @notice `forge script script/user/actions/07_ApproveBaseCurrency.s.sol --tc ApproveBaseCurrency --rpc-url polygon --account <alias> --broadcast`
contract ApproveBaseCurrency is Script {
    function run() external {
        address vault = vm.envAddress("VAULT");
        uint256 amount = vm.envUint("DEPOSIT_AMOUNT");
        IERC20 base = IERC20(Deployments.read(block.chainid, "baseCurrency"));

        vm.startBroadcast();
        ApproveBaseCurrencyLib.run(base, msg.sender, vault, amount);
        vm.stopBroadcast();
    }
}
