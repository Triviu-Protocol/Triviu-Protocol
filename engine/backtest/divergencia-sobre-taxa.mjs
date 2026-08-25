#!/usr/bin/env node
/**
 * Divergência ÷ taxa — varredura multi-par.
 *
 * DERIVADO de fee-tier-scan.mjs, que fica INTACTO porque produziu números já
 * publicados. A Escada de Reuso encerrou no degrau 2: a técnica é a de lá.
 *
 * O QUE MUDA, e por que cada mudança precisou existir:
 *
 *  1. O PAR É PARÂMETRO. No original os dois tokens são constantes de módulo.
 *
 *  2. AS PERNAS SÃO ENCADEADAS. O original cota as duas pernas no MESMO tamanho
 *     fixo — válido só para par ~1:1, e o comentário dele declara isso. Aqui a
 *     perna 2 recebe a SAÍDA da perna 1, que é o que uma ida-e-volta é de
 *     verdade. Sem isto, varrer WMATIC/USDC devolveria número sem significado.
 *
 *  3. A MÉTRICA É A RAZÃO. `net` responde "deu positivo?". A razão
 *     divergência÷taxa responde "quão perto, e o que teria de mudar" — e ordena
 *     pares entre si, que `net` não faz porque net carrega o tamanho dentro.
 *
 *  4. FALTA DE POOL E FALTA DE ARESTA CONTAM SEPARADO (Art. 2 do Polvo-gigante).
 *     Pôr as duas no mesmo balde faz veredito de bug parecer veredito de mercado.
 *
 * HONESTO: preço executável de FIM DE BLOCO. Não vê a corrida intra-bloco.
 * Positivo aqui é aresta real e DISPUTADA, nunca promessa de captura.
 */

const RPC = process.env.BACKTEST_RPC || "https://polygon.drpc.org";
const SAMPLES = Number(process.env.SAMPLES || 12);
const STEP = Number(process.env.STEP || 4000);
const GAS_BPS = Number(process.env.GAS_BPS || 0.2);

const V3FACTORY = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
const QUOTER = "0x61fFE014bA17989E743c5F6cB21bF9697530B21e";
const QUICK = "0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32";
const SUSHI = "0xc35DADB65012eC5796536bD9864eD8773aBc74C4";
const TIERS = [100, 500, 3000];
const FEE_BPS = { v3_100: 1, v3_500: 5, v3_3000: 30, quick: 30, sushi: 30 };

let id = 0;
const pad = (a) => "000000000000000000000000" + a.replace("0x", "").toLowerCase();
const p32 = (n) => n.toString(16).padStart(64, "0");

async function call(method, params, tries = 4) {
  for (let t = 0; t < tries; t++) {
    try {
      const r = await fetch(RPC, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message);
      return j.result;
    } catch (e) {
      if (t === tries - 1) throw e;
      await new Promise((s) => setTimeout(() => s(), 250 * (t + 1)));
    }
  }
}

const naoZero = (r) => r && r !== "0x" && BigInt("0x" + r.slice(26)) !== 0n;
const getPoolV3 = (a, b, fee) =>
  call("eth_call", [{ to: V3FACTORY, data: "0x1698ee82" + pad(a) + pad(b) + p32(BigInt(fee)) }, "latest"])
    .then((r) => (naoZero(r) ? "0x" + r.slice(26) : null))
    .catch(() => null);
const getPairV2 = (f, a, b) =>
  call("eth_call", [{ to: f, data: "0xe6a43905" + pad(a) + pad(b) }, "latest"])
    .then((r) => (naoZero(r) ? "0x" + r.slice(26) : null))
    .catch(() => null);
const token0 = (p) => call("eth_call", [{ to: p, data: "0x0dfe1681" }, "latest"]).then((r) => "0x" + r.slice(26));
const reservesAt = (p, blk) =>
  call("eth_call", [{ to: p, data: "0x0902f1ac" }, blk])
    .then((r) => (r && r.length >= 130 ? [BigInt("0x" + r.slice(2, 66)), BigInt("0x" + r.slice(66, 130))] : null))
    .catch(() => null);
