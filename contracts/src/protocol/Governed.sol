// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

import {IGovernedEE} from "./interfaces/IGovernedEE.sol";

/// @title Governed
/// @notice Access control of the global contracts.
abstract contract Governed is AccessControl, IGovernedEE {
    uint256 private _adminCount;

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    /// @notice Returns how many addresses hold `DEFAULT_ADMIN_ROLE`.
    /// @return Total admins.
    function adminCount() external view returns (uint256) {
        return _adminCount;
    }

    /// @inheritdoc AccessControl
    function _grantRole(bytes32 role, address vault) internal virtual override returns (bool) {
        if (role == DEFAULT_ADMIN_ROLE && vault == address(0)) revert AdminIsZero();

        bool granted = super._grantRole(role, vault);
        if (granted && role == DEFAULT_ADMIN_ROLE) _adminCount++;
        return granted;
    }

    /// @inheritdoc AccessControl
    function _revokeRole(bytes32 role, address vault) internal virtual override returns (bool) {
        bool revoked = super._revokeRole(role, vault);
        if (revoked && role == DEFAULT_ADMIN_ROLE) {
            if (_adminCount == 1) revert LastAdmin();
            _adminCount--;
        }
        return revoked;
    }
}
