#!/usr/bin/env node
/**
 * O COMMITMENT, CONFERIDO CONTRA O SOLIDITY — E NAO CONTRA ELE MESMO.
 *
 * `Commitment.proposalHash` e `Commitment.executionHash` sao recalculados pelo
 * cofre a cada execucao, e uma divergencia de um bit vira `CommitmentMismatch`.
 * O cliente precisa produzir exatamente os mesmos bytes que o `solc` produz.
 *
 * A tentacao seria comparar `abiEncode` com uma segunda implementacao de
 * `abi.encode` escrita aqui. Isso mediria consistencia, nao correcao — o defeito
 * que esta sessao inteira perseguiu. Entao a referencia e OUTRA:
 *
 *   · `forge` compila e roda um contrato de teste que chama a biblioteca REAL,
 *     e o valor sai do `solc`.
 *
 * Condicao 4 do julgamento do Tubarao-branco (ONDA-TRIVIU-EXECUTAR): a prova
 * final e contra a chain, e nao contra a implementacao.
 *
 * Sem `forge` no PATH este portao PULA dizendo que pulou. Um portao que se cala
 * quando nao pode medir e um portao que passa por engano.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const RAIZ = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const CONTRATOS = join(RAIZ, "contracts");

/* ── o cliente ────────────────────────────────────────────────────────────── */
const win = {};
new Function("window", readFileSync(join(RAIZ, "site/js/motor.js"), "utf8"))(win);
new Function("window", readFileSync(join(RAIZ, "site/js/keccak.js"), "utf8"))(win);
const M = win.TRIVIU_MOTOR, K = win.TRIVIU_KECCAK;

/* O `solc` recusa literal de endereco sem checksum EIP-55, e EIP-55 E KECCAK:
   maiusculiza o digito quando o nibble correspondente do hash do endereco em
   minusculo e >= 8. Entao o checksum sai do keccak que este portao existe para
   conferir — e o compilador vira mais um juiz dele. Se o porte estivesse errado,
   o checksum sairia errado e o `solc` recusaria antes de qualquer hash. */
function comChecksum(end) {
  const b = String(end).replace(/^0x/, "").toLowerCase();
  const h = K.keccak256(b).slice(2);
  let fora = "0x";
  for (let i = 0; i < b.length; i++) {
    fora += parseInt(h[i], 16) >= 8 ? b[i].toUpperCase() : b[i];
  }
  return fora;
}

/* Os valores nao sao redondos de proposito: um zero a mais ou a menos em campo
   errado passaria despercebido com numeros bonitos. */
const CASO = {
  chainid: "137",
  vault: "0xdbcc3fb13652451739008aeef0d1110863ac6d10",
  nonce: "7",
  configEpoch: "3",
  strategy: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6",
  tokenIn: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
  tokenOut: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619",
  amountIn: "1234567",
  lotId: "0",
  executor: "0x323C4192b269EA56aCd147dDbd3F71056E63E835",
  target: "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff",
  spender: "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff",
  operatorMinOut: "998877",
  validUntil: "1900000000",
  declaredRefund: "1000000",
  /* Calldata sintetica, mas bem formada: o seletor real de
     `swapExactTokensForTokens` seguido de duas palavras. O tamanho importa mais
     que o conteudo — 68 bytes atravessam o primeiro bloco do keccak junto com o
     padding, que e o caso que o gabarito dos seletores nao exercita.
     O primeiro valor que escrevi aqui tinha numero IMPAR de digitos, e quem
     pegou foi a validacao de `keccak256Hex` — ela recusou em vez de hashear
     bytes malformados em silencio. */
  routeCalldata: "0x38ed1739" +
    "000000000000000000000000000000000000000000000000000000000012d687" +
    "00000000000000000000000000000000000000000000000000000000000f4240"
};

const propostaCliente = K.keccak256Hex(M.abiEncode([
  { tipo: "uint256", valor: CASO.chainid },
  { tipo: "address", valor: CASO.vault },
  { tipo: "uint64", valor: CASO.nonce },
  { tipo: "uint64", valor: CASO.configEpoch },
  { tipo: "address", valor: CASO.strategy },
  { tipo: "address", valor: CASO.tokenIn },
  { tipo: "address", valor: CASO.tokenOut },
  { tipo: "uint256", valor: CASO.amountIn },
  { tipo: "uint256", valor: CASO.lotId }
]));
const rotaHashCliente = K.keccak256Hex(CASO.routeCalldata);
const execucaoCliente = K.keccak256Hex(M.abiEncode([
  { tipo: "bytes32", valor: propostaCliente },
  { tipo: "address", valor: CASO.executor },
  { tipo: "address", valor: CASO.target },
  { tipo: "address", valor: CASO.spender },
  { tipo: "uint256", valor: CASO.amountIn },
  { tipo: "uint256", valor: CASO.operatorMinOut },
  { tipo: "uint64", valor: CASO.validUntil },
  { tipo: "uint256", valor: CASO.declaredRefund },
  { tipo: "bytes32", valor: rotaHashCliente }
]));

