// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title Fees
/// @notice Computes the protocol fee and the gas refund of an execution.
library Fees {
    uint256 internal constant BPS = 10_000;

    uint256 internal constant REFUND_BPS_MAX = 100;

    /// @notice Computes the protocol fee.
    /// @param traded Amount traded in base currency.
    /// @param feeBps Current fee in basis points.
    /// @return Fee owed to the treasury.
    function protocolFee(uint256 traded, uint16 feeBps) internal pure returns (uint256) {
        return Math.mulDiv(traded, feeBps, BPS);
    }

    /// @notice Computes the gas refund, capped by two ceilings.
    /// @param declared Refund declared by the submitter.
    /// @param traded Amount traded in base currency.
    /// @param baseDecimals Decimals of the base currency.
    /// @return Refund to pay, less than or equal to the declared one.
    function gasRefund(uint256 declared, uint256 traded, uint8 baseDecimals) internal pure returns (uint256) {
        if (declared == 0) return 0;

        uint256 cap = Math.min(10 ** baseDecimals, Math.mulDiv(traded, REFUND_BPS_MAX, BPS));

        return Math.min(declared, cap);
    }
}
