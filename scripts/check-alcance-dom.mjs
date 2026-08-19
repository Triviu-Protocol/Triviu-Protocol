#!/usr/bin/env node
/* PORTAO DE ALCANCE DE ESCRITA NO DOM  ·  2026-08-19
 * ---------------------------------------------------------------------------
 * Condicao de VETO pre-declarada pelo Tubarao-branco na ONDA-TRIVIU-CONSOLE-
 * PORTE-DO-MODELO, 2026-08-13, nas palavras dele:
 *
 *   "Uma tela que so desenha, se puder escrever no DOM da tela que assina,
 *    reescreve o cartao que o usuario esta lendo antes de clicar. B exige
 *    PORTAO, nao promessa. O numero de innerHTML nao e a metrica; ALCANCE DE
 *    ESCRITA e."
 *
 * POR QUE ESTE ARQUIVO EXISTE SEPARADO do check-assinatura.mjs: aquele prova
 * propriedades DE DENTRO do caminho que assina — congelamento, regra 6 sobre os
 * bytes, regra 11. Este prova uma propriedade DE FORA: que ninguem mais alcanca
 * aquele caminho. Sao invariantes de sentido oposto, e juntar os dois num
 * arquivo faria a falha de um mascarar a do outro no mesmo exit code.
 *
 * O INVARIANTE, e ele foi MEDIDO antes de ser escrito: a superficie que assina
 * e namespaced. Os 85 ids da subarvore de assinatura no HTML comecam todos com
 * `lp-`, e o unico script que os escreve e o motor. A regra entao e:
 *
 *   NENHUM script fora do MOTOR pode ESCREVER num elemento `lp-*`.
 *
 * Leitura e livre — console-app.js consulta $("lp-ler") para saber se a tela
 * existe, e isso nao reescreve cartao nenhum. O portao distingue os dois.
 *
 * FALHA FECHADA: se um alvo de escrita nao puder ser resolvido a um id, o
 * portao RECUSA em vez de assumir que esta fora. Recusar demais e o modo de
 * falha correto num vetor de Lei #1.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const JS = join(RAIZ, "site", "js");
const HTML = join(RAIZ, "site", "console", "index.html");

const MOTOR = "console-lp.js";          // o unico dono da subarvore que assina
const PREFIXO = "lp-";

/* Escritas no DOM que podem alterar o que o usuario LE antes de assinar.
   `classList` e `style` entram: quem controla a aparencia pode esconder uma
   linha do cartao sem trocar um caractere do texto. */
const ESCRITAS = [
  /\.textContent\s*=/, /\.innerText\s*=/, /\.innerHTML\s*=/, /\.outerHTML\s*=/,
  /\.value\s*=/, /\.className\s*=/, /\.src\s*=/, /\.href\s*=/,
  /\.setAttribute\s*\(/, /\.removeAttribute\s*\(/, /\.insertAdjacent\w*\s*\(/,
  /\.append\w*\s*\(/, /\.prepend\s*\(/, /\.replaceChildren\s*\(/, /\.remove\s*\(\s*\)/,
  /\.classList\s*\.\s*(add|remove|toggle|replace)\s*\(/, /\.style\s*\./, /\.style\s*=/,
];

const semComentarios = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

const falhas = [];
let lidos = 0, alvos = 0, leiturasOk = 0;

const idsHtml = new Set(
  [...readFileSync(HTML, "utf8").matchAll(/id="(lp-[\w-]+)"/g)].map((m) => m[1])
);

for (const arq of readdirSync(JS).filter((f) => f.endsWith(".js"))) {
  if (arq === MOTOR) continue;
  const src = semComentarios(readFileSync(join(JS, arq), "utf8"));
  lidos++;

  // Cada mencao literal a um id da subarvore que assina.
  for (const m of src.matchAll(/["'`](lp-[\w-]+)["'`]/g)) {
    const id = m[1];
    if (!idsHtml.has(id)) continue;          // id que nao existe no HTML: inerte
    alvos++;
    // A janela que segue a mencao e onde uma escrita apareceria.
    const janela = src.slice(m.index, m.index + 220);
    const escreve = ESCRITAS.find((r) => r.test(janela));
    if (escreve) {
      const linha = src.slice(0, m.index).split("\n").length;
      falhas.push(`${arq}:${linha} escreve em '${id}', que pertence a subarvore que assina — ${escreve}`);
    } else {
      leiturasOk++;
    }
  }
}

console.log(`portao de alcance de escrita no DOM · subarvore '${PREFIXO}*' · motor: ${MOTOR}`);
console.log(`  ids da subarvore no HTML .......... ${idsHtml.size}`);
console.log(`  scripts varridos (fora do motor) .. ${lidos}`);
console.log(`  mencoes a ids da subarvore ........ ${alvos}  (leitura: ${leiturasOk})`);

if (falhas.length) {
  console.error("\nVETO DE LEI #1 · tela de fora alcanca a subarvore que assina:");
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log("\n✓ nenhum script fora do motor escreve na subarvore que assina");