/* ── o solc ───────────────────────────────────────────────────────────────── */
const TESTE = `// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Commitment} from "../src/vault/libraries/Commitment.sol";

contract CommitmentContraCliente is Test {
    function test_imprime() public {
        vm.chainId(${CASO.chainid});
        bytes32 proposta = Commitment.proposalHash(
            ${comChecksum(CASO.vault)},
            ${CASO.nonce},
            ${CASO.configEpoch},
            ${comChecksum(CASO.strategy)},
            ${comChecksum(CASO.tokenIn)},
            ${comChecksum(CASO.tokenOut)},
            ${CASO.amountIn},
            ${CASO.lotId}
        );
        bytes32 execucao = Commitment.executionHash(
            proposta,
            ${comChecksum(CASO.executor)},
            ${comChecksum(CASO.target)},
            ${comChecksum(CASO.spender)},
            ${CASO.amountIn},
            ${CASO.operatorMinOut},
            ${CASO.validUntil},
            ${CASO.declaredRefund},
            keccak256(hex"${CASO.routeCalldata.slice(2)}")
        );
        emit log_named_bytes32("PROPOSTA", proposta);
        emit log_named_bytes32("EXECUCAO", execucao);
    }
}
`;

let forgeOk = true;
try { execFileSync("forge", ["--version"], { stdio: "ignore" }); }
catch { forgeOk = false; }

if (!forgeOk) {
  console.log("○ commitment: PULADO — `forge` nao esta no PATH.");
  console.log("  Este portao mede o cliente contra o SOLC, e sem o compilador nao ha contra o que");
  console.log("  medir. Ele pula dizendo que pulou, em vez de passar em silencio.");
  console.log(`  o cliente calculou: proposta=${propostaCliente.slice(0, 18)}… execucao=${execucaoCliente.slice(0, 18)}…`);
  process.exit(0);
}

/* O caminho da biblioteca varia; descobre em vez de presumir. */
let caminhoLib = null;
for (const p of ["src/vault/libraries/Commitment.sol", "src/libraries/Commitment.sol",
                 "src/vault/Commitment.sol", "src/protocol/libraries/Commitment.sol"]) {
  if (existsSync(join(CONTRATOS, p))) { caminhoLib = p; break; }
}
if (!caminhoLib) {
  console.error("✗ commitment: nao achei Commitment.sol na arvore de contratos");
  process.exit(1);
}
/* O teste nasce em `test/gerado/`, entao sao DOIS niveis ate `src/` e nao um.
   O primeiro `../` levava a `test/src/...`, que o solc procurou e nao achou. */
const relativo = "../../" + caminhoLib;

mkdirSync(join(CONTRATOS, "test/gerado"), { recursive: true });
const arquivo = join(CONTRATOS, "test/gerado/CommitmentContraCliente.t.sol");
writeFileSync(arquivo, TESTE.replace("../src/vault/libraries/Commitment.sol", relativo), "utf8");

let saida = "";
try {
  saida = execFileSync("forge", ["test", "--match-path", "test/gerado/CommitmentContraCliente.t.sol", "-vv"],
    { cwd: CONTRATOS, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
} catch (e) {
  saida = String(e.stdout || "") + String(e.stderr || "");
}

const pega = (rot) => {
  const m = new RegExp(rot + ":\\s*(0x[0-9a-fA-F]{64})").exec(saida);
  return m ? m[1].toLowerCase() : null;
};
const propostaSol = pega("PROPOSTA");
const execucaoSol = pega("EXECUCAO");

if (!propostaSol || !execucaoSol) {
  console.error("✗ commitment: o forge nao imprimiu os dois hashes. Saida:");
  console.error(saida.split("\n").slice(-14).map((l) => "  " + l).join("\n"));
  process.exit(1);
}

const falhas = [];
if (propostaCliente.toLowerCase() !== propostaSol) {
  falhas.push(`proposalHash DIVERGE · cliente ${propostaCliente} · solc ${propostaSol}`);
}
if (execucaoCliente.toLowerCase() !== execucaoSol) {
  falhas.push(`executionHash DIVERGE · cliente ${execucaoCliente} · solc ${execucaoSol}`);
}

if (falhas.length) {
  console.error(`✗ commitment: ${falhas.length} divergencia(s) contra o solc`);
  for (const f of falhas) console.error("  " + f);
  console.error("  Uma divergencia de um bit vira CommitmentMismatch na chain, e a pessoa paga o gas");
  console.error("  para descobrir. E por isto que a referencia aqui e o compilador, e nao nos mesmos.");
  process.exit(1);
}
console.log("✓ commitment: os dois hashes do cliente batem com os que o solc calcula");
console.log(`  proposalHash  ${propostaSol}`);
console.log(`  executionHash ${execucaoSol}`);
console.log("  a referencia e a biblioteca REAL compilada, e nao uma segunda implementacao nossa");
