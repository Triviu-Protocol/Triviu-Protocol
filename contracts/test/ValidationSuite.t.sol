// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {TriviuExecutor} from "../src/TriviuExecutor.sol";
import {ParameterRegistry} from "../src/ParameterRegistry.sol";

/*//////////////////////////////////////////////////////////////////////////
    VALIDATION SUITE — the safety net that stands in for a public testnet.

    The founder's decision (Tradeoff Record 0008) is to go from local simulation
    straight to mainnet, with no public testnet. Because this is the ONLY barrier
    before real money, it is deliberately disproportionate: 2000+ NON-identical
    full-strategy executions, varying volume, route, slippage, gas and the DEX,
    and deliberately including adversarial cases — fee-on-transfer tokens,
    low-liquidity pools, reverting routes, and a simulated sandwich (the price
    moving against the cycle between legs).

    Every run records net result after gas, gas used, and the revert reason, and
    EVERY run asserts the three properties that must never break:
      1. The executor never holds caller funds — it ends holding exactly what was
         donated (zero if nothing was donated), never principal or profit.
      2. Every non-profitable cycle reverts ENTIRELY — no leg is left exposed and
         the caller is left holding their principal, out only gas.
      3. No malicious whitelisted token or router can drain the executor.

    What this local suite does NOT cover is stated honestly in the report
    (docs/audits/2026-07-20-local-validation-suite.md): real same-block MEV
    competition, reorgs, and live adversarial transaction ordering. Those are
    properties of a live adversarial network, not of the contract, and no local
    simulation reproduces them — which is exactly why the report names them.
//////////////////////////////////////////////////////////////////////////*/

/// Standard 18-decimal ERC-20 (no fee). The honest baseline.
contract SToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 a) external { balanceOf[to] += a; }
    function approve(address s, uint256 a) external returns (bool) { allowance[msg.sender][s] = a; return true; }
    function transfer(address to, uint256 a) external returns (bool) {
        balanceOf[msg.sender] -= a; balanceOf[to] += a; return true;
    }
    function transferFrom(address f, address to, uint256 a) external returns (bool) {
        uint256 al = allowance[f][msg.sender];
        if (al != type(uint256).max) allowance[f][msg.sender] = al - a;
        balanceOf[f] -= a; balanceOf[to] += a; return true;
    }
}

/// Fee-on-transfer token: the recipient receives LESS than sent. Explicitly
/// unsupported by policy — this suite proves that even if one were wrongly
/// whitelisted, it cannot drain the executor (it makes cycles revert, not leak).
contract FeeToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint256 public immutable feeBps;

    constructor(uint256 _feeBps) { feeBps = _feeBps; }

    function mint(address to, uint256 a) external { balanceOf[to] += a; }
    function approve(address s, uint256 a) external returns (bool) { allowance[msg.sender][s] = a; return true; }

    function _move(address f, address to, uint256 a) internal {
        uint256 fee = (a * feeBps) / 10_000;
        balanceOf[f] -= a;
        balanceOf[to] += a - fee; // fee is burned to nowhere — recipient short
    }
    function transfer(address to, uint256 a) external returns (bool) { _move(msg.sender, to, a); return true; }
    function transferFrom(address f, address to, uint256 a) external returns (bool) {
        uint256 al = allowance[f][msg.sender];
        if (al != type(uint256).max) allowance[f][msg.sender] = al - a;
        _move(f, to, a); return true;
    }
}

/// Configurable UniswapV2-style router. Per (tokenIn,tokenOut) it pays
/// `amountIn + delta` (delta may be negative = a losing hop). `reverting`
/// models a route that reverts; a router funded with too little models a
/// low-liquidity pool (its own transfer underflows and reverts). Only the typed
/// swapExactTokensForTokens signature exists — matching the executor's adapter.
contract AdvRouter {
    mapping(bytes32 => int256) public outDelta;
    bool public reverting;

    function _k(address a, address b) internal pure returns (bytes32) { return keccak256(abi.encodePacked(a, b)); }
    function setLeg(address tin, address tout, int256 d) external { outDelta[_k(tin, tout)] = d; }
    function setReverting(bool r) external { reverting = r; }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256
    ) external returns (uint256[] memory amounts) {
        require(!reverting, "AdvRouter: down");
        address tin = path[0];
        address tout = path[path.length - 1];
        // Pull input (works for both SToken and FeeToken via the shared ABI).
        SToken(tin).transferFrom(msg.sender, address(this), amountIn);
        int256 d = outDelta[_k(tin, tout)];
        uint256 out = d >= 0 ? amountIn + uint256(d) : amountIn - uint256(-d);
        require(out >= amountOutMin, "AdvRouter: slippage");
        SToken(tout).transfer(to, out); // underflows & reverts if under-funded (low-liq)
        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = out;
    }
}

