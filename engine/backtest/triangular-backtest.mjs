#!/usr/bin/env node
/**
 * Triangular arbitrage backtest — REAL Polygon pools, historical blocks.
 *
 * This answers one question honestly: across real QuickSwap V2 pools, at real
 * historical blocks, did a profitable triangular cycle exist after fees and gas?
 *
 * It reuses the engine's constant-product math (monitor/pools.ts:85 · f = 1 −
 * feeBps/10000, out = in·0.997·rOut / (rIn + in·0.997)), reads each pool's
 * reserves at each sampled block via an archive RPC, finds the profit-maximizing
 * input size numerically, and records the net result (both cycle directions).
 *
 * HONEST BOUNDARY (read this before reading any number it prints):
 *   - It reads END-OF-BLOCK reserves — the state AFTER the block's own arbitrage
 *     already ran. So it measures the RESIDUAL mispricing left at block close,
 *     NOT an edge you could have captured: a searcher takes the intra-block edge
 *     in the same block (whitepaper §8). A result near zero is the EXPECTED,
 *     honest finding — it is evidence the market is efficient at block
 *     granularity, not a disappointment.
 *   - It is a measurement of reality. It is NOT a promise, a forecast, or a claim
 *     that operations are profitable. Possibility is not probability.
 *
 * Usage:
 *   node triangular-backtest.mjs                  # default: 150 blocks, drpc archive
 *   BACKTEST_RPC=<archive-url> BACKTEST_SAMPLES=200 node triangular-backtest.mjs
 */

import { writeFileSync } from "node:fs";

const RPC = process.env.BACKTEST_RPC || "https://polygon.drpc.org";
const SAMPLES = Number(process.env.BACKTEST_SAMPLES || 150);
const STEP = Number(process.env.BACKTEST_STEP || 3000); // ~ block spacing between samples
const GAS_UNITS = BigInt(process.env.BACKTEST_GAS_UNITS || 250000); // executeCycle ballpark
const GAS_PRICE_WEI = BigInt(process.env.BACKTEST_GAS_GWEI || 50) * 1_000_000_000n; // POL = WMATIC (18)
const FEE_BPS = 30n; // QuickSwap V2 pool fee, per hop (0.30%)
const SUCCESS_FEE_BPS = 3000n; // Triviu success fee on profit only (illustrative)

// Real QuickSwap V2 pools (verified on-chain 2026-07-20). Reserve layout confirmed
// via token0(): P1/P3 token0 = WMATIC, P2 token0 = USDC.e.
const P1 = "0x6e7a5FAFcec6BB1e78bAE2A1F0B612012BF14827"; // WMATIC(res0) / USDC.e(res1)
const P2 = "0x853ee4b2a13f8a742d64c8f088be7ba2131f670d"; // USDC.e(res0) / WETH(res1)
const P3 = "0xadbf1854e5883eb8aa7baf50705338739e558e5b"; // WMATIC(res0) / WETH(res1)

const GET_RESERVES = "0x0902f1ac";
let rpcId = 0;

async function rpc(method, params, tries = 4) {
  for (let t = 0; t < tries; t++) {
    try {
      const res = await fetch(RPC, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
      });
      const j = await res.json();
      if (j.error) throw new Error(j.error.message);
      return j.result;
    } catch (e) {
      if (t === tries - 1) throw e;
      await sleep(300 * (t + 1)); // back off on rate-limit
    }
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(() => r(), ms));

// getReserves() -> (uint112 reserve0, uint112 reserve1, uint32 ts)
async function reserves(pool, blockHex) {
  const data = await rpc("eth_call", [{ to: pool, data: GET_RESERVES }, blockHex]);
  const r0 = BigInt("0x" + data.slice(2, 66));
  const r1 = BigInt("0x" + data.slice(66, 130));
  return [r0, r1];
}

// Constant-product output with the pool fee applied to the input (UniV2 / engine math).
function amountOut(amtIn, rIn, rOut) {
  if (amtIn <= 0n || rIn <= 0n || rOut <= 0n) return 0n;
  const inFee = amtIn * (10_000n - FEE_BPS);
  return (inFee * rOut) / (rIn * 10_000n + inFee);
}

// One full cycle for a given direction, returning WMATIC out for a WMATIC input.
// dir 'fwd' = WMATIC→USDC.e→WETH→WMATIC ; 'rev' = WMATIC→WETH→USDC.e→WMATIC.
function cycleOut(amtIn, dir, p1, p2, p3) {
  if (dir === "fwd") {
    const a = amountOut(amtIn, p1[0], p1[1]); // P1 WMATIC->USDC.e
    const b = amountOut(a, p2[0], p2[1]);      // P2 USDC.e->WETH
    return amountOut(b, p3[1], p3[0]);         // P3 WETH->WMATIC
  } else {
    const a = amountOut(amtIn, p3[0], p3[1]);  // P3 WMATIC->WETH
    const b = amountOut(a, p2[1], p2[0]);      // P2 WETH->USDC.e
    return amountOut(b, p1[1], p1[0]);         // P1 USDC.e->WMATIC
  }
}

