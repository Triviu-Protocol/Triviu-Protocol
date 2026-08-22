// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity <0.9.0;

/// @title Lot
/// @notice Position opened by a buy and drawn down by sells.
/// @dev Occupies three slots: the field order defines the packing. An open lot is
///      `remaining > 0`.
/// @param asset Token held by the lot.
/// @param openedAt Timestamp of the opening block.
/// @param base Base currency at opening, and the only one in which the lot can close.
/// @param remaining Units of `asset` not yet sold; zero means a closed lot.
/// @param allocatedCapital Capital allocated in `base`, excluding fee and refund.
struct Lot {
    address asset;
    uint48 openedAt;
    address base;
    uint128 remaining;
    uint128 allocatedCapital;
}
