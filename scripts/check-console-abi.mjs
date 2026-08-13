#!/usr/bin/env node
/**
 * ALVO: as DUAS telas que nomeiam funcao de contrato.
 *
 *   site/calldata/index.html + site/js/console.js      — o ciclo do Executor
 *   site/console/index.html  + site/js/console-lp.js   — o ciclo de vida de uma
 *                                                        posicao no TriviuLPVault
 *
 * Ate 2026-08-12 esta guarda cobria so a primeira, e o cabecalho dizia, com
 * todas as letras, que NAO auditava o console do produto porque ele era narrado
 * e nao assinava — "se um dia ele passar a assinar, precisa da sua propria".
 * Esse dia foi o mesmo 2026-08-12: /console/ deixou de ser uma simulacao em
 * memoria e passou a abrir a carteira. Entao ele entrou aqui, e nao ganhou uma
 * guarda propria: uma segunda guarda com as mesmas regras e a primeira coisa
 * que sai de sincronia com a original.
 *
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

/* As duas telas, e cada uma com o JS que a dirige e as tres tags que ela e
   obrigada a carregar. Uma tela que perde o /enderecos.js volta a ter endereco
   escrito a mao no dia seguinte, e e por isso que a ligacao e cobrada aqui. */
const TELAS = [
  {
    nome: "calldata",
    js: join(RAIZ, "site", "js", "console.js"),
    html: join(RAIZ, "site", "calldata", "index.html"),
    rotuloJs: "console.js",
    rotuloHtml: "calldata/index.html",
    tags: ["/enderecos.js", "/js/abi-console.js", "/js/console.js"],
  },
  {
    nome: "console",
    js: join(RAIZ, "site", "js", "console-lp.js"),
    html: join(RAIZ, "site", "console", "index.html"),
    rotuloJs: "console-lp.js",
    rotuloHtml: "console/index.html",
    tags: ["/enderecos.js", "/js/abi-console.js", "/js/console-lp.js"],
  },
];

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

/* As duas podas de comentario, usadas pelas checagens que olham para a FORMA do
   codigo e para o que a pagina RENDERIZA — nunca para o arquivo inteiro. A licao
   e desta casa: contar um padrao no arquivo inteiro em vez de dentro do trecho
   executavel ja produziu falso alarme aqui, e falso alarme treina gente a ignorar
   guardiao. Um comentario que CONTA o que a pagina foi, ou que nomeia a forma
   errada de escrever algo para que a proxima pessoa a reconheca, e o registro de
   uma correcao e nao a correcao desfeita — e nao aparece na tela nem roda.

   A poda e mecanica de proposito: nao pede julgamento sobre a intencao de
   ninguem. Uma string literal de JS sobrevive a ela, e e a string literal que
   viraria um banner na tela.

   As checagens de ENDERECO e de SELETOR a mao continuam lendo o arquivo inteiro,
   comentario incluido, e isso e deliberado: um endereco escrito num comentario
   envelhece calado do mesmo jeito que um escrito no codigo. Quem quiser explicar
   um endereco explica sem cola-lo. */
const semComentarioJs = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
const semComentarioHtml = (s) => s.replace(/<!--[\s\S]*?-->/g, " ");
if (norm(emDisco) !== norm(gerado)) {
  falhar("site/js/abi-console.js DIVERGE do que os artefatos em contracts/out produzem agora.");
  falhar("  O contrato mudou e a tela nao, ou o arquivo foi editado a mao.");
  falhar("  Regere com: node scripts/gerar-abi-console.mjs");
} else {
  notas.push("abi-console.js reproduz byte a byte os artefatos de contracts/out");
}

