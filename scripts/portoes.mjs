#!/usr/bin/env node
/**
 * A LISTA DOS PORTOES. Fonte unica: o CI chama este arquivo, e voce chama este
 * arquivo. Duas listas divergem no primeiro dia em que alguem acrescenta um
 * portao e esquece a outra.
 *
 * POR QUE ISTO EXISTE
 * ===================
 * Medido em 2026-08-22, sobre a arvore 3d855c92: dos oito portoes em scripts/,
 * UM era invocado por workflow (check-multichain-honesty, no job `surfaces`).
 * Os outros sete existiam, rodavam quando alguem lembrava, e nao reprovavam
 * nada. Tres deles estavam vermelhos naquele momento e ninguem sabia.
 *
 * Pior que o silencio: site/console/index.html afirma, em prosa, para quem le a
 * pagina, que "scripts/check-console-abi.mjs ... fails the build if either
 * reappears". Ele nao estava ligado a coisa alguma. Um portao que so roda
 * quando alguem lembra de rodar nao e portao — e um comentario com nome de
 * arquivo.
 *
 *   node scripts/portoes.mjs            os portoes que nao tocam a rede
 *   node scripts/portoes.mjs --rede     inclui os que leem RPC publico
 *   node scripts/portoes.mjs --so-rede  apenas os que leem RPC publico
 *
 * SAIDA: uma linha por portao, com o exit code ao lado, e o total com o
 * denominador. Nada e truncado — a saida de cada portao passa direto para o
 * terminal.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const AQUI = dirname(fileURLToPath(import.meta.url));

/* `rede: true` sai para um job proprio no CI. A razao nao e cosmetica: uma
   queda de RPC publico e indistinguivel de uma regressao de codigo quando as
   duas aparecem como o mesmo X vermelho na lista do PR, e a leitura errada
   custa uma investigacao inteira.

   `desligado` NAO remove o portao da lista. Ele fica aqui, com a razao e o
   commit que a produziu, e a ausencia do ARQUIVO continua reprovando — de modo
   que desligar nao vira apagar, e apagar nao vira esquecer. */
const PORTOES = [
  { nome: "check-multichain-honesty", rede: false },
  { nome: "check-csp", rede: false },
  { nome: "check-sem-estilo-inline", rede: false },
  { nome: "check-alcance-dom", rede: false },
  { nome: "check-assinatura", rede: false },
  { nome: "check-console-abi", rede: false },
  /* Publicar nao e a mesma coisa que estar na navegacao, e a diferenca entre as
     duas e uma pagina que serve para sempre o que estava escrita nela no dia em
     que foi esquecida. Tres estavam nesse estado quando isto foi medido — uma
     delas era a unica tela de assinatura provada, e outra declarava na propria
     fonte que a carteira dela era simulada. */
  { nome: "check-paginas-orfas", rede: false },
  /* Os outros conferem o que a tela AFIRMA contra o que os contratos TEM.
     Este confere de onde vem o NUMERO que a tela escreve — e a pergunta que
     nunca tinha sido feita, e por isso um console passou nos dez portoes
     mostrando 1,00 USDC de saldo que nao existia em chain nenhuma. */
  { nome: "check-dinheiro-pintado", rede: false },
  /* O keccak do navegador e um PORTE de scripts/keccak.mjs, e porte que ninguem
     confere e copia que diverge. Este portao confere contra tres coisas
     diferentes: os 133 seletores que o solc escreveu, a fronteira dos blocos de
     136 bytes (que os 133 nao cobrem — so UM deles passa de 136), e o modulo de
     origem. */
  { nome: "check-keccak", rede: false },
  /* Os dois hashes do commitment, contra a biblioteca REAL compilada pelo solc.
     Uma divergencia de um bit vira `CommitmentMismatch` na chain, e quem paga o
     gas para descobrir e a pessoa. Sem `forge` no PATH ele PULA dizendo que
     pulou — portao que se cala quando nao pode medir passa por engano. */
  { nome: "check-commitment", rede: false },
  /* A tupla com campo dinamico, contra o `abi.encode` do solc, nas fronteiras do
     padding de 32 bytes (0, 1, 31, 32, 33). O deslocamento e relativo ao inicio
     da TUPLA e nao da calldata, e errar essa origem produz bytes plausiveis que
     a chain recusa depois de o gas ter sido pago. */
  { nome: "check-tupla", rede: false },
  /* As capacidades do console, contadas sem inflar. Nasceu de um numero errado:
     a contagem dizia 16 e eram 15, porque `executarCiclo` foi casada duas vezes,
     como "abrir" e como "fechar". Quem decide o lado e a estrategia e nao o
     dono, entao a tela nao deveria ter dois botoes — e nao sao duas
     capacidades. Duas descricoes provadas pelo mesmo trecho reprovam aqui. */
  { nome: "check-capacidades", rede: false },
  { nome: "check-tesouraria-viva", rede: true },
  /* O item 1 do check-console-abi (byte-a-byte contra contracts/out) morreu em
     caad24b e delega para este. A delegacao so e honesta enquanto o delegado
     existe: por isso ele esta na lista, e a checagem de AUSENTE acima reprova
     se alguem o apagar. Portao que delega para arquivo inexistente e portao
     desligado com aparencia de portao ligado. */
  { nome: "check-abi-vs-chain", rede: true },
  /* Impede que o livro-razao volte a AFIRMAR estado de chain. Ele reprova pelo
     NOME do campo, antes de o valor vencer: o defeito nasce quando o campo e
     criado, nao no dia em que a chain muda. */
  { nome: "check-livro-vs-chain", rede: true },
  {
    nome: "check-enderecos-drift",
    rede: false,
    desligado:
      "perdeu o OBJETO, nao o caminho: ele compara site/enderecos.js contra " +
      "contracts/deploy/enderecos.js, e essa fonte foi removida em caad24b " +
      "(a linha V0 substituiu os contratos anteriores). Nao ha segunda copia " +
      "para comparar — site/enderecos.js virou a unica fonte. Repointar o " +
      "caminho seria inventar uma fonte. O risco que sobrou no lugar e outro e " +
      "esta nomeado como TUBARAO-06: o livro afirma estado de chain (Safe " +
      "1-de-1) que a chain desmente (2-de-3), e o portao que falta confere " +
      "livro contra CHAIN, nao contra copia. Religar exige decidir o que ele " +
      "guarda — decisao de canon, nao de pipeline.",
  },
];

