# Tradeoff Record No. 0003 — Protocol success fee (profit-only, atomic, capped)

- **Date:** July 2026
- **Status:** accepted
- **Originating PR:** fee-model wave

## Decision

The protocol charges a **success fee on profit only** — a configurable
percentage of a cycle's profit, routed to a treasury inside the same atomic
transaction, with a hardcoded 50% ceiling; reverts and break-even cycles pay
nothing.

## How it works

- The fee applies only after `finalBalance ≥ principal + minProfit` holds, so it
  is charged strictly on realized profit above gas — never on the principal,
  never on a revert, never on break-even.
- The rate lives in `ParameterRegistry.feeBps` (changed via PR, forum→Git→block).
  The Executor clamps it to `MAX_FEE_BPS = 5000` (50%) on every use, so a
  compromised or mistaken owner cannot over-charge — the ceiling is in bytecode.
- `treasury == address(0)` disables the fee entirely (whole result to caller).
- The fee moves to the treasury in the SAME transaction; the contract keeps no
  balance afterwards. `CycleExecuted` emits both net profit and fee, so the
  public dashboard shows it.

## Trilemma reading

| Axis | Verdict | Rationale and mitigation |
|---|---|---|
| Security | **HOLDS** | Fee is atomic and profit-only; the stateless invariant is re-proven with the fee active (invariant test, 128k calls, 0 violations). The hardcoded cap bounds owner power. |
| Scalability | **HOLDS** | One extra transfer on profitable cycles only; negligible gas, none on reverts. |
| Decentralization | **COSTS** | The fee rate and treasury are owner-controlled parameters. A user must trust that the rate — though capped at 50% and emitted on every cycle — is set fairly. Mitigation: hardcoded ceiling, on-chain PR provenance, event transparency, and the option to run the open-source engine against any executor. **Custody as deployed — see the note below; it is not what an earlier revision of this row projected.** |

### Custody as actually deployed (Polygon, measured 2026-08-22)

The revision before this one described the state at block 91859211 and asked to be
replaced before the first `setToken` call. That call happened and the note was not
replaced, so it went stale in five places at once — every one of them understating
the custody that actually exists. This replaces it with values read from the chain.

| | Previous note said | On chain now |
|---|---|---|
| `ParameterRegistry.owner` | deployer EOA, handoff pending | **the Safe** — `acceptOwner` completed, `pendingOwner` is zero |
| Safe shape | 1-of-1, sole owner the deployer | **2-of-3** across three distinct addresses |
| `treasury` | `address(0)` | **the Safe** |
| `feeBps` | `0` | **3000** |
| whitelist | everything `false`, nothing transactable | **four tokens allowed** |

**The handoff completed and the Safe now separates keys.** That was the worry the
previous note raised and could not resolve; it is resolved. Owner is
`0x73e344Be290c0D53Badbe528e45877296F6dAf6E`, threshold two of three.

**There is still no timelock.** Two of three signatures change a parameter with no
delay and no window for anyone to react.

**The fee is 3000 bps, and that is 30% of *profit*, not of volume.** It is
deliberate and stands. The bytecode ceiling remains `MAX_FEE_BPS = 5000`, so the
rate sits at 60% of what the contract would permit. Stating the base matters:
compared against a fee on traded amount it would read an order of magnitude
larger than it is.

**Not transactable, and it has never traded.** Four tokens are allowed — USDC,
USDC.e, WMATIC, WETH — but **no target is**: ten routers were checked, including
Uniswap V3 and Router02 and UniversalRouter, QuickSwap, SushiSwap, 1inch, 0x,
Paraswap, OpenOcean and KyberSwap, and all ten read `false`. `executeCycle`
therefore reverts for want of an allowed target. The treasury holds zero of all
four tokens, which corroborates it independently: no fee has ever landed, so no
profitable cycle has ever closed.

**What that owner can and cannot do.** The Executor's profit gate requires
`finalBalance >= startBalance + principal + minProfit` in the same transaction, so
a compromised owner **cannot reach a user's principal**. The ceiling is
`MAX_FEE_BPS = 5000` (50% of *profit*) plus spread capture bounded by the
`minProfit` the user signs. The Executor is bound to this Registry by an
`immutable` field set in its constructor and cannot be repointed.

**The trigger for the next revision of this note is the first `setTarget` call.**
That is what makes the protocol usable — `setToken` alone did not, as the state
above shows — and from that moment a reader is acting on this page.

## Alternatives considered

Entry/setup fee (rejected: charges users who never profit — breaks "we only earn
if you earn"); off-chain fee collection (rejected: would require custody and a
trust point the non-custody principle forbids); no cap (rejected: leaves users
exposed to a compromised owner).

## Consequences

The whitepaper (§5 success fee) becomes precise on both sides: "the expected result for the
individual user tends toward zero or negative after gas AND fee; the protocol
sustains itself through the success fee on the cycles that do profit." §8 adds
the success fee to the sustainability list; none of its bans (paid signals,
third-party capital, deposit-dependent products) is touched. Non-custody, no
token and no promise all survive.
