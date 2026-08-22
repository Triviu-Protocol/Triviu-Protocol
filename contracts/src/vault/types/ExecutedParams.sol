// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Side} from "../../api/types/Intent.sol";

/// @title ExecutedParams
/// @notice Fields of the `Executed` event.
/// @param proposalHash Proposal identifier, recomputed on-chain.
/// @param nonce Nonce prior to the increment.
/// @param side Buy or sell.
/// @param asset Non-base token of the trade.
/// @param base Base currency of the trade.
/// @param amountIn Input amount, already quantized.
/// @param gross Amount received, measured by balance delta.
/// @param fee Fee charged, in base currency.
/// @param refund Refund paid, in base currency.
/// @param net Net result; on a buy it equals `gross`, since the deductions come out of the balance.
/// @param lotId Lot named by the intent; zero on a buy.
/// @param target Target of the route used.
struct ExecutedParams {
    bytes32 proposalHash;
    uint64 nonce;
    Side side;
    address asset;
    address base;
    uint256 amountIn;
    uint256 gross;
    uint256 fee;
    uint256 refund;
    uint256 net;
    uint256 lotId;
    address target;
}
