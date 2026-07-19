// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TriviuExecutor, IUniV3Router} from "../src/TriviuExecutor.sol";
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

/// A scripted UniswapV2-style router: for a (tokenIn,tokenOut) pair it pays
/// `amountIn + outDelta` (outDelta may be negative for a losing hop). This
/// decouples cycle profit from principal so fuzz tests can vary them freely.
contract MockUniV2Router {
    mapping(bytes32 => int256) public outDelta;

    function _k(address tin, address tout) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(tin, tout));
    }

    function setLeg(address tin, address tout, int256 delta) external {
        outDelta[_k(tin, tout)] = delta;
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 /*deadline*/
    ) external returns (uint256[] memory amounts) {
        address tin = path[0];
        address tout = path[path.length - 1];
        require(MockERC20(tin).transferFrom(msg.sender, address(this), amountIn), "pull");

        int256 d = outDelta[_k(tin, tout)];
        uint256 out = d >= 0 ? amountIn + uint256(d) : amountIn - uint256(-d);
        require(out >= amountOutMin, "MockV2: insufficient output");
        require(MockERC20(tout).transfer(to, out), "send");

        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = out;
    }
}

/// A scripted UniswapV3-style router (single-hop exactInputSingle).
contract MockUniV3Router {
    mapping(bytes32 => int256) public outDelta;

    function _k(address tin, address tout) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(tin, tout));
    }

    function setLeg(address tin, address tout, int256 delta) external {
        outDelta[_k(tin, tout)] = delta;
    }

    function exactInputSingle(IUniV3Router.ExactInputSingleParams calldata p)
        external
        payable
        returns (uint256 out)
    {
        require(MockERC20(p.tokenIn).transferFrom(msg.sender, address(this), p.amountIn), "pull");
        int256 d = outDelta[_k(p.tokenIn, p.tokenOut)];
        out = d >= 0 ? p.amountIn + uint256(d) : p.amountIn - uint256(-d);
        require(out >= p.amountOutMinimum, "MockV3: insufficient output");
        require(MockERC20(p.tokenOut).transfer(p.recipient, out), "send");
    }
}

