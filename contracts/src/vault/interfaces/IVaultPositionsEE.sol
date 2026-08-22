// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

/// @title IVaultPositionsEE
/// @notice Errors and events of a vault's lots.
interface IVaultPositionsEE {
    /// @notice No lot exists with the given identifier.
    /// @dev A closed lot remains readable, with `remaining` at zero.
    error LotNotFound(uint256 lotId);

    /// @notice The given lot is already closed.
    error LotNotOpen(uint256 lotId);

    /// @notice The given lot belongs to another asset.
    /// @dev Without this check the vault would transfer one token and draw down the accounting of another.
    error LotAssetMismatch(uint256 lotId, address lotAsset, address intentAsset);

    /// @notice The lot was opened in another base currency.
    /// @dev Without this check the floor against `allocatedCapital` would compare different currencies.
    error LotBaseMismatch(uint256 lotId, address lotBase, address declaredBase);

    /// @notice The sell exceeds the lot's remainder.
    error AmountExceedsLot(uint256 lotId, uint256 amount, uint256 remaining);

    /// @notice A lot value does not fit in `uint128`.
    /// @dev Validated on write, so as not to truncate silently.
    error AmountExceedsUint128(uint256 value);

    /// @notice A buy opened a lot.
    /// @dev Carries every field of the position, including `openedAt`. `allocatedCapital` excludes
    ///      fee and refund.
    event LotOpened(
        uint256 indexed lotId,
        address indexed asset,
        address indexed base,
        uint256 remaining,
        uint256 allocatedCapital,
        uint48 openedAt
    );

    /// @notice A sell drew down a lot, fully or partially.
    /// @dev `capitalReleased` is not derivable from the subsequent state, since it depends on the capital
    ///      prior to the drawdown.
    event LotClosed(
        uint256 indexed lotId,
        address indexed asset,
        address indexed base,
        uint256 sold,
        uint256 capitalReleased,
        uint256 remaining,
        bool partialClose
    );
}
