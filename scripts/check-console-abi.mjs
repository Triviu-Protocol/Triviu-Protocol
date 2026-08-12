#!/usr/bin/env node
/**
 * Guardiao do console: a tela so pode nomear funcao que o contrato tem.
 *
 * O console anterior nomeava 16 funcoes que os contratos implantados nao
 * implementam. Nenhum teste pegou, porque nao havia nada ligando o nome na tela
 * ao artefato do contrato — o nome era texto, e texto nao quebra.
 *
 * Este check liga os dois:
 *
 *   1. site/js/abi-console.js e byte-identico ao que gerar-abi-console.mjs
 *      produz a partir de contracts/out. Contrato recompilado com assinatura
 *      diferente => arquivo diverge => CI reprova.
 *   2. Toda assinatura que o console pede via sig("papel","assinatura") existe
 *      nesse arquivo. Assinatura inventada => reprova ANTES de ir ao ar.
 *   3. Zero seletor de 4 bytes digitado a mao no console — todos vem da tabela.
 *   4. Zero endereco de 40 hex no console (HTML e JS). Endereco vem do
 *      livro-razao /enderecos.js, ou e derivado de uma leitura da chain.
 *   5. A trava de metodo de carteira e uma ALLOWLIST fechada. Ate 2026-08-12 ela
 *      tinha tres entradas, todas de leitura; hoje tem quatro, e a quarta e
 *      eth_sendTransaction, aberta por autorizacao humana nominal do fundador.
 *      Um quinto metodo reprova aqui. Assinatura de mensagem continua vetada.
 *
 * Uma observacao sobre o item 5, aprendida a duras penas nesta casa: a contagem
 * e feita no JAVASCRIPT, nunca no HTML. O HTML diz, em prosa, que a pagina nao
 * chama eth_sendTransaction — contar o arquivo inteiro transformaria essa frase
 * honesta num falso alarme, e falso alarme treina gente a ignorar guardiao.
 *
 *   node scripts/check-console-abi.mjs
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gerado, DESTINO } from "./gerar-abi-console.mjs";

const RAIZ = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const JS = join(RAIZ, "site", "js", "console.js");
const HTML = join(RAIZ, "site", "console", "index.html");

const falhas = [];
const falhar = (m) => falhas.push(m);
const notas = [];

/* ---------------------------------------------------------------- item 1 -- */
let emDisco;
try {
  emDisco = readFileSync(DESTINO, "utf8");
} catch {
  console.error("✗ site/js/abi-console.js ausente. Gere com: node scripts/gerar-abi-console.mjs");
  process.exit(1);
}
/* Comparacao normalizada de fim de linha: este repo esta em core.autocrlf=true e
   a worktree recebe CRLF. O que interessa e o CONTEUDO divergir, nao o checkout. */
const norm = (s) => s.replace(/\r\n/g, "\n");
if (norm(emDisco) !== norm(gerado)) {
  falhar("site/js/abi-console.js DIVERGE do que os artefatos em contracts/out produzem agora.");
  falhar("  O contrato mudou e a tela nao, ou o arquivo foi editado a mao.");
  falhar("  Regere com: node scripts/gerar-abi-console.mjs");
} else {
  notas.push("abi-console.js reproduz byte a byte os artefatos de contracts/out");
}

/* ------------------------------------------------------------- item 2/3 --- */
let js;
try {
  js = readFileSync(JS, "utf8");
} catch {
  console.error(`✗ ${JS} ausente — o console nao existe`);
  process.exit(1);
}
let html;
try {
  html = readFileSync(HTML, "utf8");
} catch {
  console.error(`✗ ${HTML} ausente — o console nao existe`);
  process.exit(1);
}

/* O JSON e lido do texto gerado, nao avaliado: `eval` num arquivo que este
   proprio script acabou de montar seria teatro — e um dia deixaria de ser. */
