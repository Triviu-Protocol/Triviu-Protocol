# Public dashboard — specification

Triviu has no public testnet phase. The first time anyone sees the protocol run is
**on mainnet**. That makes the public dashboard the single living proof of *don't
trust, verify* — so its rules are not stylistic, they are constitutional.

## The permanent rule (non-negotiable)

**Failures appear with the same prominence as successes.** A metric without its
failure context is marketing; a metric with failures included is evidence — and
Triviu ships only the second. No panel may show successful cycles without the
reverts in the same view, at the same weight. This rule does not change in any
version.

Corollary (§7): *if it cannot be verified, it does not ship as a claim.* Every
number on the dashboard traces to a public on-chain event or balance, readable by
anyone against the block explorer.

## Timing (also non-negotiable)

- The dashboard is **live from the first mainnet transaction**, in real time.
- It is **published simultaneously with the first deploy — never after.** Shipping
  contracts to mainnet without the public dashboard already live would be exactly
  the metric-without-context this project refuses.

## Panels → queries

Every panel is backed by a query in [`queries/`](queries/), each written with
failures included from the start. Placeholders (`{{executor_address}}`,
`{{treasury_address}}`, `{{chain}}`, `{{cycle_executed_topic}}`) are resolved once,
at first deploy, against the verified on-chain addresses.

| Panel | Source | Shows |
|---|---|---|
| **Executions by route** | [`executions_by_route.sql`](queries/executions_by_route.sql) | Attempts, successes and **reverts** per settled asset. No route hidden for performing badly. |
| **Revert rate (rolling)** | [`revert_rate_30d.sql`](queries/revert_rate_30d.sql) | Total attempts, successful cycles, reverted attempts, and the revert-rate % over a rolling 30-day window. |
| **Gas vs net result** | [`gas_vs_net_result.sql`](queries/gas_vs_net_result.sql) | Native gas spent across **all** attempts (reverts burn gas too) vs the profit that actually settled. The gap is the real cost. |
| **Treasury (public)** | [`treasury_balance.sql`](queries/treasury_balance.sql) | The treasury address and its on-chain balance per fee asset — the fee actually taken, verifiable, never a claimed figure. |

## What the dashboard must never do

- Never show a success count without its reverts beside it.
- Never present an aggregate profit as an expected or forecast return (§8: for an
  individual the expected result tends to zero — the dashboard reports history, not
  a promise).
- Never hide a route, a day, or an asset because the numbers look bad. Bad numbers
  are the evidence.

## Deploy checklist (runs WITH the first mainnet deploy)

1. Resolve every placeholder against the **verified** on-chain addresses (Executor,
   treasury) — confirm each on the explorer first.
2. Build the four panels from the queries above, failures included by construction.
3. Publish the dashboard **before or at** the deploy transaction — confirm it reads
   the first tx.
4. Link it from the site `/dashboard` page and the whitepaper §7.
5. From then on, it is append-only history: never retro-edit a bad day out.
