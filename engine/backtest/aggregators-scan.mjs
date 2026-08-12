#!/usr/bin/env node
/**
 * Multi-aggregator cycle scan — the founder's model, monitored across every venue
 * and every fee tier we can price on Polygon.
 *
 * Why this exists: the two-venue scan found the median 3-leg cycle at −96.7 bps
 * and decomposed it into an 89.7 bps FEE WALL plus 7 bps of slippage. The wall is
 * the whole story, and it is 89.7 bps only because both venues charge 30 bps a leg.
 * Uniswap V3 prices the same pairs at 1, 5, 30 and 100 bps. A three-leg cycle
 * routed through 5 bps tiers carries a 15 bps wall instead of 90.
 *
 * So this asks the question the fee wall makes obvious: with EVERY aggregator on
 * the table, does the cycle product P = prod r_i(1-phi_i) ever exceed 1?
 *
 *   V2 venues  : reserves via getReserves, constant product, fee 30 bps
 *   V3 venue   : QuoterV2.quoteExactInputSingle at each tier — executable price,
 *                which already carries the tier fee AND the concentrated-liquidity
 *                impact. Not a mid-price.
 *
 * The graph takes the BEST edge per direction across all venues and tiers, which
 * is what a real router would do, and then walks every triangle both ways.
 *
 * HONEST BOUNDARY: end-of-block state. This measures RESIDUAL mispricing after the
 * block's own arbitrage already ran, not a capturable edge. Near zero is expected.
 *
 * Usage: node aggregators-scan.mjs      SAMPLES=40 STEP=1200 SIZE_USD=250
 */

const RPC     = process.env.BACKTEST_RPC || "https://polygon.drpc.org";
const SAMPLES = Number(process.env.SAMPLES || 40);
const STEP    = Number(process.env.STEP || 1200);
const SIZE_USD= Number(process.env.SIZE_USD || 250);

const QUOTER    = "0x61fFE014bA17989E743c5F6cB21bF9697530B21e"; // Uniswap V3 QuoterV2
const V3FACTORY = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
const MULTICALL = "0xcA11bde05977b3631167028862bE2a173976CA11";

const V2 = [
  { name: "QuickSwap V2", factory: "0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32", feeBps: 30 },
  { name: "SushiSwap V2", factory: "0xc35DADB65012eC5796536bD9864eD8773aBc74C4", feeBps: 30 },
];
const V3_TIERS = [100, 500, 3000, 10000];  // 1 · 5 · 30 · 100 bps

