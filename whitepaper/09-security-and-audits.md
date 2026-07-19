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

## Findings (recorded, tested, resolved)

Two findings were raised during the internal review; both are now resolved in
v0.2 — recorded, fixed and pinned by tests, not swept aside:

- **F-01 · donation griefing (RESOLVED).** A dust transfer to the executor used
  to trip the strict stateless check for that token. v0.2 moves to balance-delta
  accounting, so a donation is preserved in place and never blocks a cycle;
  removing the strict check also required an explicit reentrancy guard, which
  replaced the implicit one. Tradeoff Record `decisions/0002`; audit
  `docs/audits/2026-07-18-tubarao-triviu-v0.2-f01.md`.
- **F-02 · arbitrary calldata to whitelisted targets (RESOLVED).** v0.2 replaces
  raw step calldata with typed per-DEX swap adapters (UniswapV2 / UniswapV3): the
  executor builds the swap itself, so a whitelisted router can only ever be asked
  to swap, never to make an arbitrary call.

## The path to mainnet

The official path is **local fork → audit → mainnet** — there is no separate
public-testnet phase. With F-01 and F-02 resolved, the Predators Protocol D2
audit has cleared a first-pass review at the closing commit (public in
`/docs/audits`). For mainnet holding third-party value, that first-pass gate is
completed, before deployment, by an independent external audit firm and a public
bug bounty (`SECURITY.md`), plus a timelocked-multisig owner enforced by the
deploy script. Until all of that, the contracts are pre-mainnet and not deployed.

## Responsible disclosure

Found a vulnerability? Do not open a public issue. Follow
[`SECURITY.md`](../SECURITY.md). We coordinate the fix and public disclosure with
credit to the researcher.
