#!/usr/bin/env node
/**
 * Guardiao: o livro-razao nao afirma estado de chain.
 *
 * O DEFEITO QUE ELE FECHA, E POR QUE ELE E DE CLASSE
 * =================================================
 * Ate 2026-08-22 site/enderecos.js declarava, em constante, `safeThreshold: 1`,
 * um unico dono e `separacaoDeChave: false`. A chain 137, no bloco 92483415,
 * respondia getThreshold() = 2 e tres donos. O livro estava errado, e errado A
 * FAVOR DA SEGURANCA: dizia menos protecao do que existe. Por isso durou. Um
 * registro que assusta e conferido; um que se acusa injustamente nao e
 * conferido por ninguem. E console-app.js imprimia a frase na tela do usuario.
 *
 * O mesmo arquivo JA havia aprendido isso em 2026-08-12, quando `ownerAtual`,
 * `pendingOwner` e `aceiteConcluido` sairam com a licao anotada ao lado: posse e
 * ESTADO DE CHAIN, e constante que espelha estado de chain e uma afirmacao com
 * prazo de validade que ninguem anota. A licao foi aplicada a tres campos e nao
 * aos tres vizinhos, que eram estado de chain pela mesma definicao.
 *
 * Um comentario nao impede a proxima pessoa de acrescentar o campo de novo.
 * Este arquivo impede. Ele tem duas metades, e as duas importam:
 *
 *   1. PROIBIDO       nenhum campo de CUSTODIA pode nomear estado de chain.
 *                     Reprova por NOME, antes de qualquer valor existir, porque
 *                     o defeito nasce no momento em que o campo e criado e nao
 *                     no dia em que ele vence.
 *
 *   2. CONFERIDO      o que sobrou no livro e conferido CONTRA A CHAIN. Endereco
 *                     de contrato tem de ter codigo; o Safe tem de ser o dono
 *                     dos registries que o livro diz que ele governa.
 *
 * A metade 1 sozinha viraria burocracia de nome. A metade 2 sozinha nao pegaria
 * um campo novo ate ele vencer. Juntas, o campo nao entra e o que ficou nao
 * mente.
 *
 *   node scripts/check-livro-vs-chain.mjs
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(RAIZ, "/"));
const livro = require("./site/enderecos.js");

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
      if (j.error) return { erro: true, msg: j.error.message };
      return { erro: false, data: j.result };
    } catch (e) { ultimo = e; }
  }
  throw new Error(`nenhum RPC respondeu: ${ultimo?.message}`);
}

/* ------------------------------------------------------- metade 1 · NOME --- */
/* Cada entrada e um campo que ja existiu aqui, ou que alguem naturalmente
   escreveria, e que e ESTADO DE CHAIN. A lista cresce quando alguem tentar. */
const PROIBIDOS = {
  safeThreshold: "getThreshold() no Safe",
  safeDonos: "getOwners() no Safe",
  separacaoDeChave: "derivado de getOwners()",
  safeVersao: "VERSION() no Safe, e muda em upgrade do singleton",
  timelock: "existencia de timelock e estado de chain",
  ownerAtual: "owner() no contrato",
  pendingOwner: "pendingOwner() no contrato",
  aceiteConcluido: "derivado de owner()/pendingOwner()",
  feeBps: "feeBps() no ParameterRegistry",
  treasury: "treasury() no ParameterRegistry",
  totalDeCofres: "totalDeCofres() no TriviuRegistry",
};

const CUSTODIA = livro.CUSTODIA || {};
for (const campo of Object.keys(CUSTODIA))
  if (PROIBIDOS[campo])
    falhar(
      `CUSTODIA.${campo} e ESTADO DE CHAIN e nao pode ser constante — leia ${PROIBIDOS[campo]}. ` +
        `Um valor certo hoje e uma afirmacao com prazo de validade que ninguem anota.`
    );

/* O texto tambem: a prosa do livro afirmava threshold 1 durante meses. Um
   comentario que conta o que o arquivo JA foi e registro e nao regressao, entao
   a varredura ignora comentario e olha so o codigo executavel. */
const fonte = readFileSync(join(RAIZ, "site", "enderecos.js"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
for (const campo of Object.keys(PROIBIDOS))
  if (new RegExp(`\\b${campo}\\s*:`).test(fonte))
    falhar(`site/enderecos.js declara "${campo}:" fora de comentario — ${PROIBIDOS[campo]}`);

notas.push(`CUSTODIA declara ${Object.keys(CUSTODIA).length} campo(s), nenhum deles estado de chain: ${Object.keys(CUSTODIA).join(" · ")}`);

/* --------------------------------------------------- metade 2 · CONFERIDO -- */
const bloco = await rpc("eth_blockNumber", []);
console.log(`livro-razao contra a chain ${livro.CHAIN_ID} - bloco ${parseInt(bloco.data, 16)}`);

/* Todo endereco que o livro chama de vivo tem de ter codigo. Um livro que lista
   um endereco sem codigo manda calldata para o vazio. */
for (const [papel, end] of Object.entries(livro.VIVOS)) {
  const r = await rpc("eth_getCode", [end, "latest"]);
  if (r.erro || !r.data || r.data === "0x") falhar(`VIVOS.${papel} (${end}) NAO tem codigo na chain`);
  else notas.push(`VIVOS.${papel} ${end} - ${(r.data.length - 2) / 2} B`);
}

/* O Safe governa o que o livro diz que ele governa. Isto NAO e afirmacao
   guardada: e leitura, feita agora, dos dois contratos que expoem owner(). */
const SEL_OWNER = "0x8da5cb5b"; // owner()
const GOVERNADOS = { parameterRegistry: livro.VIVOS.parameterRegistry, triviuRegistry: livro.VIVOS.triviuRegistry };
for (const [papel, end] of Object.entries(GOVERNADOS)) {
  const r = await rpc("eth_call", [{ to: end, data: SEL_OWNER }, "latest"]);
  if (r.erro) { notas.push(`${papel}: owner() reverteu (${r.msg}) - o contrato nao expoe Ownable`); continue; }
  const dono = "0x" + r.data.slice(-40);
  if (dono.toLowerCase() !== livro.CUSTODIA.safe.toLowerCase())
    falhar(`${papel}.owner() = ${dono}, e o livro diz que quem governa e o Safe ${livro.CUSTODIA.safe}`);
  else notas.push(`${papel}.owner() confere com CUSTODIA.safe`);
}

/* ------------------------------------------------------------------ saida -- */
if (falhas.length) {
  console.error(`\n! livro vs chain: ${falhas.length} falha(s)`);
  for (const f of falhas) console.error("  " + f);
  process.exit(1);
}
console.log(`\nok livro vs chain: zero constante de estado de chain - ${Object.keys(livro.VIVOS).length} endereco(s) com codigo`);
for (const n of notas) console.log("  " + n);
