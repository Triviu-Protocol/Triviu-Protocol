#!/usr/bin/env node
/**
 * AS CAPACIDADES DO CONSOLE, CONTADAS SEM INFLAR.
 *
 * Este portao nasceu de um numero errado que eu mesmo dei. A contagem anterior
 * declarou "16 de 16" e o Tubarao-branco mediu: nao existe `fecharPosicao` no
 * console, e `executarCiclo` tinha sido casada DUAS VEZES — como "abrir posicao"
 * e como "fechar posicao".
 *
 * E olhando o produto isso nao era erro de nome. Quem decide compra ou venda e a
 * ESTRATEGIA, nao o dono: `side` vem do `Intent` que `dryRunChecks` devolve. A
 * tela nao deveria ter dois botoes, e por isso nao sao duas capacidades.
 *
 * E DEPOIS o mesmo Tubarao achou o outro lado: `aprovar` estava faltando na lista.
 * Dois erros opostos tinham se cancelado — o 16 original estava certo por
 * coincidencia, com a lista errada, e o conserto para 15 ficou errado do outro
 * lado. Sao 16, e o que importa aqui e a LISTA e nao o total.
 *
 * A regra que fica: DUAS capacidades nao podem ser satisfeitas pelo MESMO
 * trecho de codigo. Se sao a mesma funcao, sao a mesma capacidade, e contar duas
 * vezes e inflar o denominador — que e a forma de mentir com numero verdadeiro.
 *
 * Regex ja foi enganado quatro vezes nesta casa por COMENTARIO. Esta e a quinta
 * forma, e diferente: duas descricoes casando o mesmo padrao.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const RAIZ = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const bruto = readFileSync(join(RAIZ, "site/js/console-v0.js"), "utf8");
/* Sem comentario: uma capacidade so conta se o codigo a exerce, e comentario nao
   e dito a ninguem nem executado por ninguem. */
const CODIGO = bruto
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + m.slice(p.length).replace(/./g, " "));

/* As 16. Cada uma com o padrao que a prova, e o padrao TEM de ser distinto.
   DOIS ERROS OPOSTOS SE CANCELARAM aqui, e o registro vale mais que o numero: a
   contagem original disse 16 contando `executarCiclo` DUAS vezes (a mais) e
   esquecendo `aprovar` (a menos). O 16 estava certo por coincidencia, com a
   lista errada. O primeiro conserto trocou por 15 e ficou errado do outro lado.
   Numero certo com lista errada nao da sinal nenhum, e por isso e pior. */
