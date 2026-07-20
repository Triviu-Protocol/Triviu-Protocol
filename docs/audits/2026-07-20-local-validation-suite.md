# Local validation suite — the safety net that stands in for a public testnet

**Author:** Pantera-negra (contract engineering) · **Reviewed by:** Tubarão-branco
(Lei do Sangue). **Date:** 2026-07-20. **Subject:** `contracts/test/ValidationSuite.t.sol`.

The founder's decision (Tradeoff Record [0008](../../decisions/0008-no-public-testnet.md))
is to go from local simulation straight to mainnet, with no public testnet. That
makes this suite the **only** barrier before real money, so it is deliberately
disproportionate — and, just as deliberately, honest about what it cannot see.

## What it runs

**2000 non-identical full-strategy executions**, plus a 1000-run property fuzz.
Each of the 2000 runs is seeded from its index, so the whole set is deterministic
and reproducible, and each varies:

- **volume** (principal from 1e6 to 1e24), **minProfit**, and **slippage** floors;
- **the route and the DEX** (the three-token cycle, per-leg);
- **gas** — recorded per run (not assumed).

And it deliberately includes **adversarial cases**:

| Case | What it models | Expected |
|---|---|---|
| Losing cycle | a leg pays less than it takes | reverts entirely |
| Break-even + minProfit | no edge, profit required | reverts |
| Fee-on-transfer token | a 2% haircut token wrongly whitelisted | shorts the cycle → reverts, never drains |
| Low-liquidity pool | a barely-funded router | its payout underflows → reverts |
| Reverting route | a router that is down | reverts |
| Donations | stray tokens sent to the executor | preserved, never trip a cycle |

## The three properties, asserted on EVERY run

1. **The executor never holds caller funds.** After every run — success or revert —
   it holds exactly what was donated (zero if nothing was), never principal, profit,
   or intermediate-token dust.
2. **Every non-profitable cycle reverts entirely.** No leg is left exposed; the
   caller is left holding their principal, out only gas.
3. **No malicious whitelisted token or router can drain the executor.** The
   fee-on-transfer and reverting/low-liquidity adversaries make cycles revert — they
   never leak a balance out.

## Result (evidence, not a claim — reproduce it)

```
=== Triviu local validation: 2000 runs ===
successes           : 316
reverts (total)     : 1684
  unprofitable      : 1017
  other (adversary) : 667
avg gas / attempt   : 151244
net profit settled  : 322254784287970472170   (raw 18-dec units)
```

`forge test` — full repo: **53 tests passed, 0 failed.** The distribution is itself
honest: ~16% of runs cleared, ~84% reverted — the same shape §8 predicts. Both sides
are required for the suite to pass (`successes > 0` AND `reverts > 0`).

Reproduce:

```bash
cd contracts
forge test --match-contract ValidationSuite -vv     # the 2000-run loop + logs
forge test                                          # the whole suite, 53 tests
```

## What this local suite does NOT cover (honest boundary)

A local simulation reproduces the **contract's** behavior exactly; it cannot
reproduce a live adversarial **network**. These are out of scope here, by nature,
and are named so the limitation is documented and verifiable, not hidden:

- **Same-block MEV competition.** Real searchers bid in a ~250ms sealed auction
  (§8). No local run reproduces losing that auction to a faster bidder.
- **Reorgs.** A chain reorganization can unwind a settled block; local state does
  not reorg.
- **Live adversarial transaction ordering.** A real mempool lets an adversary place
  transactions around yours (the true sandwich). This suite simulates the *price
  effect* of a sandwich (a leg paying less), but not live ordering.

These are properties of the venue, not the code. They are exactly why the protocol
ships with a public failures-included dashboard from the first mainnet transaction
([dashboard/SPEC.md](../../dashboard/SPEC.md)) — the live network is observed in the
open, not simulated away.

## Note on forks vs mocks

The adversarial guarantees (properties 1–3) are proven against **mocks on purpose**:
you cannot inject a malicious or fee-on-transfer token into a real Polygon pool, so
the drain-resistance test *requires* controlled adversaries. Real-pool AMM-math
realism is the complementary fork layer — the `engine/config/params.example.toml`
addresses were already verified on-chain (2026-07-18). A fork run against those
pools validates the strategy against real liquidity; it does not, and cannot, add to
the drain-resistance proof above.
