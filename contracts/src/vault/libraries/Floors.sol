// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title Floors
/// @notice Shape floors applied to an intent before assembling the route.
library Floors {
    uint256 internal constant MIN_TICKET_SHIFT = 2;

    uint256 internal constant BPS = 10_000;

    /// @notice Returns the smallest accepted input amount.
    /// @param decimals Recorded decimals of the input token.
    /// @return Floor in token units.
    function minTicket(uint8 decimals) internal pure returns (uint256) {
        return decimals > MIN_TICKET_SHIFT ? 10 ** (decimals - MIN_TICKET_SHIFT) : 1;
    }

    /// @notice Tells whether the declared output honors the owner's minimum ratio.
    /// @param amountIn Input amount, already quantized.
    /// @param minOut Declared floor in output token units.
    /// @param decimalsIn Decimals of the input token.
    /// @param decimalsOut Decimals of the output token.
    /// @param minRatioBps Minimum ratio in basis points; zero disables.
    /// @return `true` when the declared ratio reaches the floor.
    function meetsMinRatio(uint256 amountIn, uint256 minOut, uint8 decimalsIn, uint8 decimalsOut, uint16 minRatioBps)
        internal
        pure
        returns (bool)
    {
        if (minRatioBps == 0) return true;

        uint256 required = Math.mulDiv(amountIn, uint256(minRatioBps) * 10 ** decimalsOut, 10 ** decimalsIn * BPS);

        return minOut >= required;
    }
}
