# 13. The trilemma

The blockchain trilemma says no network maximizes **decentralization**,
**security** and **scalability** at once: improving two axes charges a price on
the third. The industry usually treats it as a marketing problem — "we solved the
trilemma." Triviu does the opposite.

> *Triviu doesn't solve the trilemma. It travels it — and documents the price of
> every lap.*

Choosing is inevitable; hiding the choice is optional. Triviu does not hide it.
Every architecture decision ships with a **Tradeoff Record** in `/decisions`,
which reads the choice against all three axes and states, explicitly, which axis
paid. A record without a cost line is invalid — if nothing was paid, nothing was
decided.

## The founding record — Polygon PoS

| Axis | Verdict | Why |
|---|---|---|
| Scalability | **GAINS** | Low gas makes small cycles executable and mistakes cheap — a prerequisite for hands-on education. |
| Security | **HOLDS** | Atomicity removes leg exposure: the cycle closes or everything reverts. Contract risk remains. |
| Decentralization | **COSTS** | We inherit Polygon's validator set. Mitigation: verified contracts, local fork simulation, self-hosted RPC recommended. |

Reading on the trilemma diagram: Scalability 0.9 · Security 0.8 ·
Decentralization 0.55. The component rule: **never plot 1.0 on all three axes** —
the perfect triangle is the perfect lie.

## The expansion records — each chain pays a different price

Polygon PoS is the default and reference chain. The same audited contracts are
EVM-equivalent, so extending to other EVM chains is a configuration, not new code —
but each chain travels the trilemma differently, and each carries its own record.

| Chain | Record | Scalability | Security | Decentralization |
|---|---|---|---|---|
| Polygon PoS | [0001](../decisions/0001-polygon-pos.md) | 0.90 | 0.80 | 0.55 |
| Arbitrum One | [0004](../decisions/0004-arbitrum-one.md) | 0.85 | **0.90** (settles to Ethereum L1) | 0.50 (single sequencer) |
| BNB Smart Chain | [0005](../decisions/0005-bsc.md) | 0.90 | 0.75 | **0.35** (small validator set — the most centralized) |

BSC buys reach and deep stablecoin liquidity by paying **more** decentralization
than Polygon, not less; we state that rather than hide it. Solana is **not** an EVM
chain — none of this code ports — so it is recorded as a deferred sibling protocol
([0006](../decisions/0006-solana-deferred.md)), not an execution target here.

The mark itself carries this: three equal nodes in a cycle, none resting on a
base, no apex — the trilemma traveled, not a hierarchy claimed. See the
[brand manual](../brand/README.md).
