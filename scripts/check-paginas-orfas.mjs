#!/usr/bin/env node
/**
 * PAGINA QUE PUBLICA E QUE NINGUEM LINKA.
 *
 * `vercel.json` declara `outputDirectory: "site"`. O deploy sobe o DISCO — nao o
 * commit, nao o que a navegacao alcanca. Um HTML dentro de site/ passa a
 * responder numa URL real assim que alguem roda `vercel --prod`, mesmo que
 * nenhuma pagina aponte para ele e mesmo que ele nem esteja commitado.
 *
 * O problema nao e a URL existir. E que uma pagina que ninguem alcanca e uma
 * pagina que ninguem RELE. Ela nao aparece em revisao de navegacao, nao aparece
 * em teste de fluxo, nao aparece quando alguem confere "o site esta certo?" — e
 * fica servindo o que quer que estivesse escrito nela no dia em que foi
 * esquecida.
 *
 * COMO ISTO NASCEU (2026-08-23, medido, nao suposto). Tres paginas estavam nesse
 * estado ao mesmo tempo:
 *
 *   /v0/     · o modelo do console, que declara na propria fonte "Wallet and
 *              chain are SIMULATED. Nothing here reaches a real network" — e que
 *              carregava um caminho de assinatura sem congelamento (VETO
 *              TUBARAO-25). Iria ao ar no proximo deploy.
 *   /cofre/  · a UNICA tela que passa nas onze regras do check-assinatura. Ela
 *              publicava e nao havia como chegar nela. A tela provada era a
 *              inalcancavel.
 *   /console/· o ciclo de vida no LPVault, que opera a LINHA ANTIGA.
 *
 * Nenhuma das tres era um erro de digitacao. Cada uma tinha uma historia
 * propria, e o que elas tinham em comum era so isto: ninguem ia reler nenhuma.
 *
 * O QUE ESTE PORTAO ACEITA COMO RESPOSTA. Duas, e as duas sao explicitas:
 *
 *   1. a pagina e LINKADA por outra pagina do site — ela entrou na navegacao e
 *      passa a ser relida junto com o resto;
 *   2. a pagina esta em `.vercelignore` — ela nao publica, entao nao ha URL para
 *      esquecer. O arquivo e lido do DISCO: uma regra que aponta para um caminho
 *      que nao existe mais reprova, porque regra obsoleta protege zero e parece
 *      protecao.
 *
 * Ha uma terceira, e ela e deliberadamente cara: a lista EXCECOES abaixo, onde
 * cada entrada carrega o motivo por escrito e o motivo e IMPRESSO em toda
 * execucao. Uma excecao que ninguem le vira permissao; uma que aparece toda vez
 * que o portao roda continua sendo uma divida.
 *
 *   node scripts/check-paginas-orfas.mjs
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";

const RAIZ = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const SITE = join(RAIZ, "site");

/* Cada excecao e uma divida com nome, nao uma dispensa. O motivo sai na tela em
   toda execucao — de proposito. */
const EXCECOES = {
  /* Era `/console/` ate 2026-08-24. A rota trocou de dono por decisao do
     fundador — *"e para por nesse endereco"* — e o console da V0 assumiu
     `/console/`, que e onde quem usa espera encontrar o produto. A linha ANTIGA
     mudou-se para `/lp/`, que e o nome do que ela faz: provisao de liquidez.
     A divida e a mesma e continua declarada aqui, so que na rota nova. */
  "/lp/":
    "opera a LINHA ANTIGA (TriviuLPVault 0xC52BaD28…, taxa de 30% DO LUCRO). Linka-la " +
    "da mesma navegacao que leva ao console da V0 (0,5% DO NEGOCIADO) poe as duas linhas " +
    "lado a lado sem dizer que sao linhas diferentes, e as bases das duas taxas nao se " +
    "comparam. Medido em 2026-08-24 antes da troca de rota: o TriviuLPVault guarda ZERO " +
    "USDC, ZERO WETH e ZERO POL, entao tirar a tela do endereco principal nao deixou " +
    "ninguem sem interface para dinheiro vivo. Sair desta lista exige decidir o que a " +
    "navegacao diz sobre as duas — decisao de produto, nao de pipeline.",
};

const falhas = [];
const notas = [];

