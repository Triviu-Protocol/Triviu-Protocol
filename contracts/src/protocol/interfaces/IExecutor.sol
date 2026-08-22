// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title IExecutor
interface IExecutor {
    function run(
        address target,
        address spender,
        IERC20 tokenIn,
        IERC20 tokenOut,
        uint256 amountIn,
        bytes calldata data
    ) external;
}
