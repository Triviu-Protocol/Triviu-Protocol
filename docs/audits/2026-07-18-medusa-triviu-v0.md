# On-chain audit report — Triviu v0 contracts

- **Auditor:** Medusa (Predators Protocol · Web3 on-chain audit) — external audit provider
- **Date:** 2026-07-18
- **Scope commit:** `86cf80e` (branch `main`)
- **Files:** `contracts/src/TriviuExecutor.sol`, `contracts/src/ParameterRegistry.sol`
- **Chain target:** Polygon PoS (execution) · Amoy (testnet)
- **Solidity:** `^0.8.24` · Foundry (forge 1.5.1)
- **Status of the code under audit:** v0, pre-testnet.

> This is an **external** audit by Predators Protocol (independent audit
> provider). Per Náutilo Art. 5/6, no audit guarantees the absence of
> vulnerabilities and final assurance rests with whoever signs the deploy.
> Consistent with the brand rule, this document lists what was examined — it does
> not claim "no issues found" in the abstract. Tools not run in a given pass are
> declared as such, not hidden.

## 1. What was examined

| Technique | Tool / method | Result |
|---|---|---|
| Full manual review | line-by-line, both contracts | done |
| Static lint | `forge build` lints | 2 informational warnings (§4) |
| Unit + revert paths | `forge test` (19 tests) | 19/19 pass |
| Property / invariant | `invariant_ContractBalanceAlwaysZero` | 256 runs × 500 calls, 0 violations |
| Fuzz | `testFuzz_PrincipalAndMinProfit`, `testFuzz_StepCount` | pass (256 runs each) |
| Reentrancy analysis | manual (CEI + external-call surface) | see F-02 |
| Access control | manual (owner model) | see §3 |

Static tools not run in this pass (declared, not hidden): Slither (install
unavailable in this environment), Mythril, Echidna. Slither later shipped in CI
(fail-on-HIGH); Mythril and Echidna are scheduled for the pre-mainnet final
review. Their absence here is a limitation of this report, not a clean bill.

## 2. Threat model

The Executor is **stateless and non-custodial**: it pulls the principal from the
caller, runs the legs, enforces `finalBalance ≥ principal + minProfit`, and
returns everything in the same transaction. The rational attacker's goals are:
(a) make the contract keep value between transactions, (b) drain a caller mid-
cycle, (c) execute an unprofitable cycle at the caller's expense, or (d) grief
availability. The design closes (a)–(c) structurally; (d) is a real, documented
residual (F-01).

## 3. Access control

`ParameterRegistry` is a single-owner contract. Every mutator is `onlyOwner` and
additionally requires a non-empty `prUrl` (the forum→Git→block trail). `owner`
starts as the deployer and is intended to move to a timelocked multisig before
mainnet (litepaper §4.2, contract NatSpec). The Executor itself has **no owner,
no admin, no pause, no upgrade path** — there is nothing to seize. Correct for a
stateless design.

## 4. Findings

### F-01 · Donation griefing trips the stateless check — MEDIUM (accepted for v0)

`executeCycle` reverts with `NotStateless` when `balanceOf(this) != 0` at entry.
Anyone can `transfer` 1 wei of a whitelisted token directly to the Executor and
permanently disable that token's cycles — there is no sweep function in v0. Cost
to attacker: dust + gas. Impact: denial of service **per token** (no fund loss;
non-custody holds).

- **Status:** known, documented, and pinned by
  `test_KnownLimitation_DonationTripsStatelessCheck`.
- **Decision:** accepted for v0 (fork/testnet scope) and recorded in
  `decisions/0002-donation-griefing.md`.
- **Fix (v0.2, before mainnet):** balance-delta accounting — compute profit as
  `finalBalance − startBalance` and return the delta, making stray balances
  irrelevant. This removes the vector at the source.
- **Verdict:** does not block testnet; **must** be resolved before mainnet.

### F-02 · Arbitrary calldata to whitelisted targets — MEDIUM (mitigated by curation, by design in v0)

Each `Step` carries `bytes data` executed via `target.call(...)` against any
Registry-allowed target. Safety rests entirely on the whitelist: a malicious or
mis-added target could receive arbitrary calls from the Executor's context.
Because the Executor holds no balance and approvals are built per-cycle in the
engine's step for the exact `amountIn`, the blast radius is bounded to the
in-flight principal of the calling transaction — not other users, not stored
funds.

