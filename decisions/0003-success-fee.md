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
| Decentralization | **COSTS** | The fee rate and treasury are owner-controlled parameters (deployer now, timelocked multisig before mainnet). A user must trust that the rate — though capped at 50% and emitted on every cycle — is set fairly. Mitigation: hardcoded ceiling, on-chain PR provenance, event transparency, and the option to run the open-source engine against any executor. |

## Alternatives considered

Entry/setup fee (rejected: charges users who never profit — breaks "we only earn
if you earn"); off-chain fee collection (rejected: would require custody and a
trust point the non-custody principle forbids); no cap (rejected: leaves users
exposed to a compromised owner).

## Consequences

The litepaper §6 becomes precise on both sides: "the expected result for the
individual user tends toward zero or negative after gas AND fee; the protocol
sustains itself through the success fee on the cycles that do profit." §8 adds
the success fee to the sustainability list; none of its bans (paid signals,
third-party capital, deposit-dependent products) is touched. Non-custody, no
token and no promise all survive.
