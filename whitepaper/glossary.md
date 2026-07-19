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

**Chain-agnostic (EVM)** — the contracts are EVM-equivalent, so the same audited
code runs on any EVM chain by configuration. Polygon is the default; Arbitrum and
BSC ship with example configs and are modelled in the
[simulator](https://triviu.vercel.app/simulate). Each chain has its own Tradeoff
Record in `/decisions` and its own deploy gate — none is "live" until that gate
clears. Solana is not EVM and is a deferred sibling protocol, not a config.

**DEX** — decentralized exchange. Triviu operates over DEX liquidity pools.

**Fee wall** — the pool fees compound over the cycle: for N hops at 0.3% each,
`0.997^N` (three hops ≈ 0.991, about 0.9% lost before slippage or gas). More hops
means a taller wall, not more chances. The rate is per-pool — PancakeSwap V2 on BSC
is 0.25%, not 0.3%. Watch it scale in the [simulator](https://triviu.vercel.app/simulate).

**Gas-Tank** — a non-custodial, per-user gas-safety reserve; see
[Section 6](06-gas-tank.md). Not protocol revenue.

**minProfit** — the minimum profit above gas a cycle must clear or the
transaction reverts. A Registry parameter.

**MEV** — Maximal Extractable Value; the profit block producers and searchers can
extract by ordering transactions. The main reason an individual's expected result
tends to zero.

**Non-custody** — the property that the protocol never holds a user's funds
between transactions. Triviu's executor is stateless and proven so.

**Price impact (slippage)** — trading against a constant-product pool moves its
price against you; the larger the trade relative to the pool, the worse. It is why
an edge that profits at small size reverts when oversized.

**Revert** — the atomic, all-or-nothing ending: if the final balance is below
`principal + minProfit`, the whole transaction unwinds and only gas is spent. The
most common outcome — published, not hidden. Run a few in the
[simulator](https://triviu.vercel.app/simulate).

**Simulator** — a client-side model of one A→B→C→A cycle that runs the exact
execution math, no wallet and no chain. Live at
[triviu.vercel.app/simulate](https://triviu.vercel.app/simulate).

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
