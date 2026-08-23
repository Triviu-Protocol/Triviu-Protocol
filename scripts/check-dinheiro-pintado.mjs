#!/usr/bin/env node
/**
 * DINHEIRO PINTADO: a tela escrevendo saldo que a chain nao tem.
 *
 * POR QUE ESTE PORTAO EXISTE, e quem o pediu. Em 2026-08-23 o console da V0
 * passou nos dez portoes do repositorio — CSP, assinatura, ABI contra chain,
 * livro contra chain, paginas orfas — e mesmo assim fazia isto, medido pelo
 * fundador na primeira vez que ele clicou:
 *
 *     "Gas reserve funded · 1.00000 POL"     — a carteira nunca abriu
 *     "Liquidity added · 1.00 USDC"          — nenhuma transacao saiu
 *     "Sub-account opened · Sub-account 2"   — nenhum contrato foi criado
 *
 * A tela mostrava 1,00 USDC de saldo, 1,00000 POL de reserva e 208 ciclos
 * cobertos. Nada existia. O mecanismo era simples e nenhum portao o via: quando
 * o caminho de ASSINATURA foi removido por veto, o `apply()` que mudava o estado
 * LOCAL ficou. Sem assinatura e com apply, cada clique escrevia o efeito de uma
 * transacao que nao aconteceu.
 *
 * Nenhum dos dez portoes podia pegar isso, e vale dizer por que: todos eles
 * conferem o que a tela AFIRMA contra o que os contratos TEM. Este confere de
 * onde vem o NUMERO que a tela escreve. Sao perguntas diferentes, e a segunda
 * nunca tinha sido feita.
 *
 * A REGRA. Um campo de dinheiro so pode receber valor que venha de uma leitura
 * de chain. A lista de campos esta abaixo, e a de marcadores de leitura tambem.
 * Uma atribuicao a campo de dinheiro sem marcador de leitura por perto reprova.
 *
 * O QUE ESTE PORTAO NAO E, dito para nao ser comprado por mais do que vale: ele
 * e textual e local — le a linha da atribuicao e as duas anteriores. Um valor
 * que venha da chain e passe por tres funcoes antes de chegar aqui nao seria
 * reconhecido, e nesse caso o portao REPROVA em vez de adivinhar; a saida e
 * declarar a origem no proprio ponto, com um comentario `chain:` que este
 * arquivo reconhece. Reprovar de mais custa uma linha de comentario. Reprovar de
 * menos custou uma tela inteira dizendo que a pessoa tinha dinheiro.
 *
 *   node scripts/check-dinheiro-pintado.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const RAIZ = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const SITE = join(RAIZ, "site");

/* Os campos que representam dinheiro ou posicao. Nomes, nao heuristica: uma
   heuristica sobre "parece um saldo" erra nos dois sentidos. */
const CAMPOS = [
  "idle", "inPos", "net", "fee", "rev", "claim", "earned", "balance", "saldo", "reserva",
];

/* O que prova que o numero veio da chain. Qualquer um destes na linha da
   atribuicao ou nas duas anteriores basta. */
const DA_CHAIN = [
  /\bLER\.\w+/, /balanceOf/, /eth_call/, /eth_getBalance/, /triviuRead/, /lerChain/,
  /\bchamar\s*\(/, /\/\*\s*chain:/, /\bawait\s+.*\bchain\b/i,
];

const falhas = [];
const notas = [];

const jsDoSite = [];
(function andar(d) {
  for (const nome of readdirSync(d)) {
    const p = join(d, nome);
    if (statSync(p).isDirectory()) andar(p);
    else if (nome.endsWith(".js")) jsDoSite.push(p);
  }
})(join(SITE, "js"));

/* Comentarios fora antes de medir. Um comentario que EXPLICA que o saldo nao e
   mais escrito contem a propria expressao que este portao procura — e ja houve
   falso alarme nesta casa exatamente assim. */
const semComentarios = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
     .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + m.slice(p.length).replace(/./g, " "));

