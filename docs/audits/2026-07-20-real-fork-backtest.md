# Real backtest — is a triangular cycle profitable on real Polygon pools?

**Author:** Gavião (engine) · **Reviewed by:** Tubarão-branco (Lei #11).
**Date:** 2026-07-20. **Tool:** [`engine/backtest/triangular-backtest.mjs`](../../engine/backtest/triangular-backtest.mjs).

This exists to answer one question the safety tests do **not** answer: across real
liquidity, at real historical blocks, would our operations have been profitable?
The validation suite proves the contract is safe; the "profit" in it is synthetic
(dialed on mock routers). This measures reality.

## What it measured

- **Real pools** (QuickSwap V2 on Polygon, verified on-chain 2026-07-20):
  WMATIC/USDC.e `0x6e7a…4827` · USDC.e/WETH `0x853e…670d` · WETH/WMATIC `0xadbf…8e5b`.
- **Real history**: reserves read at **150 blocks** spanning ~17 days, over an
  archive RPC (`polygon.drpc.org`). 150/150 blocks served.
- **The engine's own math** (`monitor/pools.ts`: constant product, 0.997 per hop),
  the profit-maximizing size found numerically, both cycle directions, minus a gas
  estimate (250k units × 50 gwei) and the success fee.

## The result (measured, not claimed)

```
blocks read (archive served)                : 150 / 150
blocks with a NET edge > 0 after gas        : 0   (0.0%)
blocks with a NET edge > 0 after gas + fee  : 0   (0.0%)
```

**Zero.** Across ~17 days of real Polygon state, the triangular cycle never cleared
a profit at end-of-block. A one-WMATIC cycle returns **0.9924** WMATIC forward and
**0.9897** reverse — it *loses* 0.8–1.0% every time. That number is the honest one:
it is the ~0.9% three-hop fee wall (whitepaper §3), which no residual mispricing on
these pools came close to clearing.

### This zero is verified, not a bug

If the pool/decimal mapping were wrong, a cycle would return an absurd number, not
0.99. It returns ~0.99 — the fee wall exactly — and the reserves read back at
sensible sizes (millions of WMATIC, hundreds of WETH). The math matches the engine
and the whitepaper. The zero is real.

## What it means — §8, measured from two angles

1. **End-of-block (what this backtest sees): nothing.** By the time a block closes,
   any triangular mispricing has already been arbitraged away. An ordinary user
   polling reserves sees an efficient market — 0/150 here.
2. **Intra-block (what this backtest cannot see): captured by professionals.** The
   transient edges that *do* appear inside a block are taken in that same block by
   the ~15 professional searchers in the ~250ms auction §8 documents — not by an
   individual with ordinary hardware.

Both angles point to the same answer, and it is the answer the whole project has
stated from the start: **for an individual, the expected result tends to zero or
negative.** Our own data, on real pools, confirms it. Possibility is not probability.

## Honest boundary (limits of this measurement)

- **End-of-block snapshots.** Archive gives block-close state; it cannot replay
  intra-block ordering. This measures residual edge, not the live race.
- **One triangle.** WMATIC/USDC.e/WETH on QuickSwap V2. Other triangles exist; the
  fee wall and the searcher dynamic apply to all of them (§8).
- **Gas is an assumption** (250k × 50 gwei), stated in the output; even at zero gas
  the gross edge was ≤ 0 on every block, so gas is not why the answer is zero.
- **This is a measurement, never a forecast or a promise.** It says what the market
  did, not what it will do.

## Reproduce it

```bash
cd engine/backtest
node triangular-backtest.mjs                 # 150 blocks, drpc archive
# or widen it:
BACKTEST_SAMPLES=300 BACKTEST_STEP=2000 node triangular-backtest.mjs
```

The raw per-block rows are in [`results-latest.json`](../../engine/backtest/results-latest.json).
Don't trust this report — run it.

## The bottom line, plainly

Asked "do our operations make a profit?", the honest, measured answer is **no** —
and Triviu is the rare protocol that runs the test that proves it against itself,
and publishes the result. That honesty is the product.
