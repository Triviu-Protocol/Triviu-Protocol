// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

/// @title ExecConfig
/// @notice Execution configuration of the `ProtocolRegistry`, packed into one word.
/// @dev Word layout, in byte indices starting from the most significant:
///
///      ```
///      byte  0 ──── 1 ────────────── 2 ──── 4 ─────────── 12 ──────────── 32
///            paused callerIsOperator  feeBps   free         treasury
///            bool   bool              uint16   8 bytes      address
///      ```
type ExecConfig is bytes32;

using ExecConfigLib for ExecConfig global;

/// @title ExecConfigLib
/// @notice Packing and reading of the `ExecConfig` fields.
library ExecConfigLib {
    /// @notice Packs the execution configuration into one word.
    /// @param paused_ Whether execution is paused.
    /// @param callerIsOperator_ Whether the queried caller is an operator.
    /// @param feeBps_ Protocol fee in basis points.
    /// @param treasury_ Recipient of the fees.
    /// @return Packed configuration.
    function pack(bool paused_, bool callerIsOperator_, uint16 feeBps_, address treasury_)
        internal
        pure
        returns (ExecConfig)
    {
        return ExecConfig.wrap(
            bytes32(
                (uint256(paused_ ? 1 : 0) << 248) | (uint256(callerIsOperator_ ? 1 : 0) << 240)
                    | (uint256(feeBps_) << 224) | uint256(uint160(treasury_))
            )
        );
    }

    /// @notice Tells whether execution is paused.
    /// @param c Packed configuration.
    /// @return `true` when paused.
    function paused(ExecConfig c) internal pure returns (bool) {
        return (uint256(ExecConfig.unwrap(c)) >> 248) & 0xff != 0;
    }

    /// @notice Tells whether the queried address is an operator.
    /// @param c Packed configuration.
    /// @return `true` when the queried address is an operator.
    function callerIsOperator(ExecConfig c) internal pure returns (bool) {
        return (uint256(ExecConfig.unwrap(c)) >> 240) & 0xff != 0;
    }

    /// @notice Returns the protocol fee.
    /// @param c Packed configuration.
    /// @return Fee in basis points.
    function feeBps(ExecConfig c) internal pure returns (uint16) {
        return uint16(uint256(ExecConfig.unwrap(c)) >> 224);
    }

    /// @notice Returns the recipient of the fees.
    /// @param c Packed configuration.
    /// @return Treasury address.
    function treasury(ExecConfig c) internal pure returns (address) {
        return address(uint160(uint256(ExecConfig.unwrap(c))));
    }

    /// @notice Returns the configuration with the operator bit reset.
    /// @param c Packed configuration.
    /// @param callerIsOperator_ New value of the bit.
    /// @return Resulting configuration.
    function withCallerIsOperator(ExecConfig c, bool callerIsOperator_) internal pure returns (ExecConfig) {
        uint256 raw = uint256(ExecConfig.unwrap(c)) & ~(uint256(0xff) << 240);
        return ExecConfig.wrap(bytes32(raw | (uint256(callerIsOperator_ ? 1 : 0) << 240)));
    }

    /// @notice Returns the configuration with the pause reset.
    /// @param c Packed configuration.
    /// @param paused_ New state.
    /// @return Resulting configuration.
    function withPaused(ExecConfig c, bool paused_) internal pure returns (ExecConfig) {
        uint256 raw = uint256(ExecConfig.unwrap(c)) & ~(uint256(0xff) << 248);
        return ExecConfig.wrap(bytes32(raw | (uint256(paused_ ? 1 : 0) << 248)));
    }

    /// @notice Returns the configuration with the fee reset.
    /// @param c Packed configuration.
    /// @param feeBps_ New fee in basis points.
    /// @return Resulting configuration.
    function withFeeBps(ExecConfig c, uint16 feeBps_) internal pure returns (ExecConfig) {
        uint256 raw = uint256(ExecConfig.unwrap(c)) & ~(uint256(type(uint16).max) << 224);
        return ExecConfig.wrap(bytes32(raw | (uint256(feeBps_) << 224)));
    }

    /// @notice Returns the configuration with the treasury reset.
    /// @param c Packed configuration.
    /// @param treasury_ New recipient.
    /// @return Resulting configuration.
    function withTreasury(ExecConfig c, address treasury_) internal pure returns (ExecConfig) {
        uint256 raw = uint256(ExecConfig.unwrap(c)) & ~uint256(type(uint160).max);
        return ExecConfig.wrap(bytes32(raw | uint256(uint160(treasury_))));
    }
}
