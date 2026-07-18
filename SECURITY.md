# Security Policy

**Current status: pre-mainnet. Not yet deployed.**
No mainnet deployment before the Predators Protocol audit (external, independent
provider · Náutilo Audit-as-a-Service) clears the final review at the closing
commit. Audit reports are public in [`docs/audits/`](docs/audits/) — don't trust,
verify.

## Responsible disclosure

Found a vulnerability? Do not open a public issue.
Write to: security@triviu.org (placeholder — configure before launch) with
reproduction steps. We respond within 72h and coordinate the fix and public
disclosure with credit to the researcher.

Bug bounty: **to be defined**. Consistent with principle 4, we do not promise
amounts before funds and rules are published.

## Scope

- `contracts/` (Executor, Registry)
- `engine/` (only flaws that cause loss of the operator's funds)

Out of scope: third-party RPCs, fork front-ends, social engineering.
