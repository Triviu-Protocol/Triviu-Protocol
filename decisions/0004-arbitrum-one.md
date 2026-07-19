# Tradeoff Record No. 0004 — Expansion network: Arbitrum One

- **Date:** July 2026
- **Status:** accepted (expansion candidate — pre-sanctioned by Record 0001)
- **Originating PR:** multi-chain propagation onda

## Decision

Triviu extends to Arbitrum One as an EVM execution target. The Solidity contracts
(`TriviuExecutor`, `ParameterRegistry`, `GasTank`) are the **same** — Arbitrum is
EVM-equivalent, so no contract change is required, only a chain configuration
(`engine/config/params.arbitrum.example.toml`). Polygon PoS (Record 0001) remains
the default and reference chain. This record adds Arbitrum; it does not replace
Polygon.

Deployment remains gated by the mainnet audit process (whitepaper §9/§14). Nothing
is deployed on any chain at v0. The simulator models Arbitrum today with real,
on-chain-verified pools; on-chain execution comes chain by chain, after the gate.

## Trilemma reading

| Axis | Verdict | Rationale and mitigation |
|---|---|---|
| Scalability | **GAINS** | Optimistic rollup — gas is low and throughput high. Marginally higher gas than Polygon PoS, still cheap enough for hands-on cycles. |
| Security | **GAINS (vs Polygon PoS)** | Settles to Ethereum L1; state is defended by fraud proofs over Ethereum data availability. Atomicity still removes leg exposure: the cycle closes or reverts. Contract risk unchanged — same audited code. |
| Decentralization | **COSTS (sequencer)** | Today a single sequencer orders transactions — a reordering/censorship surface; there is no user-facing MEV auction to inherit, but the sequencer can. Permissionless fraud proofs and forced-inclusion mitigate; the honest cost is live sequencer centralization. |

## Alternatives considered

Base and Optimism (same OP-stack profile — future records if adopted); zkSync/
Starknet (not EVM-equivalent — would need contract changes, out of the same-code
premise); staying single-chain (rejected — Record 0001 pre-sanctioned expansion).

## Consequences

The engine reads Arbitrum via config; the DEX venue is a constant-fee UniV2-style
router (SushiSwap, 0.30%) so the `0.997` fee model holds — Camelot's dynamic-fee
pairs are explicitly out of scope until the adapter models them. Addresses verified
on-chain 2026-07-19 (router → factory → pool consistent); re-verify on arbiscan.io.
Trilemma-diagram reading: S 0.85 · Sec 0.90 · D 0.50.
