# Tradeoff Record No. 0008 — no public testnet: local simulation → mainnet

- **Date:** July 2026
- **Status:** accepted (founder decision, risk-appetite)
- **Originating PR:** pre-mainnet hardening

## Decision

Triviu goes from **local simulation straight to mainnet**, with **no public
testnet phase** (no Amoy). The external audit gate (Blood Law) is **not** waived —
it stands, per [SECURITY.md](../SECURITY.md) and Tradeoff Record 0001. Only the
public-testnet step is dropped.

## The cost, stated plainly (mandatory line)

**This costs the safety net of a public adversarial environment** — a testnet where
strangers, bots and time probe the contracts before real money does. **It gains
launch speed.** The cost is **mitigated**, not erased, by two things and only these:

1. the **2000+ run local validation suite** (`contracts/test/ValidationSuite.t.sol`,
   report [2026-07-20-local-validation-suite.md](../docs/audits/2026-07-20-local-validation-suite.md)),
   which proves — on every run — that the executor never holds caller funds, that
   every unprofitable cycle reverts entirely, and that no malicious whitelisted
   token or router can drain it; and
2. the **public failures-included dashboard**, live from the first mainnet
   transaction ([dashboard/SPEC.md](../dashboard/SPEC.md)), so the live network is
   observed in the open from block one.

## What the mitigation does NOT cover

A testnet is not an audit, and neither is local simulation. The local suite cannot
reproduce a live adversarial network — same-block MEV competition, reorgs, and live
transaction ordering are out of its reach (spelled out in the report). Dropping the
testnet removes the one place those would have been exercised cheaply before
mainnet. That residual risk is the founder's to accept, and this record is where it
is accepted, on the record.

## Trilemma reading

| Axis | Verdict | Rationale |
|---|---|---|
| Scalability | **GAINS** | Faster path to a real, observable launch. |
| Security | **COSTS** | No public adversarial dry-run. Mitigated by the 2000+ suite and the live failures dashboard — mitigated, not neutralized. |
| Decentralization | **HOLDS** | Unchanged. |

## Alternatives considered

- **Keep a public testnet phase.** Rejected by the founder for speed; the audit gate
  is kept regardless, so the Blood-Law promise in the public docs stays truthful.
- **Rely on local simulation with no extra rigor.** Rejected: a single normal test
  pass is not a substitute for a testnet. Hence the *disproportionate* 2000+
  adversarial suite as the explicit mitigation this record points to.

## Consequences

- The mainnet deploy package assumes fork-and-audit → mainnet, no Amoy step
  (coherent with the Web2-first sequence).
- The validation suite is a **release gate**: it must be green (`forge test`) at the
  closing commit, alongside the external audit and the Tubarão-branco SEVERA.
- The public dashboard must be live at or before the first deploy transaction — not
  after (dashboard/SPEC.md).