/* --------------------------------------------------- o que NAO publica ----- */
const ignorados = [];
const vign = join(RAIZ, ".vercelignore");
if (existsSync(vign)) {
  for (const linha of readFileSync(vign, "utf8").split(/\r?\n/)) {
    const p = linha.trim();
    if (!p || p.startsWith("#")) continue;
    ignorados.push(p.replace(/\/+$/, ""));
    /* Regra que aponta para caminho inexistente nao protege nada e parece que
       protege. Ela reprova aqui, no dia em que o caminho some. */
    if (!existsSync(join(RAIZ, p))) {
      falhas.push(`.vercelignore lista "${p}", que nao existe no disco — regra obsoleta ` +
        "nao retem coisa alguma e ocupa o lugar de uma que reteria");
    }
  }
}
const naoPublica = (rel) => ignorados.some((i) => ("site/" + rel).startsWith(i + "/") || "site/" + rel === i);

/* -------------------------------------------------------- as paginas ------- */
const paginas = [];
(function andar(d) {
  for (const nome of readdirSync(d)) {
    const p = join(d, nome);
    if (statSync(p).isDirectory()) andar(p);
    else if (nome.endsWith(".html")) paginas.push(relative(SITE, p).split(sep).join("/"));
  }
})(SITE);

/* `cleanUrls: true` + `trailingSlash: true` no vercel.json: tanto `a/index.html`
   quanto `a.html` respondem em `/a/`. As duas formas viram a mesma rota, porque
   e a mesma URL que o navegador pede. */
const rotaDe = (rel) =>
  rel === "index.html" ? "/"
    : rel.endsWith("/index.html") ? "/" + rel.slice(0, -"index.html".length)
    : "/" + rel.slice(0, -".html".length) + "/";

/* ------------------------------------------------- para onde se aponta ----- */
const apontadas = new Set();
for (const rel of paginas) {
  const html = readFileSync(join(SITE, rel), "utf8");
  for (const m of html.matchAll(/href\s*=\s*"([^"]+)"/g)) {
    let h = m[1].split("#")[0].split("?")[0];
    if (!h || /^[a-z]+:/i.test(h)) continue;          /* http:, mailto:, tel: */
    if (!h.startsWith("/")) continue;                  /* relativo: fora do alcance desta medicao */
    if (h.endsWith(".html")) h = rotaDe(h.slice(1));
    else if (!h.endsWith("/")) h += "/";
    apontadas.add(h);
  }
}

/* ------------------------------------------------------------ o juizo ----- */
let linkadas = 0, retidas = 0, excecoes = 0;
for (const rel of paginas.sort()) {
  const rota = rotaDe(rel);
  if (rota === "/") continue;                          /* a raiz e a porta; ninguem a linka */
  if (naoPublica(rel)) { retidas += 1; notas.push(`${rota.padEnd(14)} retida por .vercelignore — nao publica`); continue; }
  if (apontadas.has(rota)) { linkadas += 1; continue; }
  if (EXCECOES[rota]) {
    excecoes += 1;
    notas.push(`${rota.padEnd(14)} ORFA DECLARADA · ${EXCECOES[rota]}`);
    continue;
  }
  falhas.push(`${rota} publica e nenhuma pagina do site aponta para ela (${rel}). ` +
    "Pagina que ninguem alcanca e pagina que ninguem rele — e ela serve o que estiver " +
    "escrito nela ate alguem lembrar que existe. Linke-a, ponha-a em .vercelignore, ou " +
    "declare-a em EXCECOES com o motivo.");
}

/* Uma excecao que sobrou depois de o caminho sumir e uma frase orfa sobre uma
   pagina orfa. */
for (const rota of Object.keys(EXCECOES)) {
  if (!paginas.some((rel) => rotaDe(rel) === rota)) {
    falhas.push(`EXCECOES declara ${rota}, e nenhuma pagina responde nessa rota — ` +
      "excecao para pagina que nao existe so serve para envelhecer.");
  }
}

if (falhas.length) {
  console.error(`✗ paginas orfas: ${falhas.length} falha(s)`);
  for (const f of falhas) console.error("  " + f);
  process.exit(1);
}
console.log(`✓ paginas orfas: ${paginas.length} pagina(s) em site/ · ${linkadas} alcancavel(is) pela navegacao · ` +
  `${retidas} retida(s) fora do ar · ${excecoes} orfa(s) declarada(s) com motivo`);
for (const n of notas) console.log("  " + n);
