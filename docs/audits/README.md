# Audits — Triviu

Audit reports by **Predators Protocol** — an external, independent audit
provider whose smart-contract product is Náutilo (Audit-as-a-Service, D2).
Triviu is a client. Published here as part of the project's radical-transparency
principle: the findings are visible, the severities are named, and the limits of
each report are stated in the report itself.

> These are **external** audits by the Predators Protocol audit process. Per
> Náutilo Art. 5 (frontier) and Art. 6 (anti-claim), no audit guarantees the
> absence of vulnerabilities and final assurance rests with whoever signs the
> deploy. "Don't trust: verify" applies to audits too — each report lists exactly
> what was and was not examined, and names its auditor.

## Reports at commit `86cf80e` (v0)

The audit **product** (Audit-as-a-Service, D2) is the Náutilo's sealed report:
the Medusa **detects** on-chain, and the Náutilo — the product-facing auditor —
**issues and seals** the client-readable report by severity, under a hardcoded
frontier disclaimer. Report language follows the client's canonical language:
Triviu is DeFi and English-canonical, so the report is in English. The Crocodilo
document is an internal legal risk-surface map, **not** a legal opinion (that is
bar-reserved). The Tubarão-branco is the final judge.

| Report | Predator | What it is |
|---|---|---|
| [**D2 audit report (product)**](2026-07-18-nautilo-audit-report-D2-triviu-v0.md) | **Náutilo** | The sealed audit product: findings by severity + frontier disclaimer. **The portfolio deliverable.** |
| [On-chain detection](2026-07-18-medusa-triviu-v0.md) | Medusa | Technical vulnerability detection (input to the report) |
| [On-chain re-audit — fee + GasTank](2026-07-18-medusa-triviu-fee-reaudit.md) | Medusa | Detection over the fee/GasTank delta (0 CRITICAL/HIGH; 1 LOW fixed) |
| [Legal risk-surface map](2026-07-18-crocodilo-legal-triviu-v0.md) | Crocodilo | Compliance risk-surface map — **not** a legal opinion; does not replace an attorney |
| [Judge (N2) verdict](2026-07-18-tubarao-branco-n2-verdict.md) | Tubarão-branco | Ratifies the N1 audits; every claim verified against source |

**Verdict:** no CRITICAL/HIGH in any domain. Two documented MEDIUM contract
findings (F-01 donation griefing, F-02 arbitrary calldata) gate mainnet.
Approved for the pre-mainnet scope; mainnet vetoed by construction until those
close and the Predators Protocol audit clears the final review.

## How to read a severity

Both security and legal reports use a five-level scale (INFO → LOW → MEDIUM →
HIGH → CRITICAL). A MEDIUM that is documented, tested and scheduled for a
specific fix is not the same as a MEDIUM discovered in production — the reports
say which is which, and link the tradeoff record or the pinning test.

Re-audit is required at the commit that resolves the open MEDIUM findings
(F-01 donation griefing, F-02 arbitrary calldata), before the external audit.
