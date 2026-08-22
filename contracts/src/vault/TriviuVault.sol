// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IVaultViews} from "../api/IVaultViews.sol";
import {Intent} from "../api/types/Intent.sol";
import {Limits} from "../api/types/Limits.sol";
import {Lot} from "../api/types/Lot.sol";
import {IImplementationRegistry} from "../protocol/interfaces/IImplementationRegistry.sol";
import {IProtocolRegistry} from "../protocol/interfaces/IProtocolRegistry.sol";

import {VaultConfig} from "./VaultConfig.sol";
import {VaultCustody} from "./VaultCustody.sol";
import {VaultExecution} from "./VaultExecution.sol";
import {VaultPositions} from "./VaultPositions.sol";
import {VaultUpgrade} from "./VaultUpgrade.sol";
import {ITriviuVault} from "./interfaces/ITriviuVault.sol";
import {ExecutionParams} from "./types/ExecutionParams.sol";

/// @title TriviuVault
/// @notice Implementation of the trading vault.
contract TriviuVault is
    Initializable,
    VaultConfig,
    VaultCustody,
    VaultExecution,
    VaultPositions,
    VaultUpgrade,
    ITriviuVault
{
    bool private transient _entered;

    /// @inheritdoc ITriviuVault
    IProtocolRegistry public immutable REGISTRY;

    /// @inheritdoc ITriviuVault
    IImplementationRegistry public immutable IMPL_REGISTRY;

    /// @inheritdoc ITriviuVault
    address public immutable ESCAPE_HATCH;

    /// @notice Deploys the implementation and pins the global addresses.
    /// @param registry Protocol parameters registry.
    /// @param implRegistry Catalog of adoptable implementations.
    /// @param escapeHatch Terminal implementation of this version. Must have code.
    constructor(IProtocolRegistry registry, IImplementationRegistry implRegistry, address escapeHatch) {
        if (escapeHatch.code.length == 0) revert EscapeHatchIsNotAContract();

        REGISTRY = registry;
        IMPL_REGISTRY = implRegistry;
        ESCAPE_HATCH = escapeHatch;

        _disableInitializers();
    }

    /// @inheritdoc ITriviuVault
    function initialize(address newOwner) external initializer {
        _initializeOwner(newOwner);
    }

    /// @inheritdoc ITriviuVault
    function deposit(IERC20 token, uint256 amount) external {
        _checkOwner();
        _deposit(token, amount);
    }

    /// @inheritdoc ITriviuVault
    function withdraw(IERC20 token, uint256 amount, address to) external {
        _enter();
        _checkOwner();
        _withdraw(token, amount, to);
        _exit();
    }

    /// @inheritdoc ITriviuVault
    function execute(ExecutionParams calldata p) external {
        _enter();
        _execute(p);
        _exit();
    }

    /// @inheritdoc ITriviuVault
    function executeAsOwner(Intent calldata intent, ExecutionParams calldata p) external {
        _enter();
        _checkOwner();
        _executeAsOwner(intent, p);
        _exit();
    }

    /// @inheritdoc ITriviuVault
    function transferOwnership(address newOwner) external {
        _checkOwner();
        _startOwnershipTransfer(newOwner);
    }

    /// @inheritdoc ITriviuVault
    function acceptOwnership() external {
        _acceptOwnership();
    }

    /// @inheritdoc ITriviuVault
    function setStrategy(address newStrategy) external {
        _checkOwner();
        _setStrategy(newStrategy);
    }

    /// @inheritdoc ITriviuVault
    function addGuard(address guard) external {
        _checkOwner();
        _addGuard(guard);
    }

    /// @inheritdoc ITriviuVault
    function removeGuard(address guard) external {
        _checkOwner();
        _removeGuard(guard);
    }

    /// @inheritdoc ITriviuVault
    function setLimits(uint64 cooldown, uint64 maxValidity, uint16 minRatioBps, uint112 quantum) external {
        _checkOwner();
        _setLimits(cooldown, maxValidity, minRatioBps, quantum);
    }

    /// @inheritdoc ITriviuVault
    function setAllowedAsset(address asset, bool allowed) external {
        _checkOwner();
        _setAllowedAsset(asset, allowed);
    }

    /// @inheritdoc ITriviuVault
    function setBaseCurrency(address token, bool enabled) external {
        _checkOwner();
        _setBaseCurrency(token, enabled);
    }

    /// @inheritdoc ITriviuVault
    function proposeUpgrade(address implementation) external {
        _checkOwner();
        _proposeUpgrade(implementation);
    }

    /// @inheritdoc ITriviuVault
    function executeUpgrade() external {
        _checkOwner();
        _executeUpgrade();
    }

    /// @inheritdoc ITriviuVault
    function cancelUpgrade() external {
        _checkOwner();
        _cancelUpgrade();
    }

    /// @inheritdoc ITriviuVault
    function adoptEscapeHatch() external {
        _checkOwner();
        _adoptEscapeHatch();
    }

    /// @inheritdoc ITriviuVault
    function dryRunChecks(uint256 candidateLotId, address base) external view returns (Intent memory) {
        return _dryRunChecks(candidateLotId, base);
    }

    /// @inheritdoc IVaultViews
    function lot(uint256 lotId) external view returns (Lot memory) {
        return _lot(lotId);
    }

    /// @inheritdoc IVaultViews
    function lotCount() external view returns (uint256) {
        return _lotCount();
    }

    /// @inheritdoc IVaultViews
    function backing(uint256 lotId) external view returns (uint256) {
        return _backing(lotId);
    }

    /// @inheritdoc IVaultViews
    function interfaceVersion() external pure returns (uint16) {
        return 1;
    }

    /// @inheritdoc IVaultViews
    function lastExecAt() external view returns (uint64) {
        return _lastExecAt();
    }

    /// @inheritdoc IVaultViews
    function nonce() external view returns (uint64) {
        return _nonce();
    }

    /// @inheritdoc ITriviuVault
    function owner() external view returns (address) {
        return _owner();
    }

    /// @inheritdoc ITriviuVault
    function pendingOwner() external view returns (address) {
        return _pendingOwner();
    }

    /// @inheritdoc ITriviuVault
    function strategy() external view returns (address) {
        return _strategy();
    }

    /// @inheritdoc ITriviuVault
    function guards() external view returns (address[] memory) {
        return _guards();
    }

    /// @inheritdoc IVaultViews
    function limits() external view returns (Limits) {
        return _limits();
    }

    /// @inheritdoc IVaultViews
    function configEpoch() external view returns (uint64) {
        return _configEpoch();
    }

    /// @inheritdoc ITriviuVault
    function pendingUpgrade() external view returns (address implementation, uint64 eta) {
        return _pendingUpgrade();
    }

    /// @inheritdoc ITriviuVault
    function assetDecimals(address asset) external view returns (uint8) {
        return _assetDecimals(asset);
    }

    /// @inheritdoc ITriviuVault
    function baseCurrencyDecimals(address token) external view returns (uint8) {
        return _baseCurrencyDecimals(token);
    }

    function _checkOwner() private view {
        if (msg.sender != _owner()) revert NotOwner();
    }

    function _enter() private {
        if (_entered) revert Reentrancy();
        _entered = true;
    }

    function _exit() private {
        _entered = false;
    }

    // Forwarding between mixins: every coupling between them appears in this list.

    /// @inheritdoc VaultExecution
    function _recordBuy(address asset, address base, uint256 received, uint256 spent) internal override {
        _openLot(asset, base, received, spent);
    }

    /// @inheritdoc VaultExecution
    function _recordSell(uint256 lotId, uint256 sold) internal override {
        _closeLot(lotId, sold);
    }

    /// @inheritdoc VaultExecution
    function _vetCandidateLot(uint256 lotId, address asset, address base, uint256 amount) internal view override {
        _checkSellable(lotId, asset, base, amount);
    }

    /// @inheritdoc VaultExecution
    function _mandateStrategy() internal view override returns (address) {
        return _strategy();
    }

    /// @inheritdoc VaultExecution
    function _mandateGuards() internal view override returns (address[] memory) {
        return _guards();
    }

    /// @inheritdoc VaultExecution
    function _mandateLimits() internal view override returns (Limits) {
        return _limits();
    }

    /// @inheritdoc VaultExecution
    function _mandateConfigEpoch() internal view override returns (uint64) {
        return _configEpoch();
    }

    /// @inheritdoc VaultExecution
    function _mandateAssetDecimals(address asset) internal view override returns (uint8) {
        return _assetDecimals(asset);
    }

    /// @inheritdoc VaultExecution
    function _mandateBaseCurrencyDecimals(address base) internal view override returns (uint8) {
        return _baseCurrencyDecimals(base);
    }

    /// @inheritdoc VaultExecution
    function _protocolRegistry() internal view override returns (IProtocolRegistry) {
        return REGISTRY;
    }

    /// @inheritdoc VaultUpgrade
    function _implementationCatalog() internal view override returns (IImplementationRegistry) {
        return IMPL_REGISTRY;
    }

    /// @inheritdoc VaultUpgrade
    function _escapeHatch() internal view override returns (address) {
        return ESCAPE_HATCH;
    }

    /// @inheritdoc VaultUpgrade
    function _bumpMandateConfigEpoch() internal override returns (uint64) {
        return _bumpConfigEpoch();
    }
}
