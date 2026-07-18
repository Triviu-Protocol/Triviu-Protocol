# 1. Motivation — don't trust, verify

The DeFi ecosystem is saturated with "profit bots" sold as black boxes: closed
code, unverifiable results and marketing built on income expectations. The user
is invited to trust exactly where they should be able to verify.

Bitcoin's central lesson was the inversion of that model: *don't trust, verify*.
Satoshi Nakamoto did not sell access to a system — they published a paper and
working code, and let anyone verify every claim. The value was not a promise; it
was the ability to check.

Triviu applies that principle to a specific domain: triangular arbitrage on DEXs.
Instead of selling access to a black box, we publish the box open — the contract,
the engine, the simulator, the parameters and, with equal prominence, the real
economic limits of this strategy.

## The inversion, concretely

| The black-box model | The Triviu model |
|---|---|
| Closed code | Open source (AGPL-3.0), verified on-chain |
| "Trust our results" | Public execution data, failures included |
| Income promises | Documented zero-or-negative expectation |
| Hidden fees / custody | Success fee only, on-chain, non-custodial, capped |
| A product you rent | A tool you read, audit and run yourself |

The rest of this document is the box, open. Every capability is stated next to
its cost. If a claim cannot be verified from the code or the chain, it does not
belong here.
