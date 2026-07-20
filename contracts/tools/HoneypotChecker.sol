// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

interface IERC20 { function balanceOf(address) external view returns (uint256); function approve(address,uint256) external returns (bool); }
interface IRouter {
    function swapExactETHForTokensSupportingFeeOnTransferTokens(uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external payable;
    function swapExactTokensForETHSupportingFeeOnTransferTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external;
}

/// Buys a token with native value along `buyPath` (path[0] = wrapped native), then
/// tries to SELL it back along `sellPath` (path[last] = wrapped native), returning
/// what it spent and recovered. A honeypot reverts on the sell → whole call reverts
/// → detected. A tax token recovers far less than it spent. Runs via eth_call with a
/// state-override that provides this code + a native balance; never deployed, never
/// sends a transaction.
contract HoneypotChecker {
    function check(address router, address token, address[] calldata buyPath, address[] calldata sellPath) external payable
        returns (uint256 spent, uint256 bought, uint256 recovered, bool sellable)
    {
        spent = msg.value;
        uint256 tBefore = IERC20(token).balanceOf(address(this));
        IRouter(router).swapExactETHForTokensSupportingFeeOnTransferTokens{value: msg.value}(0, buyPath, address(this), block.timestamp);
        bought = IERC20(token).balanceOf(address(this)) - tBefore;

        IERC20(token).approve(router, bought);
        uint256 eBefore = address(this).balance;
        IRouter(router).swapExactTokensForETHSupportingFeeOnTransferTokens(bought, 0, sellPath, address(this), block.timestamp);
        recovered = address(this).balance - eBefore;
        sellable = true;
    }
    receive() external payable {}
}
