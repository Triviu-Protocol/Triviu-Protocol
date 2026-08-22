// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

/// @title LotLib
/// @notice Computes the drawdown of a lot and the capital released by a sell.
library LotLib {
    /// @notice Draws down units from a lot and the proportional capital.
    /// @param remaining Remainder of the lot before the drawdown.
    /// @param capital Capital still allocated to the lot.
    /// @param sold Units sold; must be less than or equal to `remaining`.
    /// @return newRemaining Remainder after the drawdown; zero closes the lot.
    /// @return newCapital Capital that remains allocated.
    /// @return released Capital released by the sell.
    function close(uint128 remaining, uint128 capital, uint128 sold)
        internal
        pure
        returns (uint128 newRemaining, uint128 newCapital, uint128 released)
    {
        if (sold == remaining) return (0, 0, capital);

        // forge-lint: disable-next-line(unsafe-typecast)
        released = uint128((uint256(capital) * sold) / remaining);

        return (remaining - sold, capital - released, released);
    }
}
