# Parameter proposals

Every parameter change in Triviu is public, versioned, and reviewable — never a
private switch. This folder is where a proposal lands as a file, following the
governance flow of [Whitepaper §12](../../whitepaper/12-governance.md):

```
forum → PR → merge → on-chain
```

Each proposal records **what changes, from what to what, and why**, plus the
trilemma axis it affects and the cost accepted. When a change is applied, the PR
URL is recorded in the on-chain event, so anyone can trace a live parameter back
to the discussion that produced it. Opening a proposal applies nothing: the
multisig executes the on-chain call only after review and merge.

## What a proposal looks like

One markdown file per proposal, named `YYYY-MM-DD-HHMMSS-<slug>.md`, with:

- the parameter(s), current value, and proposed value
- the exact on-chain call it maps to (e.g. `ParameterRegistry.setFeeBps(2500)`)
- the rationale, backed by verifiable data
- the trilemma axis affected and the cost accepted

The [`parameter-proposal` issue template](../../.github/ISSUE_TEMPLATE/parameter-proposal.md)
is the same shape. Proposals can be written by hand or drafted with the Triviu
ADM Owner console, which composes the file and opens the PR for you.

## State of the ledger

Nothing is deployed on any chain yet, so there are no applied parameters to
mirror. This folder fills as proposals are opened. That is the honest state —
"don't trust, verify": the record is here, in the open, or it does not exist.