const T = {
  WMATIC:  { a: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", d: 18 },
  "USDC.e":{ a: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", d: 6  },
  USDC:    { a: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", d: 6  },
  USDT:    { a: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", d: 6  },
  DAI:     { a: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", d: 18 },
  WETH:    { a: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", d: 18 },
  WBTC:    { a: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6", d: 8  },
};
const NAMES = Object.keys(T);
/* DERIVADO DA CHAIN, nunca chutado. A primeira versao deste arquivo tinha
   WMATIC:0.40 hardcoded; a cotacao real do QuoterV2 devolveu 250 USDC.e ->
   3311.84 WMATIC, ou seja $0.0755. O erro dimensionava a perna de WMATIC em
   5.3x o alvo e contaminava o escorregamento de todo triangulo que a tocasse. */
const USD_PER = { "USDC.e": 1, USDC: 1, USDT: 1, DAI: 1 };

let calls = 0;
async function rpc(method, params) {
  calls++;
  const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: calls, method, params }) });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j.result;
}
const pad = (h) => h.replace(/^0x/, "").toLowerCase().padStart(64, "0");
const p32 = (n) => n.toString(16).padStart(64, "0");

async function multicall(list, block) {
  const out = [];
  for (let i = 0; i < list.length; i += 400) {
    const calls_ = list.slice(i, i + 400);
    let head = "", body = "", cursor = 32 * calls_.length;
    for (const c of calls_) {
      head += p32(BigInt(cursor));
      const d = c.data.replace(/^0x/, "");
      const words = Math.ceil(d.length / 2 / 32);
      body += pad(c.target) + p32(1n) + p32(96n) + p32(BigInt(d.length / 2)) + d.padEnd(words * 64, "0");
      cursor += 96 + 32 + words * 32;
    }
    const payload = "0x82ad56cb" + p32(32n) + p32(BigInt(calls_.length)) + head + body;
    let raw;
    try { raw = await rpc("eth_call", [{ to: MULTICALL, data: payload }, block]); }
    catch { calls_.forEach(() => out.push({ ok: false, data: "0x" })); continue; }
    const hex = raw.slice(2), w = (k) => hex.slice(k * 64, (k + 1) * 64);
    const n = parseInt(w(1), 16);
    for (let k = 0; k < n; k++) {
      const off = parseInt(w(2 + k), 16) / 32 + 2;
      const ok = parseInt(w(off), 16) === 1;
      const bo = parseInt(w(off + 1), 16) / 32 + off;
      const len = parseInt(w(bo), 16);
      out.push({ ok, data: "0x" + hex.slice((bo + 1) * 64, (bo + 1) * 64 + len * 2) });
    }
  }
  return out;
}

const amountIn = (tok) => BigInt(Math.round(SIZE_USD / USD_PER[tok] * 10 ** T[tok].d));
const cpmm = (a, rIn, rOut) => { const f = a * 9970n; return (f * rOut) / (rIn * 10000n + f); };

async function derivePrices() {
  const REF = "USDC.e";
  const need = NAMES.filter(n => USD_PER[n] === undefined);
  for (const tok of need) {
    // cota 1 unidade do token contra o stable de referencia, no tier mais liquido
    const one = BigInt(10 ** T[tok].d);
    let best = 0;
    for (const fee of V3_TIERS) {
      try {
        const r = await rpc("eth_call", [{ to: QUOTER,
          data: "0xc6a5026a" + pad(T[tok].a) + pad(T[REF].a) + p32(one) + p32(BigInt(fee)) + p32(0n) }, "latest"]);
        if (r && r !== "0x") {
          const out = Number(BigInt("0x" + r.slice(2, 66))) / 10 ** T[REF].d;
          if (out > best) best = out;
        }
      } catch {}
    }
    if (!best) throw new Error(`sem preco on-chain para ${tok}`);
    USD_PER[tok] = best;
  }
  console.log("precos derivados da chain (1 token -> USDC.e):");
  NAMES.forEach(n => console.log(`  ${n.padEnd(8)} $${USD_PER[n] < 1 ? USD_PER[n].toFixed(6) : USD_PER[n].toFixed(2)}`));
  console.log();
}

(async () => {
  const latest = parseInt(await rpc("eth_blockNumber", []), 16);
  await derivePrices();
  console.log(`RPC ${RPC} · bloco ${latest}`);
  console.log(`agregadores: QuickSwap V2 · SushiSwap V2 · Uniswap V3 (1 · 5 · 30 · 100 bps)`);
  console.log(`tokens: ${NAMES.join(" · ")} · tamanho $${SIZE_USD}\n`);

  const pairs = [];
  for (let i = 0; i < NAMES.length; i++) for (let j = i + 1; j < NAMES.length; j++) pairs.push([NAMES[i], NAMES[j]]);

  // ── descoberta: pares V2 e pools V3 por tier
  const disc = [];
  for (const [a, b] of pairs) {
    for (const v of V2) disc.push({ k: "v2", a, b, v, target: v.factory, data: "0xe6a43905" + pad(T[a].a) + pad(T[b].a) });
    for (const fee of V3_TIERS) disc.push({ k: "v3", a, b, fee, target: V3FACTORY, data: "0x1698ee82" + pad(T[a].a) + pad(T[b].a) + p32(BigInt(fee)) });
  }
  const dres = await multicall(disc, "latest");
  const v2pools = [], v3pools = [];
  dres.forEach((r, i) => {
    if (!r.ok || r.data.length < 66) return;
    const addr = "0x" + r.data.slice(-40);
    if (/^0x0+$/.test(addr)) return;
    (disc[i].k === "v2" ? v2pools : v3pools).push({ ...disc[i], pool: addr });
  });
  const t0 = await multicall(v2pools.map(p => ({ target: p.pool, data: "0x0dfe1681" })), "latest");
  t0.forEach((r, i) => { v2pools[i].token0 = r.ok ? ("0x" + r.data.slice(-40)).toLowerCase() : null; });
  const v2live = v2pools.filter(p => p.token0);

  console.log(`pares V2 vivos : ${v2live.length}`);
  console.log(`pools V3 vivas : ${v3pools.length}  ` +
    V3_TIERS.map(f => `${f/100}bps:${v3pools.filter(p=>p.fee===f).length}`).join(" · ") + "\n");

  const triangles = [];
  for (let i = 0; i < NAMES.length; i++) for (let j = 0; j < NAMES.length; j++) for (let k = 0; k < NAMES.length; k++)
    if (i < j && j !== k && i !== k) triangles.push([NAMES[i], NAMES[j], NAMES[k]]);

  const samples = [];
  for (let s = 0; s < SAMPLES; s++) {
    const bn = latest - s * STEP, tag = "0x" + bn.toString(16);
    const edge = new Map();
    const put = (from, to, rate, src) => {
      if (!(rate > 0)) return;
      const cur = edge.get(`${from}|${to}`);
      if (!cur || rate > cur.r) edge.set(`${from}|${to}`, { r: rate, src });
    };

    const rv = await multicall(v2live.map(p => ({ target: p.pool, data: "0x0902f1ac" })), tag);
    rv.forEach((r, i) => {
      if (!r.ok || r.data.length < 130) return;
      const p = v2live[i], h = r.data.slice(2);
      const r0 = BigInt("0x" + h.slice(0, 64)), r1 = BigInt("0x" + h.slice(64, 128));
      if (r0 <= 0n || r1 <= 0n) return;
      const aIs0 = T[p.a].a.toLowerCase() === p.token0;
      const [ra, rb] = aIs0 ? [r0, r1] : [r1, r0];
      const ia = amountIn(p.a), ib = amountIn(p.b);
      put(p.a, p.b, Number(cpmm(ia, ra, rb)) / 10 ** T[p.b].d / (Number(ia) / 10 ** T[p.a].d), p.v.name);
      put(p.b, p.a, Number(cpmm(ib, rb, ra)) / 10 ** T[p.a].d / (Number(ib) / 10 ** T[p.b].d), p.v.name);
    });

    const qs = [];
    for (const p of v3pools) {
      qs.push({ ...p, dir: "fwd", target: QUOTER, data: "0xc6a5026a" + pad(T[p.a].a) + pad(T[p.b].a) + p32(amountIn(p.a)) + p32(BigInt(p.fee)) + p32(0n) });
      qs.push({ ...p, dir: "rev", target: QUOTER, data: "0xc6a5026a" + pad(T[p.b].a) + pad(T[p.a].a) + p32(amountIn(p.b)) + p32(BigInt(p.fee)) + p32(0n) });
    }
    const qres = await multicall(qs, tag);
    qres.forEach((r, i) => {
      if (!r.ok || r.data.length < 66) return;
      const q = qs[i], out = BigInt("0x" + r.data.slice(2, 66));
      if (out <= 0n) return;
      const [from, to] = q.dir === "fwd" ? [q.a, q.b] : [q.b, q.a];
      const inAmt = Number(amountIn(from)) / 10 ** T[from].d;
      put(from, to, Number(out) / 10 ** T[to].d / inAmt, `UniV3 ${q.fee/100}bps`);
    });

    let best = null;
    for (const [A, B, C] of triangles) for (const path of [[A,B,C],[A,C,B]]) {
      const legs = [[path[0],path[1]],[path[1],path[2]],[path[2],path[0]]];
      let P = 1, src = [], ok = true;
      for (const [x,y] of legs) { const e = edge.get(`${x}|${y}`); if (!e) { ok = false; break; } P *= e.r; src.push(e.src); }
      if (ok && (!best || P > best.P)) best = { P, path, src };
    }
    if (best) samples.push({ block: bn, ...best, edges: edge.size });
    process.stdout.write(`  ${s+1}/${SAMPLES} blocos · ${edge.size} arestas\r`);
  }

  console.log(`\n\namostras: ${samples.length}/${SAMPLES}`);
  if (!samples.length) return;
  const Ps = samples.map(s => s.P).sort((a,b)=>a-b);
  const q = f => Ps[Math.min(Ps.length-1, Math.floor(f*Ps.length))];
  const bps = x => ((x-1)*1e4).toFixed(3);

  console.log(`\n=== P = prod r_i(1-phi_i) · melhor triangulo por bloco, TODOS os agregadores ===`);
  console.log(`  min      ${Ps[0].toFixed(8)}  (${bps(Ps[0])} bps)`);
  console.log(`  mediana  ${q(.5).toFixed(8)}  (${bps(q(.5))} bps)`);
  console.log(`  max      ${Ps[Ps.length-1].toFixed(8)}  (${bps(Ps[Ps.length-1])} bps)`);
  console.log(`\n  P > 1 : ${samples.filter(s=>s.P>1).length}/${samples.length}`);
  for (const b of [6,7,8,10,14])
    console.log(`  P-1 >= ${String(b).padStart(2)} bps : ${samples.filter(s=>(s.P-1)*1e4>=b).length}/${samples.length}`);

  const tally = {};
  samples.forEach(s => s.src.forEach(v => { tally[v] = (tally[v]||0)+1; }));
  console.log(`\n=== venues usadas nas pernas do melhor ciclo ===`);
  Object.entries(tally).sort((a,b)=>b[1]-a[1]).forEach(([v,n]) =>
    console.log(`  ${v.padEnd(16)} ${n} pernas  (${(n/(samples.length*3)*100).toFixed(0)}%)`));
  const b0 = samples[0];
  console.log(`\n  melhor rota no bloco mais recente: ${b0.path.join(" -> ")} -> ${b0.path[0]}`);
  console.log(`  pernas: ${b0.src.join(" | ")}`);
  console.log(`  arestas no grafo: ${b0.edges}`);
  console.log(`\nFRONTEIRA: estado de FIM DE BLOCO. Ma-precificacao residual, nao brecha capturavel.`);
  console.log(`chamadas RPC: ${calls}`);
})();
