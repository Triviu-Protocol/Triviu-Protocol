// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TriviuExecutor} from "../src/TriviuExecutor.sol";
import {ParameterRegistry} from "../src/ParameterRegistry.sol";

/// Minimal ERC-20 for tests: standard bool returns, open mint, no fees.
/// (Fee-on-transfer tokens are excluded from the protocol whitelist by policy.)
contract MockERC20 {
    string public name = "Mock";
    string public symbol = "MOCK";
    uint8 public decimals = 18;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) allowance[from][msg.sender] = allowed - amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

/// Stand-in for a DEX leg. Pre-funded by tests; `give` pays tokens to the
/// caller (the executor mid-cycle), `noop` moves nothing, `fail` reverts.
contract MockVenue {
    function give(MockERC20 token, uint256 amount) external {
        token.transfer(msg.sender, amount);
    }

    function noop() external {}

    function fail() external pure {
        revert("venue failure");
    }
}

contract TriviuExecutorTest is Test {
    string constant PR = "https://github.com/Triviu-Protocol/Triviu-Protocol/pull/1";

    ParameterRegistry registry;
    TriviuExecutor executor;
    MockERC20 token;
    MockVenue venue;
    address alice;

    function setUp() public {
        registry = new ParameterRegistry(30, 0);
        executor = new TriviuExecutor(address(registry));
        token = new MockERC20();
        venue = new MockVenue();
        alice = makeAddr("alice");

        registry.setToken(address(token), true, PR);
        registry.setTarget(address(venue), true, PR);

        token.mint(alice, 1_000e18);
        vm.prank(alice);
        token.approve(address(executor), type(uint256).max);
    }

    /*//////////////////////////////////////////////////////////////////////
                                    HELPERS
    //////////////////////////////////////////////////////////////////////*/

    function _noSteps() internal pure returns (TriviuExecutor.Step[] memory steps) {
        steps = new TriviuExecutor.Step[](0);
    }

    function _giveStep(uint256 amount) internal view returns (TriviuExecutor.Step[] memory steps) {
        steps = new TriviuExecutor.Step[](1);
        steps[0] = TriviuExecutor.Step({
            target: address(venue),
            data: abi.encodeCall(MockVenue.give, (token, amount))
        });
    }

    /*//////////////////////////////////////////////////////////////////////
                                REVERT PATHS
    //////////////////////////////////////////////////////////////////////*/

    function test_RevertWhen_TokenNotAllowed() public {
        vm.expectRevert(
            abi.encodeWithSelector(TriviuExecutor.TokenNotAllowed.selector, address(0xBEEF))
        );
        executor.executeCycle(address(0xBEEF), 1e18, 0, _noSteps());
    }

    function test_RevertWhen_TargetNotAllowed() public {
        TriviuExecutor.Step[] memory steps = new TriviuExecutor.Step[](1);
        steps[0] = TriviuExecutor.Step({target: address(0xDEAD), data: ""});

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(TriviuExecutor.TargetNotAllowed.selector, address(0xDEAD))
        );
        executor.executeCycle(address(token), 100e18, 0, steps);
    }

    function test_RevertWhen_StepFails() public {
        TriviuExecutor.Step[] memory steps = new TriviuExecutor.Step[](1);
        steps[0] = TriviuExecutor.Step({
            target: address(venue),
            data: abi.encodeCall(MockVenue.fail, ())
        });

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TriviuExecutor.StepFailed.selector, 0));
        executor.executeCycle(address(token), 100e18, 0, steps);
    }

    function test_RevertWhen_UnprofitableCycle() public {
        // No leg produces profit, so finalBalance == principal < principal + 1.
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                TriviuExecutor.UnprofitableCycle.selector, 100e18, 100e18 + 1
            )
        );
        executor.executeCycle(address(token), 100e18, 1, _noSteps());
    }

    function test_Stateless_HoldsNoBalance() public {
        // Documented stateless invariant: a pre-existing balance blocks execution.
        token.mint(address(executor), 5e18);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(TriviuExecutor.NotStateless.selector, 5e18)
        );
        executor.executeCycle(address(token), 100e18, 0, _noSteps());
    }

    /// Honest edge (decisions/0002): ANYONE can donate 1 wei of an allowed
    /// token to the executor and permanently trip the stateless check for that
    /// token — there is no sweep function in v0. Failures included: this test
    /// pins the real behavior until v0.2 moves to balance-delta accounting.
    function test_KnownLimitation_DonationTripsStatelessCheck() public {
        token.mint(address(executor), 1);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TriviuExecutor.NotStateless.selector, 1));
        executor.executeCycle(address(token), 100e18, 0, _noSteps());
    }

    /*//////////////////////////////////////////////////////////////////////
                                HAPPY PATHS
    //////////////////////////////////////////////////////////////////////*/

    function test_ReturnsEverythingToCaller() public {
        token.mint(address(venue), 50e18);

        vm.prank(alice);
        executor.executeCycle(address(token), 100e18, 10e18, _giveStep(10e18));

        // 1000 − 100 (principal out) + 110 (principal + profit back) = 1010.
        assertEq(token.balanceOf(alice), 1_010e18, "caller must receive principal + profit");
        assertEq(token.balanceOf(address(executor)), 0, "executor must end empty");
    }

    function test_EmitsCycleExecuted() public {
        token.mint(address(venue), 50e18);

        // No treasury configured in setUp -> fee is 0, whole profit to caller.
        vm.prank(alice);
        vm.expectEmit(true, true, false, true, address(executor));
        emit TriviuExecutor.CycleExecuted(alice, address(token), 100e18, 10e18, 0);
        executor.executeCycle(address(token), 100e18, 10e18, _giveStep(10e18));
    }

    /*//////////////////////////////////////////////////////////////////////
                                SUCCESS FEE
    //////////////////////////////////////////////////////////////////////*/

    address constant TREASURY = address(0x7EA5);

    function _enableFee(uint16 bps) internal {
        registry.setTreasury(TREASURY, PR);
        registry.setFeeBps(bps, PR);
    }

    function test_Fee_TakenOnProfitOnly_AndRoutedToTreasury() public {
        token.mint(address(venue), 50e18);
        _enableFee(3000); // 30% of profit

        // profit = 10; fee = 30% * 10 = 3; caller nets 7.
        vm.prank(alice);
        executor.executeCycle(address(token), 100e18, 1, _giveStep(10e18));

        assertEq(token.balanceOf(TREASURY), 3e18, "treasury gets 30% of profit");
        assertEq(token.balanceOf(alice), 1_007e18, "caller nets principal + 70% profit");
        assertEq(token.balanceOf(address(executor)), 0, "executor still ends empty");
    }

    function test_Fee_ChargedOnProfitNotPrincipal() public {
        token.mint(address(venue), 50e18);
        _enableFee(5000); // 50%

        // profit = 20; fee = 50% * 20 = 10 (NOT 50% of the 100 principal).
        vm.prank(alice);
        executor.executeCycle(address(token), 100e18, 1, _giveStep(20e18));

        assertEq(token.balanceOf(TREASURY), 10e18, "fee is on profit, never principal");
    }

    function test_Fee_ClampedToMaxWhenRegistryOvercharges() public {
        token.mint(address(venue), 50e18);
        _enableFee(9000); // owner tries 90% — must be clamped to 50%

        vm.prank(alice);
        executor.executeCycle(address(token), 100e18, 1, _giveStep(20e18));

        // 50% cap -> fee = 10, not 18.
        assertEq(token.balanceOf(TREASURY), 10e18, "fee clamped to MAX_FEE_BPS (50%)");
        assertEq(executor.MAX_FEE_BPS(), 5000);
    }

    function test_Fee_ZeroWhenTreasuryUnset() public {
        token.mint(address(venue), 50e18);
        registry.setFeeBps(3000, PR); // fee rate set but NO treasury

        vm.prank(alice);
        executor.executeCycle(address(token), 100e18, 1, _giveStep(10e18));

        assertEq(token.balanceOf(alice), 1_010e18, "no treasury -> whole profit to caller");
    }

    function test_Fee_SkippedWhenTreasuryIsExecutorItself() public {
        // Misconfiguration guard: treasury == executor would strand the fee and
        // brick the stateless check. The contract skips the fee instead.
        token.mint(address(venue), 50e18);
        registry.setTreasury(address(executor), PR);
        registry.setFeeBps(3000, PR);

        vm.prank(alice);
        executor.executeCycle(address(token), 100e18, 1, _giveStep(10e18));

        assertEq(token.balanceOf(alice), 1_010e18, "whole profit to caller; fee skipped");
        assertEq(token.balanceOf(address(executor)), 0, "executor not bricked");
    }

    function test_Fee_NothingChargedOnRevert() public {
        _enableFee(5000);
        // Unprofitable cycle reverts before any fee logic runs.
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(TriviuExecutor.UnprofitableCycle.selector, 100e18, 100e18 + 1)
        );
        executor.executeCycle(address(token), 100e18, 1, _noSteps());

        assertEq(token.balanceOf(TREASURY), 0, "reverting cycle pays no fee");
    }

    function testFuzz_FeeNeverExceedsHalfProfit_AndExecutorEndsEmpty(
        uint96 profitRaw,
        uint16 bpsRaw
    ) public {
        uint256 profit = bound(uint256(profitRaw), 1, 1e27);
        uint16 bps = uint16(bound(uint256(bpsRaw), 0, 20000)); // include over-cap values
        _enableFee(bps);
        token.mint(address(venue), profit);

        vm.prank(alice);
        executor.executeCycle(address(token), 100e18, 1, _giveStep(profit));

        uint256 fee = token.balanceOf(TREASURY);
        assertLe(fee, profit / 2 + 1, "fee never exceeds ~half of profit");
        assertEq(token.balanceOf(address(executor)), 0, "executor always ends empty");
    }

    /*//////////////////////////////////////////////////////////////////////
                                    FUZZ
    //////////////////////////////////////////////////////////////////////*/

    /// The litepaper §3 condition, fuzzed: the cycle closes iff
    /// profit ≥ minProfit — and either way the executor never keeps a wei.
    function testFuzz_PrincipalAndMinProfit(
        uint96 principalRaw,
        uint96 minProfitRaw,
        uint96 profitRaw
    ) public {
        uint256 principal = bound(uint256(principalRaw), 0, 1e27);
        uint256 minProfit = bound(uint256(minProfitRaw), 0, 1e27);
        uint256 profit = bound(uint256(profitRaw), 0, 1e27);

        token.mint(alice, principal);
        token.mint(address(venue), profit);
        uint256 aliceBefore = token.balanceOf(alice);

        vm.prank(alice);
        if (profit >= minProfit) {
            executor.executeCycle(address(token), principal, minProfit, _giveStep(profit));
            assertEq(token.balanceOf(alice), aliceBefore + profit, "profit must reach caller");
        } else {
            vm.expectRevert(
                abi.encodeWithSelector(
                    TriviuExecutor.UnprofitableCycle.selector,
                    principal + profit,
                    principal + minProfit
                )
            );
            executor.executeCycle(address(token), principal, minProfit, _giveStep(profit));
            assertEq(token.balanceOf(alice), aliceBefore, "revert must leave caller intact");
        }
        assertEq(token.balanceOf(address(executor)), 0, "executor must always end empty");
    }

    function testFuzz_StepCount(uint8 stepsRaw) public {
        uint256 n = bound(uint256(stepsRaw), 0, 16);
        TriviuExecutor.Step[] memory steps = new TriviuExecutor.Step[](n);
        for (uint256 i = 0; i < n; i++) {
            steps[i] = TriviuExecutor.Step({
                target: address(venue),
                data: abi.encodeCall(MockVenue.noop, ())
            });
        }

        uint256 aliceBefore = token.balanceOf(alice);
        vm.prank(alice);
        executor.executeCycle(address(token), 100e18, 0, steps);

        assertEq(token.balanceOf(alice), aliceBefore, "noop legs must round-trip the principal");
        assertEq(token.balanceOf(address(executor)), 0, "executor must always end empty");
    }
}

