#!/usr/bin/env node
/**
 * PORTAO · o que o site DECLARA sobre si tem de ser o que a borda SERVE.
 *
 * Tres declaracoes, todas escritas a mao e todas sujeitas a envelhecer sem que
 * ninguem perceba, porque nenhuma delas quebra nada quando erra:
 *
 *   - `sitemap.xml`      · "indexem estas URLs"
 *   - `<link canonical>` · "esta pagina mora aqui"
 *   - `<meta og:url>`    · "o cartao aponta para aqui"
 *
 * POR QUE ELE EXISTE
 * ------------------
 * Medido em 2026-09-07, depois da onda que tirou o conteudo anterior do ar:
 * das 14 URLs do sitemap, ONZE ja nao eram servidas — /learn e as seis filhas,
 * /safety, /simulate, /chains, /dashboard tinham virado 308 para `/` no mesmo
 * dia. E SETE rotas vivas nao estavam la, incluindo os tres modelos oficiais e
 * o Whitepaper que o fundador mandou preservar.
 *
 * Nenhum portao viu, porque sitemap errado nao derruba pagina: ele so pede que
 * indexem o que a casa ja tirou do ar. E o defeito mais silencioso que ha —
 * custa trafego, nao erro.
 *
 * Junto, `/positions/` declarava canonical e og:url em `/positions`, sem barra.
 * A rota servida tem barra; a declarada devolve 308. Cada compartilhamento
 * pagava um salto, e o sinal ficava dividido entre duas URLs.
 *
 * O QUE ELE REPROVA
 * -----------------
 *   1. URL no sitemap que a borda nao serve com 200 (redirecionada ou retida)
 *   2. rota viva que o sitemap nao lista
 *   3. canonical ou og:url que nao e exatamente a rota servida
 *   4. sitemap sem nenhuma URL, ou ausente
 *
 * A 4 e a trava anti-cegueira: apagar o sitemap nao pode deixar este portao
 * verde por falta de assunto.
 */
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { rotaDoArquivo, retidos, naoPublica } from "./csp-por-rota.mjs";

const RAIZ = join(import.meta.dirname, "..");
const SITE = join(RAIZ, "site");
const ORIGEM = "https://triviu.vercel.app";

const RETIDOS = retidos(RAIZ);

function* varrer(dir) {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) yield* varrer(p);
    else if (nome.endsWith(".html")) yield p;
  }
}

const paginas = [];
for (const abs of varrer(SITE)) {
  const rel = relative(SITE, abs).split(sep).join("/");
  if (naoPublica(RETIDOS, rel)) continue;
  paginas.push({ rel, abs, rota: rotaDoArquivo(rel), html: readFileSync(abs, "utf8") });
}

const falhas = [];

/* ── sitemap ─────────────────────────────────────────────────────────────── */
const smPath = join(SITE, "sitemap.xml");
let listadas = [];
if (!existsSync(smPath)) {
  falhas.push("site/sitemap.xml nao existe. Um sitemap ausente nao e um sitemap " +
    "correto — e este portao nao julga o vazio.");
} else {
  const xml = readFileSync(smPath, "utf8");
  listadas = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map((m) => m[1]);
  if (listadas.length === 0) {
    falhas.push("site/sitemap.xml nao lista nenhuma URL.");
  }
}

const servidas = new Set(paginas.map((p) => p.rota));
const noSitemap = new Set();

for (const url of listadas) {
  if (!url.startsWith(ORIGEM)) {
    falhas.push(`sitemap: URL de outra origem · ${url}`);
    continue;
  }
  const rota = url.slice(ORIGEM.length) || "/";
  noSitemap.add(rota);
  if (!servidas.has(rota)) {
    falhas.push(`sitemap pede que indexem ${rota}, e a borda NAO serve essa rota ` +
      `(ou redireciona, ou o .vercelignore reteve o arquivo)`);
  }
}
for (const p of paginas) {
  if (!noSitemap.has(p.rota)) {
    falhas.push(`rota viva ausente do sitemap · ${p.rota}  (${p.rel})`);
  }
}

/* ── canonical e og:url ──────────────────────────────────────────────────── */
for (const p of paginas) {
  const esperado = ORIGEM + p.rota;
  const can = p.html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)/i);
  const og = p.html.match(/<meta[^>]*property=["']og:url["'][^>]*content=["']([^"']+)/i);
  for (const [nome, m] of [["canonical", can], ["og:url", og]]) {
    if (!m) continue; /* ausente e outra conversa; aqui julga-se o que AFIRMA */
    if (m[1] !== esperado) {
      falhas.push(`${p.rel} · ${nome} declara ${m[1]}\n      e a borda serve ${esperado}`);
    }
  }
}

console.log(`paginas publicadas: ${paginas.length}  ·  URLs no sitemap: ${listadas.length}`);
for (const p of paginas) {
  const c = p.html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)/i);
  const o = p.html.match(/<meta[^>]*property=["']og:url["'][^>]*content=["']([^"']+)/i);
  console.log(`  ${p.rota.padEnd(28)} sitemap:${noSitemap.has(p.rota) ? "sim" : "NAO"}` +
    `  canonical:${c ? (c[1] === ORIGEM + p.rota ? "ok" : "DIVERGE") : "—"}` +
    `  og:url:${o ? (o[1] === ORIGEM + p.rota ? "ok" : "DIVERGE") : "—"}`);
}

if (falhas.length) {
  console.error(`\nREPROVA · ${falhas.length} declaracao(oes) que a borda desmente:`);
  for (const f of falhas) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("\nOK · sitemap, canonical e og:url batem com o que a borda serve.");