// Profit-maximizing input, found numerically (concave in size). Coarse log grid
// then a local refine — the same "optimal size, not maximal size" the whitepaper
// §3.5 describes, without assuming a closed form.
function bestGross(dir, p1, p2, p3, ceil) {
  let best = { gross: -(2n ** 255n), amtIn: 0n, out: 0n };
  const consider = (amtIn) => {
    if (amtIn <= 0n || amtIn >= ceil) return;
    const out = cycleOut(amtIn, dir, p1, p2, p3);
    const gross = out - amtIn;
    if (gross > best.gross) best = { gross, amtIn, out };
  };
  // coarse: 1e12 .. ceil, ~1.6x steps
  for (let x = 1_000_000_000_000n; x < ceil; x = (x * 8n) / 5n) consider(x);
  // refine around the coarse best
  if (best.amtIn > 0n) {
    const lo = best.amtIn / 2n, hi = best.amtIn * 2n;
    for (let k = 0n; k <= 20n; k++) consider(lo + ((hi - lo) * k) / 20n);
  }
  return best;
}

function fmt(wei, dec = 18, prec = 6) {
  const neg = wei < 0n;
  let v = neg ? -wei : wei;
  const base = 10n ** BigInt(dec);
  const whole = v / base;
  const frac = ((v % base) * 10n ** BigInt(prec)) / base;
  return (neg ? "-" : "") + whole.toString() + "." + frac.toString().padStart(prec, "0");
}

async function main() {
  const latest = parseInt(await rpc("eth_blockNumber", []), 16);
  const gasCostWmatic = GAS_UNITS * GAS_PRICE_WEI; // POL == WMATIC, 18 decimals
  console.log(`RPC ${RPC} · latest ${latest} · sampling ${SAMPLES} blocks every ${STEP} (~${((SAMPLES * STEP * 2) / 86400).toFixed(1)}d)`);
  console.log(`gas assumption: ${GAS_UNITS} units × ${GAS_PRICE_WEI / 1_000_000_000n} gwei = ${fmt(gasCostWmatic)} WMATIC/cycle\n`);

  const rows = [];
  let edgeAfterGas = 0, edgeAfterFee = 0, read = 0;
  let bestSeen = { netGas: -(2n ** 255n) };

  for (let i = 0; i < SAMPLES; i++) {
    const block = latest - i * STEP;
    const hex = "0x" + block.toString(16);
    let p1, p2, p3;
    try {
      [p1, p2, p3] = await Promise.all([reserves(P1, hex), reserves(P2, hex), reserves(P3, hex)]);
    } catch (e) {
      continue; // block/state not served — skip, counted by `read`
    }
    read++;

    const ceil = p1[0] < p3[0] ? p1[0] : p3[0]; // don't size beyond the shallower WMATIC leg
    const fwd = bestGross("fwd", p1, p2, p3, ceil);
    const rev = bestGross("rev", p1, p2, p3, ceil);
    const win = fwd.gross >= rev.gross ? { dir: "fwd", ...fwd } : { dir: "rev", ...rev };

    const netGas = win.gross - gasCostWmatic;
    const feeCut = netGas > 0n ? (netGas * SUCCESS_FEE_BPS) / 10_000n : 0n;
    const netUser = netGas - feeCut;

    if (netGas > 0n) edgeAfterGas++;
    if (netUser > 0n) edgeAfterFee++;
    if (netGas > bestSeen.netGas) bestSeen = { block, dir: win.dir, size: win.amtIn, gross: win.gross, netGas };

    rows.push({ block, dir: win.dir, grossWmatic: win.gross.toString(), netAfterGas: netGas.toString(), netAfterFee: netUser.toString() });
  }

  // --- distribution (evidence, not a claim) ---
  console.log(`=== REAL triangular backtest · WMATIC → USDC.e → WETH → WMATIC (both directions) ===`);
  console.log(`blocks read (archive served) : ${read}/${SAMPLES}`);
  console.log(`blocks with a NET edge > 0 after gas       : ${edgeAfterGas}  (${read ? ((100 * edgeAfterGas) / read).toFixed(1) : 0}%)`);
  console.log(`blocks with a NET edge > 0 after gas + fee : ${edgeAfterFee}  (${read ? ((100 * edgeAfterFee) / read).toFixed(1) : 0}%)`);
  if (bestSeen.netGas > -(2n ** 255n)) {
    console.log(`best single block (after gas): +${fmt(bestSeen.netGas)} WMATIC @ block ${bestSeen.block} (${bestSeen.dir}, size ${fmt(bestSeen.size)} WMATIC)`);
  }
  console.log(`\nHonest reading: this is the residual edge at END-OF-BLOCK — after the block's own`);
  console.log(`arbitrage already ran. It measures whether a mispricing was LEFT, not whether it was`);
  console.log(`capturable. A near-zero result is the whitepaper §8 reality, measured — not a promise.`);

  const out = {
    generatedAgainst: RPC,
    latestBlock: latest,
    samples: SAMPLES,
    step: STEP,
    blocksRead: read,
    gas: { units: GAS_UNITS.toString(), gweiPrice: (GAS_PRICE_WEI / 1_000_000_000n).toString() },
    edgeAfterGas,
    edgeAfterFee,
    rows,
  };
  writeFileSync(new URL("./results-latest.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
  console.log(`\nwrote results-latest.json (${rows.length} rows).`);
}

main().catch((e) => {
  console.error("backtest error:", e.message);
  process.exit(1);
});
