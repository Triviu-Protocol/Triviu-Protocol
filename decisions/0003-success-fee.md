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

### Custody as actually deployed (Polygon, 2026-08-11)

An earlier revision of the row above said the owner would be a *"timelocked
multisig before mainnet"*. Mainnet happened first. This note states what is on
the chain, measured at block 91859211, and replaces that projection.

- `ParameterRegistry` owner is still the **deployer EOA**
  `0xb5Fb0CDaab5784cBE05CcB9D843DaFe4663883C5`. A two-step handoff to Safe
  `0x73e344Be290c0D53Badbe528e45877296F6dAf6E` is *pending* — `transferOwner`
  was called, `acceptOwner` has not been.
- **That Safe is 1-of-1, and its only owner is the same deployer EOA.** Completing
  the handoff will therefore **not** separate keys today. What it does buy is a
  stable owner address: raising the threshold or adding a timelock later needs no
  further ownership transfer.
- **There is no timelock.**

**What that owner can and cannot do.** The Executor's profit gate requires
`finalBalance >= startBalance + principal + minProfit` in the same transaction, so
a compromised owner **cannot reach a user's principal**. The ceiling is
`MAX_FEE_BPS = 5000` (50% of *profit*) plus spread capture bounded by the
`minProfit` the user signs. The Executor is bound to this Registry by an
`immutable` field set in its constructor and cannot be repointed.

**Nothing is transactable at the time of writing.** Every token and router in the
whitelist reads `false`, `treasury` is `address(0)` and `feeBps` is `0`, so
`executeCycle` reverts for every asset and no user funds are at risk.

**This note must be replaced with the real custody arrangement before the first
`setToken` call.** That call is what makes the protocol usable, and from that
moment a reader is acting on this page.

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
