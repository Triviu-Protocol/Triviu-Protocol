#!/usr/bin/env node
/* PORTAO DA CUSTODIA  ·  o livro-razao contra a chain  ·  2026-08-20
 * ---------------------------------------------------------------------------
 * O DEFEITO QUE ESTE PORTAO VIGIA, e ele nao e hipotetico — aconteceu duas vezes
 * no MESMO arquivo:
 *
 *   2026-08-12  `ownerAtual`, `pendingOwner` e `aceiteConcluido` saem de
 *               contracts/deploy/enderecos.js porque diziam owner = EOA enquanto
 *               a chain respondia owner() = Safe.
 *
 *   2026-08-20  `safeThreshold: 1` e `separacaoDeChave: false` continuavam la,
 *               protegidos por esta justificativa escrita no proprio arquivo:
 *               "o que fica aqui e o que NAO expira ... e isso nao muda sozinho."
 *               A chain respondia getThreshold() = 2 com TRES donos.
 *
 * A segunda e a que ensina. O arquivo ja tinha a doutrina certa — posse e ESTADO
 * DE CHAIN, e constante que espelha estado de chain e afirmacao com prazo de
 * validade — e a aplicou pela metade, apostando que ALGUNS campos nao mudariam.
 * Nao havia como saber. O que faltava nao era honestidade: era ALARME.
 *
 * E o erro apontava para o lado SEGURO: dizia que havia menos protecao do que
 * havia. Por isso ninguem notou. Um registro que erra a favor tambem esta errado,
 * e e mais dificil de pegar justamente porque nao assusta ninguem.
 *
 * ===========================================================================
 * O QUE ELE COBRA
 * ===========================================================================
 *
 *   1. `safeThreshold`  bate com getThreshold()
 *   2. `safeDonos`      bate com getOwners(), como CONJUNTO (ordem e do Safe,
 *                       nao do autor do arquivo; comparar por ordem geraria
 *                       vermelho falso a cada troca de dono)
 *   3. `safeVersao`     bate com VERSION()
 *   4. `separacaoDeChave` e uma CONCLUSAO, e tem de decorrer do que foi lido:
 *                       verdadeira sse threshold >= 2 E ha dono que nao e o
 *                       deployer. Escrever `true` com threshold 1 e mentir com
 *                       numero certo ao lado.
 *   5. `medidoNoBloco`  existe e nao esta no futuro
 *
 * DUAS ORIGENS, sempre. Uma RPC que mente e vetor conhecido nesta casa; duas que
 * discordam abortam em vez de escolher a que agrada.
 *
 * FALHA FECHADA em todo caminho: RPC muda, resposta curta, JSON quebrado,
 * endpoints divergentes = REPROVA. Este portao nunca conclui "passou" por nao ter
 * conseguido ler.
 *
 * ===========================================================================
 * O QUE ELE NAO PROVA, dito para ninguem ler mais do que esta escrito
 * ===========================================================================
 *
 * Que os donos do Safe sao PESSOAS distintas. Tres chaves distintas e fato
 * on-chain; tres custodiantes distintos e conhecimento de fora. O campo se chama
 * `separacaoDeChave` e nao `separacaoDePessoas` por isso, e este portao cobra
 * exatamente o que o nome promete.
 *
 * Tambem nao prova ausencia de timelock como VIRTUDE — so registra. Threshold 2
 * exige conluio de duas chaves; nao impoe espera.
 *
 *   --controle th=<n>,donos=<a,b,c>,ver=<s>   injeta valores SEM tocar a chain,
 *                                             so para provar que o portao reprova.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const LIVRO = join(RAIZ, "contracts", "deploy", "enderecos.js");

/* Selectors lidos de `cast sig`, nao copiados de documentacao. */
const SEL_THRESHOLD = "0xe75235b8"; // getThreshold()
const SEL_OWNERS = "0xa0e67e2b"; // getOwners()
const SEL_VERSION = "0xffa1ad74"; // VERSION()

const ENDPOINTS = [
  "https://polygon-bor-rpc.publicnode.com",
  "https://polygon.drpc.org",
];

