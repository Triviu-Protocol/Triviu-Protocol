#!/usr/bin/env node
/**
 * A TUPLA DINAMICA, CONFERIDA CONTRA O SOLC.
 *
 * `abiEncodeTuplaDinamica` monta cabeca-e-cauda: uma palavra por campo na
 * cabeca — valor se estatico, DESLOCAMENTO se dinamico — e o conteudo na cauda.
 * Errar a origem do deslocamento produz bytes plausiveis que a chain recusa
 * depois de a pessoa ter pago o gas.
 *
 * A referencia e `abi.encode` do proprio compilador, e nao uma segunda
 * implementacao nossa. Condicao 4 do julgamento (peca 2), e condicao 5 do
 * julgamento da peca 3, que exigiu as fronteiras do padding de 32 bytes:
 * `bytes` vazio, de 1, 31, 32 e 33 bytes.
 *
 * O caminho INVERSO tambem e conferido: `lerTuplaDinamica` tem de devolver
 * exatamente o que entrou. Codificar e decodificar com a mesma funcao mediria
 * consistencia; por isso o codificado vai ao `solc` e o decodificado volta do
 * que o `solc` produziu.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const RAIZ = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const CONTRATOS = join(RAIZ, "contracts");

const win = {};
new Function("window", readFileSync(join(RAIZ, "site/js/motor.js"), "utf8"))(win);
const M = win.TRIVIU_MOTOR;

/* As fronteiras do padding: 32 bytes por palavra, e o que nao fecha e preenchido
   a direita. 31/32/33 sao onde uma implementacao erra o preenchimento. */
const CASOS = [
  { n: 0, nota: "bytes vazio" },
  { n: 1, nota: "1 byte — 31 de padding" },
  { n: 31, nota: "31 bytes — 1 de padding" },
  { n: 32, nota: "32 bytes — palavra exata, zero padding" },
  { n: 33, nota: "33 bytes — segunda palavra com 31 de padding" },
  { n: 68, nota: "68 bytes — uma calldata de swap tipica" }
];
const hexDe = (n) => "0x" + Array.from({ length: n }, (_, i) => ((i * 7 + 3) % 256).toString(16).padStart(2, "0")).join("");

const A1 = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
const A2 = "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619";

/* Monta com o cliente. A tupla imita a forma de ExecutionParams: estaticos,
   depois um `bytes`, depois um estatico DEPOIS do dinamico — que e o caso em
   que o deslocamento tem de contar a cabeca inteira, e nao parar no dinamico. */
const doCliente = CASOS.map((c) => {
  const campos = [
    { nome: "executor", tipo: "address", valor: A1 },
    { nome: "amountIn", tipo: "uint256", valor: "1234567" },
    { nome: "rota", tipo: "bytes", valor: hexDe(c.n) },
    { nome: "hash", tipo: "bytes32", valor: "0x" + "ab".repeat(32) },
    { nome: "alvo", tipo: "address", valor: A2 }
  ];
  return { ...c, campos, saida: M.abiEncodeTuplaDinamica(campos) };
});

/* ── contra o solc ────────────────────────────────────────────────────────── */
let forgeOk = true;
try { execFileSync("forge", ["--version"], { stdio: "ignore" }); } catch { forgeOk = false; }
if (!forgeOk) {
  console.log("○ tupla: PULADO — `forge` nao esta no PATH, e a referencia deste portao e o solc.");
  console.log("  Pular dizendo que pulou; um portao que se cala quando nao pode medir passa por engano.");
  process.exit(0);
}

const corpo = doCliente.map((c, i) => `
    function test_caso_${i}() public {
        bytes memory rota = hex"${hexDe(c.n).slice(2)}";
        bytes memory fora = abi.encode(
            ${A1},
            uint256(1234567),
            rota,
            bytes32(0x${"ab".repeat(32)}),
            ${A2}
        );
        emit log_named_bytes("CASO${i}", fora);
    }`).join("\n");

const TESTE = `// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";

contract TuplaContraCliente is Test {
${corpo}
}
`;