const quoteV3 = (tin, tout, amtIn, fee, blk) =>
  call("eth_call", [
    { to: QUOTER, data: "0xc6a5026a" + pad(tin) + pad(tout) + p32(BigInt(amtIn)) + p32(BigInt(fee)) + p32(0n) },
    blk,
  ])
    .then((r) => (r && r !== "0x" ? BigInt("0x" + r.slice(2, 66)) : 0n))
    .catch(() => 0n);

function cpmmOut(amtIn, rIn, rOut) {
  if (amtIn <= 0n || rIn <= 0n || rOut <= 0n) return 0n;
  const f = amtIn * 9970n;
  return (f * rOut) / (rIn * 10000n + f);
}

async function legQuote(venue, tin, tout, amtIn, blk, ctx) {
  if (venue.startsWith("v3_")) return quoteV3(tin, tout, amtIn, Number(venue.slice(3)), blk);
  const { pool, t0 } = ctx[venue];
  const r = await reservesAt(pool, blk);
  if (!r) return 0n;
  const [rIn, rOut] = t0 === tin.toLowerCase() ? [r[0], r[1]] : [r[1], r[0]];
  return cpmmOut(amtIn, rIn, rOut);
}

/** Ida-e-volta REAL: A->B numa venue, e o que SAIU volta B->A na outra. */
async function roundTrip(venueBuy, venueSell, A, B, amtA, blk, ctx) {
  const out1 = await legQuote(venueBuy, A, B, amtA, blk, ctx);
  if (out1 <= 0n) return null;
  const out2 = await legQuote(venueSell, B, A, out1, blk, ctx);
  if (out2 <= 0n) return null;
  return Number(out2) / Number(amtA);
}

async function varrerPar({ nome, A, B, decA, sizeA }) {
  const amtA = BigInt(sizeA) * 10n ** BigInt(decA);
  const ctx = {};
  const venues = [];
  for (const fee of TIERS) {
    const p = await getPoolV3(A, B, fee);
    if (p) venues.push("v3_" + fee);
  }
  for (const [nm, f] of [["quick", QUICK], ["sushi", SUSHI]]) {
    const p = await getPairV2(f, A, B);
    if (p) {
      ctx[nm] = { pool: p, t0: (await token0(p)).toLowerCase() };
      venues.push(nm);
    }
  }
  // Art. 2: falta de POOL e falta de ARESTA sao coisas diferentes e contam separado.
  if (venues.length < 2) return { nome, motivo: "SEM_VENUE_SUFICIENTE", venues: venues.length };

  const latest = parseInt(await call("eth_blockNumber", []), 16);
  let lidos = 0, positivos = 0, melhorNet = -1e9, melhorRota = "", melhorTaxa = 0;
  for (let i = 0; i < SAMPLES; i++) {
    const blk = "0x" + (latest - i * STEP).toString(16);
    let algum = false;
    for (const vb of venues) {
      for (const vs of venues) {
        if (vb === vs) continue;
        const rt = await roundTrip(vb, vs, A, B, amtA, blk, ctx);
        if (rt === null) continue;
        algum = true;
        const taxa = FEE_BPS[vb] + FEE_BPS[vs];
        const net = (rt - 1) * 10000 - GAS_BPS;
        if (net > melhorNet) {
          melhorNet = net;
          melhorRota = vb + "->" + vs;
          melhorTaxa = taxa;
        }
        if (net > 0) positivos++;
      }
    }
    if (algum) lidos++;
  }
  if (!lidos) return { nome, motivo: "SEM_COTACAO", venues: venues.length };
  const divergencia = melhorNet + GAS_BPS + melhorTaxa;

  /* PROFUNDIDADE NAO E PRECIFICACAO, e por-las no mesmo numero mente.
     `divergencia` = net + gas + taxa carrega DENTRO dela o impacto de preco.
     Em pool funda com tamanho pequeno o impacto e desprezivel e o numero mede
     ma-precificacao, que e o que se quer. Em pool rasa o impacto DOMINA: a
     primeira varredura devolveu -9.899 bps em USDC/DAI, que como divergencia
     seria perder 99% numa ida-e-volta entre duas moedas de um dolar -- e nao e
     divergencia nenhuma, e a pool nao ter fundo para o tamanho pedido.
     Reportar aquilo como "divergencia negativa" seria veredito de bug vestido
     de veredito de mercado. O corte abaixo separa os dois casos em vez de
     misturar; quem quiser o par raso reduz o tamanho ate o impacto sair. */
  const PISO_IMPACTO_BPS = -100;
  if (melhorNet < PISO_IMPACTO_BPS) {
    return { nome, motivo: "IMPACTO_DOMINA", venues: venues.length, lidos, melhorNet, melhorRota, melhorTaxa };
  }

  return {
    nome, venues: venues.length, lidos, positivos,
    melhorNet, melhorRota, melhorTaxa, divergencia,
    razao: divergencia / melhorTaxa,
  };
}