/* ------------------------------------------------------------- item 2/3 --- */
for (const t of TELAS) {
  try {
    t.fonteJs = readFileSync(t.js, "utf8");
  } catch {
    console.error(`✗ ${t.js} ausente — a tela ${t.nome} nao existe`);
    process.exit(1);
  }
  try {
    t.fonteHtml = readFileSync(t.html, "utf8");
  } catch {
    console.error(`✗ ${t.html} ausente — a tela ${t.nome} nao existe`);
    process.exit(1);
  }
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

/* Os topicos de evento tambem: a tela do LP le o tokenId de uma posicao recem
   aberta do LOG que o cofre emitiu, e um topico digitado a mao envelhece igual a
   um seletor digitado a mao — pior, porque falha em silencio, achando log
   nenhum. Entao ele passa por topico(papel, evento) e e conferido aqui. */
const eventosValidos = new Set();
for (const [papel, c] of Object.entries(JSON_EMBUTIDO.contratos))
  for (const s of Object.keys(c.eventos || {})) eventosValidos.add(papel + "|" + s);

for (const t of TELAS) {
  const js = t.fonteJs;

  const pedidas = [...js.matchAll(/\bsig\(\s*"([A-Za-z0-9]+)"\s*,\s*"([^"]+)"\s*\)/g)];
  if (!pedidas.length) falhar(`${t.rotuloJs} nao pede nenhuma assinatura via sig(papel, assinatura) — o elo com o ABI sumiu`);
  for (const [, papel, assin] of pedidas)
    if (!assinaturasValidas.has(papel + "|" + assin))
      falhar(`${t.rotuloJs} pede ${papel}.${assin} — nao existe em abi-console.js (funcao inventada)`);
  if (pedidas.length) notas.push(`${t.rotuloJs}: ${pedidas.length} referencias sig() conferidas contra o ABI compilado`);

  const eventos = [...js.matchAll(/\btopico\(\s*"([A-Za-z0-9]+)"\s*,\s*"([^"]+)"\s*\)/g)];
  for (const [, papel, ev] of eventos)
    if (!eventosValidos.has(papel + "|" + ev))
      falhar(`${t.rotuloJs} pede o topico de ${papel}.${ev} — nao existe em abi-console.js (evento inventado)`);
  if (eventos.length) notas.push(`${t.rotuloJs}: ${eventos.length} topico(s) de evento conferidos contra o ABI compilado`);

  /* Item 3: nenhum seletor literal. Se aparecer um 0x + 8 hex isolado no JS, ou
     ele e um seletor digitado a mao (proibido) ou e um numero que se parece com
     um — e os dois merecem parar aqui. */
  for (const m of js.matchAll(/0x[0-9a-fA-F]{8}(?![0-9a-fA-F])/g))
    falhar(`${t.rotuloJs} contem o literal ${m[0]} — seletor vem de sig(), nunca digitado`);

  /* ---------------------------------------------------------------- item 4 -- */
  for (const [nome, texto] of [[t.rotuloJs, js], [t.rotuloHtml, t.fonteHtml]])
    for (const m of texto.matchAll(/0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/g))
      falhar(`${nome} contem o endereco ${m[0]} escrito a mao — use /enderecos.js`);
}

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
function chavesDe(js, nomeVar) {
  const m = js.match(new RegExp(`var\\s+${nomeVar}\\s*=\\s*\\{([^}]*)\\}`));
  if (!m) return null;
  const semComentario = m[1].replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  return semComentario.split(",").map((p) => p.split(":")[0].trim().replace(/^["']|["']$/g, "")).filter(Boolean);
}

for (const t of TELAS) {
  const carteira = chavesDe(t.fonteJs, "CARTEIRA_PERMITIDO");
  if (!carteira) falhar(`${t.rotuloJs} nao declara CARTEIRA_PERMITIDO — sem trava, o veto e so um comentario`);
  else {
    for (const k of carteira)
      if (!PERMITIDO_CARTEIRA.includes(k))
        falhar(`${t.rotuloJs} permite "${k}" na carteira — fora da allowlist ${PERMITIDO_CARTEIRA.join(" / ")}`);
    if (carteira.length !== PERMITIDO_CARTEIRA.length)
      falhar(`${t.rotuloJs} declara ${carteira.length} metodos de carteira e a allowlist autorizada tem ${PERMITIDO_CARTEIRA.length}`);
    notas.push(`${t.rotuloJs}: carteira travada em ${carteira.join(" · ")}`);
  }

  const rpcs = chavesDe(t.fonteJs, "RPC_PERMITIDO");
  if (!rpcs) falhar(`${t.rotuloJs} nao declara RPC_PERMITIDO`);
  else {
    for (const k of rpcs)
      if (!PERMITIDO_RPC.includes(k)) falhar(`${t.rotuloJs} permite "${k}" por RPC — fora da lista somente-leitura`);
    notas.push(`${t.rotuloJs}: RPC travado em ${rpcs.length} metodos de leitura`);
  }
}

/* A varredura textual, SO no JavaScript executavel.
   eth_sendTransaction SAIU desta lista em 2026-08-12: ele agora e legitimo e
   aparece no arquivo por autorizacao nominal. Quem cobra a forma correta do
   disparo — congelamento, hash reconferido, chain no clique — e
   scripts/check-assinatura.mjs. Aqui ficam os que continuam proibidos, e o
   grupo tem um traco em comum: TODOS produzem uma autorizacao off-chain, que nao
   custa gas, nao aparece na chain, e so se manifesta quando ja foi usada. */
for (const t of TELAS) {
  for (const proibido of ["eth_signTypedData", "personal_sign", "eth_sendRawTransaction", "wallet_"]) {
    const n = (t.fonteJs.match(new RegExp(proibido, "g")) || []).length;
    if (n) falhar(`${t.rotuloJs} menciona ${proibido} ${n}x — autorizacao off-chain continua vetada, inclusive escrita`);
  }
  /* eth_sign e prefixo de eth_signTypedData; contado com fronteira para nao
     duplicar o achado acima nem inventar um. */
  const n = (t.fonteJs.match(/eth_sign(?!edTypedData|TypedData)\b/g) || []).length;
  if (n) falhar(`${t.rotuloJs} menciona eth_sign ${n}x — proibido nesta onda`);
}

/* ------------------------------------- a cicatriz do seletor de 4 bytes ----
   Medido em 2026-08-12 contra uma reversao real de NaoEDono do TriviuLPVault:
   o decodificador indexava palavras de 32 bytes sobre a string CRUA da reversao,
   que comeca com "0x" e os 4 bytes do seletor. Resultado: todo argumento saia
   deslocado em 4 bytes. tokenId 123456 virou 3328367175739749386490411014583095797…
   e o dono 0xb5Fb0CDa…3883C5 virou 0x00000000b5fb0cdaab5784cbe05ccb9d843dafe4.

   O NOME do erro saia certo, e e por isso que isto vira guardiao em vez de
   virar so um commit: a tela imprimia a verdade e a mentira lado a lado, com a
   mesma tipografia de valor lido da chain, e nada nela parecia errado. Um
   defeito que nao tem sintoma so e pego por quem o procura — entao ele passa a
   ser procurado toda vez que o build roda.

   A checagem e textual e diz o que cobre: exige o corte do seletor dentro do
   decodificador, e proibe indexar palavra sobre `dados`. Nao prova o
   alinhamento; prova que a forma que produziu o desalinhamento nao voltou.

   E ela roda sobre o corpo SEM COMENTARIO. O comentario que explica o conserto
   precisa nomear a forma errada para que a proxima pessoa a reconheca, e um
   guardiao que reprovasse por causa dessa frase obrigaria a apagar justamente a
   explicacao que impede o defeito de voltar. */
for (const t of TELAS) {
  const fonte = semComentarioJs(t.fonteJs);
  const m = fonte.match(/function\s+decodificarRevert\s*\(/);
  if (!m) { falhar(`${t.rotuloJs} nao define decodificarRevert() — o decodificador de reversao sumiu`); continue; }
  const iAbre = fonte.indexOf("{", m.index);
  let n = 0, corpo = null;
  for (let i = iAbre; i < fonte.length; i++) {
    if (fonte[i] === "{") n += 1;
    else if (fonte[i] === "}") { n -= 1; if (n === 0) { corpo = fonte.slice(iAbre, i + 1); break; } }
  }
  if (!corpo) { falhar(`${t.rotuloJs}: nao consegui delimitar o corpo de decodificarRevert()`); continue; }
  if (/palavra\s*\(\s*dados\b/.test(corpo)) {
    falhar(`${t.rotuloJs}: decodificarRevert() indexa palavra() sobre \`dados\`, que inclui os 4 bytes do ` +
      "seletor — e o desalinhamento de 4 bytes medido em 2026-08-12. Corte o seletor primeiro.");
  }
  if (!/dados\s*\.\s*slice\(\s*10\s*\)/.test(corpo)) {
    falhar(`${t.rotuloJs}: decodificarRevert() nao corta os 4 bytes do seletor (dados.slice(10)) antes de ` +
      "ler os argumentos da reversao.");
  }
}
notas.push("decodificarRevert() corta o seletor antes de ler argumento, nas duas telas");

/* --------------------------------------------------------- ligacoes HTML -- */
for (const t of TELAS)
  for (const src of t.tags)
    if (!t.fonteHtml.includes(`src="${src}"`)) falhar(`${t.rotuloHtml} nao carrega ${src}`);

/* --------------------------------------------- a simulacao nao pode voltar --
   /console/ serviu uma simulacao ate 2026-08-12, com dois banners dizendo isso.
   O criterio de aceite da onda nao foi "o texto sumiu" — foi que a CAMADA saiu,
   e o texto com ela. Esta checagem cobra as duas metades: nenhuma palavra da
   familia, E a presenca do que so existe quando a carteira e real. Sem a segunda
   metade, apagar o engine inteiro passaria. */
for (const t of TELAS) {
  for (const [nome, texto] of [[t.rotuloJs, semComentarioJs(t.fonteJs)],
                               [t.rotuloHtml, semComentarioHtml(t.fonteHtml)]]) {
    const achados = [...texto.matchAll(/SIMULATION MODE|SIMULATED WALLET/gi)];
    if (achados.length)
      falhar(`${nome} contem "${achados[0][0]}" ${achados.length}x — a tela voltou a ser uma simulacao, ` +
        "ou voltou a se anunciar como uma");
  }
  for (const exigido of [/window\.ethereum/, /eth_sendTransaction/])
    if (!exigido.test(t.fonteJs))
      falhar(`${t.rotuloJs} nao fala com uma carteira real (${exigido.source} ausente) — uma tela que ` +
        "oferece assinatura e nao chama a carteira e a simulacao de volta, com outro nome");
}
notas.push("as duas telas chamam a carteira de verdade e nenhuma se anuncia como simulacao");

/* ------------------------------------------------------------------ saida - */
if (falhas.length) {
  console.error(`✗ console: ${falhas.length} falha(s)`);
  for (const f of falhas) console.error("  " + f);
  process.exit(1);
}
console.log(`✓ console: ${TELAS.length} telas · assinaturas conferidas contra o ABI compilado · zero seletor e zero endereco a mao · carteira na allowlist de 4`);
for (const n of notas) console.log("  " + n);
