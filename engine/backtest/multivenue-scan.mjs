#!/usr/bin/env node
/**
 * Multi-venue cycle scan — closes the [LACUNA] of §5 of the strategy model.
 *
 * The model document formalises the cycle as a product of effective rates and
 * says plainly that the console replaces that product with Bernoulli(0.40) and
 * U ~ Uniform(0, 0.0022), because it has no market data. This measures the
 * product itself, on real pools, across MORE THAN ONE VENUE — which is the part
 * the existing single-venue backtest could not see, since an intra-venue
 * triangle is fee-walled by construction (three times 0.3% is 0.9%).
 *
 * Method, in the model's own notation:
 *   edge weight   w_i = -ln( r_i · (1 - phi_i) )
 *   cycle product P    = prod r_i (1 - phi_i)
 *   arbitrage exists  <=> P > 1  <=>  sum w_i < 0
 *
 * From the empirical distribution of P it derives the two parameters §5 arbitrates:
 *   p_real = fraction of samples with P > 1 + cost/V
 *   U_real = the realised excess (P - 1 - b/1e4) when the cycle would clear
 *
 * HONEST BOUNDARY, same as the sibling backtest: reserves are read at END OF
 * BLOCK — after that block's own arbitrage already ran. This measures RESIDUAL
 * mispricing, not a capturable edge. A result near zero is the expected finding.
 *
 * Usage: node multivenue-scan.mjs
 *   BACKTEST_RPC=<archive>  SAMPLES=60  STEP=600  SIZE_USD=250
 */

const RPC     = process.env.BACKTEST_RPC || "https://polygon.drpc.org";
const SAMPLES = Number(process.env.SAMPLES || 60);
const STEP    = Number(process.env.STEP || 600);
const SIZE_USD= Number(process.env.SIZE_USD || 250);

const MULTICALL = "0xcA11bde05977b3631167028862bE2a173976CA11";

// Venues. feeBps is the pool fee the model calls phi_i.
const VENUES = [
  { name: "QuickSwap V2", factory: "0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32", feeBps: 30 },
  { name: "SushiSwap V2", factory: "0xc35DADB65012eC5796536bD9864eD8773aBc74C4", feeBps: 30 },
];

