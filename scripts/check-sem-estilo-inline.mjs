#!/usr/bin/env node
/* PORTAO DO F-3 · estilo inline nao volta a valer de graca · 2026-08-19
 * reescrito 2026-09-07 quando a CSP deixou de ser uma so
 * ---------------------------------------------------------------------------
 * F-3, nas palavras do Tubarao-branco em 2026-08-12: "style-src 'unsafe-inline'
 * vira spoofing quando houver assinatura." Quem injeta CSS reescreve o cartao
 * que o usuario le antes de clicar, sem trocar um caractere do texto.
 *
 * A REGRA ANTIGA e o que ela media
 *   1. nenhuma pagina tem `style=`
 *   2. nenhuma pagina tem bloco <style>
 *   3. a CSP nao nomeia 'unsafe-inline' em lugar nenhum
 *   ...com a (3) lendo `headers[0]`, porque `headers[0]` era a CSP inteira.
 *
 * POR QUE ELA NAO SERVE MAIS, e nao e porque ficou inconveniente:
 *   `vercel.json` tem 17 blocos. Lendo `headers[0]`, este portao ficaria VERDE
 *   sobre 16 blocos que nunca olhou — verde afirmando cobertura que nao tem, que
 *   e pior do que o afrouxamento que ele vigia.
 *
 * A REGRA DE AGORA, mais estreita onde importa e mais larga onde nao importava:
 *   1. toda pagina resolve para uma rota com politica; sem isso, RECUSA
 *   2. pagina que PODE ASSINAR nao aceita 'unsafe-inline' nem 'unsafe-hashes'
 *      em style-src — a proibicao do F-3, agora apontada para a tela de que ele
 *      falava. "Pode assinar" nao e o nome do arquivo: e alcancar um provedor
 *      EIP-1193, medido no HTML E nos .js que ele carrega.
 *   3. todo <style> e todo `style=` que sobrevivem tem de estar AUTORIZADOS
 *      pela politica DAQUELA rota — por hash, ou por 'unsafe-inline' onde a
 *      regra 2 permite. Isto e capacidade NOVA: a regra antiga so sabia dizer
 *      "existe estilo inline". Ela nunca soube dizer "existe estilo inline que
 *      a CSP RECUSA", que e o defeito de verdade — o estilo morto, o elemento
 *      sem a cor que o desenho pedia, e ninguem percebe ate alguem olhar.
 *   4. quem usa as classes `u-xxxxxxxx` continua obrigado a carregar
 *      /vendor/estilos-inline.css, e ANTES da folha da pagina (a ordem nao e
 *      cosmetica — ver comentario da regra 4 la embaixo)
 *
 * Falha FECHADA: vercel.json ilegivel, rota sem politica, ou politica sem
 * style-src — recusa. Guardiao que nao consegue medir diz que nao mediu.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  lerConfig, politicaDaRota, diretivasDe, rotaDoArquivo,
  hashCsp, podeAssinar, semScripts, retidos, naoPublica,
} from "./csp-por-rota.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = join(RAIZ, "site");

let cfg;
try {
  cfg = lerConfig(RAIZ);
} catch (e) {
  console.error("vercel.json ilegivel — falha fechada:", e.message);
  process.exit(1);
}

const htmls = [];
(function andar(d) {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) andar(p);
    else if (e.endsWith(".html")) htmls.push(p);
  }
})(SITE);

/* Os `style=` que um script escreve e que a CSP da rota recusa. Cada entrada
   e uma DIVIDA com data e dono, nao uma dispensa: o motivo sai impresso a cada
   execucao, e qualquer ocorrencia NOVA reprova.

   As quatro abaixo sao anteriores a esta onda — vieram de `77dfcab`, quando o
   style-src perdeu 'unsafe-inline'. Consertar exige tocar o codigo do console
   da V0, que e superfície de carteira e nao estava no escopo desta onda; a
   tecnica ja existe na casa (classe `u-<sha256>` em /vendor/estilos-inline.css,
   com !important, porque um `style=` vence qualquer regra normal de folha).
   Sair desta lista e decisao do fundador. */
