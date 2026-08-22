// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity <0.9.0;

/// @title Side
/// @notice Direction of a trade intent.
/// @dev The order is part of the ABI: `Buy` is 0.
enum Side {
    Buy,
    Sell
}

/// @title Intent
/// @notice Trade intent proposed by a strategy.
/// @dev `tokenIn` and `tokenOut` derive from `side` and are not declared.
/// @param side Buy or sell of `asset` against `base`.
/// @param asset Non-base token of the trade.
/// @param base Base currency of the trade; on a sell, the currency the lot was opened in.
/// @param amountIn Input amount, before quantization.
/// @param minOut Floor checked on the net amount, after fee and refund.
/// @param lotId Lot to close; ignored on a buy.
struct Intent {
    Side side;
    address asset;
    address base;
    uint256 amountIn;
    uint256 minOut;
    uint256 lotId;
}
