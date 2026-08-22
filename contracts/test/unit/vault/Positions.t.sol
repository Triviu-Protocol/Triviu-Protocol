// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "@forge-std/Test.sol";

import {VaultPositions} from "../../../src/vault/VaultPositions.sol";
import {IVaultPositionsEE} from "../../../src/vault/interfaces/IVaultPositionsEE.sol";
import {Lot} from "../../../src/api/types/Lot.sol";

import {MockERC20} from "../../util/Mocks.sol";

/// @notice Exposes the lot accounting without going through the execution path.
contract PositionsHarness is VaultPositions {
    function openLot(address asset, address base, uint256 received, uint256 spent) external {
        _openLot(asset, base, received, spent);
    }

    function closeLot(uint256 lotId, uint256 sold) external {
        _closeLot(lotId, sold);
    }

    function checkSellable(uint256 lotId, address asset, address base, uint256 amount) external view {
        _checkSellable(lotId, asset, base, amount);
    }

    function lot(uint256 lotId) external view returns (Lot memory) {
        return _lot(lotId);
    }

    function lotCount() external view returns (uint256) {
        return _lotCount();
    }

    function backing(uint256 lotId) external view returns (uint256) {
        return _backing(lotId);
    }
}

/// @notice The lots: opening, backing and proportional closing.
contract VaultPositionsTest is Test {
    PositionsHarness private positions;
    MockERC20 private asset;

    address private base = makeAddr("base");

    function setUp() public {
        positions = new PositionsHarness();
        asset = new MockERC20("Asset", "ASSET", 18);
    }

    function _open(uint256 received, uint256 spent) private returns (uint256 lotId) {
        lotId = positions.lotCount();
        positions.openLot(address(asset), base, received, spent);
    }

    function test_theFirstLotIsZeroAndTheCountGrows() public {
        assertEq(positions.lotCount(), 0);

        assertEq(_open(1e18, 100e6), 0);
        assertEq(_open(2e18, 200e6), 1);
        assertEq(positions.lotCount(), 2);
    }

    function test_theLotKeepsWhatWasBoughtAndWhatItCost() public {
        _open(3e18, 300e6);

        Lot memory stored = positions.lot(0);

        assertEq(stored.asset, address(asset));
        assertEq(stored.base, base);
        assertEq(stored.remaining, 3e18);
        assertEq(stored.allocatedCapital, 300e6);
        assertEq(stored.openedAt, uint48(block.timestamp));
    }

    function test_theOpeningIsAnnounced() public {
        vm.expectEmit(true, true, true, true);
        emit IVaultPositionsEE.LotOpened(0, address(asset), base, 1e18, 100e6, uint48(block.timestamp));
        positions.openLot(address(asset), base, 1e18, 100e6);
    }

    function test_readingALotThatDoesNotExistIsRefused() public {
        vm.expectRevert(abi.encodeWithSelector(IVaultPositionsEE.LotNotFound.selector, 0));
        positions.lot(0);
    }

    /// @dev The lot stores two `uint128`: what does not fit is refused instead of truncated.
    function test_amountsThatDoNotFitAreRefused() public {
        uint256 tooBig = uint256(type(uint128).max) + 1;

        vm.expectRevert(abi.encodeWithSelector(IVaultPositionsEE.AmountExceedsUint128.selector, tooBig));
        positions.openLot(address(asset), base, tooBig, 1);

        vm.expectRevert(abi.encodeWithSelector(IVaultPositionsEE.AmountExceedsUint128.selector, tooBig));
        positions.openLot(address(asset), base, 1, tooBig);
    }

    // --- backing -----------------------------------------------------------

    /// @dev The backing is the lesser of what the lot says and what the vault really holds.
    function test_theBackingIsCappedByTheRealBalance() public {
        _open(10e18, 100e6);

        assertEq(positions.backing(0), 0);

        asset.mint(address(positions), 4e18);
        assertEq(positions.backing(0), 4e18);

        asset.mint(address(positions), 100e18);
        assertEq(positions.backing(0), 10e18);
    }

    // --- sell --------------------------------------------------------------

    function test_theCandidateLotIsVetted() public {
        _open(10e18, 100e6);

        positions.checkSellable(0, address(asset), base, 10e18);

        vm.expectRevert(
            abi.encodeWithSelector(IVaultPositionsEE.LotAssetMismatch.selector, 0, address(asset), address(1))
        );
        positions.checkSellable(0, address(1), base, 1);

        vm.expectRevert(abi.encodeWithSelector(IVaultPositionsEE.LotBaseMismatch.selector, 0, base, address(2)));
        positions.checkSellable(0, address(asset), address(2), 1);

        vm.expectRevert(abi.encodeWithSelector(IVaultPositionsEE.AmountExceedsLot.selector, 0, 10e18 + 1, 10e18));
        positions.checkSellable(0, address(asset), base, 10e18 + 1);
    }

    function test_aClosedLotIsNotSellable() public {
        _open(10e18, 100e6);
        positions.closeLot(0, 10e18);

        vm.expectRevert(abi.encodeWithSelector(IVaultPositionsEE.LotNotOpen.selector, 0));
        positions.checkSellable(0, address(asset), base, 1);
    }

    function test_aFullCloseEmptiesTheLot() public {
        _open(10e18, 100e6);

        vm.expectEmit(true, true, true, true);
        emit IVaultPositionsEE.LotClosed(0, address(asset), base, 10e18, 100e6, 0, false);
        positions.closeLot(0, 10e18);

        Lot memory stored = positions.lot(0);
        assertEq(stored.remaining, 0);
        assertEq(stored.allocatedCapital, 0);
    }

    function test_aPartialCloseReleasesCapitalInProportion() public {
        _open(10e18, 100e6);

        positions.closeLot(0, 4e18);

        Lot memory stored = positions.lot(0);
        assertEq(stored.remaining, 6e18);
        assertEq(stored.allocatedCapital, 60e6);
    }

    function test_closingMoreThanTheLotIsRefused() public {
        _open(10e18, 100e6);

        vm.expectRevert(abi.encodeWithSelector(IVaultPositionsEE.AmountExceedsLot.selector, 0, 11e18, 10e18));
        positions.closeLot(0, 11e18);
    }

    /// @dev Closing in pieces does not release more capital than the lot cost.
    function testFuzz_partialClosesNeverReleaseMoreThanTheCapital(uint128 first, uint128 second) public {
        uint128 size = 1_000e18;
        uint128 capital = 1_000e6;

        first = uint128(bound(first, 1, size - 1));
        second = uint128(bound(second, 1, size - first));

        _open(size, capital);

        uint256 capitalBefore = positions.lot(0).allocatedCapital;
        positions.closeLot(0, first);
        uint256 afterFirst = positions.lot(0).allocatedCapital;
        positions.closeLot(0, second);
        uint256 afterSecond = positions.lot(0).allocatedCapital;

        assertLe(afterFirst, capitalBefore);
        assertLe(afterSecond, afterFirst);
        assertEq(positions.lot(0).remaining, size - first - second);
    }
}