const T = {
  USDC: ["0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", 6],
  USDCe: ["0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", 6],
  USDT: ["0xc2132D05D31c914a87C6611C10748AEb04B58e8F", 6],
  DAI: ["0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", 18],
  WMATIC: ["0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", 18],
  WETH: ["0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", 18],
};

const PARES = [
  ["USDCe", "USDT", 5000],
  ["USDC", "USDT", 5000],
  ["USDC", "USDCe", 5000],
  ["USDC", "DAI", 5000],
  ["USDCe", "DAI", 5000],
  ["USDT", "DAI", 5000],
  ["USDC", "WMATIC", 5000],
  ["USDCe", "WMATIC", 5000],
  ["USDT", "WMATIC", 5000],
  ["USDC", "WETH", 5000],
  ["WMATIC", "WETH", 5000],
];

async function main() {
  console.log("divergencia/taxa · " + PARES.length + " pares · " + SAMPLES + " blocos @" + STEP + " · gas " + GAS_BPS + " bps");
  console.log("ida-e-volta ENCADEADA (a saida da perna 1 alimenta a perna 2)\n");
  const linhas = [];
  for (const [a, b, size] of PARES) {
    const sz = Number(process.env.SIZE || size);
    const r = await varrerPar({ nome: a + "/" + b, A: T[a][0], B: T[b][0], decA: T[a][1], sizeA: sz });
    linhas.push(r);
    if (r.motivo === "IMPACTO_DOMINA") {
      console.log("  " + r.nome.padEnd(14) + "IMPACTO_DOMINA  net " + r.melhorNet.toFixed(0) +
        " bps em size " + sz + "  (" + r.melhorRota + ") -- reduza o tamanho para medir divergencia");
    } else if (r.motivo) {
      console.log("  " + r.nome.padEnd(14) + r.motivo + "  (venues=" + r.venues + ")");
    } else {
      console.log(
        "  " + r.nome.padEnd(14) +
        "razao " + r.razao.toFixed(3) +
        "  div " + r.divergencia.toFixed(2) + " bps / taxa " + r.melhorTaxa + " bps" +
        "  net " + r.melhorNet.toFixed(2) +
        "  " + r.melhorRota +
        "  " + r.lidos + "/" + SAMPLES + " blocos  " + r.positivos + " pos"
      );
    }
  }
  const ok = linhas.filter((l) => !l.motivo).sort((a, b) => b.razao - a.razao);
  const fora = linhas.filter((l) => l.motivo);
  console.log("\n=== ORDENADO POR RAZAO (precisa passar de 1,000) ===");
  for (const l of ok) {
    console.log("  " + l.razao.toFixed(3) + "  " + l.nome.padEnd(14) +
      "taxa " + String(l.melhorTaxa).padStart(2) + " bps  div " + l.divergencia.toFixed(2) + " bps  " + l.melhorRota);
  }
  const rasos = fora.filter((f) => f.motivo === "IMPACTO_DOMINA");
  const semVenue = fora.filter((f) => f.motivo !== "IMPACTO_DOMINA");
  console.log("\ncontagem SEPARADA (Art. 2 · infra, profundidade e economia sao TRES coisas):");
  console.log("  pares com divergencia medivel .. " + ok.length + "  " + ok.map((l) => l.nome).join(" "));
  console.log("  pares onde IMPACTO domina ...... " + rasos.length + "  " + rasos.map((f) => f.nome).join(" "));
  console.log("  pares sem venue/cotacao ........ " + semVenue.length + "  " + semVenue.map((f) => f.nome).join(" "));
  console.log("  pares com razao > 1,0 .......... " + ok.filter((l) => l.razao > 1).length + "  <- a resposta da onda");
  console.log("\nFim de bloco. Nao ve a corrida intra-bloco. Medicao, nao promessa.");
}

main().catch((e) => {
  console.error("erro:", e.message);
  process.exit(1);
});
