// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {Test} from "@forge-std/Test.sol";

import {Commitment} from "../../../src/vault/libraries/Commitment.sol";

/// @notice The commitment is what binds the proposal to what the `Operator` submits.
contract CommitmentTest is Test {
    address private constant VAULT = address(0xA11CE);
    address private constant STRATEGY = address(0x57);
    address private constant TOKEN_IN = address(0x1);
    address private constant TOKEN_OUT = address(0x2);

    function _proposal() private view returns (bytes32) {
        return Commitment.proposalHash(VAULT, 7, 3, STRATEGY, TOKEN_IN, TOKEN_OUT, 1_000, 5);
    }

    function test_theSameInputsGiveTheSameHash() public view {
        assertEq(_proposal(), _proposal());
    }

    /// @dev The `chainid` goes into the hash: the same proposal on another chain is another commitment.
    function test_theChainIdIsPartOfTheProposal() public {
        bytes32 here = _proposal();

        vm.chainId(block.chainid + 1);

        assertNotEq(_proposal(), here);
    }

    function test_everyProposalFieldChangesTheHash() public view {
        bytes32 baseline = _proposal();

        assertNotEq(Commitment.proposalHash(address(1), 7, 3, STRATEGY, TOKEN_IN, TOKEN_OUT, 1_000, 5), baseline);
        assertNotEq(Commitment.proposalHash(VAULT, 8, 3, STRATEGY, TOKEN_IN, TOKEN_OUT, 1_000, 5), baseline);
        assertNotEq(Commitment.proposalHash(VAULT, 7, 4, STRATEGY, TOKEN_IN, TOKEN_OUT, 1_000, 5), baseline);
        assertNotEq(Commitment.proposalHash(VAULT, 7, 3, address(1), TOKEN_IN, TOKEN_OUT, 1_000, 5), baseline);
        assertNotEq(Commitment.proposalHash(VAULT, 7, 3, STRATEGY, address(9), TOKEN_OUT, 1_000, 5), baseline);
        assertNotEq(Commitment.proposalHash(VAULT, 7, 3, STRATEGY, TOKEN_IN, address(9), 1_000, 5), baseline);
        assertNotEq(Commitment.proposalHash(VAULT, 7, 3, STRATEGY, TOKEN_IN, TOKEN_OUT, 1_001, 5), baseline);
        assertNotEq(Commitment.proposalHash(VAULT, 7, 3, STRATEGY, TOKEN_IN, TOKEN_OUT, 1_000, 6), baseline);
    }

    /// @dev Swapping the legs around is another order, and cannot collide.
    function test_swappingTheLegsChangesTheHash() public view {
        assertNotEq(
            Commitment.proposalHash(VAULT, 7, 3, STRATEGY, TOKEN_OUT, TOKEN_IN, 1_000, 5),
            Commitment.proposalHash(VAULT, 7, 3, STRATEGY, TOKEN_IN, TOKEN_OUT, 1_000, 5)
        );
    }

    function test_everyExecutionFieldChangesTheHash() public view {
        bytes32 proposal = _proposal();
        bytes32 route = keccak256("route");

        bytes32 baseline = Commitment.executionHash(proposal, address(1), address(2), address(3), 10, 9, 8, 7, route);

        assertNotEq(
            Commitment.executionHash(keccak256("other"), address(1), address(2), address(3), 10, 9, 8, 7, route),
            baseline
        );
        assertNotEq(
            Commitment.executionHash(proposal, address(4), address(2), address(3), 10, 9, 8, 7, route), baseline
        );
        assertNotEq(
            Commitment.executionHash(proposal, address(1), address(4), address(3), 10, 9, 8, 7, route), baseline
        );
        assertNotEq(
            Commitment.executionHash(proposal, address(1), address(2), address(4), 10, 9, 8, 7, route), baseline
        );
        assertNotEq(
            Commitment.executionHash(proposal, address(1), address(2), address(3), 11, 9, 8, 7, route), baseline
        );
        assertNotEq(
            Commitment.executionHash(proposal, address(1), address(2), address(3), 10, 10, 8, 7, route), baseline
        );
        assertNotEq(
            Commitment.executionHash(proposal, address(1), address(2), address(3), 10, 9, 9, 7, route), baseline
        );
        assertNotEq(
            Commitment.executionHash(proposal, address(1), address(2), address(3), 10, 9, 8, 8, route), baseline
        );
        assertNotEq(
            Commitment.executionHash(
                proposal, address(1), address(2), address(3), 10, 9, 8, 7, keccak256("other route")
            ),
            baseline
        );
    }

    function testFuzz_differentNoncesNeverCollide(uint64 a, uint64 b) public view {
        vm.assume(a != b);

        assertNotEq(
            Commitment.proposalHash(VAULT, a, 3, STRATEGY, TOKEN_IN, TOKEN_OUT, 1_000, 5),
            Commitment.proposalHash(VAULT, b, 3, STRATEGY, TOKEN_IN, TOKEN_OUT, 1_000, 5)
        );
    }

    function testFuzz_differentConfigEpochsNeverCollide(uint64 a, uint64 b) public view {
        vm.assume(a != b);

        assertNotEq(
            Commitment.proposalHash(VAULT, 7, a, STRATEGY, TOKEN_IN, TOKEN_OUT, 1_000, 5),
            Commitment.proposalHash(VAULT, 7, b, STRATEGY, TOKEN_IN, TOKEN_OUT, 1_000, 5)
        );
    }
}