contract TriviuExecutorTest is Test {
    string constant PR = "https://github.com/Triviu-Protocol/Triviu-Protocol/pull/1";
    uint256 constant FUND = 1e30;

    ParameterRegistry registry;
    TriviuExecutor executor;
    MockERC20 tA;
    MockERC20 tB;
    MockERC20 tC;
    MockUniV2Router v2;
    MockUniV3Router v3;
    address alice;

    function setUp() public {
        registry = new ParameterRegistry(30, 0);
        executor = new TriviuExecutor(address(registry));
        tA = new MockERC20();
        tB = new MockERC20();
        tC = new MockERC20();
        v2 = new MockUniV2Router();
        v3 = new MockUniV3Router();
        alice = makeAddr("alice");

        registry.setToken(address(tA), true, PR);
        registry.setToken(address(tB), true, PR);
        registry.setToken(address(tC), true, PR);
        registry.setTarget(address(v2), true, PR);
        registry.setTarget(address(v3), true, PR);

        // Break-even route by default (all passthrough); profit is dialed per test.
        _fund(v2);
        _fund(v3);

        tA.mint(alice, 1_000e18);
        vm.prank(alice);
        tA.approve(address(executor), type(uint256).max);
    }

    /*//////////////////////////////////////////////////////////////////////
                                    HELPERS
    //////////////////////////////////////////////////////////////////////*/

    function _fund(MockUniV2Router r) internal {
        tA.mint(address(r), FUND);
        tB.mint(address(r), FUND);
        tC.mint(address(r), FUND);
    }

    function _fund(MockUniV3Router r) internal {
        tA.mint(address(r), FUND);
        tB.mint(address(r), FUND);
        tC.mint(address(r), FUND);
    }

    /// Standard closed cycle A→B→C→A, all UniV2 legs.
    function _legsV2() internal view returns (TriviuExecutor.Leg[] memory legs) {
        legs = new TriviuExecutor.Leg[](3);
        legs[0] = TriviuExecutor.Leg(TriviuExecutor.Dex.UniV2, address(v2), address(tA), address(tB), 0, 0);
        legs[1] = TriviuExecutor.Leg(TriviuExecutor.Dex.UniV2, address(v2), address(tB), address(tC), 0, 0);
        legs[2] = TriviuExecutor.Leg(TriviuExecutor.Dex.UniV2, address(v2), address(tC), address(tA), 0, 0);
    }

    /// The profit (or loss) of the cycle lands on the closing C→A hop.
    function _setResultV2(int256 delta) internal {
        v2.setLeg(address(tC), address(tA), delta);
    }

    /*//////////////////////////////////////////////////////////////////////
                                REVERT PATHS
    //////////////////////////////////////////////////////////////////////*/

    function test_RevertWhen_TokenNotAllowed() public {
        TriviuExecutor.Leg[] memory legs = _legsV2();
        legs[0].tokenIn = address(0xBEEF);
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(TriviuExecutor.TokenNotAllowed.selector, address(0xBEEF))
        );
        executor.executeCycle(address(0xBEEF), 1e18, 0, legs);
    }

    function test_RevertWhen_NoLegs() public {
        TriviuExecutor.Leg[] memory legs = new TriviuExecutor.Leg[](0);
        vm.prank(alice);
        vm.expectRevert(TriviuExecutor.NoLegs.selector);
        executor.executeCycle(address(tA), 100e18, 0, legs);
    }

    function test_RevertWhen_CycleNotClosed() public {
        // Ends on tB, not the asset tA.
        TriviuExecutor.Leg[] memory legs = new TriviuExecutor.Leg[](1);
        legs[0] = TriviuExecutor.Leg(TriviuExecutor.Dex.UniV2, address(v2), address(tA), address(tB), 0, 0);
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                TriviuExecutor.CycleNotClosed.selector, address(tA), address(tB), address(tA)
            )
        );
        executor.executeCycle(address(tA), 100e18, 0, legs);
    }

    function test_RevertWhen_BrokenChain() public {
        TriviuExecutor.Leg[] memory legs = _legsV2();
        legs[1].tokenIn = address(tA); // should be tB (leg 0's tokenOut)
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TriviuExecutor.BrokenChain.selector, 1));
        executor.executeCycle(address(tA), 100e18, 0, legs);
    }

    function test_RevertWhen_TargetNotAllowed() public {
        TriviuExecutor.Leg[] memory legs = _legsV2();
        legs[0].router = address(0xDEAD);
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(TriviuExecutor.TargetNotAllowed.selector, address(0xDEAD))
        );
        executor.executeCycle(address(tA), 100e18, 0, legs);
    }

    function test_RevertWhen_LegTokenOutNotAllowed() public {
        // A→X→A where X is not whitelisted; cycle is closed but the middle
        // token is not allowed.
        MockERC20 x = new MockERC20();
        TriviuExecutor.Leg[] memory legs = new TriviuExecutor.Leg[](2);
        legs[0] = TriviuExecutor.Leg(TriviuExecutor.Dex.UniV2, address(v2), address(tA), address(x), 0, 0);
        legs[1] = TriviuExecutor.Leg(TriviuExecutor.Dex.UniV2, address(v2), address(x), address(tA), 0, 0);
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(TriviuExecutor.TokenNotAllowed.selector, address(x))
        );
        executor.executeCycle(address(tA), 100e18, 0, legs);
    }

    function test_RevertWhen_UnprofitableCycle() public {
        // Break-even cycle (default), minProfit 1: realized delta == principal.
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                TriviuExecutor.UnprofitableCycle.selector, 100e18, 100e18 + 1
            )
        );
        executor.executeCycle(address(tA), 100e18, 1, _legsV2());
    }

    /*//////////////////////////////////////////////////////////////////////
                                HAPPY PATHS
    //////////////////////////////////////////////////////////////////////*/

    function test_ReturnsEverythingToCaller() public {
        _setResultV2(10e18); // 10 profit on close
        vm.prank(alice);
        executor.executeCycle(address(tA), 100e18, 10e18, _legsV2());

        assertEq(tA.balanceOf(alice), 1_010e18, "caller must receive principal + profit");
        assertEq(tA.balanceOf(address(executor)), 0, "executor must end empty");
    }

    function test_NoIntermediateDustHeld() public {
        _setResultV2(10e18);
        vm.prank(alice);
        executor.executeCycle(address(tA), 100e18, 10e18, _legsV2());

        // Chaining consumes exactly each hop's output — no B or C sticks.
        assertEq(tB.balanceOf(address(executor)), 0, "no tB dust");
        assertEq(tC.balanceOf(address(executor)), 0, "no tC dust");
    }

    function test_EmitsCycleExecuted() public {
        _setResultV2(10e18);
        vm.prank(alice);
        vm.expectEmit(true, true, false, true, address(executor));
        emit TriviuExecutor.CycleExecuted(alice, address(tA), 100e18, 10e18, 0);
        executor.executeCycle(address(tA), 100e18, 10e18, _legsV2());
    }

    /// The UniV3 adapter path: a closed cycle whose legs all route through the
    /// exactInputSingle interface.
    function test_UniV3Adapter_Works() public {
        TriviuExecutor.Leg[] memory legs = new TriviuExecutor.Leg[](3);
        legs[0] = TriviuExecutor.Leg(TriviuExecutor.Dex.UniV3, address(v3), address(tA), address(tB), 500, 0);
        legs[1] = TriviuExecutor.Leg(TriviuExecutor.Dex.UniV3, address(v3), address(tB), address(tC), 500, 0);
        legs[2] = TriviuExecutor.Leg(TriviuExecutor.Dex.UniV3, address(v3), address(tC), address(tA), 500, 0);
        v3.setLeg(address(tC), address(tA), 8e18); // 8 profit on close

        vm.prank(alice);
        executor.executeCycle(address(tA), 100e18, 8e18, legs);
        assertEq(tA.balanceOf(alice), 1_008e18, "V3 cycle returns principal + profit");
    }

    /// A cross-adapter cycle: V2 → V3 → V2 in the same atomic transaction.
    function test_MixedAdapters_Chain() public {
        TriviuExecutor.Leg[] memory legs = new TriviuExecutor.Leg[](3);
        legs[0] = TriviuExecutor.Leg(TriviuExecutor.Dex.UniV2, address(v2), address(tA), address(tB), 0, 0);
        legs[1] = TriviuExecutor.Leg(TriviuExecutor.Dex.UniV3, address(v3), address(tB), address(tC), 3000, 0);
        legs[2] = TriviuExecutor.Leg(TriviuExecutor.Dex.UniV2, address(v2), address(tC), address(tA), 0, 0);
        _setResultV2(5e18); // profit lands on the closing V2 hop

        vm.prank(alice);
        executor.executeCycle(address(tA), 100e18, 5e18, legs);
        assertEq(tA.balanceOf(alice), 1_005e18, "mixed-adapter cycle settles correctly");
        assertEq(tA.balanceOf(address(executor)), 0, "executor ends empty");
    }

    /*//////////////////////////////////////////////////////////////////////
                          F-01 · BALANCE-DELTA / DONATIONS
    //////////////////////////////////////////////////////////////////////*/

    function test_Donation_DoesNotBlockCycle() public {
        tA.mint(address(executor), 5e18); // hostile donation
        _setResultV2(10e18);
        vm.prank(alice);
        executor.executeCycle(address(tA), 100e18, 10e18, _legsV2());
        assertEq(tA.balanceOf(alice), 1_010e18, "donation must not block the cycle");
    }

    function test_Donation_PreservedNotStolen() public {
        uint256 donation = 5e18;
        tA.mint(address(executor), donation);
        _setResultV2(10e18);
        vm.prank(alice);
        executor.executeCycle(address(tA), 100e18, 10e18, _legsV2());

        assertEq(tA.balanceOf(alice), 1_010e18, "caller gets principal + profit only");
        assertEq(
            tA.balanceOf(address(executor)), donation,
            "executor keeps exactly the donation, never the caller's funds"
        );
    }

    function test_DeltaAccounting_DonationDoesNotInflateProfit() public {
        tA.mint(address(executor), 5e18);
        _setResultV2(10e18);
        vm.prank(alice);
        vm.expectEmit(true, true, false, true, address(executor));
        emit TriviuExecutor.CycleExecuted(alice, address(tA), 100e18, 10e18, 0);
        executor.executeCycle(address(tA), 100e18, 10e18, _legsV2());
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
        _setResultV2(10e18);
        _enableFee(3000); // 30% of profit
        vm.prank(alice);
        executor.executeCycle(address(tA), 100e18, 1, _legsV2());

        assertEq(tA.balanceOf(TREASURY), 3e18, "treasury gets 30% of profit");
        assertEq(tA.balanceOf(alice), 1_007e18, "caller nets principal + 70% profit");
        assertEq(tA.balanceOf(address(executor)), 0, "executor still ends empty");
    }

    function test_Fee_ChargedOnProfitNotPrincipal() public {
        _setResultV2(20e18);
        _enableFee(5000); // 50%
        vm.prank(alice);
        executor.executeCycle(address(tA), 100e18, 1, _legsV2());
        assertEq(tA.balanceOf(TREASURY), 10e18, "fee is on profit, never principal");
    }

    function test_Fee_ClampedToMaxWhenRegistryOvercharges() public {
        _setResultV2(20e18);
        _enableFee(9000); // owner tries 90% — must clamp to 50%
        vm.prank(alice);
        executor.executeCycle(address(tA), 100e18, 1, _legsV2());
        assertEq(tA.balanceOf(TREASURY), 10e18, "fee clamped to MAX_FEE_BPS (50%)");
        assertEq(executor.MAX_FEE_BPS(), 5000);
    }

    function test_Fee_ZeroWhenTreasuryUnset() public {
        _setResultV2(10e18);
        registry.setFeeBps(3000, PR); // rate set but NO treasury
        vm.prank(alice);
        executor.executeCycle(address(tA), 100e18, 1, _legsV2());
        assertEq(tA.balanceOf(alice), 1_010e18, "no treasury -> whole profit to caller");
    }

    function test_Fee_SkippedWhenTreasuryIsExecutorItself() public {
        // Misconfiguration guard: treasury == executor would strand the fee and
        // break the balance-preservation invariant. The contract skips the fee.
        _setResultV2(10e18);
        registry.setTreasury(address(executor), PR);
        registry.setFeeBps(3000, PR);
        vm.prank(alice);
        executor.executeCycle(address(tA), 100e18, 1, _legsV2());
        assertEq(tA.balanceOf(alice), 1_010e18, "whole profit to caller; fee skipped");
        assertEq(tA.balanceOf(address(executor)), 0, "executor not bricked");
    }

    function test_Fee_NothingChargedOnRevert() public {
        _enableFee(5000);
        // Break-even cycle with minProfit 1 reverts before any fee logic.
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(TriviuExecutor.UnprofitableCycle.selector, 100e18, 100e18 + 1)
        );
        executor.executeCycle(address(tA), 100e18, 1, _legsV2());
        assertEq(tA.balanceOf(TREASURY), 0, "reverting cycle pays no fee");
    }

    /*//////////////////////////////////////////////////////////////////////
                                    FUZZ
    //////////////////////////////////////////////////////////////////////*/

    function testFuzz_FeeNeverExceedsHalfProfit_AndExecutorEndsEmpty(
        uint96 profitRaw,
        uint16 bpsRaw
    ) public {
        uint256 profit = bound(uint256(profitRaw), 1, 1e27);
        uint16 bps = uint16(bound(uint256(bpsRaw), 0, 20000)); // include over-cap values
        _enableFee(bps);
        _setResultV2(int256(profit));

        vm.prank(alice);
        executor.executeCycle(address(tA), 100e18, 1, _legsV2());

        uint256 fee = tA.balanceOf(TREASURY);
        assertLe(fee, profit / 2 + 1, "fee never exceeds ~half of profit");
        assertEq(tA.balanceOf(address(executor)), 0, "executor always ends empty");
    }

    /// The whitepaper §3 condition, fuzzed: the cycle closes iff profit ≥
    /// minProfit — and either way the executor never keeps a wei.
    function testFuzz_PrincipalAndMinProfit(
        uint96 principalRaw,
        uint96 minProfitRaw,
        uint96 profitRaw
    ) public {
        uint256 principal = bound(uint256(principalRaw), 1, 1e27);
        uint256 minProfit = bound(uint256(minProfitRaw), 0, 1e27);
        uint256 profit = bound(uint256(profitRaw), 0, 1e27);

        tA.mint(alice, principal);
        _setResultV2(int256(profit));
        uint256 aliceBefore = tA.balanceOf(alice);

        vm.prank(alice);
        if (profit >= minProfit) {
            executor.executeCycle(address(tA), principal, minProfit, _legsV2());
            assertEq(tA.balanceOf(alice), aliceBefore + profit, "profit must reach caller");
        } else {
            vm.expectRevert(
                abi.encodeWithSelector(
                    TriviuExecutor.UnprofitableCycle.selector,
                    principal + profit,
                    principal + minProfit
                )
            );
            executor.executeCycle(address(tA), principal, minProfit, _legsV2());
            assertEq(tA.balanceOf(alice), aliceBefore, "revert must leave caller intact");
        }
        assertEq(tA.balanceOf(address(executor)), 0, "executor must always end empty");
    }
}

