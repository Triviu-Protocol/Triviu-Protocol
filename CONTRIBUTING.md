# Contributing to Triviu

The flow is the same for code, parameters, docs and brand:
**forum/issue → pull request → public discussion → merge → (if on-chain) timelock update.**
Git history is the official record of everything.

## Rules

1. **Architecture decisions require a Tradeoff Record.** Use `decisions/TEMPLATE.md`.
   A record without a cost line is invalid — if nothing was paid, nothing was decided.
2. **Parameters** (routes, tokens, slippage caps, `minProfit`) change via PR to
   `engine/config/` plus an issue using the "Parameter proposal" template.
   The on-chain mirror in `ParameterRegistry` references the PR URL in its event.
3. **Docs and public-facing material** go through the Brand Manual checklist (§ 9.4):
   zero income promises, risk notice wherever execution is involved, AI label on
   synthetic content, no "trilemma solved" claims.
4. **Commits**: imperative mood, short scope (`contracts:`, `engine:`, `docs:`,
   `brand:`, `decisions:`). Releases are GPG-signed.
5. **Conduct**: technical respect; we debate ideas, not people.

## Before opening a code PR

- `forge build && forge test` in `contracts/`
- `npm run typecheck` in `engine/`
- Anything touching execution must run on a local fork first (`sim/`).

Português: [CONTRIBUTING.pt-BR.md](CONTRIBUTING.pt-BR.md)
