// SPDX-License-Identifier: MIT
pragma solidity <0.9.0;

/// @title Limits
/// @notice Operational limits the owner imposes on the vault's executions.
/// @dev Word layout, in byte indices starting from the most significant:
///
///      ```
///      byte  0 ─────── 8 ─────────── 16 ──── 18 ──────────────── 32
///            cooldown  maxValidity   minRatio  quantum
///            uint64    uint64        Bps u16   uint112
///      ```
type Limits is bytes32;

using LimitsLib for Limits global;

/// @title LimitsLib
/// @notice Packing and reading of the `Limits` fields.
library LimitsLib {
    /// @notice Packs the four limits into one word.
    /// @param cooldown_ Minimum interval between executions, in seconds.
    /// @param maxValidity_ Maximum declarable validity, in seconds.
    /// @param minRatioBps_ Minimum output/input ratio, in basis points.
    /// @param quantum_ Granularity of `amountIn`.
    /// @return Packed limits.
    function pack(uint64 cooldown_, uint64 maxValidity_, uint16 minRatioBps_, uint112 quantum_)
        internal
        pure
        returns (Limits)
    {
        return Limits.wrap(
            bytes32(
                (uint256(cooldown_) << 192) | (uint256(maxValidity_) << 128) | (uint256(minRatioBps_) << 112)
                    | uint256(quantum_)
            )
        );
    }

    /// @notice Returns the minimum interval between executions.
    /// @param l Packed limits.
    /// @return Interval in seconds.
    function cooldown(Limits l) internal pure returns (uint64) {
        return uint64(uint256(Limits.unwrap(l)) >> 192);
    }

    /// @notice Returns the maximum validity declarable in an execution.
    /// @param l Packed limits.
    /// @return Maximum validity in seconds.
    function maxValidity(Limits l) internal pure returns (uint64) {
        return uint64(uint256(Limits.unwrap(l)) >> 128);
    }

    /// @notice Returns the minimum output/input ratio.
    /// @param l Packed limits.
    /// @return Ratio in basis points; zero disables the check.
    function minRatioBps(Limits l) internal pure returns (uint16) {
        return uint16(uint256(Limits.unwrap(l)) >> 112);
    }

    /// @notice Returns the granularity applied to `amountIn`.
    /// @param l Packed limits.
    /// @return Quantum; zero disables quantization.
    function quantum(Limits l) internal pure returns (uint112) {
        return uint112(uint256(Limits.unwrap(l)));
    }
}