/* 2026-09-07 · TUBARAO-07 FECHADO POR REMOCAO, nao por conserto.
   Os 49 `style=` que `site/js/console-v0.js` escrevia em execucao e a CSP
   recusava — onze deles carregando dado: largura de barra, cor de estado —
   sairam do ar junto com o console anterior, quando `/console/` passou a servir
   o modelo oficial. Divida que deixou de existir nao fica declarada: some.
   A entrada original esta preservada no git, em dd73ce5.

   A lista fica VAZIA de proposito, e a regra continua armada: qualquer `style=`
   novo que um script escreva reprova, porque nao ha declaracao que o cubra. */
const ESTILO_GERADO_DECLARADO = {};

const _EXEMPLO_DE_DECLARACAO = {
  "site/js/exemplo.js": {
    n: 0,
    motivo:
      "TUBARAO-07 · aberto 2026-09-07 pelo Tubarao-branco em N2, medindo /console/ NO AR: " +
      "2 atributos no DOM, 1 morto (`padding:var(--s3)`, L4562). A varredura da fonte achou " +
      "49 ocorrencias, 40 valores distintos, 12 com interpolacao. ONZE CARREGAM DADO, nao " +
      "espaco: `width:${pct}%` de barra (L1877, L1891), `background:${esc(v.color)}` de " +
      "estado (L1885, L3215, L4167, L4195), `animation-delay` (L3173, L3203, L3205). Morto, " +
      "a barra nunca enche e o estado nunca ganha cor — a tela mostra menos do que sabe. " +
      "Nasceu em 77dfcab, quando o style-src perdeu 'unsafe-inline'; aquele commit dizia " +
      "'a render proves the pages did not move', e o render mediu o estado que carregou. " +
      "Consertar exige tocar console-v0.js, superficie de carteira, fora do escopo da onda " +
      "dos modelos — Lei #3 regra 4, ratificacao do Tubarao-Apex. A tecnica ja existe na " +
      "casa: classe `u-<sha256>` em /vendor/estilos-inline.css com !important, e para os 12 " +
      "interpolados, `element.style.setProperty` (CSSOM, que a CSP nao inspeciona).",
  },
};

const falhas = [];
const notas = [];
const RETIDOS = retidos(RAIZ);
let atributos = 0, blocosEstilo = 0, autorizados = 0, mortos = 0, telasQueAssinam = 0;
let gerados = 0, retidas = 0;
/* O mesmo .js e carregado por mais de uma pagina; contar duas vezes daria uma
   divida inflada e uma base que nunca fecha. */
const jaContado = new Set();

