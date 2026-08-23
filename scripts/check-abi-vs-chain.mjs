#!/usr/bin/env node
/**
 * Guardiao: cada seletor de FUNCAO que a tela publica existe no contrato
 * IMPLANTADO no endereco que o livro-razao da para aquele papel.
 *
 * POR QUE ELE EXISTE, E O QUE ELE SUBSTITUI
 * =========================================
 * O item 1 do check-console-abi.mjs provava que site/js/abi-console.js
 * reproduzia byte a byte os artefatos de contracts/out. Essa prova morreu em
 * caad24b, quando a linha V0 substituiu os contratos anteriores no fonte: dos
 * nove papeis que o console usa, oito nao tem mais artefato nesta arvore.
 *
 * E o nono e a armadilha. `TriviuVault` existe nas DUAS linhas, com o mesmo
 * nome e codigo diferente - 9.496 B na antiga, 25.120 B na V0. Um conserto
 * ingenuo (apagar as oito entradas quebradas e ficar com a que resolve) faria a
 * tela imprimir seletores do contrato B sob o endereco do contrato A, com a
 * mesma tipografia de valor lido da chain.
 *
 * Este guardiao nao repara a prova antiga: troca por uma mais forte. A antiga
 * dizia "o arquivo bate com o que compilei aqui". Esta diz "o arquivo bate com
 * o que esta rodando na Polygon", que e o que o usuario assina contra.
 *
 * O METODO, E POR QUE SAO DOIS
 * ============================
 * Medido em 2026-08-22, bloco 92484396, antes de este arquivo existir:
 *
 *   presenca do seletor no runtime  falso NEGATIVO em proxy. USDC, USDC.e e
 *                                   USDT deram 0/4 nos seletores do ERC-20: o
 *                                   proxy faz delegatecall cego e nao carrega
 *                                   seletor nenhum. Sao tokens corretos.
 *
 *   despacho por eth_call           falso POSITIVO em contrato com fallback.
 *                                   WMATIC responde a `0x9a8b7c6d`, que nenhum
 *                                   contrato implementa, porque o fallback dele
 *                                   aceita qualquer coisa.
 *
 * Nenhum dos dois vale sozinho. Juntos, cobrem um o buraco do outro, e o que
 * nenhum dos dois alcanca e declarado INDETERMINADO em vez de ser arredondado
 * para "ok". Cicatriz MV-1: PUSH4 e indicio, resposta e prova, e um contrato
 * que responde a tudo nao prova nada.
 *
 *   node scripts/check-abi-vs-chain.mjs
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(RAIZ, "/"));

const ABI = require("./site/js/abi-console.js");
const livro = require("./site/enderecos.js");

/* Dois endpoints que nao se conhecem. Um RPC publico e muitos nos atras de um
   endereco, e um deles pode estar podado ou atrasado. */
const RPCS = ["https://polygon-bor-rpc.publicnode.com", "https://polygon-rpc.com"];

const falhas = [];
const notas = [];
const falhar = (m) => falhas.push(m);

async function rpc(method, params) {
  let ultimo;
  for (const url of RPCS) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      const j = await r.json();
      if (j.error) return { erro: true, data: j.error.data ?? "0x", msg: j.error.message };
      return { erro: false, data: j.result };
    } catch (e) { ultimo = e; }
  }
  throw new Error(`nenhum RPC respondeu (${RPCS.length} tentados): ${ultimo?.message}`);
}

const PAD32 = "0".repeat(64);