/// A hook token (ERC-777-style) that tries to reenter executeCycle during the
/// fee transfer. It should be blocked by the stateless check — proof that the
/// entry-time `balanceOf(this) != 0 → revert` doubles as a reentrancy guard.
contract ReenteringToken {
    string public name = "Reenter";
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    TriviuExecutor public executor;
    address public treasury;
    bool public armed;

    function setExecutor(TriviuExecutor _e, address _t) external {
        executor = _e;
        treasury = _t;
    }

    function arm() external {
        armed = true;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address s, uint256 a) external returns (bool) {
        allowance[msg.sender][s] = a;
        return true;
    }

    function transferFrom(address f, address t, uint256 a) external returns (bool) {
        balanceOf[f] -= a;
        balanceOf[t] += a;
        return true;
    }

    function transfer(address to, uint256 a) external returns (bool) {
        balanceOf[msg.sender] -= a;
        balanceOf[to] += a;
        // The hook fires when the fee reaches the treasury: try to reenter.
        if (armed && to == treasury) {
            armed = false;
            TriviuExecutor.Step[] memory s = new TriviuExecutor.Step[](0);
            try executor.executeCycle(address(this), 1e18, 0, s) {} catch {}
        }
        return true;
    }
}

contract TriviuExecutorReentrancyTest is Test {
    string constant PR = "https://github.com/Triviu-Protocol/Triviu-Protocol/pull/1";

    ParameterRegistry registry;
    TriviuExecutor executor;
    ReenteringToken token;
    MockVenue venue;
    address treasury = address(0x7EA5);
    address alice;

    function setUp() public {
        registry = new ParameterRegistry(30, 0);
        executor = new TriviuExecutor(address(registry));
        token = new ReenteringToken();
        venue = new MockVenue();
        alice = makeAddr("alice");

        token.setExecutor(executor, treasury);
        registry.setToken(address(token), true, PR);
        registry.setTarget(address(venue), true, PR);
        registry.setTreasury(treasury, PR);
        registry.setFeeBps(3000, PR);

        token.mint(alice, 1_000e18);
        token.mint(address(venue), 100e18);
        vm.prank(alice);
        token.approve(address(executor), type(uint256).max);
    }

    function test_ReentrancyDuringFeeTransferIsBlocked() public {
        // Arm the hook and run a profitable cycle; the reentrant call must fail
        // (the executor still holds the caller's funds -> NotStateless), and be
        // swallowed by the try/catch, leaving the outer cycle correct.
        token.arm();

        TriviuExecutor.Step[] memory steps = new TriviuExecutor.Step[](1);
        steps[0] = TriviuExecutor.Step({
            target: address(venue),
            data: abi.encodeCall(MockVenue.give, (MockERC20(address(token)), 10e18))
        });

        vm.prank(alice);
        executor.executeCycle(address(token), 100e18, 1, steps);

        // Outer cycle settled correctly; executor holds nothing.
        assertEq(token.balanceOf(address(executor)), 0, "executor ends empty despite reentry attempt");
        assertEq(token.balanceOf(treasury), 3e18, "fee taken exactly once");
    }
}