- **Status:** documented in the contract header and litepaper §4.1 ("typed swap
  adapters in v0.2").
- **Recommendation:** v0.2 replaces arbitrary calldata with typed per-DEX
  adapters and per-leg exact-approve-then-reset; until then, the Registry
  whitelist must be curated conservatively (routers only, no arbitrary tokens as
  targets beyond the assets being swapped).
- **Verdict:** acceptable for v0 with a curated whitelist; tighten in v0.2.

### F-03 · Non-standard ERC-20 return values — LOW

The Executor checks the boolean return of `transfer`/`transferFrom` via
`require(...)`. This is correct for compliant tokens (WMATIC, USDC, USDC.e, WETH
on Polygon all return `bool`). Tokens that return **no** value on transfer (some
legacy USDT-style deployments) would make the call revert on decode, not
silently pass. Combined with the existing "fee-on-transfer excluded" policy, the
whitelist is the control.

- **Recommendation:** when the whitelist review process is formalized, add an
  explicit ERC-20-compliance checklist item; consider `SafeERC20` in v0.2 if any
  non-standard token is ever a candidate.
- **Verdict:** informational-to-low; no action required for the current asset
  set, but note it in the whitelist policy.

### F-04 · `forge` lint: unchecked-transfer / unsafe-typecast — INFORMATIONAL (false-positive / guarded)

`forge build` raises `erc20-unchecked-transfer` and `unsafe-typecast`.

- `erc20-unchecked-transfer`: **false positive** — both transfer calls are
  wrapped in `require(...)`, so the return value IS checked. The linter does not
  recognize the `require` wrapping.
- `unsafe-typecast`: located in `script/Deploy.s.sol` (`uint16(maxSlippageBps)`),
  and **guarded** by `require(maxSlippageBps <= type(uint16).max)` immediately
  above the cast.
- **Verdict:** no code change required; documented here so the warnings are not
  read as unexamined.

## 5. Positive observations (examined and confirmed)

- **Stateless invariant is enforced and proven**: the entry-time
  `balanceOf(this) != 0 → revert` plus the invariant test (128,000 calls, 0
  violations) make the non-custody claim machine-checkable, not rhetorical.
- **The core condition is on-chain and non-discretionary**:
  `finalBalance ≥ principal + minProfit` reverts the whole transaction — no leg
  is left exposed (litepaper §3), confirmed by `test_RevertWhen_UnprofitableCycle`
  and the fuzz suite.
- **No `delegatecall`, no `selfdestruct`, no `receive`/`fallback`, no assembly**
  in the Executor. Minimal surface.
- **Registry provenance**: every parameter change requires a PR URL by
  construction (`withPr`), enforced and tested.

## 6. Verdict

| Severity | Count | Blocks testnet? | Blocks mainnet? |
|---|---|---|---|
| CRITICAL | 0 | — | — |
| HIGH | 0 | — | — |
| MEDIUM | 2 (F-01, F-02) | No — documented + scoped to fork/testnet | **Yes** until resolved/tightened |
| LOW | 1 (F-03) | No | Note in whitelist policy |
| INFO | 1 (F-04) | No | No |

**Medusa verdict for v0 (fork + testnet scope): APPROVED WITH DOCUMENTED
CONDITIONS.** No CRITICAL or HIGH findings. The two MEDIUM findings are inherent,
declared v0 limitations with explicit v0.2 remediations already recorded. Per
Article 5 (imutável — *Medusa never approves a known unmitigated vulnerability*),
this approval is **strictly bounded to the pre-mainnet scope** and is **not** a
mainnet approval: mainnet remains gated on (1) F-01 fixed via balance-delta
accounting, (2) F-02 tightened via typed adapters, and (3) the Predators Protocol
final pre-mainnet review at the closing commit. Any of these unmet = mainnet
deploy is a constitutional violation.

---
*Retest anchor: re-audit required at the commit that closes F-01/F-02, before the
final pre-mainnet review. This report reflects commit `86cf80e` and does not
carry to modified code (Article 6 — the audited code must not change; new version
= new audit).*
