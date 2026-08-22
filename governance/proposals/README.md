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

**This folder is empty, and not because nothing is deployed.** Two lines are live
on Polygon PoS and both carry applied parameters, read from the chain rather than
from a document:

| Contract | Live since | `feeBps` | Ceiling |
|---|---|---:|---|
| `ParameterRegistry` `0x1Adab61ef019d853BBcFaf65E929961b11897856` | 2026-08-12 | **3000** (30%) | — |
| `ProtocolRegistry` `0x7D1D8EacA0ce96cFAb5937b88Ba5d43d7e0Ad8dC` | 2026-08-22 | **50** (0.5%) | `100`, immutable |

Every one of those was set at genesis, by the deploy script, and none of them went
through `forum → PR → merge → on-chain`. That is not a defect of the flow — a
genesis has no prior state to propose against — but it does mean the ledger does
not yet mirror the chain, and saying the folder is empty because nothing is
deployed would be the comfortable version rather than the true one.

"Don't trust, verify" cuts here too: until a parameter is changed through this
folder, the authority on any live value is the chain, not this record.

```sh
cast call 0x7D1D8EacA0ce96cFAb5937b88Ba5d43d7e0Ad8dC 'feeBps()(uint16)' --rpc-url polygon
```
