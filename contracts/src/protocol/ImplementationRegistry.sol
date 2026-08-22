// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Governed} from "./Governed.sol";
import {IImplementationRegistry} from "./interfaces/IImplementationRegistry.sol";
import {IImplementationRegistryEE} from "./interfaces/IImplementationRegistryEE.sol";

/// @title ImplementationRegistry
/// @notice Catalog of vault implementations an owner may adopt.
contract ImplementationRegistry is Governed, IImplementationRegistry, IImplementationRegistryEE {
    mapping(address implementation => Status status) private _status;

    constructor(address admin) Governed(admin) {}

    /// @inheritdoc IImplementationRegistry
    function isAdoptable(address implementation) external view returns (bool) {
        return _status[implementation] == Status.Published;
    }

    /// @inheritdoc IImplementationRegistry
    function statusOf(address implementation) external view returns (Status) {
        return _status[implementation];
    }

    /// @inheritdoc IImplementationRegistry
    function publish(address implementation) external onlyRole(DEFAULT_ADMIN_ROLE) {
        Status current = _status[implementation];
        if (current == Status.Published) revert AlreadyPublished(implementation);
        if (current == Status.Deprecated) revert AlreadyDeprecated(implementation);
        if (implementation.code.length == 0) revert NotAContract(implementation);

        _status[implementation] = Status.Published;
        emit ImplementationPublished(implementation);
    }

    /// @inheritdoc IImplementationRegistry
    function deprecate(address implementation) external onlyRole(DEFAULT_ADMIN_ROLE) {
        Status current = _status[implementation];
        if (current == Status.Deprecated) revert AlreadyDeprecated(implementation);
        if (current != Status.Published) revert NotPublished(implementation);

        _status[implementation] = Status.Deprecated;
        emit ImplementationDeprecated(implementation);
    }
}
