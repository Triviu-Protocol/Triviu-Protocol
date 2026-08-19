#!/usr/bin/env node
/**
 * Guardian: os tres gates que o Tubarao-branco cravou para qualquer pagina que
 * peca assinatura de carteira (ONDA-F1, bloco eb7bf221).
 *
 *   1. CSP declarada, com script-src do proprio dominio
 *   2. three.js do proprio dominio OU com integrity (SRI)
 *   3. a pagina que assina nao compartilha origem com pagina que carrega terceiro
 *
 * Por que um guardiao e nao um commit: os tres gates nao sao um estado, sao uma
 * invariante. O header pode ser cravado hoje e a proxima pagina reintroduzir um
 * <script> inline — e ai o CSP nao afrouxa, a pagina simplesmente para de
 * funcionar; ou pior, alguem afrouxa o CSP para a pagina voltar a funcionar, e a
 * origem que assina volta a aceitar script injetado. As duas saidas sao ruins e
 * as duas sao silenciosas. Este check torna as duas barulhentas.
 *
 * Nota sobre hash de script inline: foi considerado e DESCARTADO. O repo esta em
 * core.autocrlf=true e as blobs tem line endings mistos — medido 2026-08-12,
 * site/index.html tinha 2627 linhas com CR na blob e 3116 na worktree. Hash
 * sha256 calculado na worktree NAO bate com o byte que a Vercel serve a partir da
 * blob. Um CSP baseado em hash passaria local e quebraria so em producao. Por
 * isso os blocos inline foram extraidos para /js/*.js e o script-src e 'self'
 * puro: sem byte para bater, sem armadilha de line ending.
 *
 *   node scripts/check-csp.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, relative, sep } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const SITE = join(ROOT, "site");

/* three.js r128, conferido em 2026-08-12 contra o SRI que o proprio cdnjs
   publica em api.cdnjs.com/libraries/three.js/r128?fields=sri — endpoint
   diferente do que serviu o arquivo, entao e conferencia cruzada e nao eco. */
const VENDOR = {
  "vendor/three-r128.min.js":
    "dLxUelApnYxpLt6K2iomGngnHO83iUvZytA3YjDUCjT0HDOHKXnVYdf3hU4JjM8uEhxf9nD1/ey98U3t2vZ0qQ==",
};

const falhas = [];
const notas = [];
const falhar = (m) => falhas.push(m);

/* ------------------------------------------------------------ vercel.json -- */
let cfg;
const CAMINHO_CFG = join(ROOT, "vercel.json");
try {
  cfg = JSON.parse(readFileSync(CAMINHO_CFG, "utf8"));
} catch (e) {
  console.error(`✗ vercel.json nao e JSON valido: ${e.message}`);
  console.error("  Sem parse, a Vercel ignora o arquivo inteiro e o site vai ao ar SEM CSP.");
  process.exit(1);
}

const regra = (cfg.headers || []).find((h) => h.source === "/(.*)");
if (!regra) falhar("vercel.json: nenhuma regra de header em '/(.*)' — o CSP nao cobriria o site inteiro");

const cabecalho = (nome) =>
  regra && (regra.headers || []).find((h) => h.key.toLowerCase() === nome.toLowerCase());

const csp = cabecalho("Content-Security-Policy");
if (!csp) falhar("vercel.json: Content-Security-Policy ausente — GATE 1 nao existe");

/** "script-src 'self'; img-src 'self' data:" -> { "script-src": ["'self'"], … } */
const diretivas = {};
if (csp) {
  for (const parte of csp.value.split(";")) {
    const t = parte.trim().split(/\s+/).filter(Boolean);
    if (t.length) diretivas[t[0].toLowerCase()] = t.slice(1);
  }
}