const T = {
  WMATIC: { a: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", d: 18 },
  "USDC.e":{ a: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", d: 6  },
  USDT:   { a: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", d: 6  },
  DAI:    { a: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", d: 18 },
  WETH:   { a: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", d: 18 },
  WBTC:   { a: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6", d: 8  },
};
const NAMES = Object.keys(T);

let rpcCalls = 0;
async function rpc(method, params) {
  rpcCalls++;
  const r = await fetch(RPC, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: rpcCalls, method, params }),
  });
  const j = await r.json();
  if (j.error) throw new Error(`${method}: ${j.error.message}`);
  return j.result;
}
const pad = (h) => h.replace(/^0x/, "").padStart(64, "0");
const addr = (a) => pad(a.toLowerCase());

/** Multicall3.aggregate3((address,bool,bytes)[]) -> (bool,bytes)[] */
async function multicall(calls, block) {
  const SEL = "82ad56cb";
  let head = "", body = "";
  const off0 = 32 * calls.length;
  let cursor = off0;
  for (const c of calls) {
    head += pad((cursor).toString(16));
    const data = c.data.replace(/^0x/, "");
    const words = Math.ceil(data.length / 2 / 32);
    body += addr(c.target) + pad("1") + pad((96).toString(16))
          + pad((data.length / 2).toString(16)) + data.padEnd(words * 64, "0");
    cursor += 96 + 32 + words * 32;
  }
  const payload = "0x" + SEL + pad((32).toString(16)) + pad(calls.length.toString(16)) + head + body;
  const raw = await rpc("eth_call", [{ to: MULTICALL, data: payload }, block]);
  // decode (bool,bytes)[]
  const hex = raw.slice(2);
  const w = (i) => hex.slice(i * 64, (i + 1) * 64);
  const n = parseInt(w(1), 16);
  const out = [];
  for (let i = 0; i < n; i++) {
    const off = parseInt(w(2 + i), 16) / 32 + 2;
    const ok = parseInt(w(off), 16) === 1;
    const boff = parseInt(w(off + 1), 16) / 32 + off;
    const len = parseInt(w(boff), 16);
    out.push({ ok, data: "0x" + hex.slice((boff + 1) * 64, (boff + 1) * 64 + len * 2) });
  }
  return out;
}

const SEL_GETPAIR   = "e6a43905"; // getPair(address,address)
const SEL_RESERVES  = "0902f1ac"; // getReserves()
const SEL_TOKEN0    = "0dfe1681"; // token0()

/** Constant-product output — the engine's formula, f = 1 - feeBps/1e4. */
function cpmmOut(amountIn, rIn, rOut, f) {
  const x = amountIn * f;
  return (x * rOut) / (rIn + x);
}

(async () => {
  const latest = parseInt(await rpc("eth_blockNumber", []), 16);
  console.log(`RPC ${RPC} · latest block ${latest}`);
  console.log(`venues: ${VENUES.map(v => v.name).join(" · ")}`);
  console.log(`tokens: ${NAMES.join(" · ")}\n`);

  // 1 · discover every pair on every venue
  const wanted = [];
  for (let i = 0; i < NAMES.length; i++)
    for (let j = i + 1; j < NAMES.length; j++)
      for (const v of VENUES) wanted.push({ a: NAMES[i], b: NAMES[j], v });

  const found = await multicall(wanted.map(w => ({
    target: w.v.factory,
    data: "0x" + SEL_GETPAIR + addr(T[w.a].a) + addr(T[w.b].a),
  })), "latest");

  const pools = [];
  found.forEach((r, i) => {
    if (!r.ok || r.data.length < 66) return;
    const p = "0x" + r.data.slice(-40);
    if (/^0x0+$/.test(p)) return;
    pools.push({ ...wanted[i], pair: p });
  });
  console.log(`pares existentes: ${pools.length} de ${wanted.length} testados`);

  // 2 · token0 of each pool, once
  const t0 = await multicall(pools.map(p => ({ target: p.pair, data: "0x" + SEL_TOKEN0 })), "latest");
  t0.forEach((r, i) => {
    pools[i].token0 = r.ok ? ("0x" + r.data.slice(-40)).toLowerCase() : null;
  });
  const live = pools.filter(p => p.token0);
  console.log(`pares com token0 legivel: ${live.length}\n`);

  // 3 · walk historical blocks, build the graph, take the best cycle
  const triangles = [];
  for (let i = 0; i < NAMES.length; i++)
    for (let j = 0; j < NAMES.length; j++)
      for (let k = 0; k < NAMES.length; k++)
        if (i !== j && j !== k && i !== k && i < j) triangles.push([NAMES[i], NAMES[j], NAMES[k]]);

  const samples = [];
  for (let s = 0; s < SAMPLES; s++) {
    const bn = latest - s * STEP;
    const tag = "0x" + bn.toString(16);
    let res;
    try {
      res = await multicall(live.map(p => ({ target: p.pair, data: "0x" + SEL_RESERVES })), tag);
    } catch (e) { continue; }

    // edge map: from|to -> best effective rate across venues
    const edge = new Map();
    res.forEach((r, i) => {
      if (!r.ok || r.data.length < 130) return;
      const p = live[i];
      const h = r.data.slice(2);
      const r0 = Number(BigInt("0x" + h.slice(0, 64)));
      const r1 = Number(BigInt("0x" + h.slice(64, 128)));
      if (!(r0 > 0 && r1 > 0)) return;
      const aIs0 = T[p.a].a.toLowerCase() === p.token0;
      const [ra, rb] = aIs0 ? [r0, r1] : [r1, r0];
      const [da, db] = [T[p.a].d, T[p.b].d];
      const ra2 = ra / 10 ** da, rb2 = rb / 10 ** db;
      const f = 1 - p.v.feeBps / 10_000;
      // priced at a real size, not mid-price
      const inA = SIZE_USD, inB = SIZE_USD;
      const fwd = cpmmOut(inA, ra2, rb2, f) / inA;
      const rev = cpmmOut(inB, rb2, ra2, f) / inB;
      const put = (k, val, venue) => {
        const cur = edge.get(k);
        if (!cur || val > cur.r) edge.set(k, { r: val, venue });
      };
      put(`${p.a}|${p.b}`, fwd, p.v.name);
      put(`${p.b}|${p.a}`, rev, p.v.name);
    });

    // best cycle product over every triangle, both directions
    let best = null;
    for (const [A, B, C] of triangles) {
      for (const path of [[A, B, C], [A, C, B]]) {
        const legs = [[path[0], path[1]], [path[1], path[2]], [path[2], path[0]]];
        let P = 1, venues = [], ok = true;
        for (const [x, y] of legs) {
          const e = edge.get(`${x}|${y}`);
          if (!e) { ok = false; break; }
          P *= e.r; venues.push(e.venue);
        }
        if (!ok) continue;
        const crossVenue = new Set(venues).size > 1;
        if (!best || P > best.P) best = { P, path, venues, crossVenue };
      }
    }
    /* TWO-LEG CROSS-VENUE — the actual arbitrage between aggregators: buy the
       pair on one venue, sell it on the other. A triangle priced with the best
       rate per leg cannot see this, because it collapses onto whichever venue is
       deeper on every leg. This is the spread the fee-tier probe tested for
       stables, generalised to every pair. */
    const perVenue = new Map();   // "A|B|venue" -> rate
    res.forEach((r, i) => {
      if (!r.ok || r.data.length < 130) return;
      const p = live[i];
      const h = r.data.slice(2);
      const r0 = Number(BigInt("0x" + h.slice(0, 64)));
      const r1 = Number(BigInt("0x" + h.slice(64, 128)));
      if (!(r0 > 0 && r1 > 0)) return;
      const aIs0 = T[p.a].a.toLowerCase() === p.token0;
      const [ra, rb] = aIs0 ? [r0, r1] : [r1, r0];
      const ra2 = ra / 10 ** T[p.a].d, rb2 = rb / 10 ** T[p.b].d;
      const f = 1 - p.v.feeBps / 10_000;
      perVenue.set(`${p.a}|${p.b}|${p.v.name}`, cpmmOut(SIZE_USD, ra2, rb2, f) / SIZE_USD);
      perVenue.set(`${p.b}|${p.a}|${p.v.name}`, cpmmOut(SIZE_USD, rb2, ra2, f) / SIZE_USD);
    });
    let best2 = null;
    for (let i = 0; i < NAMES.length; i++) for (let j = i + 1; j < NAMES.length; j++) {
      const [A, B] = [NAMES[i], NAMES[j]];
      for (const v1 of VENUES) for (const v2 of VENUES) {
        if (v1.name === v2.name) continue;
        const f1 = perVenue.get(`${A}|${B}|${v1.name}`);
        const f2 = perVenue.get(`${B}|${A}|${v2.name}`);
        if (!f1 || !f2) continue;
        const P = f1 * f2;
        if (!best2 || P > best2.P) best2 = { P, pair: `${A}/${B}`, route: `${v1.name} → ${v2.name}` };
      }
    }
    if (best) samples.push({ block: bn, ...best, two: best2 });
    if ((s + 1) % 10 === 0) process.stdout.write(`  ${s + 1}/${SAMPLES} blocos\r`);
  }

  // 4 · the distribution, and the two parameters §5 arbitrates
  console.log(`\n\namostras validas: ${samples.length} de ${SAMPLES}`);
  if (!samples.length) { console.log("sem amostra — RPC de arquivo indisponivel?"); return; }

  const Ps = samples.map(s => s.P).sort((a, b) => a - b);
  const q = (f) => Ps[Math.min(Ps.length - 1, Math.floor(f * Ps.length))];
  const bps = (x) => ((x - 1) * 1e4).toFixed(3);

  console.log(`\n=== DISTRIBUICAO DO PRODUTO DO CICLO  P = prod r_i(1-phi_i) ===`);
  console.log(`  tamanho precificado : ${SIZE_USD} (preco executavel, nao mid-price)`);
  console.log(`  min    P = ${Ps[0].toFixed(8)}   (${bps(Ps[0])} bps)`);
  console.log(`  p25    P = ${q(.25).toFixed(8)}   (${bps(q(.25))} bps)`);
  console.log(`  mediana  = ${q(.50).toFixed(8)}   (${bps(q(.50))} bps)`);
  console.log(`  p75    P = ${q(.75).toFixed(8)}   (${bps(q(.75))} bps)`);
  console.log(`  max    P = ${Ps[Ps.length-1].toFixed(8)}   (${bps(Ps[Ps.length-1])} bps)`);

  const gross = samples.filter(s => s.P > 1).length;
  console.log(`\n=== p REAL · fracao de blocos com ciclo positivo ===`);
  console.log(`  P > 1 (antes de gas)            : ${gross}/${samples.length}  = ${(gross/samples.length*100).toFixed(1)}%`);
  for (const b of [6, 7, 8, 10, 14]) {
    const n = samples.filter(s => (s.P - 1) * 1e4 >= b).length;
    console.log(`  P - 1 >= ${String(b).padStart(2)} bps (o b dos presets) : ${n}/${samples.length}  = ${(n/samples.length*100).toFixed(1)}%`);
  }
  const cross = samples.filter(s => s.crossVenue).length;
  console.log(`\n  melhor ciclo era CROSS-VENUE em ${cross}/${samples.length} blocos`);
  console.log(`  §5 do modelo arbitra p = 0,40 (40%)`);

  const excess = samples.filter(s => s.P > 1).map(s => s.P - 1);
  console.log(`\n=== U REAL · excedente quando o ciclo fecharia ===`);
  if (excess.length) {
    const m = excess.reduce((a, b) => a + b, 0) / excess.length;
    console.log(`  media   : ${(m*1e4).toFixed(3)} bps`);
    console.log(`  maximo  : ${(Math.max(...excess)*1e4).toFixed(3)} bps`);
  } else {
    console.log(`  NENHUMA amostra com P > 1 — U real nao mensuravel nesta janela`);
  }
  console.log(`  §5 do modelo arbitra U ~ Uniforme(0; 22,0 bps), media 11,0 bps`);

  // 5 · o cruzamento de DUAS pernas entre agregadores
  const two = samples.map(s => s.two).filter(Boolean);
  console.log(`\n=== CRUZAMENTO DE 2 PERNAS ENTRE AGREGADORES ===`);
  console.log(`  (compra numa venue, vende na outra — o mesmo par)`);
  if (two.length) {
    const P2 = two.map(x => x.P).sort((a, b) => a - b);
    const g2 = (f) => P2[Math.min(P2.length - 1, Math.floor(f * P2.length))];
    console.log(`  mediana P = ${g2(.50).toFixed(8)}   (${bps(g2(.50))} bps)`);
    console.log(`  maximo  P = ${P2[P2.length-1].toFixed(8)}   (${bps(P2[P2.length-1])} bps)`);
    console.log(`  blocos com P > 1 : ${two.filter(x => x.P > 1).length}/${two.length}`);
    const tally = {};
    two.forEach(x => { tally[x.pair] = (tally[x.pair] || 0) + 1; });
    const top = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
    console.log(`  par que mais aparece como melhor : ${top[0]} (${top[1]}/${two.length} blocos)`);
    console.log(`  rota do melhor no ultimo bloco   : ${two[0].route}`);
  } else console.log(`  sem par presente nas duas venues`);

  console.log(`\nFRONTEIRA HONESTA: reservas de FIM DE BLOCO. Isto mede a`);
  console.log(`ma-precificacao RESIDUAL, nao uma brecha capturavel. Medicao, nao promessa.`);
  console.log(`chamadas RPC: ${rpcCalls}`);
})();
