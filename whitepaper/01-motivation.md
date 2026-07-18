# 1. Motivation — don't trust, verify

Decentralized finance was built to remove trusted intermediaries. Yet a large
part of it has quietly rebuilt them. "Profit bots" are sold as black boxes:
closed code, unverifiable results, and marketing built on income expectations.
The user is invited to trust — precisely where the whole point of the technology
was to let them verify.

This is the old model wearing new clothes. In the old model, you hand your money
and your faith to something you cannot inspect, and hope. Bitcoin's founding
insight was the inversion of exactly that: *don't trust, verify.* Satoshi
Nakamoto did not sell access to a system — a paper and working code were
published, and anyone could check every claim. The value was never a promise; it
was the ability to confirm one, or to refute it.

Triviu applies that insight to a specific, saturated corner of DeFi: triangular
arbitrage on decentralized exchanges. Instead of selling access to a black box,
we publish the box open — the contract, the engine, the simulator, the
parameters, the audit reports, and, with equal prominence, the real economic
limits of the strategy. Where a "profit bot" shows you a screenshot of gains,
Triviu shows you the math that explains why those gains are unlikely to be yours.

## The inversion, concretely

| The black-box model | The Triviu model |
|---|---|
| Closed code | Open source (AGPL-3.0), verified on-chain |
| "Trust our results" | Public execution data, failures included |
| Income promises | Documented zero-or-negative expectation, with sources |
| Hidden fees or custody | Success fee only — on-chain, non-custodial, capped in bytecode |
| A product you rent | A tool you read, audit and run yourself |

Everything that follows is that box, open. Every capability is stated next to its
cost; every number that can be checked is sourced; every limit is named. If a
claim cannot be verified from the code, the chain, or a cited source, it does not
belong in this document — and it does not belong to Triviu.
