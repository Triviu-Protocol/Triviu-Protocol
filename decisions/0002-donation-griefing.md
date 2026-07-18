# Tradeoff Record No. 0002 — Strict stateless check vs. donation griefing

- **Date:** July 2026
- **Status:** accepted for v0 · balance-delta accounting scheduled for v0.2
- **Originating PR:** contract test-suite wave (found while writing the §08.3 suite)

## Decision

v0 keeps the strict stateless check (`startBalance != 0 → revert NotStateless`),
accepting a known griefing vector; v0.2 replaces it with balance-delta
accounting before any mainnet deployment.

## The finding, in plain terms

Anyone can transfer 1 wei of a whitelisted token directly to the executor.
From that moment, every `executeCycle` for that token reverts with
`NotStateless` — permanently, because v0 has no sweep function. Cost of the
attack: dust plus gas. Effect: denial of service per token. The behavior is
pinned by `test_KnownLimitation_DonationTripsStatelessCheck`.

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
is not free. v0.2's `executeCycle` will compute profit as
`finalBalance − startBalance` and return exactly that delta, making donations
irrelevant. Until then, the limitation ships documented in the contract
header, the test suite and this record — failures included.

Português: [0002-donation-griefing.pt-BR.md](0002-donation-griefing.pt-BR.md)