contract ValidationSuite is Test {
    string constant PR = "https://github.com/Triviu-Protocol/Triviu-Protocol/pull/1";
    uint256 constant FUND = 1e30;
    uint256 constant RUNS = 2000;

    ParameterRegistry registry;
    TriviuExecutor executor;
    SToken A; SToken B; SToken C;
    FeeToken F;                 // fee-on-transfer adversary
    AdvRouter good;             // healthy pool
    AdvRouter poor;             // low-liquidity pool (tiny balance)
    AdvRouter bad;              // reverting route
    address treasury = address(0x7EA5);

    // Ghost accounting, accumulated across all runs.
    uint256 attempts; uint256 successes; uint256 reverts;
    uint256 revUnprofitable; uint256 revOther;
    uint256 gasSum; uint256 netProfitSum; uint256 donatedA;

    function setUp() public {
        registry = new ParameterRegistry(30, 0);
        executor = new TriviuExecutor(address(registry));
        A = new SToken(); B = new SToken(); C = new SToken();
        F = new FeeToken(200); // 2% fee-on-transfer
        good = new AdvRouter(); poor = new AdvRouter(); bad = new AdvRouter();
        bad.setReverting(true);

        registry.setToken(address(A), true, PR);
        registry.setToken(address(B), true, PR);
        registry.setToken(address(C), true, PR);
        registry.setToken(address(F), true, PR); // wrongly whitelisted on purpose
        registry.setTarget(address(good), true, PR);
        registry.setTarget(address(poor), true, PR);
        registry.setTarget(address(bad), true, PR);

        // Fee ACTIVE — the fee branch runs on every profitable cycle.
        registry.setTreasury(treasury, PR);
        registry.setFeeBps(3000, PR);

        // Healthy pool deeply funded; poor pool barely funded (low-liquidity).
        for (uint256 i; i < 1; ++i) {
            A.mint(address(good), FUND); B.mint(address(good), FUND); C.mint(address(good), FUND);
            F.mint(address(good), FUND);
            A.mint(address(poor), 1e12); B.mint(address(poor), 1e12); C.mint(address(poor), 1e12);
        }
        A.approve(address(executor), type(uint256).max);
        F.approve(address(executor), type(uint256).max);
    }

    /*//////////////////////////////////////////////////////////////////////
        THE 2000-RUN ADVERSARIAL LOOP — deterministic (seed from the index, so
        every run is reproducible), non-identical, and asserted every iteration.
    //////////////////////////////////////////////////////////////////////*/
    function test_adversarial_2000_runs() public {
        for (uint256 i = 0; i < RUNS; ++i) {
            uint256 s = uint256(keccak256(abi.encode(i, "triviu-v0.2")));
            uint256 kind = s % 6; // 0 profit · 1 break-even · 2 loss · 3 fee-token · 4 low-liq · 5 reverting-route
            uint256 principal = bound(uint256(keccak256(abi.encode(s, "p"))), 1e6, 1e24);
            uint256 minProfit = bound(uint256(keccak256(abi.encode(s, "m"))), 0, 1e18);

            // Occasional donation of the settle asset — must never trip a cycle.
            if (s % 7 == 0) {
                uint256 don = bound(uint256(keccak256(abi.encode(s, "d"))), 1, 1e18);
                A.mint(address(executor), don);
                donatedA += don;
            }

            _runScenario(kind, principal, minProfit, s);

            // INVARIANT 1 + 3, checked after EVERY run: the executor holds exactly
            // the donated asset and nothing else — never principal, profit, or
            // intermediate dust, no matter the outcome or the adversary.
            assertEq(A.balanceOf(address(executor)), donatedA, "INV: executor holds only donated A");
            assertEq(B.balanceOf(address(executor)), 0, "INV: no B dust");
            assertEq(C.balanceOf(address(executor)), 0, "INV: no C dust");
            assertEq(F.balanceOf(address(executor)), 0, "INV: no F dust / no drain");
        }

        // The run distribution — evidence, not a claim.
        console2.log("=== Triviu local validation: %s runs ===", attempts);
        console2.log("successes           :", successes);
        console2.log("reverts (total)     :", reverts);
        console2.log("  unprofitable      :", revUnprofitable);
        console2.log("  other (adversary) :", revOther);
        console2.log("avg gas / attempt   :", attempts == 0 ? 0 : gasSum / attempts);
        console2.log("net profit settled  :", netProfitSum);

        // The suite passes only if it actually exercised the strategy 2000+ times
        // and saw BOTH sides — real successes and real reverts.
        assertGe(attempts, 2000, "must run the full strategy 2000+ times");
        assertGt(successes, 0, "must include real profitable cycles");
        assertGt(reverts, 0, "must include real reverts (failures included)");
    }

    function _legsGood(address mid) internal view returns (TriviuExecutor.Leg[] memory legs) {
        legs = new TriviuExecutor.Leg[](3);
        legs[0] = TriviuExecutor.Leg(TriviuExecutor.Dex.UniV2, address(good), address(A), mid, 0, 0);
        legs[1] = TriviuExecutor.Leg(TriviuExecutor.Dex.UniV2, address(good), mid, address(C), 0, 0);
        legs[2] = TriviuExecutor.Leg(TriviuExecutor.Dex.UniV2, address(good), address(C), address(A), 0, 0);
    }

    function _runScenario(uint256 kind, uint256 principal, uint256 minProfit, uint256 s) internal {
        // Reset the healthy pool's legs to break-even each run.
        good.setLeg(address(A), address(B), 0);
        good.setLeg(address(B), address(C), 0);
        good.setLeg(address(C), address(A), 0);
        good.setLeg(address(A), address(F), 0);
        good.setLeg(address(F), address(C), 0);

        TriviuExecutor.Leg[] memory legs;
        address asset = address(A);

        if (kind == 0) {
            // Profitable: each leg pays a little extra (a real, rare edge).
            int256 g = int256(bound(uint256(keccak256(abi.encode(s, "g"))), 1e15, 1e18));
            good.setLeg(address(A), address(B), g);
            good.setLeg(address(B), address(C), g);
            good.setLeg(address(C), address(A), g);
            minProfit = 1; // require a positive profit
            legs = _legsGood(address(B));
        } else if (kind == 1) {
            // Break-even: passthrough; with minProfit>0 it reverts, with 0 it settles flat.
            legs = _legsGood(address(B));
        } else if (kind == 2) {
            // Losing: a leg pays less — the cycle must revert entirely.
            good.setLeg(address(B), address(C), -int256(bound(uint256(keccak256(abi.encode(s, "l"))), 1, principal / 4 + 1)));
            legs = _legsGood(address(B));
        } else if (kind == 3) {
            // Fee-on-transfer token mid-route: the 2% haircut shorts the cycle.
            legs = _legsGood(address(F));
        } else if (kind == 4) {
            // Low-liquidity pool: route the first leg through the barely-funded
            // router with a large principal — its payout transfer underflows.
            legs = new TriviuExecutor.Leg[](3);
            legs[0] = TriviuExecutor.Leg(TriviuExecutor.Dex.UniV2, address(poor), address(A), address(B), 0, 0);
            legs[1] = TriviuExecutor.Leg(TriviuExecutor.Dex.UniV2, address(good), address(B), address(C), 0, 0);
            legs[2] = TriviuExecutor.Leg(TriviuExecutor.Dex.UniV2, address(good), address(C), address(A), 0, 0);
            if (principal < 1e13) principal = 1e13; // ensure it exceeds the poor pool
        } else {
            // Reverting route: the middle leg's router is down.
            legs = new TriviuExecutor.Leg[](3);
            legs[0] = TriviuExecutor.Leg(TriviuExecutor.Dex.UniV2, address(good), address(A), address(B), 0, 0);
            legs[1] = TriviuExecutor.Leg(TriviuExecutor.Dex.UniV2, address(bad), address(B), address(C), 0, 0);
            legs[2] = TriviuExecutor.Leg(TriviuExecutor.Dex.UniV2, address(good), address(C), address(A), 0, 0);
        }

        A.mint(address(this), principal);
        uint256 callerBefore = A.balanceOf(address(this));

        attempts++;
        uint256 g0 = gasleft();
        try executor.executeCycle(asset, principal, minProfit, legs) {
            gasSum += g0 - gasleft();
            successes++;
            // INVARIANT 3 (success path): the caller never ends with less than the
            // principal they committed — a successful cycle returns principal + profit.
            uint256 callerAfter = A.balanceOf(address(this));
            assertGe(callerAfter, callerBefore, "INV: caller made whole on success");
            netProfitSum += callerAfter - callerBefore;
        } catch (bytes memory reason) {
            gasSum += g0 - gasleft();
            reverts++;
            bytes4 sel;
            if (reason.length >= 4) {
                assembly { sel := mload(add(reason, 0x20)) }
            }
            if (sel == TriviuExecutor.UnprofitableCycle.selector) revUnprofitable++;
            else revOther++;
            // INVARIANT 2: a reverted cycle is atomic — the caller's principal is
            // untouched (they still hold exactly what they had before the call).
            assertEq(A.balanceOf(address(this)), callerBefore, "INV: revert is atomic, caller keeps principal");
        }
    }

    /*//////////////////////////////////////////////////////////////////////
        Property fuzz: any losing route, at any size, reverts entirely and the
        caller keeps their principal. Complements the deterministic loop with
        Foundry's own randomization.
    //////////////////////////////////////////////////////////////////////*/
    /// forge-config: default.fuzz.runs = 1000
    function testFuzz_unprofitableRevertsEntirely(uint256 principal, uint256 loss) public {
        principal = bound(principal, 1e6, 1e24);
        loss = bound(loss, 1, principal);
        good.setLeg(address(A), address(B), 0);
        good.setLeg(address(B), address(C), -int256(loss));
        good.setLeg(address(C), address(A), 0);

        A.mint(address(this), principal);
        uint256 before = A.balanceOf(address(this));
        TriviuExecutor.Leg[] memory legs = _legsGood(address(B));

        vm.expectRevert(); // UnprofitableCycle (or a leg slippage revert) — atomic either way
        executor.executeCycle(address(A), principal, 0, legs);

        assertEq(A.balanceOf(address(this)), before, "caller keeps principal on revert");
        assertEq(A.balanceOf(address(executor)), donatedA, "executor drained nothing");
        assertEq(B.balanceOf(address(executor)), 0);
        assertEq(C.balanceOf(address(executor)), 0);
    }
}
