// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {Governed} from "./Governed.sol";
import {IProtocolRegistry} from "./interfaces/IProtocolRegistry.sol";
import {IProtocolRegistryEE} from "./interfaces/IProtocolRegistryEE.sol";
import {ExecConfig, ExecConfigLib} from "./types/ExecConfig.sol";

/// @title ProtocolRegistry
/// @notice Global parameters under governance.
contract ProtocolRegistry is Governed, IProtocolRegistry, IProtocolRegistryEE {
    /// @inheritdoc IProtocolRegistry
    uint16 public constant FEE_BPS_MAX = 100;

    /// @inheritdoc IProtocolRegistry
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    ExecConfig private _config;

    mapping(address token => bool enabled) private _isBaseCurrency;

    mapping(address executor => bool enabled) private _isExecutor;

    /// @notice Deploys the registry unpaused.
    /// @param admin Governance that receives `DEFAULT_ADMIN_ROLE`.
    /// @param treasury_ Recipient of the fees.
    /// @param feeBps_ Initial fee in basis points.
    constructor(address admin, address treasury_, uint16 feeBps_) Governed(admin) {
        if (treasury_ == address(0)) revert TreasuryIsZero();
        if (feeBps_ > FEE_BPS_MAX) revert FeeAboveCap(feeBps_, FEE_BPS_MAX);

        _config = ExecConfigLib.pack(false, false, feeBps_, treasury_);

        emit TreasurySet(treasury_);
        emit FeeBpsSet(feeBps_);
        emit PausedSet(false);
    }

    /// @inheritdoc IProtocolRegistry
    function execConfig(address caller) external view returns (ExecConfig) {
        return _config.withCallerIsOperator(hasRole(OPERATOR_ROLE, caller));
    }

    /// @inheritdoc IProtocolRegistry
    function isBaseCurrency(address token) external view returns (bool) {
        return _isBaseCurrency[token];
    }

    /// @inheritdoc IProtocolRegistry
    function isExecutor(address who) external view returns (bool) {
        return _isExecutor[who];
    }

    /// @inheritdoc IProtocolRegistry
    function isOperator(address who) external view returns (bool) {
        return hasRole(OPERATOR_ROLE, who);
    }

    /// @inheritdoc IProtocolRegistry
    function paused() external view returns (bool) {
        return _config.paused();
    }

    /// @inheritdoc IProtocolRegistry
    function feeBps() external view returns (uint16) {
        return _config.feeBps();
    }

    /// @inheritdoc IProtocolRegistry
    function treasury() external view returns (address) {
        return _config.treasury();
    }

    /// @inheritdoc IProtocolRegistry
    function renounceOperator() external {
        _revokeRole(OPERATOR_ROLE, msg.sender);
    }

    /// @inheritdoc IProtocolRegistry
    function setPaused(bool isPaused) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _config = _config.withPaused(isPaused);
        emit PausedSet(isPaused);
    }

    /// @inheritdoc IProtocolRegistry
    function setFeeBps(uint16 newFeeBps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newFeeBps > FEE_BPS_MAX) revert FeeAboveCap(newFeeBps, FEE_BPS_MAX);

        _config = _config.withFeeBps(newFeeBps);
        emit FeeBpsSet(newFeeBps);
    }

    /// @inheritdoc IProtocolRegistry
    function setTreasury(address newTreasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newTreasury == address(0)) revert TreasuryIsZero();

        _config = _config.withTreasury(newTreasury);
        emit TreasurySet(newTreasury);
    }

    /// @inheritdoc IProtocolRegistry
    function setBaseCurrency(address token, bool enabled) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (token == address(0)) revert TokenIsZero();

        _isBaseCurrency[token] = enabled;
        emit BaseCurrencySet(token, enabled);
    }

    /// @inheritdoc IProtocolRegistry
    function setExecutor(address executor, bool enabled) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (executor == address(0)) revert ExecutorIsZero();

        _isExecutor[executor] = enabled;
        emit ExecutorSet(executor, enabled);
    }
}
