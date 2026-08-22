// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {StorageSlot} from "@openzeppelin/contracts/utils/StorageSlot.sol";

import {IEscapeHatchEE} from "./interfaces/IEscapeHatchEE.sol";

/// @title EscapeHatch
contract EscapeHatch is IEscapeHatchEE {
    using SafeERC20 for IERC20;

    /// @dev ERC-7201 slot of `triviu.storage.VaultConfig`
    bytes32 private constant VAULT_CONFIG_STORAGE = 0x64ad1f80561b0cd1f1b2fb404d5a36956f5f50507b9d5b3a823940b55cbcb000;

    /// @notice Returns the vault's owner.
    /// @return Owner address.
    function owner() external view returns (address) {
        return _owner();
    }

    /// @notice Transfers tokens from the vault to a recipient.
    /// @param token Withdrawn token.
    /// @param amount Amount transferred.
    /// @param to Recipient.
    function withdraw(IERC20 token, uint256 amount, address to) external {
        if (msg.sender != _owner()) revert NotOwner();

        token.safeTransfer(to, amount);
        emit Withdrawn(address(token), to, amount);
    }

    function _owner() private view returns (address) {
        return StorageSlot.getAddressSlot(VAULT_CONFIG_STORAGE).value;
    }
}
