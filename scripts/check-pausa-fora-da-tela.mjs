#!/usr/bin/env node
/* PORTAO DA PAUSA · uma animacao que toca para uma sala vazia  ·  2026-08-20
 * ---------------------------------------------------------------------------
 * Aberto pelo N2 do Tubarao-branco na ONDA-TRIVIU-SELO-DO-MODELO, contra codigo
 * escrito na MESMA onda. A peca dos quatro atos tem 29,2 segundos de animacao com
 * avanco automatico, e o guia de marca do cliente e explicito, secao 4,
 * Non-negotiable:
 *
 *     "Animation loops pause via IntersectionObserver and visibilitychange.
 *      A loop running off-screen is a battery bug."
 *
 * A primeira versao da maquina de pausa guardava tres bandeiras e comecava com
 * `if (!playing) return` — "ja parado por alguem: nao assume a pausa alheia".
 * Parecia certo. Abria isto, em duas rotas:
 *
 *     foco entra na barra   -> pausa, pausadoPorFoco = true
 *     rola a peca para fora -> pausarAuto("saida") cai no early return
 *                              e NAO REGISTRA que a peca saiu da tela
 *     foco sai da barra     -> retomarAuto("foco") limpa a unica bandeira,
 *                              nao acha outra causa, e RETOMA FORA DA TELA
 *
 * A segunda rota e a mesma com a aba escondida no lugar do foco.
 *
 * O CONSERTO foi separar a CAUSA do ESTADO: `pausas` registra sempre, toque ou
 * nao; `pausadoManual` guarda a vontade da pessoa em bandeira propria, em vez de
 * depender de nenhuma causa automatica estar marcada.
 *
 * ===========================================================================
 * POR QUE ISTO E UM PORTAO E NAO UM COMANDO NO TERMINAL
 * ===========================================================================
 *
 * A prova foi rodada uma vez e passou. Prova que roda uma vez e uma fotografia:
 * ela nao impede a proxima mao de reintroduzir o early return "para simplificar".
 * Esta casa ja pagou por isso — defeito consertado que voltou porque nada
 * re-executava a demonstracao. Entao a demonstracao mora aqui e roda em todo
 * commit.
 *
 * ===========================================================================
 * O QUE ELE NAO PROVA, dito para ninguem ler mais do que esta escrito
 * ===========================================================================
 *
 * Que o `IntersectionObserver` e o `visibilitychange` estao LIGADOS as funcoes
 * certas no navegador. Isso e ligacao de evento, e este portao le a maquina de
 * estados, nao o DOM. O que ele garante e que a MAQUINA, quando acionada nas
 * sequencias que importam, nunca termina tocando com a peca fora da tela.
 * A ligacao dos eventos e verificada por presenca, no final.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const ALVO = join(RAIZ, "site", "js", "selo.js");

const falhas = [];

if (!existsSync(ALVO)) {
  console.error("portao da pausa · site/js/selo.js nao existe — ou a peca sumiu, ou este");
  console.error("portao esta procurando o lugar errado. Falha fechada.");
  process.exit(1);
}

const fonte = readFileSync(ALVO, "utf8");

/* Extrai a maquina REAL do arquivo. Nao ha copia dela aqui de proposito: um
   portao que testa a sua propria copia aprova para sempre. */
const iniMaquina = fonte.indexOf("  var pausas = {");
const fimMaquina = fonte.indexOf("  ppBtn.addEventListener");
if (iniMaquina < 0 || fimMaquina < 0 || fimMaquina <= iniMaquina) {
  console.error("portao da pausa · nao achei a maquina de pausa em selo.js.");
  console.error("  procurava por `var pausas = {` seguido de `ppBtn.addEventListener`.");
  console.error("  Se ela foi renomeada, este portao precisa saber — falha fechada em vez");
  console.error("  de aprovar por nao encontrar.");
  process.exit(1);
}
const maquina = fonte.slice(iniMaquina, fimMaquina);

for (const exigido of ["function pausarAuto", "function retomarAuto", "pausadoManual"]) {
  if (!maquina.includes(exigido)) falhas.push(`a maquina de pausa perdeu \`${exigido}\``);
}

/* O corpo do botao tambem sai do arquivo: e ele que define o que "manual" quer
   dizer, e um teste que ignora o botao nao testa a regra que mais importa. */
const iniBotao = fonte.indexOf('ppBtn.addEventListener("click"');
const fimBotao = fonte.indexOf("rpBtn.addEventListener");
if (iniBotao < 0 || fimBotao < 0) falhas.push("nao achei o handler do botao de pausa");
const corpoBotao = falhas.length
  ? ""
  : fonte.slice(fonte.indexOf("{", fonte.indexOf("function ()", iniBotao)) + 1, fonte.lastIndexOf("});", fimBotao));

