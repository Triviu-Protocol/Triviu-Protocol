// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ExecConfig} from "../types/ExecConfig.sol";

/// @title IProtocolRegistry
/// @notice Global parameters under protocol governance.
interface IProtocolRegistry {
    /// @notice Returns the execution configuration applicable to a caller.
    /// @param caller Address evaluated as operator.
    /// @return Packed configuration, with `caller`'s role already resolved.
    function execConfig(address caller) external view returns (ExecConfig);

    /// @notice Tells whether a token is curated as a base currency.
    /// @param token Token address.
    /// @return `true` when the token is enabled.
    function isBaseCurrency(address token) external view returns (bool);

    /// @notice Tells whether an address is curated to receive the input of a route.
    /// @param who Address being evaluated.
    /// @return `true` when the executor is enabled.
    function isExecutor(address who) external view returns (bool);

    /// @notice Tells whether an address may trigger executions.
    /// @param who Address being evaluated.
    /// @return `true` when the address is an operator.
    function isOperator(address who) external view returns (bool);

    /// @notice Tells whether execution is paused in the protocol.
    /// @return `true` when paused.
    function paused() external view returns (bool);

    /// @notice Returns the protocol fee.
    /// @return Fee in basis points.
    function feeBps() external view returns (uint16);

    /// @notice Returns the recipient of the fees.
    /// @return Treasury address.
    function treasury() external view returns (address);

    /// @notice Returns the immutable fee ceiling.
    /// @return Ceiling in basis points.
    function FEE_BPS_MAX() external view returns (uint16);

    /// @notice Returns the identifier of the operator role.
    /// @return Role identifier.
    function OPERATOR_ROLE() external view returns (bytes32);

    /// @notice Removes the operator role from the caller.
    /// @dev Does not revert when the caller is not an operator.
    function renounceOperator() external;

    /// @notice Pauses or resumes execution in the protocol.
    /// @param isPaused New state.
    /// @dev The pause does not reach withdrawals.
    function setPaused(bool isPaused) external;

    /// @notice Updates the protocol fee.
    /// @param newFeeBps New fee in basis points. Reverts above `FEE_BPS_MAX`.
    function setFeeBps(uint16 newFeeBps) external;

    /// @notice Updates the recipient of the fees.
    /// @param newTreasury New recipient. Reverts on the zero address.
    function setTreasury(address newTreasury) external;

    /// @notice Enables or removes a base currency from the curation.
    /// @param token Token address. Reverts on the zero address.
    /// @param enabled Whether the token should remain enabled.
    function setBaseCurrency(address token, bool enabled) external;

    /// @notice Enables or removes an executor from the curation.
    /// @param executor Executor address. Reverts on the zero address.
    /// @param enabled Whether the executor should remain enabled.
    /// @dev Removing an executor takes effect on the next execution: the vault reads the
    ///      curation on every call, never at configuration time.
    function setExecutor(address executor, bool enabled) external;
}
