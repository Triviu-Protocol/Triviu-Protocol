# Tradeoff Record No. 0007 — v0.2 ships on one chain: Polygon only

- **Date:** July 2026
- **Status:** accepted (scope lock for v0.2)
- **Originating PR:** pre-mainnet hardening

## Decision

**v0.2 executes on Polygon PoS and nowhere else.** Arbitrum (0004), BSC (0005)
and Solana (0006) are reclassified as **v1 or later**. None of them ships a line
of deploy until it has, on its own, both an **external audit** and its **own
Tradeoff Record** that accepts the deploy.

This record does not delete 0004/0005/0006 — the registry is append-only. It
constrains them: those records document that the chains are *candidates*; this one
fixes that only **one** of them is in scope for v0.2, coherent with the founding
choice in [0001](0001-polygon-pos.md).

## Why narrow, when the engine already reads three chains

The engine reading a chain from config is cheap. Being *live* on a chain is not:
each additional chain multiplies the surface an attacker probes and the code an
auditor must clear, and it does so **before any of it is proven in production**.
That contradicts the project's own discipline — verify before you widen. Breadth
with zero on-chain history is not reach; it is unproven surface.

| Cost of premature breadth | Detail |
|---|---|
| Attack surface | Each chain = different routers, pools, token quirks, reorg profile — more places for a whitelisted-token or routing edge to bite. |
| Audit cost | The external audit gate (Blood Law) must clear **per chain**; three at once triples the thing that gates mainnet, for no proven return. |
| Honesty | Claiming three chains before one has a public dashboard would be reach we cannot yet verify — a claim without evidence. |

## Solana is a security decision, not a config flag

Reclassifying Solana is not the same kind of deferral as Arbitrum or BSC. Those
are EVM: the same audited Solidity runs, and the record they need is mostly
per-chain address and liquidity verification. **Solana is not EVM.** It is a
program in Rust under a different account model, with different DEX math
(Orca/Raydium CLMM), a different atomicity/instruction model, and a different
MEV/ordering reality (no public mempool; Jito bundles). Supporting it is a
ground-up rewrite and an independent audit — [0006](0006-solana-deferred.md) is
explicit. Treating Solana as a trivial extension of the EVM protocol would itself
be a security error, and this record names that so no future surface assumes
otherwise.

## Trilemma reading

| Axis | Verdict | Rationale |
|---|---|---|
| Security | **GAINS** | One chain = one audited surface to defend and prove before widening. The Blood-Law gate is met once, deeply, not three times, thinly. |
| Scalability | **COSTS** | Fewer venues at launch. Accepted: reach without on-chain history is not reach. |
| Decentralization | **HOLDS** | Unchanged from 0001 — Polygon's validator set, mitigated by verified contracts and local-fork simulation. |

## Alternatives considered

- **Ship all EVM chains in v0.2.** Rejected: triples the audit gate and attack
  surface for zero proven return.
- **Ship Polygon + one more.** Rejected for the same reason at smaller scale — the
  exit rule below is binary, and "one more" violates it.

## The exit rule (unambiguous)

**Prove it on one chain — with real, verifiable on-chain history — before opening
the second.** A second chain opens only when Polygon has a live public dashboard
(0003 fee, 0007 scope, §7 transparency) showing real executions, reverts included,
and a new Tradeoff Record accepts that chain with its own external audit.

## Consequences

- v0.2 surfaces (site, whitepaper, engine default, deploy runbook) present Polygon
  as the single execution target; Arbitrum/BSC/Solana appear only as future,
  gated siblings — never as available.
- The multi-chain example configs stay in the repo as **design-for**, not
  **deployed-on** — consistent with the honesty sentinel in CI.
- The mainnet deploy package targets one chain. The others wait behind their own
  records.