function instancia() {
  return new Function(`
    var playing = true, done = false;
    function pause()  { playing = false; }
    function resume() { playing = true; }
    function goTo()   { playing = true; done = false; }
    ${maquina}
    return {
      pausarAuto: pausarAuto,
      retomarAuto: retomarAuto,
      clique: function () { ${corpoBotao} },
      tocando: function () { return playing; }
    };
  `)();
}

/* As cinco sequencias. As de numero 3 e 4 sao as que o N2 encontrou; as outras
   tres existem para garantir que o conserto delas nao quebrou o resto — um
   conserto que para a peca para sempre tambem passaria em 3 e 4. */
const SEQUENCIAS = [
  { nome: "rola para fora e volta",
    roteiro: (a) => { a.pausarAuto("saida"); a.retomarAuto("saida"); },
    tocando: true,
    porque: "sem causa nenhuma segurando, a peca retoma" },

  { nome: "pausa a mao, rola para fora, volta",
    roteiro: (a) => { a.clique(); a.pausarAuto("saida"); a.retomarAuto("saida"); },
    tocando: false,
    porque: "pausa automatica NUNCA desfaz pausa que a pessoa pediu" },

  { nome: "foco na barra, rola para fora, tira o foco",
    roteiro: (a) => { a.pausarAuto("foco"); a.pausarAuto("saida"); a.retomarAuto("foco"); },
    tocando: false,
    porque: "ROTA 1 DO DEFEITO · a saida da tela tem de continuar segurando" },

  { nome: "aba escondida, rola para fora, volta a aba",
    roteiro: (a) => { a.pausarAuto("aba"); a.pausarAuto("saida"); a.retomarAuto("aba"); },
    tocando: false,
    porque: "ROTA 2 DO DEFEITO · idem, com a aba no lugar do foco" },

  { nome: "fora da tela, retoma a mao",
    roteiro: (a) => { a.pausarAuto("saida"); a.clique(); },
    tocando: true,
    porque: "intencao explicita vence heuristica" },
];

let passaram = 0;
if (!falhas.length) {
  for (const s of SEQUENCIAS) {
    let obtido;
    try {
      const a = instancia();
      s.roteiro(a);
      obtido = a.tocando();
    } catch (e) {
      falhas.push(`sequencia "${s.nome}" lancou: ${e && e.message ? e.message : e}`);
      continue;
    }
    if (obtido === s.tocando) passaram += 1;
    else
      falhas.push(
        `sequencia "${s.nome}": tocando=${obtido}, esperado ${s.tocando}. ${s.porque}`
      );
  }
}

/* A maquina certa com os eventos desligados nao vale nada. Presenca, nao ligacao:
   ver o cabecalho. */
const LIGACOES = [
  ["visibilitychange", /addEventListener\(\s*["']visibilitychange["']/],
  ["focusin na barra", /addEventListener\(\s*["']focusin["']/],
  ["focusout na barra", /addEventListener\(\s*["']focusout["']/],
  ["IntersectionObserver", /new IntersectionObserver/],
];
for (const [nome, rx] of LIGACOES) {
  if (!rx.test(fonte)) falhas.push(`a maquina existe mas \`${nome}\` nao esta ligado em selo.js`);
}

/* O `disconnect()` era o defeito original: o observador comecava a peca e se
   demitia, e os 22 segundos dos atos ii a iv tocavam para uma sala vazia. */
if (/io\.disconnect\(\)/.test(fonte))
  falhas.push(
    "`io.disconnect()` voltou ao selo.js. O observador tem de continuar vigiando depois " +
    "de iniciar a peca — desconectado, ele nao pausa quando ela sai da tela."
  );

console.log("portao da pausa · uma animacao que toca para uma sala vazia");
console.log(`  maquina extraida do arquivo ... ${maquina.length} bytes (nao ha copia neste portao)`);
console.log(`  sequencias exercidas .......... ${passaram} de ${SEQUENCIAS.length}`);
console.log(`  ligacoes de evento conferidas . ${LIGACOES.length}`);
console.log("  NAO conferido ................. se os eventos estao ligados as funcoes certas no");
console.log("                                  navegador — isto le a maquina de estados, nao o DOM");

if (falhas.length) {
  console.error("\nA PECA PODE TOCAR FORA DA TELA:");
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log("\n✓ nenhuma sequencia termina com a peca tocando fora da tela, e a pausa manual sobrevive a todas");
