// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {TriviuVault} from "../../src/vault/TriviuVault.sol";
import {ExecutionParams} from "../../src/vault/types/ExecutionParams.sol";
import {IVaultConfigEE} from "../../src/vault/interfaces/IVaultConfigEE.sol";
import {IVaultCustodyEE} from "../../src/vault/interfaces/IVaultCustodyEE.sol";
import {IVaultExecutionEE} from "../../src/api/IVaultExecutionEE.sol";
import {Intent, Side} from "../../src/api/types/Intent.sol";

import {BaseTest} from "../util/BaseTest.sol";
import {
    MockERC20,
    MockGuard,
    MockRouter,
    MockStrategy,
    RawStrategy,
    RevertingStrategy,
    ShortReturnStrategy
} from "../util/Mocks.sol";

/// @notice Route that calls the vault back in the middle of the swap.
contract ReentrantRoute {
    TriviuVault private immutable VAULT;

    constructor(TriviuVault vault) {
        VAULT = vault;
    }

    function swap(IERC20, IERC20, uint256, address) external {
        ExecutionParams memory p;
        p.base = address(0);
        VAULT.execute(p);
    }
}

/// @notice Executor with the right shape and the wrong intent: it keeps whatever the vault hands it.
/// @dev The signature matches `IExecutor.run` byte for byte on purpose. A hostile executor that
///      failed to decode would make the refusal prove an ABI mismatch instead of the curation.
contract HoardingExecutor {
    function run(address, address, IERC20, IERC20, uint256, bytes calldata) external {}
}

