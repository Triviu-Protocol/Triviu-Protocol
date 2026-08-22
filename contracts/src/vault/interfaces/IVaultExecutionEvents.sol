// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {ExecutedParams} from "../types/ExecutedParams.sol";

/// @title IVaultExecutionEvents
/// @notice Events emitted by a vault's execution.
interface IVaultExecutionEvents {
    /// @notice An execution was settled.
    event Executed(ExecutedParams p);

    /// @notice Details the declared computation of the gas refund.
    event RefundDetail(
        uint256 declaredGas, uint256 declaredGasPrice, uint256 declaredQuote, uint256 declared, uint256 paid
    );
}
