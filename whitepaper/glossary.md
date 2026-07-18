# Glossary

**Atomic transaction** — a transaction that either completes fully or reverts
entirely; no partial state survives. Triviu's cycle runs inside one.

**Bellman–Ford** — a graph algorithm that detects negative cycles in `O(V·E)`.
Triviu uses it to find profitable arbitrage cycles (a profitable cycle is a
negative cycle in the `−ln(rate)` graph).

**bps (basis points)** — hundredths of a percent. 1% = 100 bps; the fee cap of
50% = 5000 bps.

**CEI (Checks-Effects-Interactions)** — a pattern that updates state before any
external call, preventing reentrancy. The Gas-Tank withdraw follows it.

**DEX** — decentralized exchange. Triviu operates over DEX liquidity pools.

**Gas-Tank** — a non-custodial, per-user gas-safety reserve; see
[Section 6](06-gas-tank.md). Not protocol revenue.

**minProfit** — the minimum profit above gas a cycle must clear or the
transaction reverts. A Registry parameter.

**MEV** — Maximal Extractable Value; the profit block producers and searchers can
extract by ordering transactions. The main reason an individual's expected result
tends to zero.

**Non-custody** — the property that the protocol never holds a user's funds
between transactions. Triviu's executor is stateless and proven so.

**Stateless contract** — a contract that keeps no balance or state between
transactions. Triviu's executor is stateless, which makes non-custody
machine-verifiable.

**Success fee** — a fee charged only on realized profit, atomically, capped in
bytecode; see [Section 5](05-success-fee.md).

**Tradeoff Record** — a numbered document in `/decisions` that reads an
architecture decision against the trilemma and states its cost. Invalid without a
cost line.

**Trilemma** — the tension between decentralization, security and scalability; no
network maximizes all three. See [Section 13](13-trilemma.md).
