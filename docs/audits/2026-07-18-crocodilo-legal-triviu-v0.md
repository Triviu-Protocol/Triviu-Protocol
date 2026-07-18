# Legal & regulatory qualification — Triviu v0

- **Auditor:** Crocodilo (Predators Protocol · regulatory/legal) — external provider
- **Date:** 2026-07-18
- **Scope commit:** `86cf80e`
- **Object:** the public repository, litepaper v0.1, brand manual, site copy and
  the v0 contracts — as a **product**, not as legal advice.

> **Nature of this document.** This is a compliance risk-surface map by the
> Predators Protocol legal auditor (external provider). It is **not** legal
> advice and does not create an attorney–client relationship — a legal opinion is
> bar-reserved and requires a licensed attorney. For a public launch targeting
> specific jurisdictions, a licensed attorney should confirm these conclusions.
> What follows is a risk-surface map with severities and actions, produced to the
> standard the Predators Protocol applies to any client.

## 1. What was examined

Litepaper v0.1 (EN/PT), README (EN/PT), SECURITY, brand manual v2 (voice §08,
publication checklist §9.4), site copy, contract behavior (non-custody,
no-token), and the stated business model (§8 sustainability, §13 growth).

## 2. Posture summary — the design is compliance-aware by construction

The project's founding choices remove most of the usual crypto legal surface
before it forms:

- **No token, no presale, no allocation, no yield** (litepaper §2.5, §5). This
  is the single most important fact: with no asset offered, sold or promised,
  the classic securities analysis (US Howey/SEC, EU MiCA "asset-referenced /
  utility token" regimes) has little to attach to.
- **No custody, no deposits, no pooled funds** (§2.1, §4.1). The Executor holds
  no third-party funds (proven on-chain — see the Medusa audit). This keeps the
  project away from money-transmission / VASP custody triggers (FATF, EU
  MiCA CASP custody, US state MTL).
- **No income promise, explicit negative-expectation disclosure** (§6, risk
  notice everywhere). Removes the "investment contract / financial promotion"
  surface that sinks most "profit bot" projects.
- **AGPL-3.0 open source, self-hosted execution, user's own key** (§4.4). The
  user runs their own software against their own wallet — Triviu is a
  publisher of tools, not an operator of a service.

This is a genuinely low-risk posture. The findings below are about **keeping it
that way**, not about repairing a broken one.

## 3. Findings

### L-01 · Securities exposure (SEC/MiCA and equivalents) — LEGAL_LOW (holds only while "no token" holds)

As specified, there is no security, no e-money token, no asset-referenced
token, no public offer. Exposure is low **and conditional**: it depends
entirely on the "no token / no promise" invariant never breaking.

- **Action:** treat "no token, no promise" as an immutable governance rule
  (the brand manual already bans "we solved the trilemma" and income language;
  the litepaper §14.3 lists immutable rules). Recommend adding "no token / no
  fundraising / no custody" to that immutable list explicitly. Any future change
  here is a new legal review, not a patch.

### L-02 · AI persona disclosure (EU AI Act art. 50, transparency) — LEGAL_MEDIUM

The educational persona is synthetic. The EU AI Act's transparency obligations
require that AI-generated content and interactions be disclosed. The brand
already mandates an "AI-GENERATED" badge and an "AI persona" bio line (manual
§7.3, §12.1) — this is the correct control and it is **already designed in**.

- **Action:** ensure the badge is present on **every** distribution surface
  (video, thumbnail, channel bio, script footer) before any EU-facing content
  ships. This is a publication-checklist enforcement item, not a redesign. The
  §9.4 checklist already contains it; keep it non-optional.

### L-03 · Data protection (GDPR / general privacy law) — LEGAL_LOW (dependent on site/analytics choices)

The site is described as zero-tracking, zero-framework (framework §10.1). If
that holds, personal-data processing is minimal and the privacy-law surface
(EU GDPR and equivalents in the launch jurisdictions) is small. Risk appears
only if analytics, forms, newsletters or comment systems are added later.

- **Action:** before adding any tracker/form, add a privacy notice and a lawful
  basis; keep the "zero tracking" default as the safe path. If a docs search or
  Telegram bot logs anything, document retention.

### L-04 · Facilitation / MEV & market-abuse framing — LEGAL_LOW-to-MEDIUM (jurisdiction-dependent)

Triviu teaches and tooling-enables on-chain arbitrage. Arbitrage itself is
lawful and, on public DEXs, is not market manipulation in the traditional-
securities sense. However, framing matters: material must not read as
soliciting a regulated investment service or promising returns (it does the
opposite today — §6). Sanctions exposure (OFAC/EU) is a **user-side** concern
(the user picks RPC, wallet, counterparty tokens); the software is neutral and
non-custodial.

- **Action:** keep the risk notice and "not a source of income / not advice"
  language on every execution-facing surface (already present, litepaper "Notice"
  + README). Add a one-line "you are responsible for the legality of your use in
  your jurisdiction, including sanctions compliance" to the execution docs —
  the AGPL disclaimer covers warranty, not user conduct.

### L-05 · Placeholder contacts / trademark — LEGAL_INFO (housekeeping before public)

`security@triviu.org` is a placeholder; the domain is unregistered; no
trademark search is on file. None of these are launch blockers for a private
repo, but all must close before going public.

- **Action:** register the domain and inbox before flipping the repo public
  (§00-05); run a trademark knock-out search in target jurisdictions (US/EU) —
  the mark "Triviu" plus the design mark. Low urgency, high embarrassment if
  skipped.

### L-06 · AGPL-3.0 network-copyleft implications — LEGAL_INFO

AGPL-3.0 is deliberate and appropriate (it forces forks that offer the software
as a network service to publish their source — aligned with the "forks that
remove the risk notice may not use the name" brand rule). Note the practical
consequence: **any** party running a modified Triviu as a service must release
source. That is a feature here, not a bug.

- **Action:** none required. Ensure the CC BY 4.0 (brand) vs AGPL-3.0 (code) vs
  CC BY-SA (docs) split stays consistent as files are added (it currently is).

## 4. Verdict

| Severity | Count | Blocks private repo? | Blocks public launch? |
|---|---|---|---|
| LEGAL_CRITICAL | 0 | — | — |
| LEGAL_HIGH | 0 | — | — |
| LEGAL_MEDIUM | 2 (L-02, L-04) | No | Enforce controls (both already designed) |
| LEGAL_LOW | 3 (L-01, L-03, L-04) | No | Keep invariants |
| LEGAL_INFO | 2 (L-05, L-06) | No | Housekeeping before public |

**Crocodilo qualification: NO LEGAL_CRITICAL / LEGAL_HIGH. Cleared to remain a
private repository and to proceed with fork/testnet work.** For a **public,
EU/US-facing launch**, the conditions are: (a) "no token / no custody / no
promise" elevated to an immutable governance rule (L-01); (b) AI-disclosure
enforced on every content surface (L-02); (c) domain + security inbox +
trademark knock-out closed (L-05); (d) a one-line user-jurisdiction/sanctions
responsibility note on execution docs (L-04).

Per Article 4, the Crocodilo holds no unilateral veto: none of the above is
`LEGAL_CRITICAL`, so no block is submitted to the Tubarão-branco. Should the
"no token" invariant ever break, that changes — a token turns L-01 into a
likely `LEGAL_HIGH` and triggers a full re-qualification before any launch.

---
*This qualification reflects commit `86cf80e` and the artifacts listed in §1.
It does not carry to modified scope. It complements, and does not replace, a
licensed attorney's sign-off for a specific launch jurisdiction — a step the
litepaper's own roadmap treats as part of going public.*
