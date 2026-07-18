# Tradeoff Record No. 0001 — Execution network: Polygon PoS

- **Date:** July 2026
- **Status:** accepted (founding decision)
- **Originating PR:** repository foundation

## Decision

Triviu executes on — and teaches about — Polygon PoS.

## Trilemma reading

| Axis | Verdict | Rationale and mitigation |
|---|---|---|
| Scalability | **GAINS** | Low gas makes small cycles executable and mistakes cheap — a prerequisite for hands-on DeFi education. |
| Security | **HOLDS** | Atomicity removes leg exposure: either the cycle closes or everything reverts. Contract risk remains — external audit before v1. |
| Decentralization | **COSTS** | We inherit Polygon's validator set. Mitigation: verified contracts, local fork simulation, self-hosted RPC recommended. |

## Alternatives considered

Ethereum L1 (gas prohibitive for hands-on education); Arbitrum/Base (valid
expansion candidates — each will require its own record); smaller side-chains
(unacceptable security and liquidity cost).

## Consequences

All documentation, the engine and the simulator assume Polygon as default;
trilemma-diagram reading of this choice: S 0.9 · Sec 0.8 · D 0.55.

Português: [0001-polygon-pos.pt-BR.md](0001-polygon-pos.pt-BR.md)
