# 5. The success fee

Triviu sustains itself with a **success fee**, and the entire design of that fee
follows from one sentence: *the protocol earns only when the user does.*

## What it is

A percentage of a cycle's **profit only** — never the principal — taken inside
the same atomic transaction and routed to a public treasury before the remainder
returns to the caller. It is a DeFi protocol fee, in the same spirit as an AMM
swap fee or the network's own gas: if you use the technology and it produces a
gain, a fee applies on that gain; if you do not use it, there is nothing to pay.

## The four rules, enforced in code

1. **Success only.** The fee applies only after `finalBalance ≥ principal +
   minProfit` holds — i.e. only on real profit above gas. A reverted cycle and a
   break-even cycle pay **nothing**; the fee code is unreachable on those paths.
2. **On profit, never principal.** The fee base is `finalBalance − principal`.
   The user's capital is never touched by the fee.
3. **Atomic and non-custodial.** The fee moves to the treasury in the same
   transaction, before the remainder returns to the caller. The contract holds no
   balance afterwards — the stateless invariant is re-proven with the fee active.
4. **Capped in bytecode.** The rate is a Registry parameter, but the Executor
   clamps it to a hardcoded ceiling of **50% of profit** (`MAX_FEE_BPS = 5000`).
   No configuration — mistaken or malicious — can take more than half of a
   cycle's profit. The user can rely on the cap because it is in the bytecode,
   not just in this document.

```solidity
uint16 public constant MAX_FEE_BPS = 5000; // 50% of profit, hard ceiling

uint256 profit = finalBalance - principal;
uint16 bps = registry.feeBps();
if (bps > MAX_FEE_BPS) bps = MAX_FEE_BPS;
uint256 fee = (profit * bps) / 10_000;
```

## Transparency

- The rate lives in the Registry and changes only via public PR (forum → Git →
  block). The founder's ADM panel sets it within the hardcoded ceiling.
- Every cycle emits `CycleExecuted(caller, asset, profit, fee)` — the public
  dashboard shows exactly what the protocol took, per cycle and in aggregate.
- If the treasury is unset (or, by a safety guard, equal to the executor
  itself), the whole result returns to the caller and no fee is taken.

## Why this is not a promise

A success fee cannot coexist with an income promise: it pays the protocol *only*
where the user already won. The honest statement, true on both sides, is in
[Section 8](08-risks.md): the expected result for the individual user tends
toward zero or negative after gas and fee, and the protocol sustains itself on
the minority of cycles that do profit.
