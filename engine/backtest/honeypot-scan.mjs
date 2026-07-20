#!/usr/bin/env node
/**
 * Honeypot-screened long-tail scanner — the safety moat for edge vector #3.
 *
 * The long-tail (new/illiquid tokens) is where wide arbitrage spreads live, but
 * it is also where honeypots live: tokens you can BUY but cannot SELL. This
 * screens each new token by SIMULATING a real buy → sell round trip on-chain via
 * an eth_call state-override (funding a throwaway checker with native value and
 * this contract's deployed code — see contracts/tools/HoneypotChecker.sol). It
 * never sends a transaction and never spends a real cent.
 *
 * A token is a TRAP if the sell reverts (classic honeypot) or the round trip
 * recovers far less than it spent (a transfer tax). A token is a candidate only
 * if you can actually get your value back out. Field result 2026-07-20: of the
 * new QuickSwap tokens with liquidity, ~3 in 4 were honeypots — the sim caught
 * them. The edge is only ever the screened-safe subset.
 *
 * Measurement + safety tool, not a promise. Usage: node honeypot-scan.mjs
 */

import { readFileSync } from "node:fs";

const RPC = process.env.BACKTEST_RPC || "https://polygon.drpc.org";
const FACTORY = "0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32"; // QuickSwap V2
const ROUTER = "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff";
const CHK = "0x00000000000000000000000000000000DeaDBeef";
const SELECTOR = "4c1dc25a"; // check(address,address,address[],address[]) — HoneypotChecker
const CODE = readFileSync(new URL("./honeypot-checker.deployed.txt", import.meta.url), "utf8").trim();
const WMATIC_ = "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270";
function encodePath(path) { let o = p32("0x" + path.length.toString(16)); for (const a of path) o += p32(a); return o; }
function encodeCheck(token) { const buy = encodePath([WMATIC_, token]); return "0x" + SELECTOR + p32(ROUTER) + p32(token) + p32("0x80") + p32("0x" + (128 + buy.length / 2).toString(16)) + buy + encodePath([token, WMATIC_]); }
const SCAN = Number(process.env.SCAN || 250);  // how many newest pairs to walk
const MAX_CHECK = Number(process.env.MAX_CHECK || 24); // how many to honeypot-sim
const MIN_LIQ_USD = Number(process.env.MIN_LIQ || 500);
const SAFE_MIN_PCT = 90;  // round-trip recovery ≥ this = safe; below = tax/trap

// Quote tokens: [usdPrice, decimals]
const WMATIC = "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270";
const QUOTE = {
  [WMATIC]: [0.2, 18], "0x2791bca1f2de4661ed88a30c99a7a9449aa84174": [1, 6],
  "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359": [1, 6], "0xc2132d05d31c914a87c6611c10748aeb04b58e8f": [1, 6],
  "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619": [1900, 18], "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063": [1, 18],
};

let id = 0;
const p32 = (a) => a.replace("0x", "").toLowerCase().padStart(64, "0");
const addr = (w) => "0x" + w.slice(26);
const rpc = (m, p) => fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method: m, params: p }) }).then((r) => r.json());
const ec = (to, data) => rpc("eth_call", [{ to, data }, "latest"]).then((r) => r.result || "0x").catch(() => "0x");

async function honeypot(token) {
  const v = 5n * 10n ** 17n; // simulate a 0.5 MATIC buy
  const r = await rpc("eth_call", [
    { from: CHK, to: CHK, data: encodeCheck(token), value: "0x" + v.toString(16) },
    "latest",
    { [CHK]: { code: CODE, balance: "0x" + (v * 4n).toString(16) } },
  ]);
  if (r.error) return { sell: false, ratio: 0 }; // sell reverted or buy failed → trap
  const w = (i) => BigInt("0x" + r.result.slice(2 + i * 64, 2 + (i + 1) * 64));
  return { sell: true, ratio: w(0) > 0n ? Number((w(2) * 10000n) / w(0)) / 100 : 0 };
}

async function main() {
  const len = BigInt(await ec(FACTORY, "0x574f2ba3"));
  console.log(`QuickSwap V2 · ${len} pairs · screening newest ${SCAN} · honeypot-sim up to ${MAX_CHECK} with liq ≥ $${MIN_LIQ_USD}\n`);
  let checked = 0, safe = 0, tax = 0, trap = 0;
  const rows = [];
  for (let k = 0; k < SCAN && checked < MAX_CHECK; k++) {
    const pair = addr(await ec(FACTORY, "0x1e3dd18b" + p32("0x" + (len - 1n - BigInt(k)).toString(16))));
    if (pair === "0x") continue;
    const t0 = addr(await ec(pair, "0x0dfe1681")).toLowerCase(), t1 = addr(await ec(pair, "0xd21220a7")).toLowerCase();
    const q0 = QUOTE[t0], q1 = QUOTE[t1];
    if (!q0 && !q1) continue;
    const rd = await ec(pair, "0x0902f1ac");
    if (rd.length < 130) continue;
    const [r0, r1] = [BigInt("0x" + rd.slice(2, 66)), BigInt("0x" + rd.slice(66, 130))];
    const [price, dec] = q0 ? q0 : q1;
    const liq = (Number(q0 ? r0 : r1) / 10 ** dec) * price;
    if (liq < MIN_LIQ_USD) continue;
    const token = q0 ? t1 : t0;
    const h = await honeypot(token);
    checked++;
    const cls = !h.sell ? "TRAP (sell reverts)" : h.ratio < 50 ? "TRAP (heavy tax)" : h.ratio < SAFE_MIN_PCT ? `tax ${(100 - h.ratio).toFixed(0)}%` : "SAFE";
    if (cls === "SAFE") safe++; else if (cls.startsWith("tax")) tax++; else trap++;
    rows.push(`  $${Math.round(liq).toLocaleString().padStart(10)} liq · sell-back ${h.sell ? h.ratio.toFixed(1) + "%" : "REVERT"} · ${cls.padEnd(20)} · ${token}`);
  }
  console.log(`=== Medusa honeypot screen · ${checked} new tokens (liq ≥ $${MIN_LIQ_USD}) ===`);
  console.log(rows.join("\n"));
  console.log(`\nSAFE: ${safe} · tax: ${tax} · TRAP: ${trap}   (of ${checked} checked)`);
  console.log(`Without this screen, ${tax + trap}/${checked} would have taxed or trapped you. The edge is only the SAFE set.`);
}
main().catch((e) => { console.error("scan error:", e.message); process.exit(1); });
