-- Triviu public dashboard · executions by route (failures included)
-- One row per token cycle, with successes and reverts side by side. No route is
-- hidden because it performed badly — that is the point.
--
-- Placeholders resolved at first deployment:
--   {{executor_address}} · {{chain}} · {{cycle_executed_topic}}
--
-- Route identity comes from the CycleExecuted event's `asset` (the cycle's
-- start/end token). Per-leg routing lives in calldata; this view aggregates by
-- the settled asset, which is what the on-chain profit check is denominated in.

WITH executed AS (
  SELECT
    evt_tx_hash AS hash,
    bytearray_ltrim(topic2) AS asset            -- indexed `asset`
  FROM {{chain}}.logs
  WHERE contract_address = {{executor_address}}
    AND topic0 = 0x{{cycle_executed_topic}}
),
attempts AS (
  SELECT hash, tx_success
  FROM (
    SELECT t.hash, t.success AS tx_success
    FROM {{chain}}.transactions t
    WHERE t."to" = {{executor_address}}
      AND SUBSTRING(t.data FROM 1 FOR 4) = 0x26485409
  ) x
)
SELECT
  COALESCE(e.asset, 0x00)                    AS asset,
  COUNT(*)                                   AS attempts,
  COUNT(e.hash)                              AS successes,
  COUNT(*) - COUNT(e.hash)                   AS reverts
FROM attempts a
LEFT JOIN executed e ON a.hash = e.hash
GROUP BY 1
ORDER BY attempts DESC;
