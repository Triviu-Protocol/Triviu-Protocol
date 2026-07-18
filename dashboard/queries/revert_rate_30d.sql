-- Triviu public dashboard · revert rate (30 days)
-- Principle: a metric without its failure context is marketing; a metric with
-- failures included is evidence. This query counts BOTH successful cycles and
-- reverted attempts, so the published number is the honest one.
--
-- Placeholders resolved at first testnet/mainnet deployment:
--   {{executor_address}} · TriviuExecutor address (verified on Polygonscan)
--   {{chain}}            · Dune table prefix, e.g. polygon
--
-- Success = a CycleExecuted event. Attempt = any transaction whose `to` is the
-- executor and whose input selector is executeCycle (0x26485409). Reverts are
-- attempts that emitted no CycleExecuted in the same tx.

WITH attempts AS (
  SELECT
    t.block_time,
    t.hash,
    t.success AS tx_success
  FROM {{chain}}.transactions t
  WHERE t."to" = {{executor_address}}
    AND SUBSTRING(t.data FROM 1 FOR 4) = 0x26485409  -- executeCycle selector
    AND t.block_time > NOW() - INTERVAL '30' DAY
),
executed AS (
  SELECT evt_tx_hash AS hash
  FROM {{chain}}.logs
  WHERE contract_address = {{executor_address}}
    -- keccak256("CycleExecuted(address,address,uint256,uint256)")
    AND topic0 = 0x{{cycle_executed_topic}}
)
SELECT
  COUNT(*)                                                          AS total_attempts,
  COUNT(e.hash)                                                     AS successful_cycles,
  COUNT(*) - COUNT(e.hash)                                          AS reverted_attempts,
  ROUND(100.0 * (COUNT(*) - COUNT(e.hash)) / NULLIF(COUNT(*), 0), 1) AS revert_rate_pct
FROM attempts a
LEFT JOIN executed e ON a.hash = e.hash;