/*//////////////////////////////////////////////////////////////////////////
    INVARIANT — the protocol in one line: the executor NEVER holds a balance
    between transactions (§08.3: invariant_ContractBalanceAlwaysZero).
//////////////////////////////////////////////////////////////////////////*/

contract ExecutorHandler {
    TriviuExecutor public immutable executor;
    MockERC20 public immutable token;
    MockVenue public immutable venue;

    constructor(TriviuExecutor _executor, MockERC20 _token, MockVenue _venue) {
        executor = _executor;
        token = _token;
        venue = _venue;
        token.approve(address(executor), type(uint256).max);
    }

    function execute(uint256 principal, uint256 profit, uint256 minProfit) external {
        principal = principal % 1e24;
        profit = profit % 1e24;
        minProfit = minProfit % 1e24;

        token.mint(address(this), principal);
        token.mint(address(venue), profit);

        TriviuExecutor.Step[] memory steps = new TriviuExecutor.Step[](1);
        steps[0] = TriviuExecutor.Step({
            target: address(venue),
            data: abi.encodeCall(MockVenue.give, (token, profit))
        });

        // Both outcomes are legitimate protocol behavior; the invariant below
        // must hold across every mix of successes and reverts.
        try executor.executeCycle(address(token), principal, minProfit, steps) {} catch {}
    }
}

contract TriviuExecutorInvariantTest is Test {
    string constant PR = "https://github.com/Triviu-Protocol/Triviu-Protocol/pull/1";

    ParameterRegistry registry;
    TriviuExecutor executor;
    MockERC20 token;
    MockVenue venue;
    ExecutorHandler handler;

    function setUp() public {
        registry = new ParameterRegistry(30, 0);
        executor = new TriviuExecutor(address(registry));
        token = new MockERC20();
        venue = new MockVenue();
        handler = new ExecutorHandler(executor, token, venue);

        registry.setToken(address(token), true, PR);
        registry.setTarget(address(venue), true, PR);

        // Fee ACTIVE during the invariant run: the executor must still end every
        // transaction empty even while routing a fee to the treasury.
        registry.setTreasury(address(0x7EA5), PR);
        registry.setFeeBps(4000, PR);

        targetContract(address(handler));
    }

    function invariant_ContractBalanceAlwaysZero() public view {
        assertEq(token.balanceOf(address(executor)), 0);
    }
}
