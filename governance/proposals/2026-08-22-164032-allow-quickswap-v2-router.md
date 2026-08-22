# Allow the QuickSwap V2 router as an execution target

- **Date:** 2026-08-22
- **Status:** proposed
- **Contract:** `ParameterRegistry` `0x1Adab61ef019d853BBcFaf65E929961b11897856` (Polygon PoS, 137)

## Parameter

| | Current | Proposed |
|---|---|---|
| `isAllowedTarget(0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff)` | `false` | `true` |

## The exact on-chain call

```
ParameterRegistry.setTarget(
    0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff,
    true,
    "<this file's URL on main>"
)
```

Executed by the owner, which is the Safe `0x73e344Be290c0D53Badbe528e45877296F6dAf6E`,
threshold two of three.

## What this address is

Identified on the chain rather than taken from a list:

- `factory()` returns `0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32`, the QuickSwap V2 factory
- `WETH()` returns `0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270`, WMATIC
- runtime is 21,943 bytes, the size of a `UniswapV2Router02`

It is the router the engine's own tests target, and the engine builds UniV2 legs only in v0
(`engine/src/steps.ts`), so this is the venue it can actually reach.

Only this address is proposed. A second one appears in the engine tree,
`0x6e7a5FAFcec6BB1e78bAE2A1F0B612012BF14827`, sharing the same factory; it was not identified with
enough confidence to allow, and an unidentified execution target is not a thing to whitelist.

## Rationale

`executeCycle` currently reverts for every asset. Four tokens are allowed — USDC, USDC.e, WMATIC,
WETH — and no target is, so the protocol is deployed and unusable. This is the call that closes
that gap, and it is the narrowest version of it: one router, the one the engine speaks to.

## Cost accepted, stated with the number

**The strategy this enables was measured unprofitable.**
[`engine/backtest/LAUDO-VARREDURAS-2026-08-11.md`](../../engine/backtest/LAUDO-VARREDURAS-2026-08-11.md):
four sweeps, 100 samples, **zero positive cycles**, best observed net result **−5.36 bps**
(−0.054% on $5,000). Of the 25 newest pairs, all 25 were priceable and none cleared the floor. That
laudo recommended moving focus to LP.

Allowing the target does not make anyone trade — it removes a blocker so the engine *can* run when
a passage appears. But nobody should read this proposal as evidence that a profitable passage
exists: the measurement on record says the opposite, and it is our own.

## Trilemma reading

| Axis | Verdict | Rationale and mitigation |
|---|---|---|
| Scalability | **GAINS** | The protocol stops reverting for want of a target; a deployed and unusable contract has no scale to speak of. |
| Security | **COSTS** | An execution target is an address the Executor calls with user funds in flight. Mitigation: the profit gate still requires `finalBalance >= startBalance + principal + minProfit` in the same transaction, so a bad venue cannot reach principal — it can only fail the gate and revert. Surface is one router, not a list. |
| Decentralization | **HOLDS** | The owner is a 2-of-3 Safe, so no single key sets this. There is still no timelock: two signatures change it with no delay. |

## What must follow

Record 0003 names the first `setTarget` call as the trigger for revising its custody note. This is
that call. The note must be revised once this executes, and it should say what the previous
revision failed to: that the protocol became transactable on this date.
