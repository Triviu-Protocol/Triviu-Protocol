// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

/// @title IProtocolRegistryEE
/// @notice Errors and events of the `ProtocolRegistry`.
interface IProtocolRegistryEE {
    /// @notice The pause state changed.
    event PausedSet(bool isPaused);

    /// @notice The protocol fee changed.
    event FeeBpsSet(uint16 feeBps);

    /// @notice The recipient of the fees changed.
    event TreasurySet(address indexed treasury);

    /// @notice A base currency was enabled or removed.
    /// @dev The resulting restriction is enforced by the vault, only when opening a position.
    event BaseCurrencySet(address indexed token, bool enabled);

    /// @notice An executor was enabled or removed from the curation.
    /// @dev The vault hands the input amount to the executor before the route runs, so an
    ///      uncurated address here would receive funds. The restriction is enforced by the
    ///      vault on both execution entrypoints.
    event ExecutorSet(address indexed executor, bool enabled);

    /// @notice The fee provided exceeds the immutable ceiling.
    error FeeAboveCap(uint16 requested, uint16 cap);

    /// @notice The treasury provided is the zero address.
    /// @dev Without this check the failure would happen inside a client's execution.
    error TreasuryIsZero();

    /// @notice The token provided is the zero address.
    error TokenIsZero();

    /// @notice The executor provided is the zero address.
    error ExecutorIsZero();
}
