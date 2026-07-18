# Smart Contract Audit Report — Triviu v0

**Product:** Audit-as-a-Service (D2) · Predators Protocol
**Product auditor (issues and seals the report):** Náutilo (Web3)
**On-chain technical detection:** Medusa (Web3)
**Closing judge:** Tubarão-branco (Blood Law · N2 verdict)

---

> ### REPORT FRONTIER — REQUIRED READING (hardcoded)
> This is a **technical smart-contract code report**. It is **not a legal opinion
> and not a regulated accounting audit**; **no audit guarantees the absence of
> vulnerabilities**; **final assurance and responsibility rest with whoever signs
> the deploy**. The report covers only the code, scope and commit declared below —
> it does not extend to code modified afterwards.

---

## 1. Identification

| Field | Value |
|---|---|
| Client | Triviu (dogfooding — auditing the protocol itself) |
| Object | `contracts/src/TriviuExecutor.sol` · `ParameterRegistry.sol` · `GasTank.sol` |
| Audited scope | fee-model wave (this commit); supersedes the v0 core scope |
| Target chain | Polygon PoS (execution) · Amoy (testnet) |
| Solidity | `^0.8.24` · Foundry (forge 1.5.1) |
| Product tier | **First-pass / gate** (production TVL = 0 · pre-testnet) |
| Report language | English (client's canonical language — Triviu is DeFi, EN-canonical) |
| Date | 2026-07-18 |

**Tier positioning (Art. 3):** this is a **first-pass** report — a quality gate
before testnet. It is **not** a single seal for high TVL. For mainnet with real
value at risk, the recommended stratification is this report **plus an external
audit firm plus a bug bounty**, exactly as litepaper §10 already requires. This
report does not replace that step; it precedes it.

## 2. Scope examined (what was looked at — Art. 6)

| Track | Method | Coverage |
|---|---|---|
| Line-by-line manual review | full read of both contracts | complete |
| Unit and revert tests | `forge test` — 19 tests | 19/19 green |
| Property invariant | `invariant_ContractBalanceAlwaysZero` | 256 runs × 500 calls · 0 violations |
| Fuzz | `testFuzz_PrincipalAndMinProfit`, `testFuzz_StepCount` | 256 runs each |
| Reentrancy analysis | manual (CEI + external-call surface) | see M-02 |
| Access control | manual (owner model) | see §5 |
| Static lint | `forge build` lints | 2 informational warnings (I-01) |

This wave adds the success fee and the GasTank. On top of the table above:
39/39 tests green; the invariant holds with the fee ACTIVE (128k calls); a hook
token reentering the fee transfer is empirically blocked; the GasTank withdraw is
empirically reentrancy-safe. Detail in the Medusa re-audit
([fee-reaudit](2026-07-18-medusa-triviu-fee-reaudit.md)).

**Not run in this pass (declared, not hidden):** Slither ships in CI as of this
wave (fail-on-HIGH); Mythril and Echidna remain scheduled for the pre-mainnet
final review. A missing tool is a limitation of the report, not a clean bill.

This report is issued by Predators Protocol (external audit provider); Triviu is
the client. It is the sealed audit **product** (Náutilo Audit-as-a-Service D2).

## 3. Findings by severity

Scale: `CRITICAL · HIGH · MEDIUM · LOW · INFO` (mirrors the Medusa). Severity is
binary — same evidence, same class. Every finding below was **verified** before
entering the report (false positives die at verification).

### CRITICAL — no findings in the categories examined
### HIGH — no findings in the categories examined

### MEDIUM

**M-01 · Donation griefing trips the stateless check**
`executeCycle` reverts with `NotStateless` if the contract holds a balance at
entry. Anyone can transfer 1 wei of a whitelisted token straight to the contract
and permanently disable that token's cycles (no sweep function in v0). Attacker
cost: dust + gas. Impact: denial of service **per token** — no fund loss
(non-custody holds).
- Evidence: pinned by `test_KnownLimitation_DonationTripsStatelessCheck`
  (verified present in the audited code).
- Recorded decision: `decisions/0002-donation-griefing.md`.
- Fix (v0.2, before mainnet): balance-delta accounting
  (`finalBalance − startBalance`), which removes the vector at the source.
- Status: **does not block testnet · mandatory gate for mainnet.**

**M-02 · Arbitrary calldata to whitelisted targets**
Each `Step` carries `bytes data` executed via `target.call(...)` against any
Registry-allowed target. Safety rests entirely on whitelist curation. Because the
contract holds no balance and the approval is built per-cycle for the exact
`amountIn`, the blast radius is bounded to the in-flight principal of the calling
transaction — it does not reach other users or stored funds.
- Evidence: documented in the contract header and litepaper §4.1.
- Fix (v0.2): typed per-DEX swap adapters + exact-approve-then-reset per leg.
- Status: **acceptable in v0 with a curated whitelist (routers only) · tighten in v0.2.**

### LOW

**L-01 · Non-standard ERC-20 returns**
The contract checks the boolean return of `transfer`/`transferFrom` via `require`
(correct for WMATIC/USDC/USDC.e/WETH on Polygon). Tokens that return no value
would revert on decode, not pass silently. The whitelist is the control.
- Recommendation: add an ERC-20-compliance item to the whitelist policy; consider
  `SafeERC20` in v0.2 if any non-standard token becomes a candidate.

**FEE-01 · Treasury misconfiguration (treasury == executor) — fixed in-wave**
Setting the treasury to the executor's own address would have stranded the fee
and bricked the stateless check (self-DoS). The executor now skips the fee in
that case, routing the whole result to the caller. Pinned by
`test_Fee_SkippedWhenTreasuryIsExecutorItself`. No residual risk.

### INFO

**I-01 · Lint warnings (`forge`)**
`erc20-unchecked-transfer` is a **false positive** — both transfers are wrapped
in `require(...)`; the linter does not recognize the wrapping. `unsafe-typecast`
sits in `script/Deploy.s.sol` (`uint16`) and is **guarded** by
`require(maxSlippageBps <= type(uint16).max)`. No code change; documented so the
warnings are not read as unexamined.

**FEE-02 · Fee rate is owner-controlled**
The rate lives in the Registry (deployer now, timelocked multisig before mainnet).
Mitigations are all on-chain and verifiable: hardcoded `MAX_FEE_BPS = 5000` (50%)
clamp, a PR URL on every change, and the exact fee emitted per cycle. Recorded in
`decisions/0003-success-fee.md`.

**GASTANK-01 · Automated consumption path not implemented**
`GasTank` v0 is a user-controlled escrow (each account funds and withdraws its
own balance; pull-payment, CEI, reentrancy-safe). The automated path — spending a
user's reserve to complete a stuck return leg — does not exist yet and gets its
own audit when specified.

## 4. Positive observations (examined and confirmed)

- **Stateless invariant proven, fee active**: the executor never holds a balance
  between transactions — 128,000 calls, 0 violations, with the success fee
  routing. Non-custody is machine-verifiable, not rhetorical.
- **Success fee is profit-only, atomic, capped and success-only**: charged solely
  on realized profit above gas, routed in the same transaction, never above 50%,
  and zero on reverts/break-even. "We only earn if you earn," enforced in code.
- **Reentrancy blocked by the stateless check**: a hook token reentering the fee
  transfer is rejected with `NotStateless` — verified empirically, not argued.
- **Cycle condition is on-chain and non-discretionary**:
  `finalBalance ≥ principal + minProfit` reverts everything — no leg is left
  exposed (litepaper §3).
- **Minimal surface**: no `delegatecall`, `selfdestruct`, `receive`/`fallback`
  or assembly in the executor (grep-verified · zero occurrences).
- **Registry provenance**: every parameter change requires a PR URL by
  construction (`withPr`), with an event — the forum→Git→block trail.

## 5. Access control

`ParameterRegistry` is single-owner; every mutator is `onlyOwner` + non-empty
`prUrl`. `owner` starts as the deployer and must move to a timelocked multisig
before mainnet (litepaper §4.2). `TriviuExecutor` has **no owner, admin, pause or
upgrade** — there is nothing to seize. Correct for a stateless design.

## 6. Report conclusion (Art. 6 — anti-claim)

**No CRITICAL or HIGH findings in the categories examined.** Two MEDIUM findings
(M-01, M-02) are inherent, declared v0 limitations — documented, tested and
scheduled for v0.2 fixes; they are mainnet gates, not defects of this delivery.
The fee change added one LOW (FEE-01), fixed in-wave, and two INFO items (FEE-02,
GASTANK-01), by design. The GasTank v0 lets no account move another's funds.

This report **does not conclude that "the contract is secure."** It concludes
that, in the categories and commit examined, with the tools actually run, the
findings are those listed above — and that final assurance rests with whoever
signs the deploy. Consistent with the Tubarão-branco (N2 verdict · APROVA_PERFEITO
for the pre-mainnet scope · mainnet vetoed by construction until M-01/M-02 close +
the Predators Protocol final review).

**Scope seal:** valid for commit `86cf80e`. Code modified afterwards = new
report (the shell does not re-seal itself).

---

## Document frontier in this directory (who does what in the canon)

| Document | Predator | What it IS | What it is NOT |
|---|---|---|---|
| **This D2 report** | **Náutilo** | **The sealed audit product, by severity, under frontier** | Not a legal opinion, not an accounting audit |
| [On-chain detection](2026-07-18-medusa-triviu-v0.md) | Medusa | Technical vulnerability detection (input) | Not the product-facing report |
| [Legal risk-surface map](2026-07-18-crocodilo-legal-triviu-v0.md) | Crocodilo | Internal legal risk-surface map | **Not a legal opinion** (bar-reserved) — does not replace a licensed attorney |
| [N2 verdict](2026-07-18-tubarao-branco-n2-verdict.md) | Tubarão-branco | Final judge · ratifies the N1 audits | Not deploy execution |

*Frontier disclaimer (repeated by canonical obligation): technical code report;
not a legal opinion and not a regulated accounting audit; no audit guarantees the
absence of vulnerabilities; assurance rests with whoever signs the deploy.*
