# 8. The economic reality — required reading

This chapter is part of the protocol's identity. Any distribution of Triviu that
omits it violates the spirit of the project. It exists because the honest number
is the one most projects hide: for an individual, the expected result is not a
gain.

## Arbitrage is a closed professional game

Atomic arbitrage on Polygon is not an open field. Independent academic study of
the FastLane/Atlas auction flow (223,356 opportunity transactions, Dec 2024 –
Sep 2025) found a searcher population that **never exceeded ~15 entities in any
week, with only 17 unique searchers across the entire ten-month period and
typically just 5–8 active at a time.** [1]

These operators compete inside a sealed-bid auction window of roughly **250
milliseconds** per opportunity — the time to detect the discrepancy, compute the
route, and submit a bid with an execution bundle. The same study documents
systematic bid escalation among experienced participants: a winner's-curse
dynamic where sophisticated players progressively raise their bids, and where a
well-tuned agent captures a large share of profit precisely because of strategy
and infrastructure, not open access. [1]

## Where the value actually goes

A separate census of Polygon atomic-arbitrage MEV (Jan 2023 – Oct 2024, ~23
million blocks) estimated roughly **US$12M** extracted from atomic arbitrage —
about **90%** of all backrunning MEV on the chain — and found that **more than
75% of the extracted value flows to validators** (through direct bids and gas
fees), with searchers keeping the remainder. [2]

Read those two facts together: a handful of professional searchers compete in
sub-second auctions for a pool of value most of which is captured by the block
producers above them. That is the market an individual with ordinary hardware is
invited, by the usual "profit bot," to enter.

## What this means for you, stated plainly

For most individual operators, the expected result after gas **and fee** tends
toward zero or negative. Triviu is educational and technical infrastructure — not
a source of income for the user, and it must not be presented as one by anyone,
including us. The protocol sustains itself through the
[success fee](05-success-fee.md) only on the cycles that do profit; the user is
never promised that theirs will be one of them.

## The specific risks

**Professional competition (MEV).** Most opportunities are captured by
professional searchers with private orderflow access (FastLane/Atlas), minimal
latency and capital to sustain bid escalation — and Polygon is moving toward
private-mempool routing that further removes visibility from public bots. [1][3]

**Gas and reverts.** Reverted transactions still pay gas up to the point of
revert; losing a priority auction is not free. Atomicity eliminates *market*
exposure — the cycle closes or everything reverts — but it does not eliminate
*cost*. The success fee, by contrast, is charged only on profit: a revert costs
gas but never a fee.

**Token risk.** Fee-on-transfer tokens, honeypots and manipulated liquidity
exist. The Registry whitelist mitigates; it does not eliminate. Fee-on-transfer
tokens are not supported and must not enter the whitelist.

**Contract risk.** Review reduces risk; no audit brings it to zero. The known
limitations of the current contracts are documented openly — see
[Security and audits](09-security-and-audits.md) and the Tradeoff Records in
`/decisions`.

**Infrastructure risk.** RPCs and data providers are trust points external to
the protocol; prefer self-hosted nodes or redundant providers.

## Why publish this at all

Because it is the difference between a tool and a trap. A protocol that teaches
you to read the code must also teach you to read the odds. Triviu's proposition
was never "you will profit" — it is "you will be able to verify," including
verifying, from public data, that the profit is unlikely. That honesty is the
product.

---

*References: [1] arXiv:2510.14642 — FastLane auction bidding dynamics and
searcher concentration. [2] arXiv:2508.21473 — Polygon atomic-arbitrage MEV
census. [3] Polygon private-mempool announcement and PIP-64. Full list in the
[references](references.md).*