/// A hook token (ERC-777-style) that tries to reenter executeCycle during the
/// fee transfer. It must be blocked by the explicit nonReentrant guard — v0.2
/// balance-delta accounting removed the implicit stateless guard.
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
        uint256 allowed = allowance[f][msg.sender];
        if (allowed != type(uint256).max) allowance[f][msg.sender] = allowed - a;
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
            TriviuExecutor.Leg[] memory legs = new TriviuExecutor.Leg[](1);
            legs[0] = TriviuExecutor.Leg(
                TriviuExecutor.Dex.UniV2, msg.sender, address(this), address(this), 0, 0
            );
            try executor.executeCycle(address(this), 1e18, 0, legs) {} catch {}
        }
        return true;
    }
}

/// A router that pays the malicious token back at a profit for a self-cycle
/// (tokenIn == tokenOut == the ReenteringToken).
contract SelfCycleRouter {
    ReenteringToken public token;
    int256 public delta;

    function set(ReenteringToken _t, int256 _d) external {
        token = _t;
        delta = _d;
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256,
        address[] calldata,
        address to,
        uint256
    ) external returns (uint256[] memory amounts) {
        token.transferFrom(msg.sender, address(this), amountIn);
        uint256 out = delta >= 0 ? amountIn + uint256(delta) : amountIn - uint256(-delta);
        token.transfer(to, out);
        amounts = new uint256[](2);
    }
}

