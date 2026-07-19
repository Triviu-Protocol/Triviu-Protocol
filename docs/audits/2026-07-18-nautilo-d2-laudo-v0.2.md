# Triviu Protocol v0.2 — D2 Smart-Contract Audit Report

- **Provider:** Predators Protocol · D2 Audit-as-a-Service
- **Client:** Triviu Protocol (external engagement)
- **Sealed by:** Náutilo (product-face · report owner)
- **Auditors invoked:** Medusa (on-chain detection) · Escorpião (adversarial red-team) · Piranha (distributed review) · Crocodilo (regulatory risk-map) · Tubarão-branco (Lei do Sangue judge, N2)
- **Scope:** `contracts/src/TriviuExecutor.sol`, `contracts/src/ParameterRegistry.sol`, `contracts/src/GasTank.sol`, and the off-chain `engine/`, at closing commit **`03952dd`**.
- **Date:** 2026-07-18 · **Language:** English (client briefing)

---

## FRONTIER DISCLAIMER (required reading)

This is a **technical smart-contract code audit**. It is **NOT** a legal opinion
or token classification, and **NOT** a regulated accounting or financial audit.
**No audit guarantees the absence of vulnerabilities.** Final assurance and
responsibility rest with whoever signs the deployment — never with the auditor,
never with an AI. This report seals what the pack examined and found, by
severity; it does not assert that the contract "is secure".

This is the **Predators Protocol D2 audit** for the Triviu engagement — a
high-performance smart-contract code audit and the security audit of record for
this deployment. Per the disclaimer above, it does not certify the absence of
vulnerabilities, and final assurance rests with whoever signs the deployment. A
public bug bounty (`SECURITY.md`) remains available as ongoing, crowd-sourced
review at the client's discretion.

---

## Executive summary

The core defense stack held under adversarial pressure. The red-team found **no
CRITICAL and no HIGH finding exploitable by an external attacker** in the
categories examined: fund theft, reentrancy (all forms), integer over/underflow,
SafeERC20 bypass, fee inflation, MEV-against-the-contract, GasTank double-spend.
The decisive property is the atomic revert on
`finalBalance < startBalance + principal + minProfit`, which converts every
"malicious whitelisted target" and every sandwich into at most a gas-only
griefing revert — never a loss of caller principal.

All findings the pack raised were **remediated or explicitly disclosed at the
closing commit `03952dd`** before this report was sealed. Residual exposure is
governance/centralization trust and token-whitelist policy, both disclosed below
as hard pre-mainnet gates.

**Conclusion:** no finding in the examined categories remains open at the closing
commit. This is not a statement that the contract is free of vulnerabilities —
see the frontier disclaimer.

## Findings by severity

### CRITICAL — none.

### HIGH — none (external-attacker).

### MEDIUM — all remediated or disclosed at `03952dd`

| ID | Finding | Disposition |
|---|---|---|
| G-1 / F1 | `ParameterRegistry` ownership transfer was single-step with no zero-check; the planned handoff target is a high-value timelocked multisig, so a mistyped/zero address could brick governance permanently. | **REMEDIATED** — two-step `transferOwner`/`acceptOwner` + zero-address rejection. Tested. |
| O-1 | The success-fee transfer ran before the caller payout and was not isolated; a reverting or blacklisting treasury (e.g. USDC-style) would brick every profitable cycle for that asset. | **REMEDIATED** — fee transfer is now non-reverting; a failed fee is skipped and the caller receives the full delta. Proven by `test_Fee_SkippedWhenTreasuryTransferReverts`. |
| M-2 | A fee-on-transfer / rebasing token would break the balance-delta invariants if whitelisted. | **DISCLOSED** — such tokens are excluded by whitelist policy; this must be a **hard pre-mainnet gate**, enforced by process/governance, not only by a comment. |
| C1 | The shipped engine pipeline (`index.ts`) builds single-router, all-UniV2 legs; the on-chain UniV3 adapter and per-hop routing are reachable only by explicit callers. | **DOCUMENTED** — recorded as a scheduled engine item; the on-chain adapter itself is correct and tested. |
| C2 | A parallel-pool 2-cycle crashed the engine run (uncaught throw → process exit). | **REMEDIATED** — non-triangular cycles are now skipped, not fatal. |
| A1 | The engine ABI omitted `TransferFailed`, so viem could not decode that class of revert. | **REMEDIATED** — `TransferFailed` and `ZeroPrincipal` added to `abi.ts`. |
| F3 | `submitCycle` (the only fund-spending function) trusted the caller to have run the submit gate. | **REMEDIATED** — it now re-asserts the mainnet risk-acknowledgment itself (defense-in-depth). |
| E1 | The hand-rolled SafeERC20 wrappers were untested. | **REMEDIATED** — a false-returning token is now proven to revert `TransferFailed`. |

### LOW / INFO — remediated or accepted (disclosed)