async function ler(url, to, data) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "curl/8.0" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "eth_call",
      params: [{ to, data }, "latest"],
    }),
  });
  if (!r.ok) throw new Error(`${url} devolveu HTTP ${r.status}`);
  const j = await r.json();
  if (j.error) throw new Error(`${url}: ${JSON.stringify(j.error)}`);
  const v = j.result;
  if (typeof v !== "string" || !v.startsWith("0x") || v.length < 66)
    throw new Error(`${url}: resposta curta demais, veio ${JSON.stringify(v)}`);
  return v;
}

/* --- o livro ------------------------------------------------------------- */
let CUSTODIA;
try {
  const mod = await import("file://" + LIVRO.replace(/\\/g, "/"));
  CUSTODIA = (mod.default ?? mod).CUSTODIA;
} catch (e) {
  console.error(`portao da custodia · nao consegui carregar ${LIVRO}`);
  console.error(`  ${e && e.message ? e.message : e}`);
  console.error("  FALHA FECHADA: portao que nao le o alvo nao aprova.");
  process.exit(1);
}
if (!CUSTODIA || !CUSTODIA.safe) {
  console.error("portao da custodia · o bloco CUSTODIA sumiu do livro-razao, ou perdeu `safe`.");
  console.error("  Se ele foi renomeado, este portao precisa saber — falha fechada.");
  process.exit(1);
}

/* --- a chain, ou o controle ---------------------------------------------- */
const argv = process.argv.slice(2).join(" ");
const controle = argv.includes("--controle") ? argv : null;

let threshold, donos, versao, origem;
try {
  if (controle) {
    const th = /th=(\d+)/.exec(controle);
    const dn = /donos=([0-9a-fA-Fx,]+)/.exec(controle);
    const vr = /ver=([0-9.]+)/.exec(controle);
    if (!th || !dn) { console.error("uso: --controle th=2,donos=0xaa..,0xbb..[,ver=1.4.1]"); process.exit(2); }
    threshold = Number(th[1]);
    donos = dn[1].split(",").filter(Boolean);
    versao = vr ? vr[1] : CUSTODIA.safeVersao;
    origem = "CONTROLE INJETADO (a chain nao foi lida)";
  } else {
    const [t1, t2] = await Promise.all(ENDPOINTS.map((u) => ler(u, CUSTODIA.safe, SEL_THRESHOLD)));
    const [o1, o2] = await Promise.all(ENDPOINTS.map((u) => ler(u, CUSTODIA.safe, SEL_OWNERS)));
    const [v1, v2] = await Promise.all(ENDPOINTS.map((u) => ler(u, CUSTODIA.safe, SEL_VERSION)));
    if (t1 !== t2 || o1 !== o2 || v1 !== v2) {
      console.error("ORIGENS DIVERGEM — abortado sem escolher lado:");
      console.error(`  getThreshold  ${t1}  vs  ${t2}`);
      console.error(`  getOwners     ${o1.slice(0, 42)}…  vs  ${o2.slice(0, 42)}…`);
      console.error(`  VERSION       ${v1.slice(0, 42)}…  vs  ${v2.slice(0, 42)}…`);
      process.exit(1);
    }
    threshold = Number(BigInt(t1));
    donos = decodificarEnderecos(o1);
    versao = decodificarTexto(v1);
    origem = `${ENDPOINTS.length} endpoints concordando`;
  }
} catch (e) {
  console.error("leitura falhou — FALHA FECHADA, nao 'passou':", e && e.message ? e.message : e);
  process.exit(1);
}

/* ABI: offset(32) | length(32) | palavras. Escrito a mao porque trazer um decoder
   inteiro para ler dois tipos seria dependencia nova por preguica. */
function decodificarEnderecos(hex) {
  const p = hex.slice(2);
  const n = Number(BigInt("0x" + p.slice(64, 128)));
  const fora = [];
  for (let i = 0; i < n; i++) {
    const pal = p.slice(128 + i * 64, 128 + (i + 1) * 64);
    if (pal.length < 64) throw new Error("getOwners: palavra truncada");
    fora.push("0x" + pal.slice(24));
  }
  return fora;
}
function decodificarTexto(hex) {
  const p = hex.slice(2);
  const n = Number(BigInt("0x" + p.slice(64, 128)));
  const bytes = p.slice(128, 128 + n * 2);
  return Buffer.from(bytes, "hex").toString("utf8");
}