/* ARMADILHA MEDIDA, 2026-08-22, ao calibrar este arquivo.
 *
 * A primeira versao mandava DUAS palavras de calldata em todo probe, e acusou
 * `transferFrom(address,address,uint256)` de nao existir na USDC. Ela existe.
 *
 * O que acontece: o Solidity confere `calldatasize >= 4 + 32*N` antes de
 * decodificar, e quando falta palavra ele faz `revert(0,0)`, que reverte VAZIO.
 * Vazio e exatamente o sinal que este guardiao usa para dizer "a funcao nao
 * existe". O probe se auto-sabotava, e o sintoma era indistinguivel de um
 * achado real: uma funcao de 3 argumentos parecia ausente enquanto as de 1 e 2
 * passavam.
 *
 * Trinta e duas palavras cobrem qualquer assinatura destas telas com folga, e um
 * tipo dinamico decodifica offset zero como array vazio em vez de estourar o
 * limite. O controle usa o MESMO enchimento: se usasse outro, a comparacao entre
 * probe e controle estaria medindo duas coisas diferentes. */
const ENCHIMENTO = PAD32.repeat(32);

/* Seletor que nenhum contrato implementa. Serve de controle: onde ELE responde,
   o contrato tem fallback e o despacho deixa de distinguir qualquer coisa. */
const CONTROLE = "0x9a8b7c6d";

/* --------------------------------------------------------------- alvos ----- */
/* A ponte de nome esta declarada, e a razao junto: o ABI chama o papel de
   `lpVault` e o livro chama de `triviuLPVault`. Nomes diferentes para a mesma
   coisa e o motivo pelo qual esta divergencia sobreviveu tanto tempo: quem
   procurasse `lpVault` no livro nao acharia, e concluiria "papel sem endereco"
   em vez de "papel com outro nome". */
const ALVOS = {
  parameterRegistry: livro.VIVOS.parameterRegistry,
  triviuExecutor: livro.VIVOS.triviuExecutor,
  gasTank: livro.VIVOS.gasTank,
  triviuRegistry: livro.VIVOS.triviuRegistry,
  triviuFactory: livro.VIVOS.triviuFactory,
  lpVault: livro.VIVOS.triviuLPVault,
  npm: livro.EXTERNOS.uniswapPositionManager,
};

/* Papeis cujo endereco nao e fixo por DESENHO, com o alvo que substitui.
   `resolver` devolve [endereco, comoFoiAchado] ou null com a razao. */
const DERIVADOS = {
  erc20: {
    razao: "interface de token, o endereco e o token que o usuario escolhe",
    async resolver() {
      /* Basta UM token curado provar cada seletor. A USDC nativa e proxy, entao
         ela exercita justamente o caminho que o bytecode nao alcanca. */
      const sel = ABI.contratos.parameterRegistry.funcoes["isAllowedToken(address)"]?.seletor;
      if (!sel) return null;
      const CANDIDATOS = {
        USDC: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
        "USDC.e": "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
        WETH: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619",
      };
      for (const [nome, end] of Object.entries(CANDIDATOS)) {
        const r = await rpc("eth_call", [
          { to: ALVOS.parameterRegistry, data: sel + end.slice(2).toLowerCase().padStart(64, "0") },
          "latest",
        ]);
        if (!r.erro && BigInt(r.data) === 1n) return [end, `${nome}, curada no ParameterRegistry`];
      }
      return null;
    },
  },
  triviuVault: {
    razao: "instanciado por dono pela TriviuFactory, nao ha endereco fixo",
    async resolver() {
      /* Quando o primeiro cofre nascer, este papel passa a ser verificavel
         sozinho. O portao fica mais forte com o tempo em vez de envelhecer. */
      const fTotal = ABI.contratos.triviuRegistry.funcoes["totalDeCofres()"]?.seletor;
      const fCofre = ABI.contratos.triviuRegistry.funcoes["cofres(uint256)"]?.seletor;
      if (!fTotal || !fCofre) return null;
      const t = await rpc("eth_call", [{ to: ALVOS.triviuRegistry, data: fTotal }, "latest"]);
      if (t.erro || BigInt(t.data) === 0n) return null;
      const c = await rpc("eth_call", [{ to: ALVOS.triviuRegistry, data: fCofre + PAD32 }, "latest"]);
      if (c.erro) return null;
      return ["0x" + c.data.slice(-40), "cofres(0) do TriviuRegistry"];
    },
  },
};

