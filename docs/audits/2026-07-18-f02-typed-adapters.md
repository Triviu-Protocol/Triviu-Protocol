# F-02 audit — TriviuExecutor v0.2 · typed swap adapters + SafeERC20

- **Date:** 2026-07-18
- **N1 on-chain auditor:** Medusa (Web3 T3 · Art. 5 imutável)
- **N2 judge:** Tubarão-branco (Hunter T5 · Lei do Sangue · Art. 13)
- **Scope:** the F-02 change — `Step{address target; bytes data}` (arbitrary
  calldata) replaced by a typed `Leg` (UniV2 `swapExactTokensForTokens` /
  UniV3 `exactInputSingle`); per-leg approve/reset; balance-delta chaining;
  cycle-integrity checks; SafeERC20-style transfer/approve wrappers. Also the
  engine (`abi.ts`, `build/steps.ts`, consumers) moved to typed legs.
- **Verdict:** **APROVA_PERFEITO** (Lei #14 BINARY).
- **Not this audit:** the full external audit (§09 Cyber Squad) on the complete
  v0.2 is the separate mainnet GATE.

## What F-02 changes and why

v0/v0.1 forwarded arbitrary `bytes` to whitelisted targets — safety rested
entirely on whitelist curation. v0.2 removes arbitrary calldata: each leg is a
typed swap the Executor builds itself, so a whitelisted router can only ever be
asked to swap, never to make an arbitrary call. Legs chain by MEASURED output
(`balanceOf` delta), the cycle must open and close on `asset`, and each hop's
`tokenIn` must equal the prior hop's `tokenOut`.

## N1 · Medusa on-chain review

| Vector | Finding |
|---|---|
| Reentrancy (cross-fn / cross-contract / read-only) | **Closed.** `nonReentrant` on the only state-changing fn; a whitelisted router/token reentering reverts. Per-leg allowance is exact and reset to 0, so no over-pull. |
| Oracle manipulation | **N/A.** No oracle on-chain; profit is the realized balance delta — immune to price/TWAP manipulation. |
| Unchecked external call | **Safe by design.** Swap return values are intentionally ignored — the `balanceOf` delta is the source of truth, robust against a lying router. transfer/approve go through `_callOptionalReturn` (SafeERC20 pattern). |
| MEV (sandwich / front-run / JIT) | **Caller-risk, gated.** Atomic; the `minProfit` check reverts an unprofitable outcome (only gas lost). Per-leg `amountOutMin` available for tighter floors. Documented, whitepaper §8. |
| Access control / delegatecall / storage collision | **None.** Executor has no owner, no delegatecall, no proxy; the only mutable slot is the reentrancy guard. |
| Cycle integrity | **Enforced.** open==asset, close==asset, `tokenIn[i]==tokenOut[i-1]` — no value stranded. |
| SafeERC20 (non-bool tokens) | **Handled.** `_callOptionalReturn` tolerates USDT-family (no return), verifies bool when present, rejects a non-contract token. |

**Auto-reject categories (Art. 5):** zero triggered.
**INFO (not a defect):** a self-swap leg (`tokenIn == tokenOut`) whose output is
below its input underflow-reverts instead of a clean error. Degenerate,
caller-crafted, funds safe on the atomic revert; real cycles use distinct tokens
per hop, where `tokenOut` balance only increases.
**Medusa does not detect a vulnerable finding.**

## N2 · Tubarão-branco judge (audits the delivery AND N1)

- **Aferição de N1:** stress-tested Medusa's INFO — the underflow is reachable
  only for `tokenIn == tokenOut` legs; for distinct-token hops the `tokenOut`
  balance strictly increases (or stays equal on a 0-output, yielding a clean
  `UnprofitableCycle`). Scope is exact, funds are safe. N1 left no gota. Ratified.
- **N2 direct:** independent adversarial pass concurs on every vector. F-01's
  properties (balance-delta, reentrancy guard) hold under F-02. **SafeERC20
  closes the standing LOW flagged in the F-01 audit** (non-bool tokens) — that
  promise is kept; zero standing ressalva remains.

## Empirical evidence (Lei #8)

- `forge 1.5.1` local: **44 tests + 1 invariant passed, 0 failed**. New coverage:
  `NoLegs`, `CycleNotClosed`, `BrokenChain`, `LegTokenOutNotAllowed`, the UniV3
  adapter, a cross-adapter (V2→V3→V2) cycle, and `NoIntermediateDustHeld`.
- Invariant `invariant_ExecutorHoldsOnlyDonations`: 256×500 = 128 000 calls,
  0 reverts, across 3-leg cycles + donations; executor held exactly `totalDonated`
  of the asset and 0 of every intermediate token.
- Engine: `tsc --noEmit` 0 errors; 32 vitest green (typed-leg builder + consumers).

## Verdict

**APROVA_PERFEITO.** Zero HIGH/CRITICAL, zero standing ressalva. Both
internal-review findings (F-01, F-02) are now resolved. Nothing here authorizes a
mainnet deploy — that remains gated on the §09 external audit clearing the
closing commit.

> *Não passa nem gota de sangue.*
