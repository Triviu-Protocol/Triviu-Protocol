#!/usr/bin/env node
/* PORTAO DO F-3 · nenhuma pagina publicada volta a ter estilo inline · 2026-08-19
 * ---------------------------------------------------------------------------
 * F-3, nas palavras do Tubarao-branco em 2026-08-12: "style-src 'unsafe-inline'
 * vira spoofing quando houver assinatura." Quem injeta CSS reescreve o cartao
 * que o usuario le antes de clicar, sem trocar um caractere do texto.
 *
 * O conserto foi mecanico: 483 atributos `style=` viraram 129 classes derivadas
 * do proprio valor, e os 16 blocos <style> sairam para arquivo. Este portao
 * existe porque conserto sem guarda volta — basta um `style="margin-top:8px"`
 * digitado sem pensar para a diretiva ter de ser reaberta.
 *
 * Verifica TRES coisas, e as tres tem de valer ao mesmo tempo:
 *   1. nenhuma pagina tem atributo `style=`
 *   2. nenhuma pagina tem bloco <style> inline
 *   3. a CSP nao nomeia 'unsafe-inline' em lugar nenhum
 *
 * Falha FECHADA: se o vercel.json nao puder ser lido ou nao tiver CSP, recusa.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = join(RAIZ, "site");

const htmls = [];
(function andar(d) {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) andar(p);
    else if (e.endsWith(".html")) htmls.push(p);
  }
})(SITE);

const falhas = [];
let atributos = 0, blocos = 0;

for (const p of htmls) {
  const s = readFileSync(p, "utf8");
  const rel = relative(RAIZ, p).split(String.fromCharCode(92)).join("/");
  const a = [...s.matchAll(/\sstyle="/g)];
  const b = [...s.matchAll(/<style(?![^>]*\ssrc=)/g)];
  atributos += a.length;
  blocos += b.length;
  for (const m of a) falhas.push(`${rel}:${s.slice(0, m.index).split("\n").length} atributo style= — use uma classe de /vendor/estilos-inline.css`);
  for (const m of b) falhas.push(`${rel}:${s.slice(0, m.index).split("\n").length} bloco <style> inline — extraia para /vendor/estilos/`);
}

/* REGRA 4 · A ORDEM DAS FOLHAS, e ela nao e cosmetica.
   `[hidden]{display:none!important}` tem especificidade (0,1,0) — a MESMA de
   `.u-xxxxxxxx{display:flex !important}`. Com !important dos dois lados e
   especificidade igual, vence QUEM VEM DEPOIS. As utilidades tem de carregar
   ANTES da folha da pagina, senao um `display:flex` convertido passa a vencer
   `[hidden]` e elementos escondidos aparecem. Antes da conversao o inline ja
   perdia para o !important de autor, entao esta ordem e o que PRESERVA o
   comportamento — inverte-la e uma regressao que nenhuma contagem pega. */
for (const p of htmls) {
  const s = readFileSync(p, "utf8");
  const rel = relative(RAIZ, p).split(String.fromCharCode(92)).join("/");
  const iUtil = s.indexOf("/vendor/estilos-inline.css");
  const mPag = s.match(/href="\/vendor\/estilos\/[^"]+\.css"/);
  if (iUtil < 0) { falhas.push(`${rel}: nao carrega /vendor/estilos-inline.css`); continue; }
  if (mPag && s.indexOf(mPag[0]) < iUtil)
    falhas.push(`${rel}: a folha da pagina carrega ANTES das utilidades — [hidden] perde para display:flex`);
}

let csp;
try {
  const v = JSON.parse(readFileSync(join(RAIZ, "vercel.json"), "utf8"));
  csp = v.headers?.[0]?.headers?.find((h) => h.key === "Content-Security-Policy")?.value;
} catch (e) {
  console.error("vercel.json ilegivel — falha fechada:", e.message);
  process.exit(1);
}
if (!csp) { console.error("nenhuma Content-Security-Policy no vercel.json — falha fechada"); process.exit(1); }
if (csp.includes("unsafe-inline")) falhas.push(`vercel.json: a CSP nomeia 'unsafe-inline'`);

console.log(`portao F-3 · estilo inline · ${htmls.length} paginas varridas`);
console.log(`  atributos style= .... ${atributos}`);
console.log(`  blocos <style> ...... ${blocos}`);
console.log(`  CSP com unsafe-inline ${csp.includes("unsafe-inline") ? "SIM" : "nao"}`);

if (falhas.length) {
  console.error("\nF-3 REABERTO:");
  for (const f of falhas.slice(0, 12)) console.error("  - " + f);
  if (falhas.length > 12) console.error(`  ... e mais ${falhas.length - 12}`);
  process.exit(1);
}
console.log("\n✓ zero estilo inline · CSP sem unsafe-inline");
