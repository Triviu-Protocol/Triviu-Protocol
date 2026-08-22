// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IVaultViews} from "../../api/IVaultViews.sol";
import {Intent} from "../../api/types/Intent.sol";
import {IImplementationRegistry} from "../../protocol/interfaces/IImplementationRegistry.sol";
import {IProtocolRegistry} from "../../protocol/interfaces/IProtocolRegistry.sol";

import {ExecutionParams} from "../types/ExecutionParams.sol";

/// @title ITriviuVault
/// @notice External surface of a trading vault.
interface ITriviuVault is IVaultViews {
    /// @notice Sets the vault's initial owner.
    /// @param newOwner Owner address.
    /// @dev Called exactly once, by the factory, in the same act as the deploy.
    function initialize(address newOwner) external;

    /// @notice Deposits tokens into the vault.
    /// @param token Deposited token.
    /// @param amount Amount transferred.
    /// @dev Requires a prior `approve`. A direct transfer also credits the vault, without emitting
    ///      `Deposited`.
    function deposit(IERC20 token, uint256 amount) external;

    /// @notice Withdraws tokens from the vault.
    /// @param token Withdrawn token.
    /// @param amount Amount transferred.
    /// @param to Recipient.
    /// @dev Available in any protocol state, including paused.
    function withdraw(IERC20 token, uint256 amount, address to) external;

    /// @notice Starts the transfer of vault ownership.
    /// @param newOwner Proposed owner. Zero cancels the pending proposal.
    /// @dev There is no ownership renouncement.
    function transferOwnership(address newOwner) external;

    /// @notice Accepts the pending ownership transfer.
    function acceptOwnership() external;

    /// @notice Sets the vault's strategy.
    /// @param newStrategy Strategy address, or zero to remove it.
    function setStrategy(address newStrategy) external;

    /// @notice Adds a guard to the vault.
    /// @param guard Guard address.
    function addGuard(address guard) external;

    /// @notice Removes a guard from the vault.
    /// @param guard Guard address.
    function removeGuard(address guard) external;

    /// @notice Updates the vault's operational limits.
    /// @param cooldown Minimum interval between executions, in seconds.
    /// @param maxValidity Maximum validity the submitter may declare, in seconds.
    /// @param minRatioBps Minimum output/input ratio, in basis points.
    /// @param quantum Granularity of `amountIn`; zero disables quantization.
    function setLimits(uint64 cooldown, uint64 maxValidity, uint16 minRatioBps, uint112 quantum) external;

    /// @notice Allows or removes an asset on the vault.
    /// @param asset Asset address.
    /// @param allowed Whether the asset should remain allowed.
    /// @dev Allowing records the decimals read from the token.
    function setAllowedAsset(address asset, bool allowed) external;

    /// @notice Enables or removes a base currency on the vault.
    /// @param token Token address.
    /// @param enabled Whether the token should remain enabled.
    /// @dev The global curation of the `ProtocolRegistry` is still checked at execution.
    function setBaseCurrency(address token, bool enabled) external;

    /// @notice Executes a trade proposed by the vault's strategy.
    /// @param p Parameters chosen by the submitter.
    /// @dev The vault does not validate `p.executor`: the submitter chooses the destination of the execution amount.
    function execute(ExecutionParams calldata p) external;

    /// @notice Executes a trade proposed by the owner themself.
    /// @param intent Proposed intent.
    /// @param p Parameters chosen by the submitter.
    /// @dev Bypasses the strategy; guards, limits, floors, fee and pause still apply.
    function executeAsOwner(Intent calldata intent, ExecutionParams calldata p) external;

    /// @notice Schedules the adoption of a published implementation.
    /// @param implementation Implementation to adopt.
    function proposeUpgrade(address implementation) external;

    /// @notice Adopts the scheduled implementation after the timelock.
    /// @dev Re-validates the catalog, increments the `configEpoch` and runs the storage migration.
    function executeUpgrade() external;

    /// @notice Cancels the pending upgrade proposal.
    function cancelUpgrade() external;

    /// @notice Adopts the `EscapeHatch`, terminating the vault's trading functions.
    /// @dev Irreversible and without timelock.
    function adoptEscapeHatch() external;

    /// @notice Applies the checks that do not depend on the assembled route.
    /// @param candidateLotId Lot suggested for closing.
    /// @param base Base currency of the query.
    /// @return Approved intent, already quantized.
    /// @dev Does not cover forbidden target and spender, the economic floors, nor the commitment.
    function dryRunChecks(uint256 candidateLotId, address base) external view returns (Intent memory);

    /// @notice Returns the plugged-in strategy.
    /// @return Strategy address, or zero.
    function strategy() external view returns (address);

    /// @notice Returns the plugged-in guards.
    /// @return List of guards.
    function guards() external view returns (address[] memory);

    /// @notice Returns the recorded decimals of an allowed asset.
    /// @param asset Asset address.
    /// @return Recorded decimals, or zero if the asset is not allowed.
    function assetDecimals(address asset) external view returns (uint8);

    /// @notice Returns the recorded decimals of a base currency enabled on this vault.
    /// @param token Token address.
    /// @return Recorded decimals, or zero if the token is not enabled.
    function baseCurrencyDecimals(address token) external view returns (uint8);

    /// @notice Returns the vault's owner.
    /// @return Owner address.
    function owner() external view returns (address);

    /// @notice Returns the proposed owner who has not yet accepted.
    /// @return Proposed address, or zero.
    function pendingOwner() external view returns (address);

    /// @notice Returns the protocol parameters registry.
    /// @return Address of the `ProtocolRegistry`.
    function REGISTRY() external view returns (IProtocolRegistry);

    /// @notice Returns the catalog of adoptable implementations.
    /// @return Address of the `ImplementationRegistry`.
    function IMPL_REGISTRY() external view returns (IImplementationRegistry);

    /// @notice Returns the terminal implementation adoptable without timelock.
    /// @return Address of the `EscapeHatch`.
    function ESCAPE_HATCH() external view returns (address);

    /// @notice Returns the pending upgrade proposal.
    /// @return implementation Scheduled implementation, or zero.
    /// @return eta Timestamp from which the adoption becomes executable.
    function pendingUpgrade() external view returns (address implementation, uint64 eta);
}
