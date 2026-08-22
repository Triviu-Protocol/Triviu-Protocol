// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {Lot} from "../api/types/Lot.sol";

import {IVaultPositionsEE} from "./interfaces/IVaultPositionsEE.sol";
import {LotLib} from "./libraries/LotLib.sol";

/// @title VaultPositions
/// @notice Records the lots opened by buys and drawn down by sells.
abstract contract VaultPositions is IVaultPositionsEE {
    /// @custom:storage-location erc7201:triviu.storage.VaultPositions
    struct VaultPositionsStorage {
        Lot[] lots;
    }

    /// @dev ERC-7201 slot of the `triviu.storage.VaultPositions` namespace.
    bytes32 private constant VAULT_POSITIONS_STORAGE =
        0x901b7eeb826c5012ffdfd6e0d38fd8553450504f9a4d4ee8e3631a5e416e2c00;

    function _positionsStorage() private pure returns (VaultPositionsStorage storage $) {
        assembly ("memory-safe") {
            $.slot := VAULT_POSITIONS_STORAGE
        }
    }

    /// @notice Returns a lot, open or closed.
    /// @param lotId Lot identifier.
    /// @return Corresponding lot.
    function _lot(uint256 lotId) internal view returns (Lot memory) {
        return _lotRef(lotId);
    }

    /// @notice Returns how many lots the vault has opened so far.
    /// @return Total lots created, open or not.
    function _lotCount() internal view returns (uint256) {
        return _positionsStorage().lots.length;
    }

    /// @notice Returns how much of the lot is backed by balance in the vault.
    /// @param lotId Lot identifier.
    /// @return Lesser of `remaining` and the asset balance.
    /// @dev Derived on read: the owner may withdraw without updating the accounting.
    function _backing(uint256 lotId) internal view returns (uint256) {
        Lot storage lot_ = _lotRef(lotId);

        uint256 remaining = lot_.remaining;
        uint256 balance = IERC20(lot_.asset).balanceOf(address(this));

        return remaining < balance ? remaining : balance;
    }

    /// @notice Opens a lot with the result of a buy.
    /// @param asset Token acquired.
    /// @param base Base currency of the buy, and the only one in which the lot can close.
    /// @param received Units of `asset` measured in the vault.
    /// @param spent Capital in `base` allocated to the lot, excluding fee and refund.
    /// @dev Rejects values above `uint128` instead of truncating.
    function _openLot(address asset, address base, uint256 received, uint256 spent) internal {
        if (received > type(uint128).max) revert AmountExceedsUint128(received);
        if (spent > type(uint128).max) revert AmountExceedsUint128(spent);

        // The submitter chooses the moment of execution, and the trust model already assumes it.
        // forge-lint: disable-next-line(block-timestamp,unsafe-typecast)
        uint48 openedAt = uint48(block.timestamp);

        Lot[] storage lots = _positionsStorage().lots;
        uint256 lotId = lots.length;

        // forge-lint: disable-start(unsafe-typecast)
        lots.push(
            Lot({
                asset: asset,
                openedAt: openedAt,
                base: base,
                remaining: uint128(received),
                allocatedCapital: uint128(spent)
            })
        );
        // forge-lint: disable-end(unsafe-typecast)

        emit LotOpened(lotId, asset, base, received, spent, openedAt);
    }

    /// @notice Validates whether a lot can be drawn down by the proposed sell.
    /// @param lotId Lot identifier.
    /// @param asset Asset of the intent.
    /// @param base Base currency declared in the execution.
    /// @param amount Units to draw down, already quantized.
    /// @dev Does not check backing: a missing balance reverts in the token transfer itself.
    function _checkSellable(uint256 lotId, address asset, address base, uint256 amount) internal view {
        Lot storage lot_ = _lotRef(lotId);

        address lotAsset = lot_.asset;
        if (lotAsset != asset) revert LotAssetMismatch(lotId, lotAsset, asset);

        address lotBase = lot_.base;
        if (lotBase != base) revert LotBaseMismatch(lotId, lotBase, base);

        uint256 remaining = lot_.remaining;
        if (remaining == 0) revert LotNotOpen(lotId);
        if (amount > remaining) revert AmountExceedsLot(lotId, amount, remaining);
    }

    /// @notice Draws down units from a lot and releases the proportional capital.
    /// @param lotId Lot identifier.
    /// @param sold Units sold.
    /// @dev The comparison with `remaining` also guarantees the narrowing to `uint128`.
    function _closeLot(uint256 lotId, uint256 sold) internal {
        Lot storage lot_ = _lotRef(lotId);

        uint128 remaining = lot_.remaining;
        if (sold > remaining) revert AmountExceedsLot(lotId, sold, remaining);

        // forge-lint: disable-start(unsafe-typecast)
        (uint128 newRemaining, uint128 newCapital, uint128 released) =
            LotLib.close(remaining, lot_.allocatedCapital, uint128(sold));
        // forge-lint: disable-end(unsafe-typecast)

        lot_.remaining = newRemaining;
        lot_.allocatedCapital = newCapital;

        emit LotClosed(lotId, lot_.asset, lot_.base, sold, released, newRemaining, newRemaining > 0);
    }

    /// @dev Reverts with `LotNotFound` instead of the out-of-range index panic.
    function _lotRef(uint256 lotId) private view returns (Lot storage lot_) {
        Lot[] storage lots = _positionsStorage().lots;
        if (lotId >= lots.length) revert LotNotFound(lotId);

        return lots[lotId];
    }
}
