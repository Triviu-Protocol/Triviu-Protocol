# Tradeoff Record No. 0006 — Solana: a sibling protocol, deferred

- **Date:** July 2026
- **Status:** **deferred** (candidate — recorded, not accepted-for-build)
- **Originating PR:** multi-chain propagation onda

## Decision

Solana is recorded as a future direction, **not** an execution target of the
current protocol. Unlike Arbitrum (0004) and BSC (0005), Solana is **not an EVM
chain**: none of the Solidity contracts port to it. Supporting Solana means a
separate, ground-up build — a sibling protocol — with its own audit, not a config
file.

This record exists so the intent is on the record with its honest cost, and so no
surface can claim Solana support prematurely. Until a build record supersedes this
one, Triviu on Solana does not exist beyond intent.

## Why it is a rewrite, not a config

| Dimension | EVM (Polygon/Arbitrum/BSC) | Solana |
|---|---|---|
| Language / VM | Solidity / EVM | Rust (Anchor) / SVM |
| DEX venues | UniV2/V3-style routers | Orca, Raydium (different pool math, CLMM) |
| Atomicity | one transaction, one contract call | one transaction, multiple instructions — different program model |
| Ordering / MEV | public mempool + priority fee | no public mempool; Jito bundles, local fee markets |
| Contracts | reused unchanged | written from zero |

## Trilemma reading

Deferred. Solana's scalability is high (very low fees, high throughput); its
security and decentralization carry their own profile (validator set, historical
liveness incidents) that a real build record must read honestly. No scores are
assigned until this record is superseded by an accepted build record.

## Consequences

No Solana code, addresses, or claims enter any public or internal surface while
this record is `deferred`. The roadmap may name Solana as a future sibling
protocol; marketing may not present it as available. When a build is opened, a new
record (0007+) supersedes this one and carries the real trilemma reading.
