# 3. Triangular arbitrage — the mechanism and its mathematics

A triangular arbitrage exploits momentary price discrepancies across three
liquidity pools, traversing the cycle A → B → C → A within **a single atomic
transaction**. If, at the end of the cycle, the amount of A obtained does not
exceed the initial amount plus costs, the transaction reverts entirely — no leg
is left exposed. This chapter derives, from first principles, exactly when such a
cycle is profitable — and why, for an individual, it usually is not.

## 3.1 The swap primitive

On a constant-product AMM (Uniswap v2, QuickSwap v2 on Polygon, SushiSwap on
Arbitrum, PancakeSwap V2 on BSC), a pool of reserves `(x, y)`
enforces the invariant `x · y = k`. For an input `Δx` of the first token, the
output of the second is the exact on-chain `getAmountOut` — the fee is applied by
shrinking the *effective* input, not by taxing the output. The fee rate is a
per-pool parameter, not a constant: 0.30% on QuickSwap/SushiSwap, but **0.25% on
PancakeSwap V2** — the engine reads it per pool rather than assuming 0.3%:

```
          γ · Δx · y
Δy = ─────────────────────  ,   γ = 1 − f
        x + γ · Δx
```

For the canonical 0.30% pool, `f = 0.003` and `γ = 0.997` — the contract computes
this with the integer factor `997/1000` [U2]. The withheld `f · Δx` accretes to
the reserves, which is how liquidity providers earn.

## 3.2 Price impact

The marginal ("spot") price is `P = y / x`. But you never trade at the marginal
price: the *execution* price `P_exec = Δy / Δx = γ·y / (x + γ·Δx)` is always worse,
and worsens with size. To first order, for `Δx ≪ x`, the fractional slippage is
simply

```
slippage ≈ Δx / x
```

i.e. a trade equal to 1% of the input reserve costs on the order of 1% in price,
before fees — and the cost grows super-linearly for larger trades [P1]. This is
why arbitrage cannot be scaled up freely: past a point, your own trade closes the
gap you are chasing.

## 3.3 Uniswap v3 pools

Concentrated-liquidity pools (Uniswap v3, QuickSwap v3/Algebra) do not expose a
single reserve ratio. They store the square root of price in Q64.96 fixed point,
`sqrtPriceX96 = √P · 2⁹⁶`, and the human-readable price is recovered as

```
P = ( sqrtPriceX96 / 2⁹⁶ )² · 10^(decimals₀ − decimals₁)
```

The engine reads both pool types; the fork simulation, not this formula, is the
source of truth before any transaction [U3].

## 3.4 When is a cycle profitable?

Chain the swap three times, from an input `Δ₀` of A through pools `(A,B)`,
`(B,C)`, `(C,A)`, to an output `Δ_out`. The **net profit**, with gas cost `G`
denominated in A, is:

```
Profit = Δ_out(Δ₀) − Δ₀ − G

Execution condition:   Δ_out(Δ₀) ≥ Δ₀ + minProfit   (with minProfit ≥ G)
```

In the infinitesimal limit `Δ₀ → 0`, price impact vanishes and `Δ_out/Δ₀ →
γ³ · P_AB · P_BC · P_CA`. So a **necessary** condition for any profit at all is:

```
γ³ · P_AB · P_BC · P_CA  >  1
```

For 0.30% pools (`γ = 0.997`), that means the product of the three spot rates must
exceed `1 / 0.997³ ≈ 1.00905` — the raw mispricing has to clear roughly **0.9% of
cumulative fees before a single unit of gas or price impact is paid** [W1]. This
number is the first honest wall: most transient discrepancies are smaller than it.

## 3.5 Optimal size, not maximal size

Because price impact makes `Δ_out(Δ₀)` concave, profit is maximized at a *finite*
input — trade too little and you leave profit on the table; trade too much and
your own slippage erases it. For the reduced two-parameter form of a cycle, Wang
et al. (ETH Zurich) give the closed-form optimum [W1]:

```
Δ₀* = ( √(γ · a′ · a) − a ) / γ
```

The engine computes `Δ₀*`, evaluates `Profit(Δ₀*)`, and only proceeds if it is
positive after gas and the [success fee](05-success-fee.md).

## 3.6 Detection is a negative-cycle problem

Finding these cycles across a whole graph of pools is a classic algorithm.
Model tokens as vertices and each tradeable rate `R[i,j]` as a directed edge. A
cycle is profitable when its rate product exceeds 1. Assign each edge the weight
`w(i,j) = −log R[i,j]`; taking `−log` turns the product into a sum and flips the
inequality:

```
∏ R  >  1     ⟺     Σ (−log R)  <  0
```

So **an arbitrage opportunity is exactly a negative-weight cycle** — this is CLRS
*Introduction to Algorithms*, Problem 24-3 [C1]. Dijkstra fails on negative
weights; **Bellman–Ford** both finds shortest paths and *detects* negative cycles
(an edge still relaxable after `|V|−1` passes lies on one), in `O(V·E)` [C2]. The
engine ships this, with the queue-based SPFA refinement for sparse graphs. The
detector is written to be read, with worked examples anyone can run.

## 3.7 The honesty this math forces

The mathematics is not a sales pitch — it is a filter. The ~0.9% fee wall, the
concavity that caps trade size, and the gas floor together explain, before any
mention of competition, why the expected result for an individual tends toward
zero. Add professional searchers and sub-second auctions
([Section 8](08-risks.md)) and the picture is complete. Triviu publishes the math
so you can compute this for yourself — which is the entire point.

---

*References: [U2] Uniswap v2 Core whitepaper and `UniswapV2Library.sol`. [U3]
Uniswap v3 Core whitepaper; Uniswap v3 math primer. [P1] Paradigm, "Understanding
AMMs: Price Impact." [W1] Wang, Chen, Xu, Yu, Gervais, "Cyclic Arbitrage in
Decentralized Exchanges" (arXiv:2105.02784). [C1] CLRS, Problem 24-3. [C2]
cp-algorithms, Bellman–Ford. Full list in [references](references.md).*
