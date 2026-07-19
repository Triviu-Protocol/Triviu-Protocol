# Tradeoff Record No. 0002 — Strict stateless check vs. donation griefing

- **Date:** July 2026
- **Status:** RESOLVED in v0.2 · balance-delta accounting implemented (F-01 closed)
- **Originating PR:** contract test-suite wave (found while writing the §08.3 suite)

## Decision

v0 kept the strict stateless check (`startBalance != 0 → revert NotStateless`),
accepting a known griefing vector. **v0.2 replaced it with balance-delta
accounting** — profit is measured as `finalBalance − startBalance` — closing the
vector before any mainnet deployment. Removing the strict check also removed the
implicit reentrancy guard it provided, so v0.2 adds an explicit `nonReentrant`
storage-based guard in its place.

## The finding, in plain terms

Anyone can transfer 1 wei of a whitelisted token directly to the executor.
From that moment, every `executeCycle` for that token reverts with
`NotStateless` — permanently, because v0 has no sweep function. Cost of the
attack: dust plus gas. Effect: denial of service per token. **In v0.2 this is
fixed:** a donation is preserved in place and never blocks a cycle, pinned by
`test_Donation_DoesNotBlockCycle`, `test_Donation_PreservedNotStolen`, and the
`invariant_ExecutorHoldsOnlyDonations` invariant (128k calls, 0 violations).

## Trilemma reading

| Axis | Verdict | Rationale and mitigation |
|---|---|---|
| Security | **GAINS** | The strict check makes the non-custody claim trivially auditable: the contract balance is zero before and after, with no accounting to trust. |
| Scalability | **HOLDS** | One extra `balanceOf` call; negligible gas either way. |
| Decentralization | **COSTS** | Availability depends on nobody griefing the contract — an external actor can halt a token's cycles at dust cost. Mitigation: fork/testnet scope for v0, balance-delta accounting in v0.2, and redeployment is cheap for a stateless contract. |

## Alternatives considered

Balance-delta accounting now (rejected for v0: changes the founding artifact
mid-wave and deserves its own audited PR); a sweep function (rejected: an
owner-controlled escape hatch weakens the non-custody story and adds an
attack surface).

## Consequences

Educational surface: this record is teaching material about why "stateless"
is not free. v0.2's `executeCycle` computes profit as
`finalBalance − startBalance` and returns exactly that delta, making donations
irrelevant — the executor ends every cycle holding precisely its starting
balance (a donation, if any; otherwise zero). The v0 tradeoff is preserved above
as the record of why the strict check shipped first — failures included.
