# 3. Triangular arbitrage

A triangular arbitrage exploits momentary price discrepancies across three
liquidity pools, traversing the cycle A → B → C → A within **a single atomic
transaction**. If, at the end of the cycle, the amount of A obtained does not
exceed the initial amount plus costs, the transaction reverts entirely — no leg
is left exposed.

## The math

For an initial volume `V` in asset A, effective exchange rates `r₁, r₂, r₃`
(already reflecting price impact) and pool fees `φ₁, φ₂, φ₃`:

```
Gross profit = V · [ r₁·r₂·r₃ · (1−φ₁)(1−φ₂)(1−φ₃) − 1 ]

Execution condition:  Gross profit − G ≥ minProfit
```

where `G` is the gas cost denominated in A. If the condition is not met at
execution time, the contract reverts. The success fee (Section 5) applies only
*after* this condition holds, and only to the profit.

## Detection as a graph problem

A cycle A → B → C → A is profitable (before gas) when the product of effective
rates exceeds 1:

```
r₁·(1−φ₁) · r₂·(1−φ₂) · r₃·(1−φ₃) > 1
```

Taking −ln of each factor turns "product > 1" into "sum < 0": finding arbitrage
is equivalent to finding a **negative cycle** in the graph whose edge weights are
`−ln(effective rate)`. Bellman–Ford detects negative cycles in `O(V·E)`, and this
is exactly what the [off-chain engine](04-architecture.md) implements.

```
weight(edge) = −ln( rate · (1 − fee) )
profitable cycle  ⇔  negative cycle in that graph
```

## Honesty note

Existing in the graph is **not** the same as being capturable in practice.
Between detection and block inclusion sit professional competition (MEV), gas and
slippage. [Section 8](08-risks.md) documents why the expected result for an
individual operator tends toward zero or negative — and the engine's default is
to simulate, not to send.
