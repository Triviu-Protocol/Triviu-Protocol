# 5. The success fee

Triviu sustains itself with a **success fee**, and on the arbitrage cycle the
entire design of that fee follows from one sentence: *the protocol earns only
when the user does.*

That sentence is true of the cycle and **not** true of liquidity provision. The
section "Where this stops" below says exactly where it fails and by how much,
because a rule stated without its boundary is a projection.

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

## Where this stops: liquidity provision

The four rules above describe the **cycle**. Triviu has a second path — providing
liquidity through the LP vault — and on that path the fee works differently, in a
way that matters to the person paying it.

The LP fee is a share of the fees a position **collected**. It is never taken
from the principal, and a position that collected nothing pays nothing. So far it
mirrors the cycle. The difference is what "collected" leaves out:

```
what the owner keeps  =  collected fees  −  impermanent loss  −  recentering cost
what the protocol takes  =  a share of collected fees
```

The two subtractions happen after the fee is taken, and neither is visible to the
contract at the moment it takes it — impermanent loss is only realized on exit.
**A position can therefore pay the fee and still end below what went into it.**

In a measurement over 15 Polygon pools and 75 range/pool combinations (a $500 position, seven 24-hour windows, from block 91,846,456), 45 combinations ended positive for the owner and **30 ended negative — with the fee collected in all 75**.

We are not aware of a way to make the LP fee conditional on the owner's net
result inside a single transaction, for the reason just given. Until that changes,
three things stand in place of a promise: the fee base is collected fees and never
principal; the rate is clamped in the vault's own bytecode; and the console shows
impermanent loss next to the collected fees, so the number that decides whether
you gained is on the same screen as the number we are paid on.

## Transparency

- The rate lives in the Registry and changes only via public PR (forum → Git →
  block), always within the hardcoded ceiling.
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
