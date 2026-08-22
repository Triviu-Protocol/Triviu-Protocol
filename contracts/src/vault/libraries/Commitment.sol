// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title Commitment
/// @notice Derives the hashes that bind the simulated proposal to the submitted execution.
library Commitment {
    /// @notice Derives the proposal identifier, without the route data.
    /// @param vault Vault that will execute.
    /// @param nonce Nonce prior to the increment.
    /// @param configEpoch Current configuration epoch.
    /// @param strategy Plugged-in strategy that responded.
    /// @param tokenIn Token leaving the vault.
    /// @param tokenOut Token entering the vault.
    /// @param amountIn Input amount, already quantized.
    /// @param lotId Lot named by the intent; zero on a buy.
    /// @return Proposal identifier.
    /// @dev `block.chainid` takes part because vaults created by CREATE2 share an address
    ///      across chains.
    function proposalHash(
        address vault,
        uint64 nonce,
        uint64 configEpoch,
        address strategy,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 lotId
    ) internal view returns (bytes32) {
        return keccak256(
            abi.encode(block.chainid, vault, nonce, configEpoch, strategy, tokenIn, tokenOut, amountIn, lotId)
        );
    }

    /// @notice Derives the full commitment, including the chosen route.
    /// @param proposal Proposal identifier.
    /// @param executor Declared executor.
    /// @param target Target of the external call.
    /// @param spender Address that receives the allowance.
    /// @param amountIn Input amount, already quantized.
    /// @param operatorMinOut Declared floor on the gross result.
    /// @param validUntil Declared deadline of the execution.
    /// @param declaredRefund Declared gas refund.
    /// @param routeCalldataHash Hash of the route calldata.
    /// @return Commitment that travels in the calldata.
    function executionHash(
        bytes32 proposal,
        address executor,
        address target,
        address spender,
        uint256 amountIn,
        uint256 operatorMinOut,
        uint64 validUntil,
        uint256 declaredRefund,
        bytes32 routeCalldataHash
    ) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                proposal,
                executor,
                target,
                spender,
                amountIn,
                operatorMinOut,
                validUntil,
                declaredRefund,
                routeCalldataHash
            )
        );
    }
}
