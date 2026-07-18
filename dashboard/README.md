# Public dashboard (Dune)

Principle: a metric without its failure context is marketing; a metric with
failures included is evidence.

This directory versions the public dashboard's SQL queries. They are written now
and parameterized; they go live (and get linked from the root README) at the
first testnet/mainnet deployment, when the executor address exists.

## Queries

| File | What it shows |
|---|---|
| [`queries/revert_rate_30d.sql`](queries/revert_rate_30d.sql) | Revert rate over 30 days — attempts vs. successes vs. reverts |
| [`queries/executions_by_route.sql`](queries/executions_by_route.sql) | Executions per settled asset, reverts included per route |
| [`queries/gas_vs_net_result.sql`](queries/gas_vs_net_result.sql) | Gas burned across ALL attempts vs. profit that actually settled |

## Placeholders (resolved at deployment)

- `{{executor_address}}` — TriviuExecutor address, verified on Polygonscan
- `{{chain}}` — Dune table prefix (e.g. `polygon`)
- `{{cycle_executed_topic}}` — `keccak256("CycleExecuted(address,address,uint256,uint256)")`

Reverts are counted as attempts to the executor carrying the `executeCycle`
selector (`0x26485409`) that emitted no `CycleExecuted` in the same transaction.
Reverted transactions still pay gas — the gas query includes them on purpose.

TODO: publish the Dune dashboard and link it from the root README once the
first deployment exists.
