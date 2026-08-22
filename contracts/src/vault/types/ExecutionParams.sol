// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title ExecutionParams
/// @notice Parameters the submitter chooses in an execution.
/// @param executor Executor that receives the amount and runs the route; the vault does not validate it.
/// @param target Target of the external call.
/// @param spender Address that receives the allowance inside the executor.
/// @param base Declared base currency of the execution.
/// @param operatorMinOut Floor on the gross result.
/// @param validUntil Cutoff timestamp of the execution.
/// @param declaredConfigEpoch Configuration epoch observed when assembling the proposal.
/// @param declaredRefund Requested gas refund, in base currency.
/// @param declaredGas Declared gas, for audit only.
/// @param declaredGasPrice Declared gas price, for audit only.
/// @param declaredQuote Declared quote, for audit only.
/// @param candidateLotId Lot suggested for closing.
/// @param routeCalldata Route calldata, opaque to the vault.
/// @param executionHash Commitment that binds proposal and submission.
struct ExecutionParams {
    address executor;
    address target;
    address spender;
    address base;
    uint256 operatorMinOut;
    uint64 validUntil;
    uint64 declaredConfigEpoch;
    uint256 declaredRefund;
    uint256 declaredGas;
    uint256 declaredGasPrice;
    uint256 declaredQuote;
    uint256 candidateLotId;
    bytes routeCalldata;
    bytes32 executionHash;
}
