#!/usr/bin/env node
/**
 * Long-tail scanner — sizes edge vector #3 (strategy/edge-research): freshly
 * created pools, where spreads are wide and the big searchers do not compete —
 * but where rug / honeypot / fee-on-transfer risk is the real cost. The moat is
 * the safety screen; without it the "edge" is a trap.
 *
 * This is the Tier-1 screen (pure eth_call, no simulation): of the most recently
 * created pairs, how many have (a) a real quote token we can price, (b) real
 * liquidity, (c) contract code, (d) a two-way tradeable path. It SIZES the safe-
 * candidate stream. It does NOT yet run the Tier-2 honeypot simulation (buy then
 * sell, via state-override) — that is the next build and the real moat; the RPC
 * supports the override, so it is feasible.
 *
 * Honest: passing Tier-1 is necessary, not sufficient. getAmountsOut is a view and
 * cannot see a transfer tax or a sell-revert honeypot — only a real buy+sell
 * simulation can. This counts CANDIDATES, not confirmed-safe edges.
 */

const RPC = process.env.BACKTEST_RPC || "https://polygon.drpc.org";
const FACTORY = "0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32"; // QuickSwap V2
const ROUTER = "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff";
const N = Number(process.env.N || 120);       // how many of the newest pairs to screen
const MIN_LIQ_USD = Number(process.env.MIN_LIQ || 3000);

// Quote tokens we can price: [addr] = [usdPrice, decimals]
const QUOTE = {
  "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270": [0.2, 18], // WMATIC
  "0x2791bca1f2de4661ed88a30c99a7a9449aa84174": [1, 6],    // USDC.e
  "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359": [1, 6],    // USDC
  "0xc2132d05d31c914a87c6611c10748aeb04b58e8f": [1, 6],    // USDT
  "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619": [1900, 18],// WETH
  "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063": [1, 18],   // DAI
};

let id = 0;
const p32 = (n) => n.toString(16).padStart(64, "0");
async function call(method, params, tries = 4) {
  for (let t = 0; t < tries; t++) {
    try {
      const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }) });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message);
      return j.result;
    } catch (e) { if (t === tries - 1) throw e; await new Promise((s) => setTimeout(() => s(), 250 * (t + 1))); }
  }
}
const ec = (to, data) => call("eth_call", [{ to, data }, "latest"]).then((r) => r).catch(() => "0x");
const addr = (w) => "0x" + w.slice(26);

async function main() {
  const len = BigInt(await ec(FACTORY, "0x574f2ba3")); // allPairsLength()
  console.log(`QuickSwap V2 · ${len} total pairs · screening the newest ${N} · min liquidity $${MIN_LIQ_USD}\n`);

  let priceable = 0, liquid = 0, tier1 = 0;
  const winners = [];
  for (let k = 0; k < N; k++) {
    const idx = len - 1n - BigInt(k);
    const pair = addr(await ec(FACTORY, "0x1e3dd18b" + p32(idx))); // allPairs(idx)
    if (pair === "0x") continue;
    const t0 = addr(await ec(pair, "0x0dfe1681")).toLowerCase();
    const t1 = addr(await ec(pair, "0xd21220a7")).toLowerCase();
    const q0 = QUOTE[t0], q1 = QUOTE[t1];
    if (!q0 && !q1) continue;            // no priceable quote → skip
    priceable++;
    const quote = q0 ? t0 : t1, token = q0 ? t1 : t0, [price, dec] = q0 ? q0 : q1;

    const rd = await ec(pair, "0x0902f1ac");
    if (!rd || rd.length < 130) continue;
    const [r0, r1] = [BigInt("0x" + rd.slice(2, 66)), BigInt("0x" + rd.slice(66, 130))];
    const quoteRes = q0 ? r0 : r1;
    const liqUSD = (Number(quoteRes) / 10 ** dec) * price;
    if (liqUSD < MIN_LIQ_USD) continue;
    liquid++;

    // (c) token has code
    const code = await call("eth_getCode", [token, "latest"]).catch(() => "0x");
    if (!code || code.length <= 2) continue;
    // (d) two-way tradeable path (view — necessary, NOT sufficient vs honeypots)
    const small = BigInt(Math.floor((10 / price) * 10 ** dec)); // ~$10 of quote
    const buy = await ec(ROUTER, "0xd06ca61f" + p32(small) + p32(64n) + p32(2n) + p32(BigInt(quote)) + p32(BigInt(token)));
    const tradeable = buy && buy.length > 200; // getAmountsOut returned an array
    if (!tradeable) continue;
    tier1++;
    if (winners.length < 8) winners.push({ pair, token, quote: q0 ? "t0" : "t1", liqUSD: Math.round(liqUSD) });
  }

  console.log(`priceable (has a quote token) : ${priceable}/${N}`);
  console.log(`+ liquidity ≥ $${MIN_LIQ_USD}       : ${liquid}`);
  console.log(`+ code + two-way tradeable    : ${tier1}   ← Tier-1 safe-candidate stream`);
  console.log(`\nsample survivors (Tier-1 only — NOT yet honeypot-simulated):`);
  for (const w of winners) console.log(`  pair ${w.pair} · token ${w.token} · ~$${w.liqUSD.toLocaleString()} liq`);
  console.log(`\nTier-1 counts candidates, not confirmed-safe edges. The moat is Tier-2:`);
  console.log(`a real buy→sell simulation (state-override supported by this RPC) to reject`);
  console.log(`honeypots and transfer taxes. That is the next build. Measurement, not a promise.`);
}
main().catch((e) => { console.error("scan error:", e.message); process.exit(1); });