/* --- o julgamento --------------------------------------------------------- */
const falhas = [];
const baixo = (a) => String(a).toLowerCase();
const noLivro = (CUSTODIA.safeDonos || []).map(baixo).sort();
const naChain = donos.map(baixo).sort();

if (Number(CUSTODIA.safeThreshold) !== threshold)
  falhas.push(
    `safeThreshold: o livro diz ${CUSTODIA.safeThreshold} e a chain responde ${threshold}. ` +
    "Posse e estado de chain; constante que a espelha tem prazo de validade."
  );

if (noLivro.length !== naChain.length || noLivro.some((a, i) => a !== naChain[i])) {
  falhas.push(
    `safeDonos divergem.\n      livro: ${noLivro.join(", ") || "(vazio)"}\n      chain: ${naChain.join(", ")}`
  );
}

if (String(CUSTODIA.safeVersao) !== String(versao))
  falhas.push(`safeVersao: o livro diz "${CUSTODIA.safeVersao}" e a chain responde "${versao}".`);

/* A conclusao tem de decorrer do que foi lido, e nao ser escrita a parte. */
const temOutroAlemDoDeployer = naChain.some((a) => a !== baixo(CUSTODIA.deployer));
const separacaoReal = threshold >= 2 && temOutroAlemDoDeployer;
if (Boolean(CUSTODIA.separacaoDeChave) !== separacaoReal)
  falhas.push(
    `separacaoDeChave: o livro diz ${CUSTODIA.separacaoDeChave} e o que foi lido implica ${separacaoReal} ` +
    `(threshold ${threshold}, ${naChain.length} dono(s), deployer entre eles: ${!temOutroAlemDoDeployer ? "sozinho" : "nao"}). ` +
    "Este campo e conclusao, nao anotacao: ele tem de decorrer do threshold e dos donos."
  );

if (!Number.isInteger(CUSTODIA.medidoNoBloco) || CUSTODIA.medidoNoBloco <= 0)
  falhas.push(
    "medidoNoBloco ausente ou invalido. Sem ele o leitor nao sabe a idade do que esta lendo, " +
    "e foi exatamente assim que este bloco envelheceu duas vezes."
  );

console.log(`portao da custodia · Safe ${CUSTODIA.safe}`);
console.log(`  origem ............. ${origem}`);
console.log(`  threshold .......... livro ${CUSTODIA.safeThreshold}  ·  chain ${threshold}`);
console.log(`  donos .............. livro ${noLivro.length}  ·  chain ${naChain.length}`);
console.log(`  versao ............. livro ${CUSTODIA.safeVersao}  ·  chain ${versao}`);
console.log(`  separacao de chave . livro ${CUSTODIA.separacaoDeChave}  ·  implicada ${separacaoReal}`);
console.log(`  timelock ........... ${CUSTODIA.timelock ?? "ausente"}  (threshold nao impoe espera)`);
console.log(`  medido no bloco .... ${CUSTODIA.medidoNoBloco}`);
console.log("  NAO conferido ...... se os donos sao PESSOAS distintas — isso e conhecimento");
console.log("                       de fora da chain, e o campo nao promete isso");

if (falhas.length) {
  console.error("\nO LIVRO-RAZAO DIVERGE DA CHAIN:");
  for (const f of falhas) console.error("  - " + f);
  console.error("\n  Conserto: leia a chain, atualize o bloco CUSTODIA em contracts/deploy/enderecos.js,");
  console.error("  atualize `medidoNoBloco` na MESMA edicao, e rode `cp contracts/deploy/enderecos.js site/enderecos.js`.");
  process.exit(1);
}
console.log("\n✓ o livro-razao diz sobre a custodia o que a chain responde, e a conclusao decorre da leitura");
