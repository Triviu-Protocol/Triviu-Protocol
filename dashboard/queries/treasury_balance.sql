-- Triviu public dashboard · treasury balance (public, per asset)
-- The success fee accrues to the treasury, in the cycle's own asset. This exposes
-- the treasury's on-chain position so anyone can verify it against the block
-- explorer — the fee the protocol has actually taken, in the open, never a claimed
-- figure. If the treasury is empty, the query shows empty; that is the honest state.
--
-- Placeholders resolved at first deployment:
--   {{treasury_address}} · the ParameterRegistry treasury (verify on the explorer)
--   {{chain}}            · Dune table prefix per chain, e.g. polygon
--
-- Coverage: ERC20 fee assets via net transfer position (works on any Dune chain).
-- Native POL, if ever used as a fee asset, is read directly on the explorer at the
-- treasury address — stated here so the boundary of this query is explicit, not hidden.

WITH flows AS (
  SELECT
    contract_address AS token,
    SUM(CASE WHEN "to"   = {{treasury_address}} THEN value ELSE 0 END) AS inflow,
    SUM(CASE WHEN "from" = {{treasury_address}} THEN value ELSE 0 END) AS outflow
  FROM erc20_{{chain}}.evt_Transfer
  WHERE "to" = {{treasury_address}} OR "from" = {{treasury_address}}
  GROUP BY 1
)
SELECT
  token,
  inflow,
  outflow,
  inflow - outflow AS balance_raw   -- in the token's own decimals; convert in the panel
FROM flows
WHERE inflow - outflow > 0
ORDER BY balance_raw DESC;
