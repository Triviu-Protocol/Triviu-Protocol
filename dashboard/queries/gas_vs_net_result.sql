-- Triviu public dashboard · gas spent vs. aggregate net result
-- The honest bottom line: what the executor paid in gas across ALL attempts
-- (reverts included — they still burn gas) versus the profit that actually
-- settled on successful cycles. The gap is the real cost of learning.
--
-- Placeholders resolved at first deployment:
--   {{executor_address}} · {{chain}} · {{cycle_executed_topic}}
--
-- `profit` is the 4th CycleExecuted arg (uint256, in `asset` units). Because
-- assets differ in decimals/value, aggregate profit is shown per asset; convert
-- to a common unit in the dashboard layer with a price feed if desired.

WITH executed AS (
  SELECT
    evt_tx_hash AS hash,
    bytearray_ltrim(topic2) AS asset,
    bytearray_to_uint256(bytearray_substring(data, 33, 32)) AS profit
  FROM {{chain}}.logs
  WHERE contract_address = {{executor_address}}
    AND topic0 = 0x{{cycle_executed_topic}}
),
attempts AS (
  SELECT t.hash, t.gas_used, t.gas_price
  FROM {{chain}}.transactions t
  WHERE t."to" = {{executor_address}}
    AND SUBSTRING(t.data FROM 1 FOR 4) = 0x26485409
    AND t.block_time > NOW() - INTERVAL '30' DAY
)
SELECT
  COUNT(*)                                         AS attempts,
  COUNT(e.hash)                                    AS successes,
  COUNT(*) - COUNT(e.hash)                         AS reverts,
  SUM(a.gas_used * a.gas_price) / 1e18             AS total_gas_native,  -- POL
  SUM(COALESCE(e.profit, 0))                       AS gross_profit_raw   -- per-asset units
FROM attempts a
LEFT JOIN executed e ON a.hash = e.hash;
