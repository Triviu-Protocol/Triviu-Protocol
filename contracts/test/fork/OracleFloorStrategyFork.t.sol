// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";

import {IStrategy} from "../../src/api/IStrategy.sol";
import {IVaultViews} from "../../src/api/IVaultViews.sol";
import {Intent, Side} from "../../src/api/types/Intent.sol";
import {VaultView} from "../../src/api/types/VaultView.sol";
import {OracleFloorStrategy} from "../../src/strategy/OracleFloorStrategy.sol";

/// @title OracleFloorStrategyForkTest
/// @notice The unit suite proves the fix against a STUB. This proves it against the vault.
///
/// @dev WHY THIS FILE EXISTS
///
/// The 311 green tests of this repository run against `VaultViewsStub`. That stub was fixed in
/// this same wave to mirror `VaultPositions.sol:131` — but a mirror is an ASSERTION about the
/// vault, not an OBSERVATION of it. The judge's words, and the reason this file was required
/// before any redeploy: nothing in the unit suite ever touches the real vault.
///
/// The defect being closed is not hypothetical. Measured on Polygon at block 92,599,235, the
/// live vault holds `lotCount() == 0` and `nonce == 0` — it has never executed — and in that
/// state NO `candidateLotId` exists, not even zero. `propose` read the lot before the branch
/// that leads to a buy, so the buy branch was unreachable: a lot was needed to propose the buy
/// that would create the first lot.
///
/// This test deploys the CORRECTED strategy onto a fork and asks the REAL vault, then asks the
/// same question of the strategy that is actually deployed. One answers, the other reverts, in
/// the same block, against the same vault.
contract OracleFloorStrategyForkTest is Test {
    /// @dev The live vault. `lotCount() == 0` — this is what the factory ships.
    address internal constant VAULT = 0xDd2d59866E20Ed354EaFaB49FdbD6cFce7243508;

    /// @dev The strategy currently deployed, carrying the defect in immutable bytecode.
    address internal constant DEPLOYED_BROKEN = 0x3214b8803f6A29480C0a7e85Ac00739954602644;

    address internal constant WMATIC = 0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270;
    address internal constant USDC = 0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359;
    address internal constant MATIC_USD = 0xAB594600376Ec9fD91F8e885dADF0CE036862dE0;
    address internal constant USDC_USD = 0xfE4A8cc5b5B2366C1B58Bea3858e81843581b2F7;

    /* The arguments ratified by Apex T7 and read back from the deployed contract. */
    uint256 internal constant TICKET = 100_000;
    uint256 internal constant MAX_AGE = 3600;
    uint16 internal constant BUY_TOL = 1800;
    uint16 internal constant SELL_TOL = 1800;
    uint16 internal constant MAX_LOSS = 3000;

    OracleFloorStrategy internal fixed_;

    function setUp() public {
        vm.createSelectFork(vm.rpcUrl("polygon"));
        fixed_ = new OracleFloorStrategy(
            WMATIC, USDC, 18, 6, MATIC_USD, USDC_USD, TICKET, MAX_AGE, BUY_TOL, SELL_TOL, MAX_LOSS
        );
    }

    function _view(uint256 lotId, uint256 baseBalance) internal pure returns (VaultView memory) {
        return VaultView({vault: VAULT, configEpoch: 4, lastExecAt: 0, candidateLotId: lotId, baseBalance: baseBalance});
    }

    /// @dev The premise. If this ever fails the whole wave needs rereading, because every other
    ///      conclusion rests on the live vault holding no lots.
    function test_fork_thePremise_liveVaultHasNoLots() public view {
        assertEq(IVaultViews(VAULT).lotCount(), 0, "the live vault holds no lots");
    }

    /// @dev And `lot()` reverts for every id in that state — including zero. Measured, not assumed.
    function test_fork_thePremise_everyLotIdReverts() public {
        for (uint256 id = 0; id < 3; id++) {
            vm.expectRevert();
            IVaultViews(VAULT).lot(id);
        }
    }

    /// @dev THE PROOF. The corrected strategy, asked by the REAL vault, proposes a buy.
    function test_fork_correctedStrategyProposesABuyAgainstTheLiveVault() public view {
        Intent memory i = fixed_.propose(_view(0, TICKET));

        assertEq(uint256(i.side), uint256(Side.Buy));
        assertEq(i.asset, WMATIC);
        assertEq(i.base, USDC);
        assertEq(i.amountIn, TICKET);
        assertEq(i.lotId, 0, "a buy opens a lot; it does not name one");
        assertGt(i.minOut, 0, "a floor of zero protects nothing");
    }

    /// @dev THE CONTRAST, in the same block against the same vault: what is deployed today
    ///      reverts where the corrected code answers. This is the regression, on chain.
    function test_fork_theDeployedStrategyRevertsWhereTheFixedOneAnswers() public {
        vm.expectRevert();
        IStrategy(DEPLOYED_BROKEN).propose(_view(0, TICKET));

        /* Same call, same vault, same block — the corrected one does not revert. */
        assertEq(uint256(fixed_.propose(_view(0, TICKET)).side), uint256(Side.Buy));
    }

    /// @dev The guard must not have closed what worked. With no lots, no id is in range, so every
    ///      id falls through to the buy rather than reverting.
    function test_fork_anyLotIdFallsThroughToTheBuy() public view {
        assertEq(uint256(fixed_.propose(_view(7, TICKET)).side), uint256(Side.Buy));
        assertEq(uint256(fixed_.propose(_view(type(uint256).max, TICKET)).side), uint256(Side.Buy));
    }

    /// @dev An empty vault must read as "deposit more", never as an oracle failure — the
    ///      distinction the contract header declares and the defect was collapsing.
    function test_fork_emptyVaultProposesNothingRatherThanReverting() public view {
        Intent memory i = fixed_.propose(_view(0, 0));

        assertEq(i.amountIn, 0, "nothing to do");
        assertEq(i.minOut, 0);
    }
}
