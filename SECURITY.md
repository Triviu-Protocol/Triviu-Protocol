# Security Policy

**Current status: pre-mainnet. Not yet deployed.**
No mainnet deployment before the Predators Protocol D2 audit (Náutilo
Audit-as-a-Service · the security audit of record) clears the final review at the
closing commit, and before the two disclosed trust gates (timelocked-multisig
owner; token-whitelist policy) are in place. Audit reports are public in
[`docs/audits/`](docs/audits/) — don't trust, verify. The current D2 report is
[`2026-07-18-nautilo-d2-laudo-v0.2.md`](docs/audits/2026-07-18-nautilo-d2-laudo-v0.2.md).

## Responsible disclosure

Found a vulnerability? Do not open a public issue.
Write to: security@triviu.org (placeholder — configure before launch) with
reproduction steps. We respond within 72h and coordinate the fix and public
disclosure with credit to the researcher.

## Bug bounty — scope (rewards set at funding)

Consistent with the no-promises principle, we do **not** promise amounts before
the funds and rules are published. The reward table is set when the bounty is
funded, before mainnet; this section defines the scope and how findings are
classified so a researcher knows exactly what is worth reporting.

### Severity classification (mirrors the audit scale)

| Severity | What it means |
|---|---|
| CRITICAL | Direct, externally-triggerable loss of caller funds, or takeover of the Registry owner without the two-step handoff. |
| HIGH | Loss of funds under a rare-but-reachable precondition; reentrancy that survives the guard. |
| MEDIUM | Loss/lock under a costly precondition; a broken invariant without direct theft. |
| LOW / INFO | Best-practice violation; hypothetical-only exploit. |

### Target invariants — break one and it's in scope

1. The executor holds **no caller funds** between transactions (only donations,
   and those are never handed to a caller).
2. A cycle **never returns less than `principal`** to the caller — it settles
   with `profit ≥ minProfit` or the whole transaction reverts.
3. The success fee **never exceeds 50% of profit** and never touches principal.
4. `executeCycle` is **non-reentrant**; no whitelisted token/router can re-enter.
5. **GasTank**: only the balance owner can move it; no cross-user reach; no
   double-spend.
6. **Registry**: only the current owner changes parameters; ownership moves only
   via the two-step `transferOwner` → `acceptOwner`.

### In scope

- `contracts/src/` — `TriviuExecutor`, `ParameterRegistry`, `GasTank`.
- `engine/` — only flaws that cause loss of the operator's own funds (the engine
  is off-chain and non-custodial).

### Out of scope

- Third-party RPCs, DEX routers and tokens (a malicious *whitelisted* target that
  only griefs via revert is a known, disclosed property — the atomic gate makes
  it gas-only, never a loss).
- Governance/centralization risk that the audit already discloses (owner EOA
  before the multisig handoff, token-whitelist policy) — see the D2 laudo.
- Fork front-ends, social engineering, spam/DoS of public RPCs.

Final assurance rests with whoever signs the deployment. No audit or bounty
guarantees the absence of vulnerabilities.