/// @notice CHECKS-A and CHECKS-B: every refusal on the execution path has a case here.
contract ExecuteChecksTest is BaseTest {
    uint256 private constant SPEND = 100e6;

    function setUp() public override {
        super.setUp();

        // Balance with slack for the fee, and the clock already past the initial cooldown.
        _fundBase(1_000e6);
        strategy.setIntent(_buyIntent(SPEND));
    }

    // --- CHECKS-A ---------------------------------------------------------

    function test_theHappyPathGoesThrough() public {
        _execute(_buyIntent(SPEND));

        assertEq(vault.lotCount(), 1);
        assertEq(vault.nonce(), 1);
    }

    function test_onlyTheOperatorExecutes() public {
        ExecutionParams memory p = _params(_buyIntent(SPEND));

        vm.prank(stranger);
        vm.expectRevert(IVaultExecutionEE.NotOperator.selector);
        vault.execute(p);
    }

    function test_aPausedProtocolStopsEverybody() public {
        vm.prank(admin);
        registry.setPaused(true);

        ExecutionParams memory p = _params(_buyIntent(SPEND));

        vm.prank(operator);
        vm.expectRevert(IVaultExecutionEE.Paused.selector);
        vault.execute(p);
    }

    function test_anExpiredProposalIsRefused() public {
        ExecutionParams memory p = _params(_buyIntent(SPEND));

        skip(61);

        vm.prank(operator);
        vm.expectRevert(IVaultExecutionEE.ProposalExpired.selector);
        vault.execute(p);
    }

    /// @dev Validity has an owner-set ceiling: a proposal good for too long is refused.
    function test_aProposalValidForTooLongIsRefused() public {
        Intent memory intent = _buyIntent(SPEND);
        ExecutionParams memory p = _params(intent);
        p.validUntil = uint64(block.timestamp + MAX_VALIDITY + 1);
        p = _seal(p, intent);

        vm.prank(operator);
        vm.expectRevert(IVaultExecutionEE.ValidityTooLong.selector);
        vault.execute(p);
    }

    /// @dev Any setter between the read and the execution invalidates the proposal.
    function test_aStaleConfigEpochIsRefused() public {
        ExecutionParams memory p = _params(_buyIntent(SPEND));

        vm.prank(owner);
        vault.setLimits(COOLDOWN, MAX_VALIDITY, 0, 0);

        vm.prank(operator);
        vm.expectRevert(IVaultExecutionEE.ConfigEpochStale.selector);
        vault.execute(p);
    }

    function test_theCooldownIsEnforcedBetweenExecutions() public {
        _execute(_buyIntent(SPEND));

        ExecutionParams memory p = _params(_buyIntent(SPEND));

        vm.prank(operator);
        vm.expectRevert(IVaultExecutionEE.CooldownActive.selector);
        vault.execute(p);

        skip(COOLDOWN);
        _execute(_buyIntent(SPEND));

        assertEq(vault.nonce(), 2);
    }

    function test_aBaseThatTheVaultDoesNotAcceptIsRefused() public {
        MockERC20 other = new MockERC20("Other", "OTH", 6);

        Intent memory intent = _buyIntent(SPEND);
        ExecutionParams memory p = _params(intent);
        p.base = address(other);
        p = _seal(p, intent);

        vm.prank(operator);
        vm.expectRevert(IVaultConfigEE.BaseNotEnabled.selector);
        vault.execute(p);
    }

    // --- the `Strategy` -----------------------------------------------------

    function test_aRevertingStrategyIsRefused() public {
        address broken = address(new RevertingStrategy());

        vm.prank(owner);
        vault.setStrategy(broken);

        ExecutionParams memory p = _params(_buyIntent(SPEND));

        vm.prank(operator);
        vm.expectRevert(IVaultExecutionEE.StrategyCallFailed.selector);
        vault.execute(p);
    }

    function test_aStrategyThatAnswersTooLittleIsRefused() public {
        address short = address(new ShortReturnStrategy());

        vm.prank(owner);
        vault.setStrategy(short);

        ExecutionParams memory p = _params(_buyIntent(SPEND));

        vm.prank(operator);
        vm.expectRevert(IVaultExecutionEE.StrategyCallFailed.selector);
        vault.execute(p);
    }

    /// @dev The decode is done in `uint256` precisely to refuse what does not fit the type.
    function test_aStrategyWithAnOutOfRangeSideIsRefused() public {
        bytes memory payload = abi.encode(uint256(2), uint160(address(asset)), uint160(address(base)), SPEND, 0, 0);

        address raw = address(new RawStrategy(payload));

        vm.prank(owner);
        vault.setStrategy(raw);

        ExecutionParams memory p = _params(_buyIntent(SPEND));

        vm.prank(operator);
        vm.expectRevert(IVaultExecutionEE.StrategyCallFailed.selector);
        vault.execute(p);
    }

    function test_aStrategyWithADirtyAddressIsRefused() public {
        bytes memory payload =
            abi.encode(uint256(0), uint256(type(uint160).max) + 1, uint160(address(base)), SPEND, 0, 0);

        address raw = address(new RawStrategy(payload));

        vm.prank(owner);
        vault.setStrategy(raw);

        ExecutionParams memory p = _params(_buyIntent(SPEND));

        vm.prank(operator);
        vm.expectRevert(IVaultExecutionEE.StrategyCallFailed.selector);
        vault.execute(p);
    }

    // --- intent vetting -----------------------------------------------------

    function test_theIntentBaseMustMatchTheDeclaredOne() public {
        MockERC20 other = new MockERC20("Other", "OTH", 6);

        vm.prank(owner);
        vault.setBaseCurrency(address(other), true);

        Intent memory intent = _buyIntent(SPEND);
        intent.base = address(other);
        strategy.setIntent(intent);

        ExecutionParams memory p = _params(_buyIntent(SPEND));

        vm.prank(operator);
        vm.expectRevert(IVaultConfigEE.DeclaredBaseMismatch.selector);
        vault.execute(p);
    }

    function test_anAssetOutsideTheListIsRefused() public {
        MockERC20 other = new MockERC20("Other", "OTH", 18);

        Intent memory intent = _buyIntent(SPEND);
        intent.asset = address(other);
        strategy.setIntent(intent);

        ExecutionParams memory p = _params(intent);

        vm.prank(operator);
        vm.expectRevert(IVaultConfigEE.AssetNotAllowed.selector);
        vault.execute(p);
    }

    function test_anAmountThatQuantizesToZeroIsRefused() public {
        vm.prank(owner);
        vault.setLimits(COOLDOWN, MAX_VALIDITY, 0, uint112(SPEND * 2));

        Intent memory intent = _buyIntent(SPEND);
        strategy.setIntent(intent);

        Intent memory quantized = _buyIntent(0);
        ExecutionParams memory p = _params(quantized);

        vm.prank(operator);
        vm.expectRevert(IVaultExecutionEE.AmountQuantizedToZero.selector);
        vault.execute(p);
    }

    /// @dev The commitment is over the **already quantized** amount: it is what the vault will trade.
    function test_theCommitmentIsOverTheQuantizedAmount() public {
        uint112 quantum = 1e6;

        vm.prank(owner);
        vault.setLimits(COOLDOWN, MAX_VALIDITY, 0, quantum);

        Intent memory proposed = _buyIntent(SPEND + 123);
        strategy.setIntent(proposed);

        Intent memory quantized = _buyIntent(SPEND);
        ExecutionParams memory p = _params(quantized);
        p.routeCalldata =
            abi.encodeCall(MockRouter.swap, (IERC20(address(base)), IERC20(address(asset)), SPEND, address(vault)));
        p = _seal(p, quantized);

        vm.prank(operator);
        vault.execute(p);

        assertEq(vault.lot(0).allocatedCapital, SPEND);
    }

    function test_aTicketBelowTheFloorIsRefused() public {
        Intent memory intent = _buyIntent(999);
        strategy.setIntent(intent);

        ExecutionParams memory p = _params(intent);

        vm.prank(operator);
        vm.expectRevert(IVaultExecutionEE.TicketTooSmall.selector);
        vault.execute(p);
    }

    function test_aDeclaredOutputBelowTheOwnersRatioIsRefused() public {
        vm.prank(owner);
        vault.setLimits(COOLDOWN, MAX_VALIDITY, 5_000, 0);

        Intent memory intent = _buyIntent(SPEND);
        strategy.setIntent(intent);

        ExecutionParams memory p = _params(intent);

        vm.prank(operator);
        vm.expectRevert(IVaultExecutionEE.RatioTooLow.selector);
        vault.execute(p);
    }

    /// @dev Base-currency curation belongs to the protocol, and applies per buy.
    function test_buyingWithAnUncuratedBaseIsRefused() public {
        vm.prank(admin);
        registry.setBaseCurrency(address(base), false);

        ExecutionParams memory p = _params(_buyIntent(SPEND));

        vm.prank(operator);
        vm.expectRevert(IVaultConfigEE.BaseNotCurated.selector);
        vault.execute(p);
    }

    // --- commitment and route ------------------------------------------------

    function test_anyTamperedFieldBreaksTheCommitment() public {
        Intent memory intent = _buyIntent(SPEND);
        ExecutionParams memory p = _params(intent);
        p.operatorMinOut = 1;

        vm.prank(operator);
        vm.expectRevert(IVaultExecutionEE.CommitmentMismatch.selector);
        vault.execute(p);
    }

    function test_aRouteCalldataSwapDoesNotSurviveTheCommitment() public {
        Intent memory intent = _buyIntent(SPEND);
        ExecutionParams memory p = _params(intent);
        p.routeCalldata =
            abi.encodeCall(MockRouter.swap, (IERC20(address(base)), IERC20(address(asset)), SPEND, address(stranger)));

        vm.prank(operator);
        vm.expectRevert(IVaultExecutionEE.CommitmentMismatch.selector);
        vault.execute(p);
    }

    /// @dev The same commitment does not pass twice: the nonce goes into the hash.
    function test_theSameProposalCannotBeReplayed() public {
        vm.prank(owner);
        vault.setLimits(0, MAX_VALIDITY, 0, 0);

        Intent memory intent = _buyIntent(SPEND);
        ExecutionParams memory p = _params(intent);

        vm.prank(operator);
        vault.execute(p);

        vm.prank(operator);
        vm.expectRevert(IVaultExecutionEE.CommitmentMismatch.selector);
        vault.execute(p);
    }

    function test_theRouteCannotPointAtTheVaultOrTheExecutor() public {
        Intent memory intent = _buyIntent(SPEND);

        ExecutionParams memory p = _params(intent);
        p.target = address(vault);
        p = _seal(p, intent);

        vm.prank(operator);
        vm.expectRevert(IVaultExecutionEE.ForbiddenTarget.selector);
        vault.execute(p);

        p = _params(intent);
        p.spender = address(executor);
        p = _seal(p, intent);

        vm.prank(operator);
        vm.expectRevert(IVaultExecutionEE.ForbiddenSpender.selector);
        vault.execute(p);
    }

    /// @dev Neither the target nor the `spender` may be a listed token: it would be signing a `transferFrom`.
    function test_theRouteCannotPointAtAListedToken() public {
        Intent memory intent = _buyIntent(SPEND);

        ExecutionParams memory p = _params(intent);
        p.target = address(asset);
        p = _seal(p, intent);

        vm.prank(operator);
        vm.expectRevert(IVaultExecutionEE.ForbiddenTarget.selector);
        vault.execute(p);

        p = _params(intent);
        p.spender = address(base);
        p = _seal(p, intent);

        vm.prank(operator);
        vm.expectRevert(IVaultExecutionEE.ForbiddenSpender.selector);
        vault.execute(p);
    }

    // --- the floors on a buy --------------------------------------------------

    /// @dev Pins an uncomfortable property so it stays stated instead of implicit. On a buy there
    ///      are three floors: `Limits.minRatioBps` (owner), `operatorMinOut` (submitter) and
    ///      `Intent.minOut` (strategy). `minRatioBps` never sees the realised amount —
    ///      `Floors.meetsMinRatio` compares the **declared** `minOut` — so it cannot substitute
    ///      for the other two. What defends the owner against a mis-routing operator is the
    ///      `minOut` their own strategy declares.
    ///
    ///      This uses `MockStrategy`, which declares whatever the test hands it, so what is pinned
    ///      here is the **vault's** behaviour: with all three floors at zero it accepts a zero
    ///      fill, and it does so by design rather than by oversight. This is no longer the shape
    ///      the reference flow produces — `ExampleStrategy` takes `MIN_OUT_PER_TICKET` by
    ///      constructor and refuses zero, guarded by
    ///      `test_theExampleStrategyRefusesToShipWithoutABuyFloor`.
    ///      If this test ever starts reverting, a floor was added inside the vault itself —
    ///      update it, do not delete it.
    function test_aBuyWithEveryFloorAtZeroAcceptsAZeroFill() public {
        router.setRate(1);

        Intent memory intent = _buyIntent(SPEND);
        strategy.setIntent(intent);

        uint256 baseBefore = base.balanceOf(address(vault));
        _execute(intent);

        assertEq(asset.balanceOf(address(vault)), 0, "a floor now exists on the buy leg");
        assertEq(baseBefore - base.balanceOf(address(vault)), SPEND + (SPEND * FEE_BPS) / 10_000);
        assertEq(vault.lotCount(), 1, "the lot was opened with no backing at all");
    }

    // --- executor curation --------------------------------------------------

    /// @dev The vault sends `amountIn` to `p.executor` before the route runs. The submitter chooses
    ///      that address, so without the curation they would be choosing who receives the funds.
    function test_anUncuratedExecutorNeverReceivesTheInput() public {
        HoardingExecutor hoarder = new HoardingExecutor();
        uint256 balanceBefore = base.balanceOf(address(vault));

        Intent memory intent = _buyIntent(SPEND);
        ExecutionParams memory p = _params(intent);
        p.executor = address(hoarder);
        p = _seal(p, intent);

        vm.prank(operator);
        vm.expectRevert(IVaultExecutionEE.ExecutorNotCurated.selector);
        vault.execute(p);

        assertEq(base.balanceOf(address(vault)), balanceBefore, "the vault paid an uncurated executor");
        assertEq(base.balanceOf(address(hoarder)), 0, "the uncurated executor was funded");
    }

    /// @dev The owner's entrypoint skips the strategy, not the curation.
    function test_theOwnerEntrypointAlsoRequiresACuratedExecutor() public {
        HoardingExecutor hoarder = new HoardingExecutor();

        Intent memory intent = _buyIntent(SPEND);
        ExecutionParams memory p = _params(intent);
        p.executor = address(hoarder);
        p = _seal(p, intent);

        vm.prank(owner);
        vm.expectRevert(IVaultExecutionEE.ExecutorNotCurated.selector);
        vault.executeAsOwner(intent, p);
    }

    /// @dev The vault reads the curation on every call, never at configuration time: an executor
    ///      withdrawn by governance stops being accepted on the next execution, with no migration
    ///      and no epoch bump.
    function test_removingTheCurationStopsTheNextExecution() public {
        _execute(_buyIntent(SPEND));
        skip(COOLDOWN);

        vm.prank(admin);
        registry.setExecutor(address(executor), false);

        ExecutionParams memory p = _params(_buyIntent(SPEND));

        vm.prank(operator);
        vm.expectRevert(IVaultExecutionEE.ExecutorNotCurated.selector);
        vault.execute(p);
    }

    // --- guards -------------------------------------------------------------

    function test_aGuardThatRejectsStopsTheExecution() public {
        MockGuard blocker = new MockGuard(true);

        vm.prank(owner);
        vault.addGuard(address(blocker));

        ExecutionParams memory p = _params(_buyIntent(SPEND));

        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(
                IVaultExecutionEE.GuardRejected.selector,
                address(blocker),
                abi.encodeWithSelector(MockGuard.Rejected.selector)
            )
        );
        vault.execute(p);
    }

    function test_everyGuardIsConsulted() public {
        MockGuard first = new MockGuard(false);
        MockGuard blocker = new MockGuard(true);

        vm.startPrank(owner);
        vault.addGuard(address(first));
        vault.addGuard(address(blocker));
        vm.stopPrank();

        ExecutionParams memory p = _params(_buyIntent(SPEND));

        vm.prank(operator);
        vm.expectRevert();
        vault.execute(p);
    }

    // --- balance and floors --------------------------------------------------

    /// @dev A buy needs slack over the traded amount, for fee and refund.
    function test_aBuyWithoutRoomForTheFeeIsRefused() public {
        uint256 balance = base.balanceOf(address(vault));

        vm.prank(owner);
        vault.withdraw(IERC20(address(base)), balance, owner);

        _fundBase(SPEND);

        ExecutionParams memory p = _params(_buyIntent(SPEND));

        vm.prank(operator);
        vm.expectRevert(IVaultExecutionEE.InsufficientBalanceForFees.selector);
        vault.execute(p);
    }

    function test_aBuyLargerThanTheBalanceIsRefused() public {
        uint256 balance = base.balanceOf(address(vault));

        Intent memory intent = _buyIntent(balance + 1e6);
        strategy.setIntent(intent);

        ExecutionParams memory p = _params(intent);

        vm.prank(operator);
        vm.expectRevert(IVaultExecutionEE.InsufficientBalanceForFees.selector);
        vault.execute(p);
    }

    function test_aGrossBelowWhatTheOperatorDeclaredIsRefused() public {
        Intent memory intent = _buyIntent(SPEND);
        ExecutionParams memory p = _params(intent);
        p.operatorMinOut = type(uint128).max;
        p = _seal(p, intent);

        vm.prank(operator);
        vm.expectRevert(IVaultExecutionEE.GrossBelowOperatorMin.selector);
        vault.execute(p);
    }

    function test_aNetBelowWhatTheStrategyAskedIsRefused() public {
        Intent memory intent = _buyIntent(SPEND);
        intent.minOut = type(uint128).max;
        strategy.setIntent(intent);

        ExecutionParams memory p = _params(intent);

        vm.prank(operator);
        vm.expectRevert(IVaultExecutionEE.NetBelowStrategyMin.selector);
        vault.execute(p);
    }

    // --- reentrancy ----------------------------------------------------------

    function test_theVaultRefusesToBeCalledBackMidExecution() public {
        ReentrantRoute attacker = new ReentrantRoute(vault);

        Intent memory intent = _buyIntent(SPEND);
        ExecutionParams memory p = _params(intent);
        p.target = address(attacker);
        p.spender = address(attacker);
        p.routeCalldata =
            abi.encodeCall(ReentrantRoute.swap, (IERC20(address(base)), IERC20(address(asset)), SPEND, address(vault)));
        p = _seal(p, intent);

        vm.prank(operator);
        vm.expectRevert();
        vault.execute(p);
    }

    // --- dry run -------------------------------------------------------------

    function test_theDryRunAnswersWhatTheStrategyWouldPropose() public view {
        Intent memory proposed = vault.dryRunChecks(0, address(base));

        assertEq(uint8(proposed.side), uint8(Side.Buy));
        assertEq(proposed.asset, address(asset));
        assertEq(proposed.amountIn, SPEND);
    }

    function test_theDryRunRefusesWhatTheExecutionWouldRefuse() public {
        _execute(_buyIntent(SPEND));

        vm.expectRevert(IVaultExecutionEE.CooldownActive.selector);
        vault.dryRunChecks(0, address(base));
    }

    function test_theDryRunRunsTheGuards() public {
        MockGuard blocker = new MockGuard(true);

        vm.prank(owner);
        vault.addGuard(address(blocker));

        vm.expectRevert();
        vault.dryRunChecks(0, address(base));
    }

    // --- the owner in place of the operator -----------------------------------

    function test_theOwnerCanExecuteHisOwnIntent() public {
        Intent memory intent = _buyIntent(SPEND);
        ExecutionParams memory p = _params(intent);

        vm.prank(owner);
        vault.executeAsOwner(intent, p);

        assertEq(vault.lotCount(), 1);
    }

    /// @dev The owner's path does not go through the `Strategy`: they bring the intent by hand.
    function test_theOwnerPathIgnoresTheStrategy() public {
        address broken = address(new RevertingStrategy());

        vm.prank(owner);
        vault.setStrategy(broken);

        Intent memory intent = _buyIntent(SPEND);
        ExecutionParams memory p = _params(intent);

        vm.prank(owner);
        vault.executeAsOwner(intent, p);

        assertEq(vault.lotCount(), 1);
    }

    function test_aStrangerCannotUseTheOwnerPath() public {
        Intent memory intent = _buyIntent(SPEND);
        ExecutionParams memory p = _params(intent);

        vm.prank(stranger);
        vm.expectRevert(IVaultCustodyEE.NotOwner.selector);
        vault.executeAsOwner(intent, p);
    }

    /// @dev The owner does not escape the limits they wrote themselves.
    function test_theOwnerPathStillObeysTheLimits() public {
        Intent memory intent = _buyIntent(SPEND);
        ExecutionParams memory p = _params(intent);

        vm.prank(owner);
        vault.executeAsOwner(intent, p);

        Intent memory again = _buyIntent(SPEND);
        ExecutionParams memory next = _params(again);

        vm.prank(owner);
        vm.expectRevert(IVaultExecutionEE.CooldownActive.selector);
        vault.executeAsOwner(again, next);
    }
}