contract TriviuExecutorReentrancyTest is Test {
    string constant PR = "https://github.com/Triviu-Protocol/Triviu-Protocol/pull/1";

    ParameterRegistry registry;
    TriviuExecutor executor;
    ReenteringToken token;
    SelfCycleRouter router;
    address treasury = address(0x7EA5);
    address alice;

    function setUp() public {
        registry = new ParameterRegistry(30, 0);
        executor = new TriviuExecutor(address(registry));
        token = new ReenteringToken();
        router = new SelfCycleRouter();
        alice = makeAddr("alice");

        router.set(token, 10e18); // 10 profit on the self-cycle
        token.setExecutor(executor, treasury);
        registry.setToken(address(token), true, PR);
        registry.setTarget(address(router), true, PR);
        registry.setTreasury(treasury, PR);
        registry.setFeeBps(3000, PR);

        token.mint(alice, 1_000e18);
        token.mint(address(router), 1_000e18);
        vm.prank(alice);
        token.approve(address(executor), type(uint256).max);
    }

    function test_ReentrancyDuringFeeTransferIsBlocked() public {
        // Arm the hook and run a profitable cycle; the reentrant call must fail
        // (nonReentrant: _status is ENTERED -> Reentrancy), be swallowed by the
        // try/catch, and leave the outer cycle correct.
        token.arm();

        TriviuExecutor.Leg[] memory legs = new TriviuExecutor.Leg[](1);
        legs[0] = TriviuExecutor.Leg(
            TriviuExecutor.Dex.UniV2, address(router), address(token), address(token), 0, 0
        );

        vm.prank(alice);
        executor.executeCycle(address(token), 100e18, 1, legs);

        // Outer cycle settled; executor holds nothing; fee taken exactly once.
        assertEq(token.balanceOf(address(executor)), 0, "executor ends empty despite reentry attempt");
        assertEq(token.balanceOf(treasury), 3e18, "fee taken exactly once");
    }
}

