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

## Turn the gates on — once per clone

```
git config core.hooksPath .githooks
```

That is the whole setup. There is no installer. `core.hooksPath` points git at the
versioned hook directory, so what runs is what the repository contains.

From then on every commit is checked against the **index** — the exact content the
commit will record — by every gate in `scripts/check-*.mjs`. Files you have not
staged are not judged: a hook that blocks a commit over something the commit does
not touch only teaches people `--no-verify`.

Run the same thing by hand at any time:

```
node scripts/portoes.mjs             # the working tree
node scripts/portoes.mjs --indice    # exactly what the hook sees
```

**Before publishing**, run the third mode. `vercel --prod` uploads the working
tree, not the commit — so a file that never entered git still ships:

```
node scripts/portoes.mjs --pre-publicacao
```

It refuses when anything under `site/` **differs from the commit** — untracked,
modified or deleted. For a deploy there is no difference between "never entered
git" and "entered and changed after": both are bytes nobody reviewed going out.

Provenance of the contracts, and how to reproduce it yourself:
[`docs/PROCEDENCIA.md`](docs/PROCEDENCIA.md).

## Before opening a code PR

- `forge build && forge test` in `contracts/`
- `npm run typecheck` in `engine/`
- Anything touching execution must run on a local fork first (`sim/`).
- `node scripts/portoes.mjs` — every gate, green.
