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
import { lerConfig, rotaDoArquivo, semScripts } from "./csp-por-rota.mjs";

const RAIZ = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const SITE = join(RAIZ, "site");

/* Cada excecao e uma divida com nome, nao uma dispensa. O motivo sai na tela em
   toda execucao — de proposito. */
/* 2026-09-07 · o modelo oficial do Site nao tem navegacao, e isso e um FATO DO
   MODELO, medido, nao uma opiniao sobre ele: o template carrega 14 `href`
   distintos, 12 ancoras da propria pagina (#pulse, #journey, #roadmap…) e 2
   hosts de fonte. Zero link para qualquer outra rota do site.

   Publicar o modelo "sem tirar e nem por" — direcao literal do fundador — custou
   o alcance de 8 rotas, medido A/B com a MESMA regua contra o index de HEAD
   (a749509): as 5 rotas dos proprios modelos, mais `/console/`, `/cofre/` e
   `/whitepaper/`, que penduravam na navegacao do index anterior.

   Nao ha conserto que caiba a quem executa: linkar exige escrever `href` DENTRO
   do modelo, e o modelo nao se toca. A divida fica declarada aqui, sai impressa
   toda vez, e a decisao e do fundador — a mesma linha de 2026-08-23 se aplica:
   "Se eu te dei uma arquitetura, e tudo, ela PRECISA SER IGUAL ao que eu dei." */
const SEM_NAVEGACAO_NO_MODELO =
  "o modelo oficial do Site nao linka para lugar nenhum (14 href: 12 ancoras + 2 hosts de " +
  "fonte). Chegar aqui pela navegacao exigiria escrever href dentro do modelo, e o modelo " +
  "nao se toca. Divida do fundador, nao do pipeline.";

/* Estas 13 NAO sao consequencia da troca do index — medido A/B: ja eram
   inalcancaveis com o index anterior. O portao antigo nao as via porque media
   "alguem linka" em vez de "chega-se desde /", e tres paginas que so se linkam
   entre si passavam. A regua nova acendeu divida velha; acender nao e criar. */
const JA_ERA_ANTES =
  "ja era inalcancavel desde / ANTES da troca do index (medido A/B contra HEAD a749509). " +
  "O portao antigo media 'alguem linka' e nao 'chega-se desde /', entao ilha de paginas " +
  "que so se linkam entre si passava. Divida herdada, agora visivel.";