const casado = norm(gerado).match(/var ABI = ([\s\S]*?);\n  if \(typeof module/);
if (!casado) {
  console.error("✗ nao consegui extrair o JSON de abi-console.js — o formato do gerador mudou");
  process.exit(1);
}
const JSON_EMBUTIDO = JSON.parse(casado[1]);

const assinaturasValidas = new Set();
for (const [papel, c] of Object.entries(JSON_EMBUTIDO.contratos))
  for (const s of Object.keys(c.funcoes)) assinaturasValidas.add(papel + "|" + s);
for (const [papel, c] of Object.entries(JSON_EMBUTIDO.extras))
  for (const s of Object.keys(c.funcoes)) assinaturasValidas.add(papel + "|" + s);

const seletoresValidos = new Set();
for (const c of Object.values(JSON_EMBUTIDO.contratos)) {
  for (const f of Object.values(c.funcoes)) seletoresValidos.add(f.seletor.toLowerCase());
  for (const s of Object.keys(c.erros)) seletoresValidos.add(s.toLowerCase());
}
for (const c of Object.values(JSON_EMBUTIDO.extras))
  for (const f of Object.values(c.funcoes)) seletoresValidos.add(f.seletor.toLowerCase());

const pedidas = [...js.matchAll(/\bsig\(\s*"([A-Za-z0-9]+)"\s*,\s*"([^"]+)"\s*\)/g)];
if (!pedidas.length) falhar("console.js nao pede nenhuma assinatura via sig(papel, assinatura) — o elo com o ABI sumiu");
for (const [, papel, assin] of pedidas)
  if (!assinaturasValidas.has(papel + "|" + assin))
    falhar(`console.js pede ${papel}.${assin} — nao existe em abi-console.js (funcao inventada)`);
if (pedidas.length) notas.push(`${pedidas.length} referencias sig() conferidas contra o ABI compilado`);

/* Item 3: nenhum seletor literal. Se aparecer um 0x + 8 hex isolado no JS, ou ele
   e um seletor digitado a mao (proibido) ou e um numero que se parece com um — e
   os dois merecem parar aqui. */
for (const m of js.matchAll(/0x[0-9a-fA-F]{8}(?![0-9a-fA-F])/g))
  falhar(`console.js contem o literal ${m[0]} — seletor vem de sig(), nunca digitado`);

/* ---------------------------------------------------------------- item 4 -- */
for (const [nome, texto] of [["console.js", js], ["console/index.html", html]])
  for (const m of texto.matchAll(/0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/g))
    falhar(`${nome} contem o endereco ${m[0]} escrito a mao — use /enderecos.js`);

/* ---------------------------------------------------------------- item 5 -- */
/* 2026-08-12: a lista de carteira cresceu em EXATAMENTE UM, sob autorizacao humana
   nominal do fundador. eth_sendTransaction entra; nenhum metodo de ASSINATURA DE
   MENSAGEM entra, nem agora nem por engano — a estrutura em console.js e uma
   allowlist, entao o que nao esta aqui LANCA sem precisar ser proibido por nome.
   A trava fina de assinatura mora em scripts/check-assinatura.mjs. */
const PERMITIDO_CARTEIRA = ["eth_accounts", "eth_requestAccounts", "eth_chainId", "eth_sendTransaction"];
const PERMITIDO_RPC = [
  "eth_call", "eth_chainId", "eth_getCode", "eth_getLogs",
  "eth_blockNumber", "eth_gasPrice", "eth_estimateGas", "eth_getBalance",
  "eth_getTransactionReceipt",
];

/* Os comentarios sao removidos ANTES de partir as chaves, e isto conserta um
   alarme falso real: um comentario de bloco dentro do literal carrega virgula e
   dois-pontos, entao o split produzia uma "chave" que nenhuma linguagem
   reconhece e o guardiao reprovava um arquivo correto. Guardiao que grita sem
   motivo e guardiao que ensina a ignorar guardiao — e o proximo grito, o
   verdadeiro, tambem sera ignorado. */
function chavesDe(nomeVar) {
  const m = js.match(new RegExp(`var\\s+${nomeVar}\\s*=\\s*\\{([^}]*)\\}`));
  if (!m) return null;
  const semComentario = m[1].replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  return semComentario.split(",").map((p) => p.split(":")[0].trim().replace(/^["']|["']$/g, "")).filter(Boolean);
}

const carteira = chavesDe("CARTEIRA_PERMITIDO");
if (!carteira) falhar("console.js nao declara CARTEIRA_PERMITIDO — sem trava, o veto e so um comentario");
else {
  for (const k of carteira)
    if (!PERMITIDO_CARTEIRA.includes(k))
      falhar(`console.js permite "${k}" na carteira — fora da lista somente-leitura ${PERMITIDO_CARTEIRA.join(" / ")}`);
  if (carteira.length !== PERMITIDO_CARTEIRA.length)
    falhar(`console.js declara ${carteira.length} metodos de carteira e a allowlist autorizada tem ${PERMITIDO_CARTEIRA.length}`);
  notas.push(`carteira travada em ${carteira.join(" · ")}`);
}

const rpcs = chavesDe("RPC_PERMITIDO");
if (!rpcs) falhar("console.js nao declara RPC_PERMITIDO");
else {
  for (const k of rpcs)
    if (!PERMITIDO_RPC.includes(k)) falhar(`console.js permite "${k}" por RPC — fora da lista somente-leitura`);
  notas.push(`RPC travado em ${rpcs.length} metodos de leitura`);
}

/* A varredura textual, SO no JavaScript executavel.
   eth_sendTransaction SAIU desta lista em 2026-08-12: ele agora e legitimo e
   aparece no arquivo por autorizacao nominal. Quem cobra a forma correta do
   disparo — congelamento, hash reconferido, chain no clique — e
   scripts/check-assinatura.mjs. Aqui ficam os que continuam proibidos, e o
   grupo tem um traco em comum: TODOS produzem uma autorizacao off-chain, que nao
   custa gas, nao aparece na chain, e so se manifesta quando ja foi usada. */
for (const proibido of ["eth_signTypedData", "personal_sign", "eth_sendRawTransaction", "wallet_"]) {
  const n = (js.match(new RegExp(proibido, "g")) || []).length;
  if (n) falhar(`console.js menciona ${proibido} ${n}x — assinatura de mensagem continua vetada, inclusive escrita`);
}
/* eth_sign e prefixo de eth_signTypedData; contado com fronteira para nao
   duplicar o achado acima nem inventar um. */
{
  const n = (js.match(/eth_sign(?!edTypedData|TypedData)\b/g) || []).length;
  if (n) falhar(`console.js menciona eth_sign ${n}x — proibido nesta onda`);
}

/* --------------------------------------------------------- ligacoes HTML -- */
for (const src of ["/enderecos.js", "/js/abi-console.js", "/js/console.js"])
  if (!html.includes(`src="${src}"`)) falhar(`console/index.html nao carrega ${src}`);

/* ------------------------------------------------------------------ saida - */
if (falhas.length) {
  console.error(`✗ console: ${falhas.length} falha(s)`);
  for (const f of falhas) console.error("  " + f);
  process.exit(1);
}
console.log("✓ console: assinaturas conferidas contra o ABI compilado · zero seletor e zero endereco a mao · carteira na allowlist de 4");
for (const n of notas) console.log("  " + n);