/*//////////////////////////////////////////////////////////////////////////
    INVARIANT — the protocol in one line: the executor NEVER holds any caller
    funds between transactions. Under balance-delta accounting (v0.2) it may
    hold donations; it must hold EXACTLY those and nothing more
    (§08.3: invariant_ExecutorHoldsOnlyDonations).
//////////////////////////////////////////////////////////////////////////*/

contract ExecutorHandler {
    TriviuExecutor public immutable executor;
    MockERC20 public immutable tA;
    MockERC20 public immutable tB;
    MockERC20 public immutable tC;
    MockUniV2Router public immutable v2;
    uint256 public totalDonated;

    constructor(
        TriviuExecutor _executor,
        MockERC20 _a,
        MockERC20 _b,
        MockERC20 _c,
        MockUniV2Router _v2
    ) {
        executor = _executor;
        tA = _a;
        tB = _b;
        tC = _c;
        v2 = _v2;
        tA.approve(address(executor), type(uint256).max);
    }

    function _legs() internal view returns (TriviuExecutor.Leg[] memory legs) {
        legs = new TriviuExecutor.Leg[](3);
        legs[0] = TriviuExecutor.Leg(TriviuExecutor.Dex.UniV2, address(v2), address(tA), address(tB), 0, 0);
        legs[1] = TriviuExecutor.Leg(TriviuExecutor.Dex.UniV2, address(v2), address(tB), address(tC), 0, 0);
        legs[2] = TriviuExecutor.Leg(TriviuExecutor.Dex.UniV2, address(v2), address(tC), address(tA), 0, 0);
    }

    // Break-even cycles (no router drain) plus arbitrary donations; both
    // outcomes (success / revert) must leave the invariant intact.
    function execute(uint256 principal, uint256 minProfit) external {
        principal = principal % 1e24;
        minProfit = minProfit % 1e24;
        tA.mint(address(this), principal);
        try executor.executeCycle(address(tA), principal, minProfit, _legs()) {} catch {}
    }

    function donate(uint256 amount) external {
        amount = amount % 1e24;
        tA.mint(address(executor), amount);
        totalDonated += amount;
    }
}

