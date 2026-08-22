// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {Create2} from "@openzeppelin/contracts/utils/Create2.sol";

import {ITriviuVault} from "../vault/interfaces/ITriviuVault.sol";

import {IVaultFactory} from "./interfaces/IVaultFactory.sol";
import {IVaultFactoryEE} from "./interfaces/IVaultFactoryEE.sol";

/// @title VaultFactory
contract VaultFactory is IVaultFactory, IVaultFactoryEE {
    /// @inheritdoc IVaultFactory
    address public immutable IMPLEMENTATION;

    constructor(address implementation) {
        if (implementation.code.length == 0) revert ImplementationIsNotAContract();

        IMPLEMENTATION = implementation;
    }

    /// @inheritdoc IVaultFactory
    function createVault(address owner, uint256 index) external returns (address vault) {
        vault = Create2.deploy(0, _salt(owner, index), _initCode(owner));
        emit VaultCreated(vault, owner, index);
    }

    /// @inheritdoc IVaultFactory
    function vaultAddress(address owner, uint256 index) external view returns (address) {
        return Create2.computeAddress(_salt(owner, index), keccak256(_initCode(owner)));
    }

    function _initCode(address owner) private view returns (bytes memory) {
        return abi.encodePacked(
            type(ERC1967Proxy).creationCode,
            abi.encode(IMPLEMENTATION, abi.encodeCall(ITriviuVault.initialize, (owner)))
        );
    }

    function _salt(address owner, uint256 index) private pure returns (bytes32) {
        return keccak256(abi.encode(owner, index));
    }
}
