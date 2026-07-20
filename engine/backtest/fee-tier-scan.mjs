#!/usr/bin/env node
/**
 * Fee-tier arb scanner — depth-aware, executable price (not mid-price).
 *
 * Tests edge vector #1 from strategy/edge-research: a stable pair (USDT/USDC.e)
 * whose cross-venue spread (measured 0.3–0.54%) is uncapturable on 0.3% V2 pools
 * but MAY clear through low-fee venues (Uniswap V3 0.01% / 0.05%).
 *
 * It prices a real round trip — USDC.e → USDT on one venue, USDT → USDC.e on
 * another — at a real size, using the Uniswap V3 QuoterV2 (which accounts for
 * concentrated liquidity + the pool fee) for V3 legs and constant-product math
 * for V2 legs. Both legs at the same notional (valid for a ~1:1 stable pair). A
 * round trip profits when buyRate_i · sellRate_j > 1 + gas/size, over all venue
 * pairs i ≠ j. Measured across historical blocks → the real distribution.
 *
 * HONEST: this is executable price at end-of-block. It still cannot see the
 * intra-block race (§8). A positive count here is a real, if contested, edge;
 * a zero count kills the vector honestly. It is a measurement, never a promise.
 */

const RPC = process.env.BACKTEST_RPC || "https://polygon.drpc.org";
const SAMPLES = Number(process.env.SAMPLES || 80);
const STEP = Number(process.env.STEP || 4000);
const SIZE_USDCE = BigInt(process.env.SIZE || 10000) * 10n ** 6n; // 10k USDC.e (6 dec)
// Gas for a 2-leg swap (~200k units × 50 gwei ≈ 0.01 POL ≈ $0.003) is negligible on
// a 10k stable trade — under 0.001 bps. We subtract a CONSERVATIVE 0.2 bps to stand
// in for gas + any residual friction, far above the real value. The binding cost is
// the swap fee, already inside the Quoter/CPMM output.
const GAS_BPS = 0.2;

const USDCe = "0x2791bca1f2de4661ed88a30c99a7a9449aa84174"; // 6 dec
const USDT = "0xc2132d05d31c914a87c6611c10748aeb04b58e8f";  // 6 dec
const V3FACTORY = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
const QUOTER = "0x61fFE014bA17989E743c5F6cB21bF9697530B21e"; // QuoterV2
const QUICK = "0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32";
const SUSHI = "0xc35DADB65012eC5796536bD9864eD8773aBc74C4";

let id = 0;
const pad = (a) => "000000000000000000000000" + a.replace("0x", "").toLowerCase();
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
const getPoolV3 = (a, b, fee) => call("eth_call", [{ to: V3FACTORY, data: "0x1698ee82" + pad(a) + pad(b) + p32(BigInt(fee)) }, "latest"]).then((r) => r && r !== "0x" ? "0x" + r.slice(26) : null);
const getPairV2 = (f, a, b) => call("eth_call", [{ to: f, data: "0xe6a43905" + pad(a) + pad(b) }, "latest"]).then((r) => r && r !== "0x" ? "0x" + r.slice(26) : null);
const token0 = (p) => call("eth_call", [{ to: p, data: "0x0dfe1681" }, "latest"]).then((r) => "0x" + r.slice(26));
const reservesAt = (p, blk) => call("eth_call", [{ to: p, data: "0x0902f1ac" }, blk]).then((r) => r && r.length >= 130 ? [BigInt("0x" + r.slice(2, 66)), BigInt("0x" + r.slice(66, 130))] : null);
// QuoterV2.quoteExactInputSingle((tokenIn,tokenOut,amountIn,fee,sqrtPriceLimitX96)) -> amountOut
const quoteV3 = (tin, tout, amtIn, fee, blk) =>
  call("eth_call", [{ to: QUOTER, data: "0xc6a5026a" + pad(tin) + pad(tout) + p32(BigInt(amtIn)) + p32(BigInt(fee)) + p32(0n) }, blk])
    .then((r) => (r && r !== "0x" ? BigInt("0x" + r.slice(2, 66)) : 0n))
    .catch(() => 0n);