contract TriviuExecutorInvariantTest is Test {
    string constant PR = "https://github.com/Triviu-Protocol/Triviu-Protocol/pull/1";
    uint256 constant FUND = 1e30;

    ParameterRegistry registry;
    TriviuExecutor executor;
    MockERC20 tA;
    MockERC20 tB;
    MockERC20 tC;
    MockUniV2Router v2;
    ExecutorHandler handler;

    function setUp() public {
        registry = new ParameterRegistry(30, 0);
        executor = new TriviuExecutor(address(registry));
        tA = new MockERC20();
        tB = new MockERC20();
        tC = new MockERC20();
        v2 = new MockUniV2Router();
        handler = new ExecutorHandler(executor, tA, tB, tC, v2);

        registry.setToken(address(tA), true, PR);
        registry.setToken(address(tB), true, PR);
        registry.setToken(address(tC), true, PR);
        registry.setTarget(address(v2), true, PR);

        // Fee ACTIVE during the invariant run (profit is 0, so no fee moves,
        // but the fee branch still executes).
        registry.setTreasury(address(0x7EA5), PR);
        registry.setFeeBps(4000, PR);

        tA.mint(address(v2), FUND);
        tB.mint(address(v2), FUND);
        tC.mint(address(v2), FUND);

        targetContract(address(handler));
    }

    function invariant_ExecutorHoldsOnlyDonations() public view {
        // The executor keeps exactly what was donated — never caller principal
        // or profit — and never any intermediate-token dust.
        assertEq(tA.balanceOf(address(executor)), handler.totalDonated());
        assertEq(tB.balanceOf(address(executor)), 0);
        assertEq(tC.balanceOf(address(executor)), 0);
    }
}
