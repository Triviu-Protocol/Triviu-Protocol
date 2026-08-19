#!/usr/bin/env node
/* PORTAO DO F-6b · "ilimitado" e magnitude, e este portao EXECUTA a regra
 * ---------------------------------------------------------------------------
 * Gate aberto pelo Tubarao-branco em 2026-08-12 — "approve de valor exato, nunca
 * ilimitado" — classificado LOW em 2026-08-19, com prazo de 72h.
 *
 * POR QUE ELE EXECUTA EM VEZ DE LER. Os outros portoes desta casa provam
 * propriedades do TEXTO: quem le o slot, quem anexa ouvinte, quem declara
 * allowlist. Esta regra e aritmetica — "este numero e ilimitado na pratica?" — e
 * ler o texto de uma aritmetica prova que ela existe, nao que ela esta certa.
 * A primeira versao da regra 6 recusava exatamente `2^256-1` e deixava passar
 * `uint96 max`, que e o padrao de UNI e COMP: um portao textual teria visto a
 * funcao, achado o `throw`, e aprovado.
 *
 * E ELE ACHOU UM DEFEITO VIVO. Ao ser escrito, este portao expos que
 * `recusarAprovacaoInfinita` chamava `tiposPorPalavra`, que ficara nas telas,
 * fora do escopo do motor — closure captura onde a funcao foi DEFINIDA. Em
 * producao, medido por `curl`, todo `approve` lancava ReferenceError antes de
 * montar calldata. Falhou fechado, e ninguem viu, porque nenhum portao
 * EXECUTAVA a regra.
 *
 * FALHA FECHADA: se o motor nao carregar, ou se `recusarAprovacaoInfinita` nao
 * existir, recusa. Portao que nao consegue rodar a regra nao aprova a regra.
 */
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

/* O motor resolve o ABI pelo `window`. Aqui ele e montado com o minimo que a
   regra precisa — o artefato real nao muda o que esta sendo medido, que e a
   aritmetica sobre a palavra. */
globalThis.window = {
  TRIVIU_ABI: {
    contratos: { erc20: { funcoes: { "approve(address,uint256)": {
      seletor: "0x095ea7b3", entradas: [{ tipo: "address" }, { tipo: "uint256" }] } } } },
    extras: {},
  },
};

let MOTOR;
try { MOTOR = require(join(RAIZ, "site", "js", "motor.js")); }
catch (e) {
  console.error("✗ motor.js nao carregou — a regra 6 nao pode ser exercida: " + e.message);
  process.exit(1);
}
if (typeof MOTOR.recusarAprovacaoInfinita !== "function") {
  console.error("✗ motor.js nao expoe recusarAprovacaoInfinita — a regra 6 nao existe para ser exercida");
  process.exit(1);
}

const pal = (h) => String(h).padStart(64, "0");
const ZERO = pal("0".repeat(40));

/* Cada linha ja foi um defeito ou ja foi um falso positivo desta casa. */
const CASOS = [
  { nome: "100 USDC · 6 casas · quantia exata",        p: pal((100n * 10n ** 6n).toString(16)),      recusa: false },
  { nome: "1 bilhao de tokens de 18 casas",            p: pal((10n ** 9n * 10n ** 18n).toString(16)), recusa: false },
  { nome: "zero · o passo que ZERA a permissao",       p: pal("0"),                                   recusa: false },
  { nome: "2^256-1 · o classico",                      p: "f".repeat(64),                             recusa: true  },
  { nome: "uint96 max · UNI, COMP · o que passava",    p: pal("f".repeat(24)),                        recusa: true  },
  { nome: "uint112 max",                               p: pal("f".repeat(28)),                        recusa: true  },
  { nome: "uint128 max",                               p: pal("f".repeat(32)),                        recusa: true  },
  { nome: "2^255 · nao e maximo canonico, e absurdo",  p: pal((1n << 255n).toString(16)),             recusa: true  },
];

const falhas = [];
let ok = 0;

for (const c of CASOS) {
  let recusou = false, erro = "";
  try {
    MOTOR.recusarAprovacaoInfinita("0x095ea7b3" + ZERO + c.p, "erc20", "approve(address,uint256)");
  } catch (e) {
    recusou = true;
    erro = e && e.constructor ? e.constructor.name : "";
    /* ReferenceError nao e recusa — e a regra quebrada. Foi exatamente assim que
       o defeito de `tiposPorPalavra` sobreviveu: um erro que PARECE recusa. */
    if (erro !== "Error") {
      falhas.push(`${c.nome}: a regra lancou ${erro}, que nao e recusa — e a regra quebrada. ${e.message.slice(0, 80)}`);
      continue;
    }
  }
  if (recusou === c.recusa) { ok++; continue; }
  falhas.push(
    c.recusa
      ? `${c.nome}: ACEITOU um valor ilimitado na pratica`
      : `${c.nome}: RECUSOU uma quantia legitima — falso positivo aqui impede aprovacao honesta`
  );
}

console.log("portao do F-6b · a regra 6 exercida, nao lida");
console.log(`  casos ......................... ${CASOS.length}`);
console.log(`  corretos ...................... ${ok}`);
console.log(`  NAO conferido ................. se o artefato real declara os tipos como este stub declara`);

if (falhas.length) {
  console.error("\nF-6b ABERTO:");
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log("\n✓ quantia exata passa, maximo canonico recusa, e a regra roda sem quebrar");