const CAPACIDADES = [
  ["conectar carteira", /function connect\s*\(/, null],
  ["criar cofre", /ato:\s*['"]criar['"]/, "criar"],
  /* `aprovar` e transacao propria: sem o approve do ERC-20 o deposito reverte.
     Ela ficou de fora da primeira lista e ninguem notou, porque a soma batia. */
  ["aprovar o gasto", /ato:\s*['"]aprovar['"]/, "aprovar"],
  ["depositar", /ato:\s*['"]depositar['"]/, "depositar"],
  ["sacar", /ato:\s*['"]sacar['"]/, "sacar"],
  ["liberar ativo", /mudarCerca\(['"]ativo['"][^)]*true/, "ativo"],
  ["bloquear ativo", /mudarCerca\(['"]ativo['"][^)]*false/, null],
  ["ligar moeda-base", /mudarCerca\(['"]moedaDoCofre['"][^)]*true/, "moedaDoCofre"],
  ["desligar moeda-base", /mudarCerca\(['"]moedaDoCofre['"][^)]*false/, null],
  ["somar guardiao", /mudarCerca\(['"]guarda['"][^)]*true/, "guarda"],
  ["tirar guardiao", /mudarCerca\(['"]guarda['"][^)]*false/, null],
  ["apontar estrategia", /mudarCerca\(['"]estrategia['"][^)]*true/, "estrategia"],
  ["limpar estrategia", /mudarCerca\(['"]estrategia['"][^)]*false/, null],
  ["definir os limites", /function mudarLimites\s*\(/, "limites"],
  ["simular o ciclo", /function simularCiclo\s*\(/, null],
  /* UMA capacidade, e nao duas. `executeAsOwner` abre OU fecha conforme o
     `side` que a estrategia devolve — o dono nao escolhe o lado. */
  ["executar o que a estrategia propoe", /function executarCiclo\s*\(/, "executar"]
];

const falhas = [];
const presentes = [];
const ausentes = [];
/* Onde cada padrao casa. Dois padroes que casam no MESMO ponto sao a mesma
   capacidade escrita duas vezes. */
const posicoes = new Map();

for (const [nome, re] of CAPACIDADES) {
  const m = re.exec(CODIGO);
  if (!m) { ausentes.push(nome); continue; }
  presentes.push(nome);
  const chave = m.index;
  if (posicoes.has(chave)) {
    falhas.push(`"${nome}" e "${posicoes.get(chave)}" casam no MESMO ponto do codigo ` +
      `(offset ${chave}) — sao a mesma capacidade contada duas vezes`);
  } else {
    posicoes.set(chave, nome);
  }
}

/* E a checagem que o Tubarao exigiu: nenhum padrao pode ser satisfeito pelo
   mesmo TRECHO que outro, mesmo caindo em offsets diferentes. */
const porTrecho = new Map();
for (const [nome, re] of CAPACIDADES) {
  const m = re.exec(CODIGO);
  if (!m) continue;
  const trecho = m[0];
  if (porTrecho.has(trecho)) {
    falhas.push(`"${nome}" e "${porTrecho.get(trecho)}" sao provadas pelo MESMO trecho ` +
      `\`${trecho.slice(0, 40)}\` — uma das duas nao e uma capacidade separada`);
  } else {
    porTrecho.set(trecho, nome);
  }
}

if (ausentes.length) {
  falhas.push(`${ausentes.length} capacidade(s) declarada(s) e NAO encontrada(s): ${ausentes.join(", ")}`);
}

/* ── COMPLETUDE ─────────────────────────────────────────────────────────────
   As checagens acima provam que as capacidades declaradas sao DISTINTAS entre
   si. Nao provam que sao TODAS — e consistencia interna nao e completude.
   Foi assim que `aprovar` ficou de fora sem ninguem notar: a lista era coerente
   consigo mesma e incompleta ao mesmo tempo.
   A referencia externa e o modulo que assina: cada ato que ele expoe TEM de
   aparecer na lista, senao ha uma transacao que o console faz e que este portao
   nao conta. */
const ASSINAR = readFileSync(join(RAIZ, "site/js/assinar-v0.js"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, " ");
const atos = [...ASSINAR.matchAll(/(\w+):\s*passo\w+/g)].map((m) => m[1]);
/* Cada capacidade DECLARA qual ato ela cobre, e a completude compara com essa
   declaracao — sem adivinhar a forma do padrao. As duas versoes anteriores
   adivinhavam: a primeira casava substring e dava `saca` como coberto por
   `sacar`; a segunda exigia aspas e derrubou `executar`, cujo padrao e
   `function executarCiclo(`. Adivinhar a forma ERA a classe do erro. */
const cobertos = new Set(CAPACIDADES.map(([, , ato]) => ato).filter(Boolean));
const semCobertura = atos.filter((a) => !cobertos.has(a));

if (atos.length === 0) {
  falhas.push("nao consegui ler os atos de assinar-v0.js — sem referencia externa, " +
    "este portao mede so a si mesmo");
} else if (semCobertura.length) {
  falhas.push(`${semCobertura.length} ato(s) que o modulo ASSINA e que a lista nao conta: ` +
    `${semCobertura.join(", ")} — uma transacao que o console faz e que ninguem contou`);
}
/* A nota da completude vai numa variavel PROPRIA e nao em `presentes`.
   A primeira versao a empurrava para dentro do array que conta capacidades, e o
   portao passou a imprimir "17 de 16" — inflando o numero dentro do portao que
   existe para nao inflar numeros. Contagem e prosa nao dividem o mesmo balde. */
const notaCompletude = (atos.length && !semCobertura.length)
  ? `os ${atos.length} atos que o modulo assina estao todos na lista`
  : null;

if (falhas.length) {
  console.error(`✗ capacidades: ${falhas.length} problema(s)`);
  for (const f of falhas) console.error("  " + f);
  console.error("  Contar a mesma coisa duas vezes infla o denominador, e um denominador inflado");
  console.error("  e a forma de mentir com numero verdadeiro.");
  process.exit(1);
}
console.log(`✓ capacidades: ${presentes.length} de ${CAPACIDADES.length}, cada uma provada por um trecho distinto`);
if (notaCompletude) console.log(`  ${notaCompletude}`);
console.log(`  duas contagens erradas antes desta: 16 contando "abrir" e "fechar" como a mesma`);
console.log(`  funcao duas vezes e esquecendo "aprovar" — dois erros opostos que se cancelaram —`);
console.log(`  e depois 15, errado do outro lado. Numero certo com lista errada nao da sinal.`);