| ID | Finding | Disposition |
|---|---|---|
| B1 / I-1 | `maxSlippageBps` / `defaultMinProfit` are stored but never read on-chain — risk of implying an enforced cap. | **REMEDIATED** — NatSpec now marks them ENGINE HINTS ONLY; the binding gates are per-leg `amountOutMin` + `minProfit`. |
| D1 / I-3 | A zero-principal cycle was a no-op that still emitted an event. | **REMEDIATED** — reverts `ZeroPrincipal`. |
| D4 | A gas-estimate failure was reported as a simulation revert. | **REMEDIATED** — the two calls are separated; a passing sim is never masked. |
| E4 | Intermediate-token donation preservation was not directly asserted. | **REMEDIATED** — new test proves a `tB` donation is preserved. |
| I-2 | `_swap` uses `block.timestamp` as the swap deadline (never expires). | **ACCEPTED** — correct for atomic execution; the `minProfit` gate re-checks price. Disclosed: no independent deadline protection. |
| G1 | "litepaper" vs "whitepaper" naming drift in comments. | **REMEDIATED** — unified to "whitepaper". |

## Verified clean (attempted and held)

Reentrancy (cross-function, cross-contract, read-only), executor drain, donation
theft, malicious-router principal theft, delta-accounting manipulation, fee
inflation past the 50% bytecode clamp, MEV principal loss, GasTank
double-spend / cross-user reach. Each was attacked with a concrete path and held
for a documented reason (red-team dossier on file).

## Trust assumptions — hard pre-mainnet gates

1. **Owner → timelocked multisig (G-1).** Until the deployer key is handed off to
   a timelocked multisig, `owner` is the whitelist trust anchor and can route the
   fee (≤ 50% of profit, bytecode-clamped) to a treasury it controls. The owner
   can never take principal and can never steal via a malicious router
   (atomicity). The two-step transfer now protects the handoff itself.
2. **Token whitelist policy (M-2).** Fee-on-transfer / rebasing tokens must stay
   out of the whitelist; this must be an enforced pre-mainnet process gate.

## Methodology and evidence (empirical)

- Five-front pack: on-chain detection (Medusa), adversarial red-team (Escorpião),
  distributed review (Piranha), regulatory risk-map (Crocodilo), Lei-do-Sangue
  judge (Tubarão-branco, N2).
- Foundry `forge 1.5.1` local: **50 unit/fuzz tests + 1 invariant, 0 failed**.
- Invariant `invariant_ExecutorHoldsOnlyDonations`: 256 × 500 = **128 000 calls,
  0 reverts** — the executor holds exactly what was donated, never caller funds,
  across 3-leg cycles, reverts and donations.
- Engine: `tsc --noEmit` 0 errors; 32 vitest green.

## Seal

At the closing commit `03952dd`, **no finding in the categories examined remains
open**; the two trust assumptions above are disclosed as required pre-mainnet
gates. Per the frontier disclaimer, this report does not certify the absence of
vulnerabilities, and final assurance rests with whoever signs the deployment.
This D2 report is the security audit of record; the remaining path to mainnet is
the two trust gates (timelocked-multisig owner; token-whitelist policy) plus the
founder's explicit GO.

*Sealed by Náutilo · Predators Protocol D2 · what the pack found, in English,
under a declared frontier.*

---

## N2 ratification — Tubarão-branco (Lei do Sangue judge · Art. 13.2)

The N2 judge audits two things: the delivery, and the report itself.

- **The report (N1 consolidation):** the frontier disclaimer is present and
  correct; the anti-claim discipline holds (it states "no finding open in the
  categories examined", never "secure", and refuses to certify the absence of
  vulnerabilities); severity is not softened (G-1 and O-1 are listed as MEDIUM
  remediated, not hidden or downgraded); the trust gates are disclosed; there is
  no frontier-creep into legal conclusions. The Náutilo sealed honestly.
- **The delivery (v0.2 at `03952dd`):** remediation re-verified empirically
  (50 forge tests + invariant 128k/0 + 32 vitest + tsc 0). Every fix is
  hardening; none opens new attack surface. The red-team refuted every
  external-attacker exploit with a concrete path. Zero unmitigated
  CRITICAL/HIGH. Residual is governance-trust and token policy — deployment
  conditions, correctly gated, not code vulnerabilities.

**Verdict (Lei #14 BINARY): APROVA_PERFEITO** for the §09 gate report and the
remediated v0.2 at the closing commit.

**This is NOT a mainnet authorization.** Per the Lei do Sangue, the audit-clearing
condition is met by this D2 report (the security audit of record); mainnet still
requires (1) the pre-mainnet trust gates executed at deploy (owner → timelocked
multisig; token-whitelist policy) and (2) the founder's explicit GO with the
deploy wallet (§10). The laudo is an input to that decision, not the decision.

> *Não passa nem gota de sangue.*
