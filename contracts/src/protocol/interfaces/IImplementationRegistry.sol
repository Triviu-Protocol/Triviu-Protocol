// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IImplementationRegistry
/// @notice Catalog of adoptable vault implementations.
interface IImplementationRegistry {
    enum Status {
        Unknown,
        Published,
        Deprecated
    }

    /// @notice Tells whether an implementation may be adopted.
    /// @param implementation Address being evaluated.
    /// @return `true` when published and not deprecated.
    function isAdoptable(address implementation) external view returns (bool);

    /// @notice Returns the state of an address in the catalog.
    /// @param implementation Address queried.
    /// @return Current state.
    function statusOf(address implementation) external view returns (Status);

    /// @notice Publishes an implementation in the catalog.
    /// @param implementation Address to publish.
    function publish(address implementation) external;

    /// @notice Deprecates an implementation in the catalog.
    /// @param implementation Address to deprecate.
    function deprecate(address implementation) external;
}
