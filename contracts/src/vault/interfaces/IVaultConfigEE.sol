// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {Limits} from "../../api/types/Limits.sol";

/// @title IVaultConfigEE
/// @notice Errors and events of a vault's configuration.
interface IVaultConfigEE {
    /// @notice The caller is not the proposed owner.
    error NotPendingOwner();

    /// @notice The vault would be left without an owner.
    /// @dev Only `initialize` reverts with this; `transferOwnership(address(0))` cancels the
    ///      pending proposal.
    error OwnerIsZero();

    /// @notice The address provided has no code.
    /// @dev A `staticcall` to an address without code returns success, so an incorrect guard
    ///      would approve every intent.
    error NotAContract(address target);

    /// @notice The vault has already reached `MAX_GUARDS`.
    error TooManyGuards();

    /// @notice The guard is already plugged in.
    error GuardAlreadyAdded(address guard);

    /// @notice The guard is not plugged in.
    error GuardNotFound(address guard);

    /// @notice The token's decimals are outside the accepted range.
    /// @dev Zero means absent from the list; the ceiling of 18 follows from the `uint128` of `Lot.remaining`.
    error DecimalsOutOfRange(uint8 decimals);

    /// @notice The strategy proposed an asset not allowed on this vault.
    error AssetNotAllowed();

    /// @notice The declared base currency is not enabled on this vault.
    error BaseNotEnabled();

    /// @notice The declared base currency is not in the global curation.
    /// @dev Only a buy produces this error: removing curation blocks opening new lots and
    ///      keeps the closing of existing ones.
    error BaseNotCurated();

    /// @notice The strategy proposed a base currency different from the one declared in the execution.
    /// @dev The view is built with the balance of the declared currency before the strategy responds.
    error DeclaredBaseMismatch();

    /// @notice An ownership transfer was proposed.
    event OwnershipTransferStarted(address indexed currentOwner, address indexed newOwner);

    /// @notice The vault changed owner.
    /// @dev Does not increment the `configEpoch`.
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /// @notice The vault's strategy changed. Zero means removal.
    event StrategySet(address indexed strategy, uint64 epoch);

    /// @notice A guard was added.
    event GuardAdded(address indexed guard, uint64 epoch);

    /// @notice A guard was removed.
    event GuardRemoved(address indexed guard, uint64 epoch);

    /// @notice The vault's operational limits changed.
    /// @dev Emits the packed word, in the same layout used in storage.
    event LimitsSet(Limits limits, uint64 epoch);

    /// @notice An asset was allowed or removed.
    /// @dev `decimals` at zero means removal.
    event AssetSet(address indexed asset, uint8 decimals, uint64 epoch);

    /// @notice A base currency was enabled or removed on this vault.
    /// @dev `decimals` at zero means removal.
    event BaseCurrencySet(address indexed token, uint8 decimals, uint64 epoch);
}