function cpmmOut(amtIn, rIn, rOut) { if (amtIn <= 0n || rIn <= 0n || rOut <= 0n) return 0n; const f = amtIn * 9970n; return (f * rOut) / (rIn * 10000n + f); }

async function main() {
  const latest = parseInt(await call("eth_blockNumber", []), 16);
  // Resolve venues once.
  const v3 = {};
  for (const fee of [100, 500, 3000]) v3[fee] = await getPoolV3(USDT, USDCe, fee);
  const qP = await getPairV2(QUICK, USDT, USDCe), sP = await getPairV2(SUSHI, USDT, USDCe);
  const qT0 = qP ? (await token0(qP)).toLowerCase() : null, sT0 = sP ? (await token0(sP)).toLowerCase() : null;
  console.log(`fee-tier scan · USDT/USDC.e · size ${SIZE_USDCE / 10n ** 6n} USDC.e · ${SAMPLES} blocks @${STEP}`);
  console.log(`venues: V3[0.01%]${v3[100] ? "✓" : "✗"} V3[0.05%]${v3[500] ? "✓" : "✗"} V3[0.3%]${v3[3000] ? "✓" : "✗"} QuickV2${qP ? "✓" : "✗"} SushiV2${sP ? "✓" : "✗"}\n`);

  let read = 0, profit = 0, maxNetBps = -1e9, maxPair = "";
  const SIZE = Number(SIZE_USDCE);
  for (let i = 0; i < SAMPLES; i++) {
    const blk = "0x" + (latest - i * STEP).toString(16);
    // buyRate = USDT out per USDC.e in ; sellRate = USDC.e out per USDT in — both at SIZE notional.
    const buy = {}, sell = {};
    try {
      for (const fee of [100, 500, 3000]) {
        if (!v3[fee]) continue;
        buy[`v3_${fee}`] = Number(await quoteV3(USDCe, USDT, SIZE_USDCE, fee, blk)) / SIZE;
        sell[`v3_${fee}`] = Number(await quoteV3(USDT, USDCe, SIZE_USDCE, fee, blk)) / SIZE;
      }
      for (const [name, pool, t0] of [["quick", qP, qT0], ["sushi", sP, sT0]]) {
        if (!pool) continue;
        const r = await reservesAt(pool, blk);
        if (!r) continue;
        const [rUSDT, rUSDCe] = t0 === USDT.toLowerCase() ? [r[0], r[1]] : [r[1], r[0]];
        buy[name] = Number(cpmmOut(SIZE_USDCE, rUSDCe, rUSDT)) / SIZE;  // USDC.e -> USDT
        sell[name] = Number(cpmmOut(SIZE_USDCE, rUSDT, rUSDCe)) / SIZE; // USDT -> USDC.e
      }
    } catch { continue; }
    const buys = Object.entries(buy), sells = Object.entries(sell);
    if (!buys.length || !sells.length) continue;
    read++;
    // best round trip over venue pairs i != j: final per 1 in = buyRate_i * sellRate_j
    let best = 0, bestPair = "";
    for (const [bi, br] of buys) for (const [sj, sr] of sells) { if (bi === sj) continue; const rt = br * sr; if (rt > best) { best = rt; bestPair = `buy ${bi} / sell ${sj}`; } }
    const netBps = (best - 1) * 10000 - GAS_BPS;
    if (netBps > maxNetBps) { maxNetBps = netBps; maxPair = bestPair; }
    if (netBps > 0) profit++;
  }

  console.log(`blocks read       : ${read}/${SAMPLES}`);
  console.log(`round trips > 0 net (after fees+gas): ${profit}  (${read ? ((100 * profit) / read).toFixed(1) : 0}%)`);
  console.log(`best net observed : ${maxNetBps.toFixed(2)} bps  (${(maxNetBps / 100).toFixed(3)}% on ${SIZE_USDCE / 10n ** 6n} USDC.e)  [${maxPair}]`);
  console.log(`\nDepth-aware (QuoterV2), executable price, end-of-block. Positive = a real (contested)`);
  console.log(`edge existed; it does NOT include the intra-block race (§8). Measurement, not a promise.`);
}
main().catch((e) => { console.error("scan error:", e.message); process.exit(1); });