mkdirSync(join(CONTRATOS, "test/gerado"), { recursive: true });
writeFileSync(join(CONTRATOS, "test/gerado/TuplaContraCliente.t.sol"), TESTE, "utf8");

let saida = "";
try {
  saida = execFileSync("forge", ["test", "--match-path", "test/gerado/TuplaContraCliente.t.sol", "-vv"],
    { cwd: CONTRATOS, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
} catch (e) { saida = String(e.stdout || "") + String(e.stderr || ""); }

const falhas = [];
const notas = [];
for (let i = 0; i < doCliente.length; i++) {
  const m = new RegExp(`CASO${i}:\\s*(0x[0-9a-fA-F]+)`).exec(saida);
  if (!m) { falhas.push(`caso ${i} (${doCliente[i].nota}): o forge nao imprimiu`); continue; }
  const doSolc = m[1].toLowerCase();
  const meu = doCliente[i].saida.hex.toLowerCase();
  if (meu !== doSolc) {
    falhas.push(`${doCliente[i].nota}: cliente ${meu.length / 2 - 1} bytes, solc ${doSolc.length / 2 - 1} bytes` +
      (meu.length === doSolc.length ? " — mesmo tamanho, conteudo diferente" : ""));
    continue;
  }
  /* E o caminho inverso, sobre o que o SOLC produziu — nao sobre o meu. */
  const tipos = ["address", "uint256", "bytes", "bytes32", "address"];
  let lido;
  try { lido = M.lerTuplaDinamica(doSolc, tipos); }
  catch (e) { falhas.push(`${doCliente[i].nota}: lerTuplaDinamica lancou — ${e.message}`); continue; }
  const esperado = hexDe(doCliente[i].n).toLowerCase();
  if (String(lido[2]).toLowerCase() !== esperado) {
    falhas.push(`${doCliente[i].nota}: a leitura devolveu ${String(lido[2]).slice(0, 20)}… e o valor era ${esperado.slice(0, 20)}…`);
    continue;
  }
  if (String(lido[0]).toLowerCase() !== A1.toLowerCase() || String(lido[4]).toLowerCase() !== A2.toLowerCase()) {
    falhas.push(`${doCliente[i].nota}: a leitura errou um campo estatico DEPOIS do dinamico`);
    continue;
  }
  notas.push(`${doCliente[i].nota}: monta igual ao solc e a leitura devolve o que entrou`);
}

/* ── a ROTA de verdade: address[] e o seletor ─────────────────────────────── */
/* `address[]` entrou junto com `bytes`, na mesma funcao e fora da tabela. O
   caso abaixo e a calldata REAL de um swap V2, com o `path` de dois enderecos,
   e o seletor sai do keccak portado — nao de uma constante digitada. */
const kwin = {};
new Function("window", readFileSync(join(RAIZ, "site/js/keccak.js"), "utf8"))(kwin);
const KK = kwin.TRIVIU_KECCAK;
const ASSINATURA = "swapExactTokensForTokens(uint256,uint256,address[],address,uint256)";
const COFRE = "0xdBCC3Fb13652451739008aEEf0d1110863AC6d10";

const rotaCliente = M.abiEncodeTuplaDinamica([
  { nome: "amountIn", tipo: "uint256", valor: "1234567" },
  { nome: "amountOutMin", tipo: "uint256", valor: "998877" },
  { nome: "path", tipo: "address[]", valor: [A1, A2] },
  { nome: "to", tipo: "address", valor: COFRE },
  { nome: "deadline", tipo: "uint256", valor: "1900000000" }
]);

const TESTE_ROTA = `// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";

contract RotaContraCliente is Test {
    function test_rota() public {
        address[] memory caminho = new address[](2);
        caminho[0] = ${A1};
        caminho[1] = ${A2};
        bytes memory fora = abi.encode(
            uint256(1234567), uint256(998877), caminho, ${COFRE}, uint256(1900000000)
        );
        emit log_named_bytes("ROTA", fora);
        emit log_named_bytes32("SELETOR", bytes32(bytes4(keccak256("${ASSINATURA}"))));
    }
}
`;
writeFileSync(join(CONTRATOS, "test/gerado/RotaContraCliente.t.sol"), TESTE_ROTA, "utf8");
let saidaRota = "";
try {
  saidaRota = execFileSync("forge", ["test", "--match-path", "test/gerado/RotaContraCliente.t.sol", "-vv"],
    { cwd: CONTRATOS, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
} catch (e) { saidaRota = String(e.stdout || "") + String(e.stderr || ""); }

const mRota = /ROTA:\s*(0x[0-9a-fA-F]+)/.exec(saidaRota);
const mSel = /SELETOR:\s*(0x[0-9a-fA-F]{64})/.exec(saidaRota);
if (!mRota || !mSel) {
  falhas.push("o forge nao imprimiu a rota e/ou o seletor");
} else {
  if (rotaCliente.hex.toLowerCase() !== mRota[1].toLowerCase()) {
    falhas.push(`a rota com address[] DIVERGE do solc (cliente ${rotaCliente.hex.length / 2 - 1} bytes, ` +
      `solc ${mRota[1].length / 2 - 1} bytes)`);
  } else {
    notas.push("a rota de swap V2, com o path como address[], monta igual ao solc");
  }
  const selCliente = KK.keccak256(ASSINATURA).slice(0, 10).toLowerCase();
  const selSolc = mSel[1].slice(0, 10).toLowerCase();
  if (selCliente !== selSolc) {
    falhas.push(`o seletor da rota diverge: cliente ${selCliente} · solc ${selSolc}`);
  } else {
    notas.push(`o seletor ${selCliente} sai do keccak portado, e nao de uma constante digitada`);
  }
  /* E a leitura devolve o array como LISTA, e nao como bytes. */
  let lidoRota;
  try { lidoRota = M.lerTuplaDinamica(mRota[1], ["uint256", "uint256", "address[]", "address", "uint256"]); }
  catch (e) { falhas.push(`lerTuplaDinamica lancou na rota — ${e.message}`); lidoRota = null; }
  if (lidoRota) {
    const caminho = lidoRota[2];
    const ok = Array.isArray(caminho) && caminho.length === 2 &&
      String(caminho[0]).toLowerCase() === A1.toLowerCase() &&
      String(caminho[1]).toLowerCase() === A2.toLowerCase();
    if (!ok) falhas.push(`a leitura do address[] devolveu ${JSON.stringify(caminho).slice(0, 60)}`);
    else notas.push("a leitura devolve o path como lista de dois enderecos, e nao como bytes crus");
  }
}

/* ── a calldata INTEIRA de executeAsOwner ────────────────────────────────────
   Tupla ANINHADA: `Intent` e estatica e vai inline; `ExecutionParams` contem um
   `bytes`, entao a tupla inteira vira dinamica e a cabeca leva um ponteiro para
   ela. Este e o caso real, e as quatro pecas anteriores se juntam aqui. */
const paramsCliente = M.abiEncodeTuplaDinamica([
  { nome: "executor", tipo: "address", valor: A1 },
  { nome: "target", tipo: "address", valor: A2 },
  { nome: "spender", tipo: "address", valor: A2 },
  { nome: "base", tipo: "address", valor: A1 },
  { nome: "operatorMinOut", tipo: "uint256", valor: "998877" },
  { nome: "validUntil", tipo: "uint64", valor: "1900000000" },
  { nome: "declaredConfigEpoch", tipo: "uint64", valor: "3" },
  { nome: "declaredRefund", tipo: "uint256", valor: "1000000" },
  { nome: "declaredGas", tipo: "uint256", valor: "250000" },
  { nome: "declaredGasPrice", tipo: "uint256", valor: "35000000000" },
  { nome: "declaredQuote", tipo: "uint256", valor: "1000000" },
  { nome: "candidateLotId", tipo: "uint256", valor: "0" },
  { nome: "routeCalldata", tipo: "bytes", valor: rotaCliente ? ("0x38ed1739" + rotaCliente.hex.slice(2)) : "0x" },
  { nome: "executionHash", tipo: "bytes32", valor: "0x" + "cd".repeat(32) }
]);
const inteiroCliente = M.abiEncodeTuplaDinamica([
  { nome: "side", tipo: "uint8", valor: "0" },
  { nome: "asset", tipo: "address", valor: A2 },
  { nome: "base", tipo: "address", valor: A1 },
  { nome: "amountIn", tipo: "uint256", valor: "1234567" },
  { nome: "minOut", tipo: "uint256", valor: "998877" },
  { nome: "lotId", tipo: "uint256", valor: "0" },
  { nome: "params", tipo: "bruto-dinamico", valor: paramsCliente.hex }
]);

const TESTE_INTEIRO = `// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";

struct Intent2 { uint8 side; address asset; address base; uint256 amountIn; uint256 minOut; uint256 lotId; }
struct Params2 {
    address executor; address target; address spender; address base;
    uint256 operatorMinOut; uint64 validUntil; uint64 declaredConfigEpoch;
    uint256 declaredRefund; uint256 declaredGas; uint256 declaredGasPrice;
    uint256 declaredQuote; uint256 candidateLotId; bytes routeCalldata; bytes32 executionHash;
}

contract InteiroContraCliente is Test {
    function test_inteiro() public {
        Intent2 memory i = Intent2(0, ${A2}, ${A1}, 1234567, 998877, 0);
        Params2 memory p = Params2(
            ${A1}, ${A2}, ${A2}, ${A1}, 998877, 1900000000, 3,
            1000000, 250000, 35000000000, 1000000, 0,
            hex"${(rotaCliente ? ("38ed1739" + rotaCliente.hex.slice(2)) : "")}",
            bytes32(0x${"cd".repeat(32)})
        );
        emit log_named_bytes("INTEIRO", abi.encode(i, p));
    }
}
`;
writeFileSync(join(CONTRATOS, "test/gerado/InteiroContraCliente.t.sol"), TESTE_INTEIRO, "utf8");
let saidaInt = "";
try {
  saidaInt = execFileSync("forge", ["test", "--match-path", "test/gerado/InteiroContraCliente.t.sol", "-vv"],
    { cwd: CONTRATOS, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
} catch (e) { saidaInt = String(e.stdout || "") + String(e.stderr || ""); }

const mInt = /INTEIRO:\s*(0x[0-9a-fA-F]+)/.exec(saidaInt);
if (!mInt) {
  falhas.push("o forge nao imprimiu a calldata inteira de executeAsOwner");
} else if (inteiroCliente.hex.toLowerCase() !== mInt[1].toLowerCase()) {
  falhas.push(`a calldata ANINHADA diverge: cliente ${inteiroCliente.hex.length / 2 - 1} bytes, ` +
    `solc ${mInt[1].length / 2 - 1} bytes`);
} else {
  notas.push(`a tupla ANINHADA de executeAsOwner monta igual ao solc ` +
    `(${mInt[1].length / 2 - 1} bytes, Intent inline + ponteiro para ExecutionParams)`);
}

/* O mapa nao pode chamar ponteiro de valor — condicao 4 do julgamento. */
const mapa = doCliente[0].saida.mapa;
const ponteiros = mapa.filter((x) => x.papel === "deslocamento");
if (ponteiros.length !== 1) {
  falhas.push(`o mapa declara ${ponteiros.length} deslocamento(s) e a tupla tem 1 campo dinamico`);
} else {
  notas.push("o mapa distingue deslocamento de valor, para o cartao nunca exibir um ponteiro");
}

if (falhas.length) {
  console.error(`✗ tupla: ${falhas.length} de ${CASOS.length} caso(s) falharam`);
  for (const f of falhas) console.error("  " + f);
  process.exit(1);
}
console.log(`✓ tupla: ${CASOS.length} casos batem com abi.encode do solc, e a leitura inversa devolve o que entrou`);
for (const n of notas) console.log("  " + n);
