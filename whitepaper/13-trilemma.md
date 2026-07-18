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

The mark itself carries this: three equal nodes in a cycle, none resting on a
base, no apex — the trilemma traveled, not a hierarchy claimed. See the
[brand manual](../brand/README.md).
