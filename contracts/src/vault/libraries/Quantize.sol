// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

/// @title Quantize
library Quantize {
    function down(uint256 amount, uint112 quantum) internal pure returns (uint256) {
        if (quantum == 0) return amount;
        return amount - (amount % quantum);
    }
}