/* ------------------------------------------------------------ verificacao -- */
const bloco = await rpc("eth_blockNumber", []);
console.log(`abi-console.js contra a chain 137 - bloco ${parseInt(bloco.data, 16)}`);

let presentes = 0, ausentes = 0, indeterminados = 0, semAlvo = 0;

for (const [papel, c] of Object.entries(ABI.contratos)) {
  const fns = Object.entries(c.funcoes);

  let endereco = ALVOS[papel];
  let procedencia = "livro-razao";
  if (!endereco && DERIVADOS[papel]) {
    const achado = await DERIVADOS[papel].resolver();
    if (achado) [endereco, procedencia] = achado;
  }

  if (!endereco) {
    semAlvo += fns.length;
    console.log(`  ${"-".padEnd(5)} ${papel.padEnd(18)} SEM ALVO - ${DERIVADOS[papel]?.razao ?? "papel sem endereco"} [${fns.length} fn]`);
    notas.push(`${papel}: ${fns.length} assinatura(s) sem contrato implantado para conferir - ${DERIVADOS[papel]?.razao ?? ""}`);
    continue;
  }

  const codeR = await rpc("eth_getCode", [endereco, "latest"]);
  if (codeR.erro || !codeR.data || codeR.data === "0x") {
    falhar(`${papel}: ${endereco} nao tem codigo na chain - a tela nomeia um contrato que nao existe`);
    continue;
  }
  const code = codeR.data.toLowerCase();

  /* O controle roda ANTES de julgar qualquer seletor deste alvo. */
  const ctrl = await rpc("eth_call", [{ to: endereco, data: CONTROLE + ENCHIMENTO }, "latest"]);
  const temFallback = !ctrl.erro || (ctrl.data && ctrl.data !== "0x");

  const porBytecode = [], porDespacho = [], indef = [], faltando = [];

  for (const [sig, f] of fns) {
    if (code.includes(f.seletor.slice(2))) { porBytecode.push(sig); continue; }
    if (temFallback) { indef.push(sig); continue; }
    const r = await rpc("eth_call", [{ to: endereco, data: f.seletor + ENCHIMENTO }, "latest"]);
    const respondeu = !r.erro || (r.data && r.data !== "0x");
    if (respondeu) porDespacho.push(sig);
    else faltando.push(sig);
  }

  presentes += porBytecode.length + porDespacho.length;
  ausentes += faltando.length;
  indeterminados += indef.length;

  const marca = faltando.length ? "FALHA" : indef.length ? "?    " : "ok   ";
  console.log(
    `  ${marca} ${papel.padEnd(18)} ${endereco}  ${porBytecode.length + porDespacho.length}/${fns.length}` +
      `  [bytecode ${porBytecode.length} - despacho ${porDespacho.length}` +
      (indef.length ? ` - indeterminado ${indef.length}` : "") + `]  (${procedencia})`
  );

  if (temFallback && indef.length)
    notas.push(
      `${papel} (${endereco}) responde ao seletor de controle ${CONTROLE}: tem fallback, e o ` +
        `despacho nao distingue nada nele. ${indef.length} assinatura(s) ficam INDETERMINADAS, nao "ok".`
    );

  for (const s of faltando)
    falhar(`${papel}.${s} NAO existe em ${endereco} - a tela nomeia funcao que o contrato implantado nao tem`);
}

/* ------------------------------------------------------------------ saida -- */
console.log(
  `\n  ${presentes} provados - ${ausentes} ausentes - ${indeterminados} indeterminados - ` +
    `${semAlvo} sem contrato implantado  (total ${presentes + ausentes + indeterminados + semAlvo})`
);

if (falhas.length) {
  console.error(`\n! abi vs chain: ${falhas.length} falha(s)`);
  for (const f of falhas) console.error("  " + f);
  process.exit(1);
}
console.log(`\nok abi vs chain: zero assinatura publicada ausente do contrato implantado`);
for (const n of notas) console.log("  " + n);
