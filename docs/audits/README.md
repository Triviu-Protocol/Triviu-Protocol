# Audits — Triviu

Internal audit reports produced by the Predators Protocol audit predators.
Published here as part of the project's radical-transparency principle: the
findings are visible, the severities are named, and the limitations of each
report are stated in the report itself.

> These are **internal** audits. They raise the floor; they do not replace the
> **external, third-party audit** that the litepaper (§10) makes a hard gate
> before any mainnet deployment. "Don't trust: verify" applies to audits too —
> each report lists exactly what was and was not examined.

## Reports at commit `86cf80e` (v0)

| Report | Auditor | Domain | Verdict |
|---|---|---|---|
| [On-chain security](2026-07-18-medusa-triviu-v0.md) | Medusa | Contract security | Approved for fork/testnet with 2 documented MEDIUM conditions; **not** a mainnet approval |
| [Legal & regulatory](2026-07-18-crocodilo-legal-triviu-v0.md) | Crocodilo | Compliance | No CRITICAL/HIGH; cleared private + fork/testnet; 4 conditions before public launch |
| [Judge (N2) verdict](2026-07-18-tubarao-branco-n2-verdict.md) | Tubarão-branco | Final judge | Ratifies both N1 audits; claims verified against source |

## How to read a severity

Both security and legal reports use a five-level scale (INFO → LOW → MEDIUM →
HIGH → CRITICAL). A MEDIUM that is documented, tested and scheduled for a
specific fix is not the same as a MEDIUM discovered in production — the reports
say which is which, and link the tradeoff record or the pinning test.

Re-audit is required at the commit that resolves the open MEDIUM findings
(F-01 donation griefing, F-02 arbitrary calldata), before the external audit.