const args = new Set(process.argv.slice(2));
const soRede = args.has("--so-rede");
const comRede = args.has("--rede") || soRede;

const selecionados = PORTOES.filter((p) => (soRede ? p.rede : comRede || !p.rede));

const larg = Math.max(...PORTOES.map((p) => p.nome.length));
const resultados = [];
const sumidos = [];

for (const p of selecionados) {
  const caminho = join(AQUI, p.nome + ".mjs");

  /* Fail-closed contra a forma mais silenciosa de afrouxar um portao: apagar o
     arquivo. Sem isto, `rm scripts/check-csp.mjs` deixaria a suite verde e
     menor, e "menor" nao aparece em lugar nenhum. */
  if (!existsSync(caminho)) {
    sumidos.push(p.nome);
    console.error(`  ${p.nome.padEnd(larg)}  AUSENTE  <- listado aqui e nao existe em scripts/`);
    continue;
  }

  if (p.desligado) {
    console.error(`  ${p.nome.padEnd(larg)}  DESLIGADO`);
    for (const linha of quebrar(p.desligado, 74)) console.error(`  ${" ".repeat(larg)}  | ${linha}`);
    continue;
  }

  console.error(`\n=== ${p.nome} ===`);
  const r = spawnSync(process.execPath, [caminho], { stdio: "inherit" });
  const code = r.status === null ? 1 : r.status;
  resultados.push({ nome: p.nome, code });
}

/* --------------------------------------------------------------- resumo --- */
console.error("\n---------------------------------------------------------------");
for (const r of resultados)
  console.error(`  ${r.nome.padEnd(larg)}  exit=${r.code}  ${r.code === 0 ? "ok" : "FALHOU"}`);

const falharam = resultados.filter((r) => r.code !== 0);
const escopo = soRede ? "de rede" : comRede ? "no total" : "sem rede";
console.error(
  `\n  ${resultados.length - falharam.length} de ${resultados.length} portoes ${escopo} passaram` +
    (sumidos.length ? ` · ${sumidos.length} AUSENTE(S)` : "")
);

if (sumidos.length || falharam.length) process.exit(1);

function quebrar(texto, n) {
  const saida = [];
  let linha = "";
  for (const palavra of texto.split(/\s+/)) {
    if ((linha + " " + palavra).trim().length > n) { saida.push(linha.trim()); linha = palavra; }
    else linha += " " + palavra;
  }
  if (linha.trim()) saida.push(linha.trim());
  return saida;
}