const EXCECOES = {
  "/TRIVIU-Site-V6/": SEM_NAVEGACAO_NO_MODELO,
  "/TRIVIU-Console-V5.4.3": SEM_NAVEGACAO_NO_MODELO,
  "/TRIVIU-Labs-V5/": SEM_NAVEGACAO_NO_MODELO,
  "/TRIVIU-Brandbook-V3.3": SEM_NAVEGACAO_NO_MODELO,
  "/TRIVIU-Design-System-V4.2": SEM_NAVEGACAO_NO_MODELO,
  "/console/": SEM_NAVEGACAO_NO_MODELO + " ERA alcancavel pelo index anterior — esta e a rota do " +
    "console da V0, que toca carteira; perder o caminho ate ela e o item mais caro desta lista.",
  "/cofre/": SEM_NAVEGACAO_NO_MODELO + " ERA alcancavel pelo index anterior.",
  "/whitepaper/": SEM_NAVEGACAO_NO_MODELO + " ERA alcancavel pelo index anterior.",

  "/learn/": JA_ERA_ANTES,
  "/learn/amm/": JA_ERA_ANTES,
  "/learn/cycle/": JA_ERA_ANTES,
  "/learn/fee-wall/": JA_ERA_ANTES,
  "/learn/mev/": JA_ERA_ANTES,
  "/learn/run/": JA_ERA_ANTES,
  "/learn/safety/": JA_ERA_ANTES,
  "/safety/": JA_ERA_ANTES,
  "/dashboard/": JA_ERA_ANTES,
  "/chains/": JA_ERA_ANTES,
  "/calldata/": JA_ERA_ANTES,
  "/simulate/": JA_ERA_ANTES,
  "/positions/": JA_ERA_ANTES,

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

/* A rota que cada arquivo serve vem de `csp-por-rota.mjs`, fonte unica desta
   casa desde 2026-09-07. O `rotaDe` local que vivia aqui devolvia
   `/TRIVIU-Console-V5.4.3/`; a Vercel serve `/TRIVIU-Console-V5.4.3`, SEM barra,
   porque le o ponto da versao como extensao de arquivo. Medido nas 27 rotas do
   preview dpl_HnyeuwfUdgPC9vmudLhtJ5zFHcQE. Duas regras de rota na mesma casa
   viram duas verdades, e a que estava errada era esta. */
const rotaDe = rotaDoArquivo;

/* Rota que so existe como REDIRECIONAMENTO tambem e alcancavel: quem chega nela
   chega ao destino. */
const redirs = new Map();
try {
  for (const r of lerConfig(RAIZ).redirects || []) {
    if (r.has) continue;                               /* condicional a host: outro assunto */
    if (r.source.includes("(")) continue;              /* curinga: nao resolve para uma rota so */
    redirs.set(r.source.endsWith("/") || r.source.includes(".") ? r.source : r.source + "/",
               r.destination);
  }
} catch (e) {
  falhas.push(`vercel.json ilegivel — falha fechada: ${e.message}`);
}

/* ------------------------------------------------- para onde se aponta ----- *
 * ABSOLUTO E RELATIVO. Ate 2026-09-07 esta medicao pulava href relativo com o
 * comentario "fora do alcance desta medicao", e isso deixou de ser verdade no
 * dia em que os modelos oficiais entraram: eles se cruzam SO por href relativo
 * (`TRIVIU-Console-V5.4.3.html`). Cinco paginas linkadas apareceriam como orfas,
 * e — pior — os 10 links relativos QUEBRADOS das copias de alias nao apareceriam
 * de jeito nenhum, porque o portao nem olhava para eles.
 *
 * E ALCANCE, nao popularidade. "Alguem linka" e fraco: tres paginas que so se
 * linkam entre si formam uma ilha que ninguem chega pela porta. O que se mede
 * aqui e caminhada a partir de `/`. */
const saidasDe = new Map();
const quebrados = [];
for (const rel of paginas) {
  const html = semScripts(readFileSync(join(SITE, rel), "utf8"));
  const saidas = new Set();
  for (const m of html.matchAll(/href\s*=\s*["']([^"']+)["']/g)) {
    let h = m[1].split("#")[0].split("?")[0];
    if (!h || /^[a-z]+:/i.test(h)) continue;           /* http:, mailto:, tel: */
    if (!h.startsWith("/")) {
      const base = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/") + 1) : "";
      const alvo = (base + h).replace(/[^/]+\/\.\.\//g, "");
      if (!paginas.includes(alvo)) {
        if (/\.html$/.test(alvo) && !naoPublica(rel))
          quebrados.push(`${rel} aponta para "${h}", que resolve para ${alvo} e nao existe — 404`);
        continue;
      }
      saidas.add(rotaDe(alvo));
      continue;
    }
    if (h.endsWith(".html")) h = rotaDe(h.slice(1));
    else if (!h.endsWith("/") && !h.split("/").pop().includes(".")) h += "/";
    saidas.add(h);
  }
  saidasDe.set(rotaDe(rel), saidas);
}
for (const q of quebrados) falhas.push(q);

/* ------------------------------------------- caminhada a partir da porta --- */
const alcancadas = new Set(["/"]);
const fila = ["/"];
while (fila.length) {
  const atual = fila.shift();
  for (const alvo of saidasDe.get(atual) || []) {
    const destino = redirs.get(alvo) || alvo;
    if (alcancadas.has(destino)) continue;
    alcancadas.add(destino);
    fila.push(destino);
  }
}

/* ------------------------------------------------------------ o juizo ----- */
let linkadas = 0, retidas = 0, excecoes = 0;
for (const rel of paginas.sort()) {
  const rota = rotaDe(rel);
  if (rota === "/") continue;                          /* a raiz e a porta; ninguem a linka */
  if (naoPublica(rel)) { retidas += 1; notas.push(`${rota.padEnd(28)} retida por .vercelignore — nao publica`); continue; }
  if (alcancadas.has(rota)) { linkadas += 1; continue; }
  if (EXCECOES[rota]) {
    excecoes += 1;
    notas.push(`${rota.padEnd(28)} ORFA DECLARADA · ${EXCECOES[rota]}`);
    continue;
  }
  falhas.push(`${rota} publica e NAO SE CHEGA NELA caminhando desde / (${rel}). ` +
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
