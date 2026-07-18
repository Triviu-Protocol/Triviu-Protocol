# References

Every load-bearing claim in this whitepaper is traceable to a primary source.
"Don't trust: verify" applies to this document too.

## AMM mathematics

- **[U2]** Adams, Zinsmeister, Salem, Keefer, Robinson — *Uniswap v2 Core*
  whitepaper. The fee-adjusted invariant and the `997/1000` swap formula.
  `https://app.uniswap.org/whitepaper.pdf` · Contract source of truth:
  `UniswapV2Library.sol`,
  `https://github.com/Uniswap/v2-periphery/blob/master/contracts/libraries/UniswapV2Library.sol`
- **[U3]** Adams et al. — *Uniswap v3 Core* whitepaper; Uniswap "v3 Math Primer"
  (`sqrtPriceX96`, Q64.96). `https://app.uniswap.org/whitepaper-v3.pdf` ·
  `https://blog.uniswap.org/uniswap-v3-math-primer`
- **[P1]** Paradigm Research — *Understanding Automated Market Makers, Part 1:
  Price Impact*. `https://research.paradigm.xyz/amm-price-impact`
- **[W1]** Wang, Chen, Xu, Yu, Gervais (ETH Zurich) — *Cyclic Arbitrage in
  Decentralized Exchanges*. Profitability condition and optimal input size.
  arXiv:2105.02784 · `https://arxiv.org/pdf/2105.02784`

## Detection algorithm

- **[C1]** Cormen, Leiserson, Rivest, Stein — *Introduction to Algorithms* (CLRS),
  Problem 24-3, "Arbitrage": the `−log` reduction to negative-cycle detection.
- **[C2]** cp-algorithms — *Bellman–Ford* and negative-cycle detection, `O(V·E)`.
  `https://cp-algorithms.com/graph/bellman_ford.html`

## MEV and the economic reality (Polygon)

- **[1]** *FastLane auction bidding dynamics and searcher concentration* — 223,356
  opportunity transactions (Dec 2024 – Sep 2025); ~17 unique searchers, 5–8 active
  at a time, ~250 ms auction window. arXiv:2510.14642 ·
  `https://arxiv.org/html/2510.14642v1`
- **[2]** *Polygon atomic-arbitrage MEV census* (Jan 2023 – Oct 2024, ~23M
  blocks): ~US$12M extracted, >75% to validators. arXiv:2508.21473 ·
  `https://arxiv.org/abs/2508.21473`
- **[3]** Polygon — *Private Mempool* announcement and PIP-64 (Validator-Elected
  Block Producer). `https://polygon.technology/blog` ·
  `https://forum.polygon.technology/t/pip-64-validator-elected-block-producer/20918`
- Flashbots — *Frontrunning, MEV, and the crisis* (priority gas auctions,
  backrunning). `https://writings.flashbots.net/frontrunning-mev-crisis`

## Infrastructure

- **Aave v3** flash loans — 0.05% premium, repay-or-revert atomicity.
  `https://aave.com/docs/aave-v3/guides/flash-loans`
- **Balancer** Vault flash loans — zero protocol fee (governance parameter).
- **FastLane / Atlas** on Polygon — validator-centric MEV auction framework.
  `https://github.com/FastLane-Labs/atlas`
- **Uniswap v3 fee tiers** — 0.01% / 0.05% / 0.30% / 1.00%.
  `https://support.uniswap.org/hc/en-us/articles/20904283758349`

## Lineage

- Nakamoto, S. — *Bitcoin: A Peer-to-Peer Electronic Cash System* (2008). The
  origin of "don't trust, verify."
- Buterin, V. — *Ethereum: A Next-Generation Smart Contract and Decentralized
  Application Platform* (2013).
