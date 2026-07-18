# 9. Security and audits

Triviu's security posture is stated the same way as everything else: openly, with
the limits next to the strengths.

## Who audits Triviu

The contracts are audited by **Predators Protocol** — an independent,
multi-agent audit provider whose smart-contract product is Náutilo
(Audit-as-a-Service). Triviu is a client. The engagement follows Predators
Protocol's process:

- **Medusa** performs the on-chain detection (reentrancy, access control,
  arithmetic, MEV surface).
- **Náutilo** issues and seals the client-facing report, by severity, under a
  frontier disclaimer.
- **Crocodilo** maps the regulatory risk surface (not a legal opinion — that is
  bar-reserved).
- **Tubarão-branco** is the final judge (N2): it verifies each finding against
  the source before ratifying.

Every report is public in [`docs/audits/`](../docs/audits/), names its auditor,
and lists exactly what was and was not examined.

## What an audit does and does not mean

No audit — Predators Protocol's or anyone else's — guarantees the absence of
vulnerabilities. Final assurance rests with whoever signs the deploy. The reports
never conclude "the contract is secure"; they conclude, at most, "no findings in
the categories examined, with the tools actually run." Tools not run in a pass
are declared, not hidden. This is the frontier and anti-claim discipline the
audit provider imposes on itself.

## What has been verified so far

- **Stateless / non-custody**, proven by an invariant test: 128,000 calls, the
  executor's balance zero after every one — with the success fee active.
- **The core condition** (`finalBalance ≥ principal + minProfit`) reverts the
  whole cycle; no leg is left exposed.
- **The fee** is profit-only, atomic, and capped at 50% in bytecode; reverts and
  break-even pay nothing; a hook token reentering the fee transfer is blocked by
  the stateless check.
- **The Gas-Tank** withdraw is reentrancy-safe and moves no account's funds but
  its own owner's.
- **Static analysis** (Slither, fail-on-HIGH) runs in CI.

## Known limitations (documented, not hidden)

Two findings are open and gate mainnet — they are recorded, tested and scheduled,
not swept aside:

- **F-01 · donation griefing.** A dust transfer to the executor trips the strict
  stateless check for that token (no sweep in v0). Fix: balance-delta accounting
  before mainnet. Tradeoff Record `decisions/0002`.
- **F-02 · arbitrary calldata to whitelisted targets.** Safety rests on
  conservative whitelist curation; typed per-DEX adapters replace it before
  mainnet.

## The path to mainnet

The official path is **local fork → audit → mainnet** — there is no separate
public-testnet phase. Mainnet is gated on: F-01 and F-02 resolved, and the
Predators Protocol audit clearing a final review at the closing commit. Until
then, the contracts are pre-mainnet and not deployed.

## Responsible disclosure

Found a vulnerability? Do not open a public issue. Follow
[`SECURITY.md`](../SECURITY.md). We coordinate the fix and public disclosure with
credit to the researcher.
