// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IVaultCustodyEE} from "./interfaces/IVaultCustodyEE.sol";

/// @title VaultCustody
/// @notice Deposits and withdraws tokens from the vault.
abstract contract VaultCustody is IVaultCustodyEE {
    using SafeERC20 for IERC20;

    /// @notice Transfers tokens from the owner to the vault.
    /// @param token Deposited token.
    /// @param amount Amount transferred.
    function _deposit(IERC20 token, uint256 amount) internal {
        token.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(address(token), msg.sender, amount);
    }

    /// @notice Transfers tokens from the vault to a recipient.
    /// @param token Withdrawn token.
    /// @param amount Amount transferred.
    /// @param to Recipient.
    function _withdraw(IERC20 token, uint256 amount, address to) internal {
        token.safeTransfer(to, amount);
        emit Withdrawn(address(token), to, amount);
    }
}