/* --------------------------------------------------------------- GATE 1 --- */
const scriptSrc = diretivas["script-src"];
if (!scriptSrc) {
  falhar("CSP sem script-src — a diretiva que o gate 1 exige nomeadamente");
} else {
  for (const proibido of ["'unsafe-inline'", "'unsafe-eval'", "'unsafe-hashes'", "*", "data:", "https:", "http:"]) {
    if (scriptSrc.includes(proibido))
      falhar(`CSP script-src contem ${proibido} — script-src deixa de ser "do proprio dominio"`);
  }
  const externos = scriptSrc.filter((f) => /^(https?:)?\/\//.test(f));
  if (externos.length) falhar(`CSP script-src permite origem de terceiro: ${externos.join(" ")}`);
  if (!scriptSrc.includes("'self'")) falhar("CSP script-src nao contem 'self'");
}

/* worker-src 'none' e o que impede que um script injetado registre um service
   worker e passe a interceptar TODA pagina desta origem, inclusive a que assina.
   Medido 2026-08-12: nenhuma pagina do site usa worker. Custa zero, fecha muito. */
if (diretivas["worker-src"]?.[0] !== "'none'")
  falhar("CSP sem worker-src 'none' — um script injetado poderia registrar service worker e persistir na origem");

for (const [dir, esperado] of [
  ["object-src", "'none'"],
  ["base-uri", "'none'"],
  ["frame-ancestors", "'none'"],
]) {
  if (diretivas[dir]?.[0] !== esperado) falhar(`CSP sem ${dir} ${esperado}`);
}

for (const h of ["Cross-Origin-Opener-Policy", "X-Content-Type-Options", "Referrer-Policy"]) {
  if (!cabecalho(h)) falhar(`header ${h} ausente`);
}

/* ------------------------------------------------------ varredura do site -- */
const htmls = [];
(function andar(d) {
  for (const nome of readdirSync(d)) {
    const p = join(d, nome);
    if (statSync(p).isDirectory()) andar(p);
    else if (nome.endsWith(".html")) htmls.push(p);
  }
})(SITE);

const TAG_SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const atr = (s, nome) => s.match(new RegExp(`${nome}\\s*=\\s*"([^"]*)"`, "i"))?.[1];

const hostsSubrecurso = new Set();

for (const arquivo of htmls) {
  const rel = relative(SITE, arquivo).split(sep).join("/");
  const html = readFileSync(arquivo, "utf8");

  for (const m of html.matchAll(TAG_SCRIPT)) {
    const atributos = m[1];
    const src = atr(atributos, "src");

    if (!src) {
      /* Bloco de dados (ld+json) nao e script executavel: o navegador nao o
         "prepara" para execucao, entao o script-src nao o avalia. Qualquer
         outro type inline e script de verdade e quebraria sob 'self'. */
      const tipo = (atr(atributos, "type") || "").toLowerCase();
      if (tipo !== "application/ld+json")
        falhar(`${rel}: <script> inline (type="${tipo || "javascript"}") — o CSP desta origem o recusa; extraia para /js/*.js`);
      continue;
    }

    if (/^(https?:)?\/\//.test(src)) {
      const host = new URL(src.startsWith("//") ? "https:" + src : src).host;
      hostsSubrecurso.add(host);
      /* GATE 2 + GATE 3: script de terceiro so passa com SRI — e mesmo com SRI
         ele continua sendo terceiro executando nesta origem, que e exatamente o
         que o gate 3 nao quer ao lado de uma pagina que assina. */
      if (!atr(atributos, "integrity"))
        falhar(`${rel}: <script src="${src}"> de terceiro SEM integrity — GATE 2`);
      else
        falhar(`${rel}: <script src="${src}"> e terceiro nesta origem — com SRI, mas GATE 3 pede a origem limpa`);
    }
  }

  /* Handler em atributo e script inline com outro nome. Sob script-src 'self'
     ele nao roda, e a falha e silenciosa: o botao simplesmente nao responde. */
  for (const m of html.matchAll(/\son(?:click|load|error|change|input|submit|focus|blur|keydown|keyup|mouse[a-z]+)\s*=\s*"/gi))
    falhar(`${rel}: handler inline (${m[0].trim().replace(/=.*/, "")}) — nao executa sob script-src 'self'`);

  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const rel_ = (atr(m[0], "rel") || "").toLowerCase();
    const href = atr(m[0], "href");
    if (!href || !/^(https?:)?\/\//.test(href)) continue;
    const host = new URL(href.startsWith("//") ? "https:" + href : href).host;

    /* DICA DE RECURSO PARA TERCEIRO · o furo que passava por baixo do gate 3.
     *
     * Ate 2026-08-19 este bloco so recolhia stylesheet/icon/preload, e o teste
     * aplicado era "o host esta declarado em alguma diretiva do CSP?". Para
     * essas tres o teste faz sentido: host nao declarado = pagina quebrada.
     *
     * Para `preconnect` e `dns-prefetch` o teste e o ERRADO, e errado no
     * sentido perigoso — nao no sentido chato. Essas duas nao carregam recurso
     * nenhum: mandam o navegador resolver o DNS e abrir o TLS com o terceiro,
     * e isso acontece ANTES de qualquer diretiva opinar. A CSP nao as governa.
     * Um `preconnect` para fonts.gstatic.com nao quebraria a pagina e nao
     * apareceria em relatorio de violacao; entregaria o IP e o User-Agent de
     * quem esta lendo a tela de assinatura, em silencio, e o gate 3 continuaria
     * imprimindo "zero terceiro".
     *
     * `prefetch` / `prerender` / `modulepreload` entram na mesma regra por um
     * motivo diferente: a cobertura da CSP sobre elas varia por navegador
     * (prefetch-src foi proposto e retirado). Um portao que depende de qual
     * navegador o visitante usa nao e portao.
     *
     * Medido nesta data: zero ocorrencia em site/**.html. Este bloco fecha o
     * furo do portao, nao uma exposicao de hoje — a diferenca esta dita para
     * ninguem ler mais do que esta escrito.
     */
    const DICAS_QUE_A_CSP_NAO_GOVERNA = ["preconnect", "dns-prefetch", "prefetch", "prerender", "modulepreload"];
    const dica = DICAS_QUE_A_CSP_NAO_GOVERNA.find((d) => rel_.split(/\s+/).includes(d));
    if (dica) {
      falhar(
        `${rel}: <link rel="${dica}"> aponta para ${host}. Isso resolve DNS e abre TLS com um ` +
        `terceiro antes de qualquer diretiva da CSP opinar — nao quebra a pagina, nao gera ` +
        `relatorio de violacao, e entrega IP e User-Agent de quem le a tela. Hospede o recurso ` +
        `nesta origem, como as 20 fontes woff2 ja estao, ou remova a dica.`
      );
      continue;
    }

    if (rel_.includes("stylesheet") || rel_ === "icon" || rel_.includes("preload"))
      hostsSubrecurso.add(host);
  }
}

/* Todo host de subrecurso tem de estar declarado em ALGUMA diretiva do CSP.
   Um host novo que ninguem liberou nao vira erro de seguranca: vira pagina
   quebrada em producao, que e como um CSP acaba afrouxado as pressas. */
const permitidos = new Set(Object.values(diretivas).flat().map((f) => f.replace(/^https?:\/\//, "")));
for (const host of hostsSubrecurso)
  if (!permitidos.has(host))
    falhar(`host ${host} e carregado pelo HTML mas nao esta em nenhuma diretiva do CSP — quebraria em producao`);

/* ------------------------------------------------------- copia vendorizada - */
for (const [rel, sri] of Object.entries(VENDOR)) {
  let bytes;
  try {
    bytes = readFileSync(join(SITE, rel));
  } catch {
    falhar(`${rel} ausente — index.html aponta para ele e a cena 3D some`);
    continue;
  }
  const atual = createHash("sha512").update(bytes).digest("base64");
  if (atual !== sri) {
    falhar(`${rel}: sha512 divergiu do conferido contra o cdnjs`);
    falhar(`  esperado sha512-${sri.slice(0, 24)}…`);
    falhar(`  atual    sha512-${atual.slice(0, 24)}…`);
  } else {
    notas.push(`${rel} bate o SRI publicado pelo cdnjs (sha512-${sri.slice(0, 16)}…)`);
  }
}

/* ----------------------------------------------------------------- saida --- */
if (falhas.length) {
  console.error("✗ gates de assinatura: " + falhas.length + " falha(s)");
  for (const f of falhas) console.error("  " + f);
  process.exit(1);
}
console.log(`✓ gates de assinatura: CSP script-src 'self' sem inline · ${htmls.length} paginas varridas · zero script de terceiro`);
for (const n of notas) console.log(`  ${n}`);
