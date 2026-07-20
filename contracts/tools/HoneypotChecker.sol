// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

interface IERC20 { function balanceOf(address) external view returns (uint256); function approve(address,uint256) external returns (bool); }
interface IRouter {
    function WETH() external view returns (address);
    function swapExactETHForTokensSupportingFeeOnTransferTokens(uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external payable;
    function swapExactTokensForETHSupportingFeeOnTransferTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external;
}

/// Buys `token` with native value, then tries to SELL it back. Returns what it
/// bought and what it recovered. A honeypot reverts on the sell (whole call
/// reverts → detected); a tax token returns far less than it spent (measurable).
/// Meant to be called via eth_call with a state-override that provides this code
/// and a native balance — never deployed.
contract HoneypotChecker {
    function check(address router, address token) external payable
        returns (uint256 spent, uint256 bought, uint256 recovered, bool sellable)
    {
        spent = msg.value;
        address weth = IRouter(router).WETH();
        address[] memory buy = new address[](2); buy[0] = weth; buy[1] = token;
        uint256 tBefore = IERC20(token).balanceOf(address(this));
        IRouter(router).swapExactETHForTokensSupportingFeeOnTransferTokens{value: msg.value}(0, buy, address(this), block.timestamp);
        bought = IERC20(token).balanceOf(address(this)) - tBefore;

        IERC20(token).approve(router, bought);
        address[] memory sell = new address[](2); sell[0] = token; sell[1] = weth;
        uint256 eBefore = address(this).balance;
        IRouter(router).swapExactTokensForETHSupportingFeeOnTransferTokens(bought, 0, sell, address(this), block.timestamp);
        recovered = address(this).balance - eBefore;
        sellable = true;
    }
    receive() external payable {}
}
