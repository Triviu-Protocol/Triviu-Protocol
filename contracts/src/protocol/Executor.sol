// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IExecutor} from "./interfaces/IExecutor.sol";
import {IExecutorEE} from "./interfaces/IExecutorEE.sol";

/// @title Executor
/// @notice Performs the external call of a trade and returns control with no residual balance.
contract Executor is IExecutor, IExecutorEE {
    using SafeERC20 for IERC20;

    /// @dev Zeroed at the end of `run`: sequential executions are allowed, nested ones are not.
    bool private transient _running;

    /// @inheritdoc IExecutor
    /// @dev The baseline discounts the `amountIn` already transferred by the vault.
    function run(
        address target,
        address spender,
        IERC20 tokenIn,
        IERC20 tokenOut,
        uint256 amountIn,
        bytes calldata data
    ) external {
        if (_running) revert Reentrancy();
        _running = true;

        uint256 baselineIn = tokenIn.balanceOf(address(this)) - amountIn;
        uint256 baselineOut = tokenOut.balanceOf(address(this));

        tokenIn.forceApprove(spender, amountIn);

        (bool ok,) = target.call(data);
        if (!ok) _bubbleUp();

        tokenIn.forceApprove(spender, 0);

        if (tokenIn.allowance(address(this), spender) != 0) revert AllowanceNotCleared();
        if (tokenIn.balanceOf(address(this)) != baselineIn) revert BalanceDeltaNonZero();
        if (tokenOut.balanceOf(address(this)) != baselineOut) revert BalanceDeltaNonZero();

        _running = false;
    }

    /// @dev Forwards the route's returndata without interpreting it.
    function _bubbleUp() private pure {
        assembly ("memory-safe") {
            let size := returndatasize()
            let ptr := mload(0x40)
            returndatacopy(ptr, 0, size)
            revert(ptr, size)
        }
    }
}