for (const p of htmls) {
  const bruto = readFileSync(p, "utf8");
  const rel = relative(RAIZ, p).split(sep).join("/");
  const relSite = relative(SITE, p).split(sep).join("/");
  /* Pagina retida pelo .vercelignore nao chega a producao: nao ha CSP que a
     recuse porque nao ha resposta. Julga-la produz falha que ninguem pode
     consertar. */
  if (naoPublica(RETIDOS, relSite)) { retidas += 1; continue; }
  const rota = rotaDoArquivo(relSite);

  const pol = politicaDaRota(cfg, rota);
  if (!pol) { falhas.push(`${rel}: rota ${rota} nao casa com nenhum bloco de header — falha fechada`); continue; }
  const d = diretivasDe(pol.csp);
  const styleSrc = d["style-src"];
  if (!styleSrc) { falhas.push(`${rel}: a politica de ${rota} nao tem style-src — falha fechada`); continue; }

  const temInline = styleSrc.includes("'unsafe-inline'");
  const temHashesDeAtributo = styleSrc.includes("'unsafe-hashes'");
  const hashes = new Set(styleSrc.filter((f) => f.startsWith("'sha")));

  /* REGRA 2 · a proibicao do F-3, apontada para a tela de que ele falava. */
  const { assina, provas } = podeAssinar(bruto, p, SITE);
  if (assina) {
    telasQueAssinam += 1;
    if (temInline || temHashesDeAtributo)
      falhas.push(`${rel} PODE ASSINAR (${provas.join(", ")}) e a CSP de ${rota} traz ` +
        `${temInline ? "'unsafe-inline'" : "'unsafe-hashes'"} em style-src — F-3 REABERTO na tela ` +
        "que o F-3 existe para proteger: CSS injetado reescreve o cartao que a pessoa le antes de assinar.");
  }

  /* REGRA 3 · so o que o navegador ANALISA como estilo. CSS dentro de <script>
     e string, e contar string como marcacao ja produziu alarme falso aqui. */
  const html = semScripts(bruto);
  const linha = (i) => bruto.slice(0, i).split("\n").length;

  for (const m of html.matchAll(/<style\b(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/style>/gi)) {
    blocosEstilo += 1;
    if (temInline || hashes.has(hashCsp(m[1]))) { autorizados += 1; continue; }
    mortos += 1;
    falhas.push(`${rel}:${linha(m.index)} bloco <style> de ${m[1].length} b que a CSP de ${rota} ` +
      `RECUSA — nem hash nem 'unsafe-inline'. Em producao ele nao pinta, e a pagina muda de ` +
      "aparencia em silencio.");
  }

  for (const m of html.matchAll(/\sstyle\s*=\s*"([^"]*)"/gi)) {
    atributos += 1;
    if (temInline || (temHashesDeAtributo && hashes.has(hashCsp(m[1])))) { autorizados += 1; continue; }
    mortos += 1;
    falhas.push(`${rel}:${linha(m.index)} atributo style="${m[1].slice(0, 40)}" que a CSP de ${rota} ` +
      "RECUSA — use uma classe de /vendor/estilos-inline.css, ou autorize o valor por hash " +
      "(exige 'unsafe-hashes' em style-src).");
  }

  /* REGRA 5 · O `style=` QUE O SCRIPT ESCREVE, e que nenhum portao via.
     Achado pelo Tubarao-branco em N2, 2026-09-07, medindo `/console/` NO AR:
     2 atributos, 1 morto. As regras 1-4 leem o ARQUIVO, e este nasce em
     execucao — `pane.innerHTML = '<div style="padding:var(--s5)">'`. Sob
     `style-src 'self'` ele nao pinta, e a tela perde o espacamento sem um
     ruido, numa rota que assina.
     Nasceu em `77dfcab fix(csp): style-src drops 'unsafe-inline', and a render
     proves the pages did not move` — o render provou o estado que CARREGOU;
     estes aparecem em estados que ele nao alcancou.
     A regra e simples porque a CSP e simples: sem 'unsafe-inline' no style-src
     da rota, TODO `style=` que um script dela escreve esta morto. Hash nao
     salva: exigiria 'unsafe-hashes' mais o valor exato, e template com `${}`
     nem valor exato tem. */
  if (!temInline) {
    for (const m of bruto.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) {
      const src = m[1];
      if (/^(https?:)?\/\//.test(src)) continue;
      const alvo = src.startsWith("/") ? join(SITE, src.slice(1)) : join(p, "..", src);
      let js;
      try { js = readFileSync(alvo, "utf8"); } catch { continue; }
      const relJs = relative(RAIZ, alvo).split(sep).join("/");
      if (jaContado.has(relJs)) continue;
      jaContado.add(relJs);
      const achados = [...js.matchAll(/<[a-z][^>]*\sstyle\s*=\s*(["'])([^"']*)\1/gi)];
      const decl = ESTILO_GERADO_DECLARADO[relJs];
      /* Linha de BASE, não lista de perdão: o número declarado é o que existia
         no dia em que a dívida foi aberta. Uma ocorrência a mais reprova, e uma
         a menos também — porque cair sem atualizar a base deixa a base mentindo
         para cima e abre espaço para uma nova entrar sem ninguém ver. */
      if (!decl && achados.length) {
        mortos += achados.length;
        falhas.push(`${relJs} escreve ${achados.length} atributo(s) style= que a CSP de ${rota} ` +
          `(${rel}) RECUSA — criado em execucao nao pinta sob style-src 'self'. Exemplo: ` +
          `style="${achados[0][2].slice(0, 50)}". Use uma classe de /vendor/estilos-inline.css, ` +
          "ou declare em ESTILO_GERADO_DECLARADO com data e motivo.");
      } else if (decl && achados.length !== decl.n) {
        mortos += 1;
        falhas.push(`${relJs}: a divida declarada era ${decl.n} atributo(s) style= gerado(s) e ` +
          `agora sao ${achados.length}. ${achados.length > decl.n ? "Cresceu" : "Diminuiu"} — ` +
          "atualize a base com a medicao nova, ou o número passa a mentir.");
      } else if (decl) {
        gerados += decl.n;
      }
    }
  }

  /* REGRA 4 · A ORDEM DAS FOLHAS, e ela nao e cosmetica.
     `[hidden]{display:none!important}` tem especificidade (0,1,0) — a MESMA de
     `.u-xxxxxxxx{display:flex !important}`. Com !important dos dois lados e
     especificidade igual, vence QUEM VEM DEPOIS. As utilidades tem de carregar
     ANTES da folha da pagina, senao um `display:flex` convertido passa a vencer
     `[hidden]` e elementos escondidos aparecem. Antes da conversao o inline ja
     perdia para o !important de autor, entao esta ordem e o que PRESERVA o
     comportamento — inverte-la e uma regressao que nenhuma contagem pega.

     A exigencia agora e CONDICIONAL: quem nao usa as classes convertidas nao
     tem o que ordenar. Os 5 modelos oficiais nao usam nenhuma. */
  const usaUtilidades = /\bu-[0-9a-f]{8}\b/.test(html);
  const iUtil = bruto.indexOf("/vendor/estilos-inline.css");
  const mPag = bruto.match(/href="\/vendor\/estilos\/[^"]+\.css"/);
  if (usaUtilidades && iUtil < 0)
    falhas.push(`${rel}: usa classe u-xxxxxxxx e NAO carrega /vendor/estilos-inline.css — a classe nao existe`);
  else if (iUtil >= 0 && mPag && bruto.indexOf(mPag[0]) < iUtil)
    falhas.push(`${rel}: a folha da pagina carrega ANTES das utilidades — [hidden] perde para display:flex`);
}

console.log(`portao F-3 · estilo inline · ${htmls.length} paginas · ${new Set(htmls.map((p) => rotaDoArquivo(relative(SITE, p).split(sep).join("/")))).size} rotas`);
console.log(`  blocos <style> ........... ${blocosEstilo}`);
console.log(`  atributos style= ......... ${atributos}`);
console.log(`  autorizados pela CSP ..... ${autorizados}`);
console.log(`  RECUSADOS pela CSP ....... ${mortos}`);
console.log(`  telas que podem assinar .. ${telasQueAssinam} (nenhuma delas aceita unsafe-inline de estilo)`);
console.log(`  retidas fora do ar ....... ${retidas} (nao julgadas: nao chegam a producao)`);
console.log(`  style= escrito por script  ${gerados} em divida declarada · mudar o numero reprova`);
for (const [arq, d] of Object.entries(ESTILO_GERADO_DECLARADO))
  console.log(`    ${arq} · ${d.n}\n      ${d.motivo.replace(/(.{95}\S*)\s/g, "$1\n      ")}`);

/* Declaracao para arquivo que NENHUMA pagina publicada carrega e frase orfa
   sobre divida que ja nao existe — o espelho de esconder divida, e mente do
   mesmo jeito. Quando o arquivo sai do ar, a declaracao sai com ele. */
for (const arq of Object.keys(ESTILO_GERADO_DECLARADO))
  if (!jaContado.has(arq))
    falhas.push(`ESTILO_GERADO_DECLARADO declara ${arq}, e nenhuma pagina publicada o carrega — ` +
      "divida que deixou de existir nao fica declarada; tire a entrada.");
for (const n of notas) console.log("  " + n);

if (falhas.length) {
  console.error("\nF-3 REABERTO:");
  for (const f of falhas.slice(0, 12)) console.error("  - " + f);
  if (falhas.length > 12) console.error(`  ... e mais ${falhas.length - 12}`);
  process.exit(1);
}
console.log("\n✓ nenhum estilo inline sem autorizacao · nenhuma tela que assina sob unsafe-inline");
