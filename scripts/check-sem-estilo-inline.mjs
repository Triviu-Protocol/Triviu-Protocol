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
 *
 * ===========================================================================
 * 2026-08-19 · O PORTAO SO VARRIA .html, e o estilo inline entrava pelo .js
 * ===========================================================================
 *
 * O conserto do F-3 foi feito nos arquivos .html, e este portao foi escrito
 * para vigiar .html. Mas um `style="..."` escrito dentro de uma string de
 * JavaScript, entregue ao DOM por innerHTML, produz o MESMO atributo inline no
 * documento — sob a mesma diretiva que nao o permite.
 *
 * Medido em 2026-08-19 nos 12 arquivos de site/js: 53 ocorrencias de `style="`,
 * 52 delas em `modelo-2.js` (fora do git) e UMA em `simulate.js:158`, rastreada
 * e publicada. A CSP servida em producao naquela data, por `curl`:
 *
 *     Content-Security-Policy: default-src 'self'; script-src 'self';
 *                              style-src 'self'; font-src 'self'; ...
 *
 * `style-src 'self'` sem `unsafe-inline` e sem `unsafe-hashes` nao autoriza
 * atributo de estilo — nem escrito a mao no HTML, nem montado em JavaScript. O
 * portao dizia "zero estilo inline · CSP sem unsafe-inline" enquanto uma pagina
 * publicada montava um.
 *
 * O QUE ESTE PORTAO NAO PASSOU A VIGIAR, e a razao:
 *
 *   `el.style.cor = x` (CSSOM) NAO e violacao de F-3. A CSP nao restringe a
 *   propriedade `style` de um elemento acessada por script — so o ATRIBUTO.
 *   Sao 33 ocorrencias nos mesmos 12 arquivos, quase todas legitimas: barra de
 *   grafico, alternancia de tema, posicao de tooltip. Reprova-las aqui inflaria
 *   o portao com falso positivo ate alguem desliga-lo.
 *
 *   Escrita CSSOM tem juiz proprio, e ele existe: `check-alcance-dom.mjs`, que
 *   reprova `.style.` quando o alvo pertence a subarvore que assina. A divisao
 *   e de proposito — este portao cuida do que a CSP recusa, aquele cuida de
 *   quem alcanca o cartao que o usuario le.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { codigoNormalizado } from "./_comentarios.mjs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = join(RAIZ, "site");

const htmls = [];
const jss = [];
(function andar(d) {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) andar(p);
    else if (e.endsWith(".html")) htmls.push(p);
    else if (e.endsWith(".js")) jss.push(p);
  }
})(SITE);

const falhas = [];
let atributos = 0, blocos = 0;

for (const p of htmls) {
  const s = readFileSync(p, "utf8");
  const rel = relative(RAIZ, p).split(String.fromCharCode(92)).join("/");
  const a = [...s.matchAll(/\sstyle\s*=\s*["']/gi)];
  const b = [...s.matchAll(/<style(?![^>]*\ssrc=)/gi)];
  atributos += a.length;
  blocos += b.length;
  for (const m of a) falhas.push(`${rel}:${s.slice(0, m.index).split("\n").length} atributo style= — use uma classe de /vendor/estilos-inline.css`);
  for (const m of b) falhas.push(`${rel}:${s.slice(0, m.index).split("\n").length} bloco <style> inline — extraia para /vendor/estilos/`);
}

/* OS .js — o mesmo atributo, montado em string.
   Comentario nao e codigo: um `style="` dentro de um bloco de comentario nunca
   chega ao DOM, e reprova-lo seria falso positivo que ensina a ignorar o portao.

   O removedor vem de `_comentarios.mjs` e PRESERVA a numeracao de linha. Este
   arquivo nasceu com a versao ingenua — a que troca o bloco inteiro por um
   espaco — e por isso acusava `modelo-2.js:385` para uma violacao que esta na
   422. Trinta e sete linhas de deriva, num portao que aponta o defeito para
   quem vai conserta-lo. */

let cssom = 0;

for (const p of jss) {
  const bruto = readFileSync(p, "utf8");
  const s = codigoNormalizado(bruto);
  const rel = relative(RAIZ, p).split(String.fromCharCode(92)).join("/");
  const linhaDe = (i) => s.slice(0, i).split("\n").length;

  /* 1 · atributo de estilo montado em string */
  for (const m of s.matchAll(/[\s"'`>]style\s*=\s*["'`]/gi))
    falhas.push(
      `${rel}:${linhaDe(m.index)} monta um atributo style= numa string — ` +
      `a CSP desta origem e style-src 'self', que nao autoriza atributo de estilo. Use uma classe.`
    );

  /* 2 · setAttribute("style", ...) — mesmo atributo, outro caminho */
  for (const m of s.matchAll(/\.setAttribute\s*\(\s*["'`]style["'`]/gi))
    falhas.push(
      `${rel}:${linhaDe(m.index)} chama setAttribute("style", …) — e o mesmo atributo inline ` +
      `que a CSP recusa, so que escrito por outra porta. Use classList.`
    );

  /* 3 · bloco <style> montado em string */
  for (const m of s.matchAll(/<style[\s>]/gi))
    falhas.push(
      `${rel}:${linhaDe(m.index)} monta um bloco <style> numa string — injetado no DOM ele cai ` +
      `sob style-src e nao e aplicado. Extraia para /vendor/estilos/.`
    );

  /* CSSOM: contado, nunca reprovado aqui. A razao esta no cabecalho. */
  cssom += [...s.matchAll(/\.style\s*[.=]/g)].length;
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

console.log(`portao F-3 · estilo inline · ${htmls.length} paginas e ${jss.length} scripts varridos`);
console.log(`  atributos style= no html ... ${atributos}`);
console.log(`  blocos <style> no html ..... ${blocos}`);
console.log(`  CSP com unsafe-inline ...... ${csp.includes("unsafe-inline") ? "SIM" : "nao"}`);
console.log(`  escrita CSSOM nos scripts .. ${cssom}  (nao e materia deste portao — ver check-alcance-dom)`);

if (falhas.length) {
  console.error("\nF-3 REABERTO:");
  for (const f of falhas.slice(0, 12)) console.error("  - " + f);
  if (falhas.length > 12) console.error(`  ... e mais ${falhas.length - 12}`);
  process.exit(1);
}
console.log("\n✓ zero estilo inline · CSP sem unsafe-inline");