const ALVO = new RegExp(
  `(?:\\.(?:${CAMPOS.join("|")})|\\[[^\\]]+\\])\\s*(?:\\+=|-=|=(?!=))`, "g"
);
const CAMPO_DIRETO = new RegExp(`\\.(?:${CAMPOS.join("|")})\\s*(?:\\+=|-=|=(?!=))`);

let escritas = 0;
for (const arquivo of jsDoSite) {
  const rel = "js/" + relative(join(SITE, "js"), arquivo).split(sep).join("/");
  const original = readFileSync(arquivo, "utf8");
  const linhasOrig = original.split("\n");
  const linhas = semComentarios(original).split("\n");

  for (let i = 0; i < linhas.length; i++) {
    if (!CAMPO_DIRETO.test(linhas[i])) continue;
    /* Declaracao de objeto literal (`idle: 0`) nao e atribuicao a um saldo
       existente; e o nascimento do objeto, e o valor inicial dele e conferido
       pelo resto da tela. O que interessa aqui e a MUTACAO. */
    /* ZERAR NAO E PINTAR. `v.net = 0` num reset nao pode inventar dinheiro:
       nenhuma quantia nasce de uma atribuicao a zero, e exigir origem de chain
       para um zero obrigaria a declarar o obvio em todo reset — que e como uma
       lista de excecoes comeca a crescer ate deixar de significar alguma coisa.
       A regra fica mais FINA aqui, e nao mais frouxa: continua reprovando
       qualquer valor diferente de zero. */
    if (/(?:\+=|-=|=)\s*0\s*[;,)}]/.test(linhas[i]) && !/\+=\s*0*[1-9]/.test(linhas[i])) {
      const soZeros = (linhas[i].match(/(?:\+=|-=|=(?!=))\s*([^;,)}]+)/g) || [])
        .every((a) => /(?:\+=|-=|=)\s*0\s*$/.test(a.trim()));
      if (soZeros) continue;
    }
    /* DUAS JANELAS, e a separacao conserta um defeito que este portao teve na
       sua primeira execucao: ele apagava os comentarios e depois procurava,
       dentro do texto ja sem comentarios, um marcador que E um comentario. A
       declaracao de origem nunca podia casar, e as duas unicas linhas legitimas
       do repositorio continuaram vermelhas mesmo depois de declaradas.
         - a janela de CODIGO responde "o valor vem de uma chamada de leitura?",
           e nao le comentario nenhum: prosa que cite o nome de uma funcao de
           leitura nao vale como prova;
         - a janela ORIGINAL responde uma pergunta so, e literal: existe uma
           declaracao explicita de origem? Ela nao aparece por acaso.
       (E o marcador nao e escrito por extenso aqui: escreve-lo dentro de um
        comentario fecharia este comentario no meio. Foi o que aconteceu.) */
    const janela = [linhas[i - 2], linhas[i - 1], linhas[i]].filter(Boolean).join("\n");
    const janelaOrig = linhasOrig.slice(Math.max(0, i - 3), i + 1).join("\n");
    escritas += 1;
    if (DA_CHAIN.some((re) => re.test(janela))) continue;
    if (/\/\*\s*chain:/.test(janelaOrig)) continue;
    falhas.push(
      `${rel}:${i + 1} escreve um campo de dinheiro sem que o valor venha de uma leitura de chain:\n` +
      `      ${linhasOrig[i].trim().slice(0, 120)}\n` +
      "      Um numero de saldo que nasce no navegador e um numero que a pessoa le como dinheiro dela. " +
      "Se ele VEM da chain e este portao nao esta vendo, escreva a origem num comentario `/* chain: … */` " +
      "na linha acima — declarar de onde veio custa uma linha."
    );
  }
}

if (falhas.length) {
  console.error(`✗ dinheiro pintado: ${falhas.length} escrita(s) sem origem na chain`);
  for (const f of falhas) console.error("  " + f);
  process.exit(1);
}
console.log(`✓ dinheiro pintado: ${jsDoSite.length} arquivo(s) varridos · ${escritas} escrita(s) em campo de ` +
  `dinheiro, todas com origem em leitura de chain · campos vigiados: ${CAMPOS.join(" ")}`);
for (const n of notas) console.log("  " + n);
