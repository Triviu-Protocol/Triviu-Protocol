// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import {Limits, LimitsLib} from "../api/types/Limits.sol";

import {IVaultConfigEE} from "./interfaces/IVaultConfigEE.sol";

/// @title VaultConfig
/// @notice Manages ownership, strategy, guards, allowed assets and limits of a vault.
abstract contract VaultConfig is IVaultConfigEE {
    uint256 internal constant MAX_GUARDS = 8;
    uint8 internal constant MIN_DECIMALS = 1;
    uint8 internal constant MAX_DECIMALS = 18;

    /// @custom:storage-location erc7201:triviu.storage.VaultConfig
    /// @dev `owner` must remain the first field, since `EscapeHatch` reads the slot directly.
    struct VaultConfigStorage {
        address owner;
        address pendingOwner;
        address strategy;
        uint64 configEpoch;
        Limits limits;
        address[] guards;
        mapping(address asset => uint8 decimals) assetDecimals;
        mapping(address token => uint8 decimals) baseCurrencyDecimals;
    }

    /// @dev ERC-7201 slot of the `triviu.storage.VaultConfig` namespace.
    bytes32 private constant VAULT_CONFIG_STORAGE = 0x64ad1f80561b0cd1f1b2fb404d5a36956f5f50507b9d5b3a823940b55cbcb000;

    function _configStorage() private pure returns (VaultConfigStorage storage $) {
        assembly ("memory-safe") {
            $.slot := VAULT_CONFIG_STORAGE
        }
    }

    function _owner() internal view returns (address) {
        return _configStorage().owner;
    }

    function _pendingOwner() internal view returns (address) {
        return _configStorage().pendingOwner;
    }

    function _strategy() internal view returns (address) {
        return _configStorage().strategy;
    }

    function _guards() internal view returns (address[] memory) {
        return _configStorage().guards;
    }

    function _limits() internal view returns (Limits) {
        return _configStorage().limits;
    }

    function _configEpoch() internal view returns (uint64) {
        return _configStorage().configEpoch;
    }

    function _assetDecimals(address asset) internal view returns (uint8) {
        return _configStorage().assetDecimals[asset];
    }

    function _baseCurrencyDecimals(address token) internal view returns (uint8) {
        return _configStorage().baseCurrencyDecimals[token];
    }

    /// @notice Initializes the vault's owner.
    /// @param newOwner Address of the initial owner.
    function _initializeOwner(address newOwner) internal {
        if (newOwner == address(0)) revert OwnerIsZero();

        _configStorage().owner = newOwner;
        emit OwnershipTransferred(address(0), newOwner);
    }

    /// @notice Starts an ownership transfer.
    /// @param newOwner Proposed new owner. Zero cancels the pending transfer.
    function _startOwnershipTransfer(address newOwner) internal {
        VaultConfigStorage storage $ = _configStorage();
        $.pendingOwner = newOwner;
        emit OwnershipTransferStarted($.owner, newOwner);
    }

    /// @notice Accepts the pending ownership transfer.
    function _acceptOwnership() internal {
        VaultConfigStorage storage $ = _configStorage();
        if (msg.sender != $.pendingOwner) revert NotPendingOwner();

        address previousOwner = $.owner;
        $.owner = msg.sender;
        $.pendingOwner = address(0);
        emit OwnershipTransferred(previousOwner, msg.sender);
    }

    /// @notice Sets the vault's strategy.
    /// @param newStrategy Strategy address, or zero to remove it.
    function _setStrategy(address newStrategy) internal {
        if (newStrategy != address(0) && newStrategy.code.length == 0) revert NotAContract(newStrategy);

        VaultConfigStorage storage $ = _configStorage();
        $.strategy = newStrategy;
        emit StrategySet(newStrategy, _bumpEpoch($));
    }

    /// @notice Adds a guard to the vault.
    /// @param guard Guard address.
    function _addGuard(address guard) internal {
        if (guard.code.length == 0) revert NotAContract(guard);

        VaultConfigStorage storage $ = _configStorage();
        address[] storage guardList = $.guards;

        uint256 count = guardList.length;
        if (count == MAX_GUARDS) revert TooManyGuards();

        for (uint256 i = 0; i < count; i++) {
            if (guardList[i] == guard) revert GuardAlreadyAdded(guard);
        }

        guardList.push(guard);
        emit GuardAdded(guard, _bumpEpoch($));
    }

    /// @notice Removes a guard from the vault.
    /// @param guard Guard address.
    function _removeGuard(address guard) internal {
        VaultConfigStorage storage $ = _configStorage();
        address[] storage guardList = $.guards;

        uint256 count = guardList.length;
        for (uint256 i = 0; i < count; i++) {
            if (guardList[i] == guard) {
                guardList[i] = guardList[count - 1];
                guardList.pop();
                emit GuardRemoved(guard, _bumpEpoch($));
                return;
            }
        }

        revert GuardNotFound(guard);
    }

    /// @notice Updates the vault's operational limits.
    /// @param cooldown Configured cooldown.
    /// @param maxValidity Configured maximum validity.
    /// @param minRatioBps Minimum ratio in basis points.
    /// @param quantum Configured quantum.
    function _setLimits(uint64 cooldown, uint64 maxValidity, uint16 minRatioBps, uint112 quantum) internal {
        Limits newLimits = LimitsLib.pack(cooldown, maxValidity, minRatioBps, quantum);

        VaultConfigStorage storage $ = _configStorage();
        $.limits = newLimits;
        emit LimitsSet(newLimits, _bumpEpoch($));
    }

    /// @notice Allows or removes an asset on the vault.
    /// @param asset Asset address.
    /// @param allowed Whether the asset should remain allowed.
    function _setAllowedAsset(address asset, bool allowed) internal {
        (uint8 decimals, uint64 epoch) = _list(_configStorage().assetDecimals, asset, allowed);
        emit AssetSet(asset, decimals, epoch);
    }

    /// @notice Enables or removes a base currency on the vault.
    /// @param token Token address.
    /// @param enabled Whether the token should remain enabled.
    function _setBaseCurrency(address token, bool enabled) internal {
        (uint8 decimals, uint64 epoch) = _list(_configStorage().baseCurrencyDecimals, token, enabled);
        emit BaseCurrencySet(token, decimals, epoch);
    }

    function _list(mapping(address => uint8) storage list, address token, bool listed)
        private
        returns (uint8 decimals, uint64 epoch)
    {
        decimals = listed ? _readDecimals(token) : 0;

        list[token] = decimals;
        epoch = _bumpEpoch(_configStorage());
    }

    /// @dev Validates the token and accepts only `decimals` between 1 and 18.
    function _readDecimals(address token) private view returns (uint8 decimals) {
        if (token.code.length == 0) revert NotAContract(token);

        decimals = IERC20Metadata(token).decimals();
        if (decimals < MIN_DECIMALS || decimals > MAX_DECIMALS) revert DecimalsOutOfRange(decimals);
    }

    /// @dev Invalidates configurations or proposals that depend on the `configEpoch`.
    function _bumpConfigEpoch() internal returns (uint64) {
        return _bumpEpoch(_configStorage());
    }

    function _bumpEpoch(VaultConfigStorage storage $) private returns (uint64 epoch) {
        unchecked {
            epoch = $.configEpoch + 1;
        }
        $.configEpoch = epoch;
    }
}
