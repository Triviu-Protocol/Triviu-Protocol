# Judge verdict (N2) — Triviu v0 audit closure

- **Judge:** Tubarão-branco (Predators Protocol · Lei do Sangue · final judge)
- **Date:** 2026-07-18
- **Scope commit:** `86cf80e`
- **Mandate:** CANON-TUBARAO-SEVERA (Art. 13) — the judge audits two things:
  (1) the delivery, and (2) the sector auditors' own audits (N1).

## 1. N1 audits under review

- Náutilo — sealed D2 audit product ([report](2026-07-18-nautilo-audit-report-D2-triviu-v0.md))
- Medusa — on-chain detection ([report](2026-07-18-medusa-triviu-v0.md))
- Crocodilo — legal risk-surface map, not a legal opinion ([report](2026-07-18-crocodilo-legal-triviu-v0.md))

Canon note: the audit **product** is the Náutilo's report (it orchestrates the
Medusa's detection and seals it under the frontier disclaimer). The Medusa
report is the technical input; the Crocodilo map is internal and explicitly not
a bar-reserved legal opinion.

## 2. Verification of the N1 claims against source (not taken on faith)

Every load-bearing factual claim in the two reports was checked against the
code at `86cf80e`:

| Claim | Where | Verified |
|---|---|---|
| Donation griefing is pinned by a test | `test_KnownLimitation_DonationTripsStatelessCheck` | present, line 156 of the test file |
| `transfer`/`transferFrom` returns are checked | `require(IERC20(...)...)` | present in `TriviuExecutor.sol` |
| No `delegatecall`/`selfdestruct`/`fallback`/`receive` | `src/*.sol` | grep returns zero |
| 19 contract tests green, invariant holds | `forge test` | 19/19 pass; invariant 256×500 calls, 0 violations |
| F-04 lint warnings are false-positive / guarded | `forge build` + Deploy guard | confirmed: `require` wrapping + `require(<= type(uint16).max)` |

The Medusa report does **not** claim tools it did not run (Slither/Mythril/
Echidna are declared as not-run) — this satisfies the anti-"clean bill" rule.
The Crocodilo report correctly declines to assert a unilateral veto (Art. 4)
because nothing reaches LEGAL_CRITICAL, and correctly declares itself **not** a
bar-reserved legal opinion.

## 3. Judgment of the auditors' rigor (N2 duty)

- **Medusa (N1):** rigor accepted. The approval is correctly **bounded** to
  the pre-mainnet scope and explicitly conditioned on F-01/F-02 plus the
  Predators Protocol final review before mainnet — consistent with Article 5
  (imutável: never approve a known unmitigated vulnerability). No gota let through.
- **Crocodilo (N1):** rigor accepted. Severities are proportionate; the "no
  token / no promise" invariant is correctly identified as the load-bearing
  condition, and its breach is pre-classified as a re-qualification trigger. The
  map correctly declares itself **not** a bar-reserved legal opinion.
- **Náutilo (product):** rigor accepted. The report seals the Medusa's detection
  by severity, carries the hardcoded frontier disclaimer, is issued in the
  client's canonical language (English — Triviu is DeFi, EN-canonical), and —
  per Article 6 — concludes "no findings in the categories examined," never "the
  contract is secure." No CRITICAL/HIGH softened; the two MEDIUMs reach the
  report intact.

## 4. Blood Law surface (my own direct duty, Art. 13.3)

Checked independently of the N1 reports: no secrets in the tree; the private key
is read from the environment and never logged; the submission gate defaults to
refusing (`dry_run`), requires a passed simulation, and requires an explicit
mainnet acknowledgement env var. Repository confirmed private. No sensitive
surface breached.

## 4b. Fee-model wave — additional N2 verification (2026-07-18)

The success fee, the GasTank and the re-audits were checked against source at
this commit:

| Claim | Where | Verified |
|---|---|---|
| Fee capped at 50% in bytecode | `MAX_FEE_BPS = 5000`; `if (bps > MAX_FEE_BPS) bps = MAX_FEE_BPS` | `TriviuExecutor.sol` L63/L147 |
| Fee on profit only, never principal | `fee = (profit * bps) / 10_000`, `profit = finalBalance - principal` | L148/L139 |
| Self-DoS guard (treasury != executor) | `if (treasury != address(0) && treasury != address(this))` | L145 |
| GasTank CEI (state before external call) | balance debited then `call{value}` | `GasTank.sol` L47→L48 |
| Reentrancy on fee transfer blocked | hook-token test | `test_ReentrancyDuringFeeTransferIsBlocked` |
| Whole suite green with fee active | `forge test` | 39/39 pass; invariant 128k calls, 0 violations |

Medusa's fee re-audit and Náutilo's updated D2 report are ratified. FEE-01 was
fixed in-wave; FEE-02/GASTANK-01 are by-design INFO. No CRITICAL/HIGH introduced.
Blood Law check on the new code: the fee is atomic and non-custodial (nothing
held between transactions — re-proven), the cap is in bytecode, the GasTank moves
no account's funds but its own owner's. No gota through.

## 5. Verdict

**APROVA_PERFEITO for the fork/testnet scope, including the success fee, the
GasTank and the re-audits.** No CRITICAL or HIGH finding in any domain. The open
MEDIUM findings (F-01, F-02) are inherent v0 limitations, documented, tested and
scheduled — gates for mainnet, not defects. All N1 audits (Medusa v0 + fee
re-audit, Crocodilo, Náutilo D2) are ratified.

**Mainnet remains VETOED by construction** until: F-01 (balance-delta
accounting) closed, F-02 (typed adapters) tightened, an external third-party
audit passed, and the Crocodilo public-launch conditions (immutable no-token
rule, AI disclosure, domain/inbox/trademark) met. This veto lifts only through
the normal path — it is not a discretionary hold; it is the Blood Law applied to
irreversible fund risk.

---
*This verdict reflects commit `86cf80e`. New code = new audit = new verdict
(the audited artifact must not change under the judge's eye).*
