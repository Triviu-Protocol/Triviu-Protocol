#!/usr/bin/env node
/**
 * Gera site/js/abi-console.js a partir dos artefatos compilados em contracts/out.
 *
 * POR QUE ISTO EXISTE
 * ===================
 * O console anterior (adm/console/triviu-initiation-v2.html) nomeava funcoes que
 * os contratos implantados nao tem — registro de usuario, triade por usuario,
 * cofre de indicacao, "cerca". Um nome de funcao digitado a mao numa tela nao
 * tem nada que o prenda ao contrato: ele envelhece sozinho e ninguem percebe.
 *
 * Entao a tela nao digita nenhum. Cada assinatura e cada seletor de 4 bytes que
 * o console imprime sai DAQUI, e isto sai do artefato que o forge produziu ao
 * compilar exatamente o codigo que foi implantado. O guardiao
 * scripts/check-console-abi.mjs regera este arquivo e compara byte a byte: se o
 * contrato mudar e a tela nao, o CI reprova.
 *
 * O KECCAK
 * ========
 * Seletor de erro e topico de evento nao vem prontos no artefato (o forge so
 * publica `methodIdentifiers`, que cobre funcoes). Entao o keccak-256 esta
 * implementado aqui — e ele NAO e confiado: antes de gerar qualquer coisa, ele e
 * conferido contra as ~26 respostas conhecidas que o proprio forge escreveu em
 * `methodIdentifiers`. Se a implementacao estiver errada em um bit, os seletores
 * de funcao nao batem e este script aborta sem escrever nada.
 *
 *   node scripts/gerar-abi-console.mjs          escreve
 *   node scripts/check-console-abi.mjs          confere
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

/* ========================================================== keccak-256 ===== */
const MASCARA = (1n << 64n) - 1n;
const girar = (x, n) => ((x << BigInt(n)) | (x >> BigInt(64 - n))) & MASCARA;

const RC = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];
// r[x][y] — deslocamentos de rho, tabela padrao do Keccak.
const DESLOC = [
  [0, 36, 3, 41, 18],
  [1, 44, 10, 45, 2],
  [62, 6, 43, 15, 61],
  [28, 55, 25, 21, 56],
  [27, 20, 39, 8, 14],
];

function permutar(A) {
  for (let rodada = 0; rodada < 24; rodada++) {
    // theta
    const C = new Array(5), D = new Array(5);
    for (let x = 0; x < 5; x++) C[x] = A[x] ^ A[x + 5] ^ A[x + 10] ^ A[x + 15] ^ A[x + 20];
    for (let x = 0; x < 5; x++) D[x] = C[(x + 4) % 5] ^ girar(C[(x + 1) % 5], 1);
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) A[x + 5 * y] ^= D[x];
    // rho + pi
    const B = new Array(25).fill(0n);
    for (let x = 0; x < 5; x++)
      for (let y = 0; y < 5; y++)
        B[y + 5 * ((2 * x + 3 * y) % 5)] = girar(A[x + 5 * y], DESLOC[x][y]);
    // chi
    for (let x = 0; x < 5; x++)
      for (let y = 0; y < 5; y++)
        A[x + 5 * y] = B[x + 5 * y] ^ (~B[((x + 1) % 5) + 5 * y] & MASCARA & B[((x + 2) % 5) + 5 * y]);
    // iota
    A[0] ^= RC[rodada];
  }
  return A;
}

/** keccak-256 (o do Ethereum: padding 0x01, NAO o SHA3-256 do NIST). */
export function keccak256(texto) {
  const TAXA = 136; // 1088 bits
  const msg = Buffer.from(texto, "utf8");
  const preenchido = Buffer.alloc(Math.ceil((msg.length + 1) / TAXA) * TAXA);
  msg.copy(preenchido);
  preenchido[msg.length] = 0x01;
  preenchido[preenchido.length - 1] |= 0x80;

  let A = new Array(25).fill(0n);
  for (let off = 0; off < preenchido.length; off += TAXA) {
    for (let i = 0; i < TAXA / 8; i++) {
      let lane = 0n;
      for (let b = 7; b >= 0; b--) lane = (lane << 8n) | BigInt(preenchido[off + i * 8 + b]);
      A[i] ^= lane;
    }
    A = permutar(A);
  }
  let saida = "";
  for (let i = 0; i < 4; i++) {
    let lane = A[i];
    for (let b = 0; b < 8; b++) { saida += (lane & 0xffn).toString(16).padStart(2, "0"); lane >>= 8n; }
  }
  return "0x" + saida;
}

/* ===================================================== assinatura canonica = */
/** Um input de ABI vira o tipo canonico: tupla vira "(a,b,c)", array preserva o sufixo. */
function tipoCanonico(entrada) {
  if (entrada.type.startsWith("tuple")) {
    const dentro = (entrada.components || []).map(tipoCanonico).join(",");
    return "(" + dentro + ")" + entrada.type.slice("tuple".length);
  }
  return entrada.type;
}
const assinatura = (item) => `${item.name}(${(item.inputs || []).map(tipoCanonico).join(",")})`;

/* ============================================================= artefatos === */
const RAIZ = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const OUT = join(RAIZ, "contracts", "out");

const ler = (arquivo, nome) => JSON.parse(readFileSync(join(OUT, arquivo, nome + ".json"), "utf8"));

/* Os artefatos do codigo que foi implantado, mais as interfaces que os proprios
   contratos declaram — e de onde sai o `approve` que o usuario assina no passo 1.
   Nenhum deles e escrito a mao: sao os .json que o forge produziu.

   O TriviuLPVault entrou em 2026-08-12, e entrou com prova, nao com confianca.
   O fonte foi copiado de triviu-engine/contracts/src/TriviuLPVault.sol e
   compilado aqui (solc 0.8.24, optimizer 200, os mesmos do irmao). O artefato
   resultante NAO e byte-identico ao que a chain devolve — 380 dos 7954 bytes
   diferem — e a diferenca foi MEDIDA em vez de suposta:

     bytes divergentes DENTRO das 19 janelas de immutableReferences : 380
     bytes divergentes FORA delas                                   :   0
     artefato com os immutables preenchidos === eth_getCode(0xC52BaD28…) : true
     hash de metadata IPFS na cauda dos dois                         : igual

   Ou seja: os unicos bytes que diferem sao `registry` e `positionManager`, que
   o construtor grava no deploy e que nenhum compilador poderia conhecer antes.
   O fonte que este arquivo le E o contrato que esta na chain.

   A INonfungiblePositionManager e a interface que o proprio TriviuLPVault
   declara — sete funcoes, nao a ABI inteira do Uniswap. Ela vale como
   assinatura porque cada uma foi conferida AO VIVO contra 0xC36442b4…FE88 em
   2026-08-12 (ver EXTRAS.erc721 para o metodo e para o controle negativo). */
const ARTEFATOS = [
  { papel: "parameterRegistry", contrato: "ParameterRegistry", arq: ["ParameterRegistry.sol", "ParameterRegistry"] },
  { papel: "triviuExecutor", contrato: "TriviuExecutor", arq: ["TriviuExecutor.sol", "TriviuExecutor"] },
  { papel: "gasTank", contrato: "GasTank", arq: ["GasTank.sol", "GasTank"] },
  { papel: "erc20", contrato: "IERC20", arq: ["TriviuExecutor.sol", "IERC20"] },
  { papel: "lpVault", contrato: "TriviuLPVault", arq: ["TriviuLPVault.sol", "TriviuLPVault"] },
  { papel: "npm", contrato: "INonfungiblePositionManager", arq: ["TriviuLPVault.sol", "INonfungiblePositionManager"] },
];

/* Assinaturas que NAO vem de artefato deste repositorio, declaradas aqui uma vez
   com a razao ao lado. O seletor continua sendo calculado — nenhum hex e
   digitado — mas a procedencia e outra e a tela diz isso na cara.
     symbol/decimals  ERC-20 metadata (EIP-20 opcional). O IERC20 que o Executor
                      declara nao os tem, e sem eles a tela so mostraria endereco.
     approve (ERC-721) o position manager do Uniswap nao tem fonte aqui e o
                      TriviuLPVault nao declara essa funcao na interface dele —
                      declara so as sete que ele mesmo chama. Ela e obrigatoria
                      no fluxo assim mesmo, porque `coletar` e `fechar` passam
                      por _exigeAprovacaoUnica(). Medida ao vivo, ver abaixo.

   O bloco `lpVault` que morava aqui SAIU em 2026-08-12. Ele existia porque o
   TriviuLPVault nao tinha fonte neste repositorio; agora tem, foi compilado, e o
   artefato reproduz o bytecode implantado byte a byte fora dos immutables. Uma
   assinatura que pode sair do artefato nao tem por que ficar numa lista de
   excecoes — a lista de excecoes so vale enquanto e curta e cada linha dela e
   necessaria. */
const EXTRAS = {
  erc20Meta: {
    origem: "EIP-20 metadata (opcional na norma; ausente do IERC20 que o Executor declara)",
    assinaturas: ["symbol()", "decimals()"],
  },
  /* allowance NAO e metadata opcional: e nucleo do EIP-20. Ela esta aqui, e nao
     em `erc20`, porque o IERC20 minimo que o TriviuExecutor declara lista apenas
     approve/balanceOf/transfer/transferFrom — o artefato deste repositorio nao a
     tem, entao ela nao pode sair de contracts/out.
     A regra 7 do Tubarao-branco exige LER e MOSTRAR a aprovacao existente antes
     de pedir outra, e sem esta assinatura a tela nao teria como. O seletor
     continua calculado pelo keccak conferido, nunca digitado, e foi conferido AO
     VIVO em 2026-08-12 contra os tres primeiros tokens liberados
     (0x2791bca1…, 0x3c499c54…, 0xc2132d05…): a chamada RESPONDEU 0 nos tres, ou
     seja a funcao existe e devolve valor — nao reverteu como reverte um seletor
     que o contrato nao implementa. Cicatriz MV-1 honrada: nome na tela nao prova
     nada, a resposta do contrato prova. */
  erc20Allowance: {
    origem: "nucleo EIP-20 · ausente do IERC20 minimo deste repositorio · seletor conferido ao vivo contra 3 tokens liberados em 2026-08-12 (responderam 0, nao reverteram)",
    assinaturas: ["allowance(address,address)"],
  },
  /* ERC-721 approve. Mesma string de assinatura do approve de ERC-20, mesmo
     seletor — e semantica completamente diferente: o segundo argumento e um
     tokenId, nao uma quantia. Fica num papel proprio por isso: a tela precisa
     poder dizer "isto autoriza UMA posicao", e nao "isto autoriza uma quantia".

     Nao sai de artefato porque nenhum artefato daqui a declara: o
     INonfungiblePositionManager que o TriviuLPVault escreve lista as sete
     funcoes que o cofre CHAMA, e `approve` nao e uma delas — quem chama e o
     usuario, direto na carteira dele.

     Conferida AO VIVO em 2026-08-12 contra 0xC36442b4a4522E871399CD717aBDD847Ab11FE88,
     pelo despacho e nao pelo bytecode (cicatriz MV-1: PUSH4 e indicio, resposta
     e prova):
       approve(0xC52BaD28…, 1) de 0x…0001  -> reverte Error(string)
         "ERC721: approve caller is not owner nor approved for all"
       controle negativo, uma funcao inventada -> reverte com data "0x", vazio.
     Uma reverte com o motivo do contrato, a outra nao reverte com nada. E a
     diferenca entre as duas que prova que a primeira existe. */
  erc721: {
    origem: "EIP-721 · ausente de todo artefato deste repositorio · despacho conferido ao vivo contra o position manager em 2026-08-12 (reverte com Error(string) do proprio contrato; funcao inexistente reverte vazia)",
    assinaturas: ["approve(address,uint256)"],
  },
  /* Os dois erros que o proprio compilador insere e que nunca aparecem numa ABI:
     `require(cond, "msg")` reverte com Error(string) e um estouro ou divisao por
     zero reverte com Panic(uint256). Sem eles a tela imprimiria um hex opaco
     justamente nas duas reversoes mais comuns. */
  solidity: {
    origem: "reversoes embutidas no compilador Solidity · nao constam de nenhuma ABI",
    assinaturas: ["Error(string)", "Panic(uint256)"],
  },
};

/* =================================================== conferencia do keccak = */
const conhecidos = [];
for (const a of ARTEFATOS) {
  const j = ler(a.arq[0], a.arq[1]);
  for (const [sig, sel] of Object.entries(j.methodIdentifiers || {})) conhecidos.push([sig, "0x" + sel]);
}
if (conhecidos.length < 20) {
  console.error(`✗ so ${conhecidos.length} seletores conhecidos nos artefatos — poucos para conferir o keccak. Rode: forge build`);
  process.exit(1);
}
const divergentes = conhecidos.filter(([sig, sel]) => keccak256(sig).slice(0, 10) !== sel);
if (divergentes.length) {
  console.error("✗ o keccak-256 deste script nao reproduz os seletores que o forge escreveu:");
  for (const [sig, sel] of divergentes.slice(0, 5))
    console.error(`   ${sig}\n     forge  ${sel}\n     aqui   ${keccak256(sig).slice(0, 10)}`);
  console.error("  Nada foi escrito. Um seletor errado na tela e pior que nenhuma tela.");
  process.exit(1);
}
// Vetor conhecido do proprio Keccak, alem dos seletores: entrada vazia.
if (keccak256("") !== "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470") {
  console.error("✗ keccak256('') nao bate o vetor conhecido. Nada foi escrito.");
  process.exit(1);
}

/* =========================================================== montagem ====== */
const saida = { conferidos: conhecidos.length, contratos: {} };

for (const a of ARTEFATOS) {
  const j = ler(a.arq[0], a.arq[1]);
  const abi = j.abi || [];
  const alvo = { contrato: a.contrato, funcoes: {}, erros: {}, eventos: {} };

  for (const item of abi) {
    const sig = assinatura(item);
    if (item.type === "function") {
      const sel = "0x" + j.methodIdentifiers[sig];
      alvo.funcoes[sig] = {
        seletor: sel,
        mutabilidade: item.stateMutability,
        entradas: (item.inputs || []).map((i) => ({ nome: i.name, tipo: tipoCanonico(i) })),
        saidas: (item.outputs || []).map((o) => ({ nome: o.name, tipo: tipoCanonico(o) })),
      };
    } else if (item.type === "error") {
      alvo.erros[keccak256(sig).slice(0, 10)] = {
        assinatura: sig,
        entradas: (item.inputs || []).map((i) => ({ nome: i.name, tipo: tipoCanonico(i) })),
      };
    } else if (item.type === "event") {
      alvo.eventos[sig] = {
        topico: keccak256(sig),
        indexados: (item.inputs || []).filter((i) => i.indexed).map((i) => i.name),
      };
    }
  }
  saida.contratos[a.papel] = alvo;
}

saida.extras = {};
for (const [chave, bloco] of Object.entries(EXTRAS)) {
  const f = {};
  for (const sig of bloco.assinaturas) f[sig] = { seletor: keccak256(sig).slice(0, 10) };
  saida.extras[chave] = { origem: bloco.origem, funcoes: f };
}

/* O arquivo servido. Sem inline, sem module: um <script src> que define uma
   global, igual ao /enderecos.js — e pela mesma razao, servir HTML estatico. */
const corpo =
  `/* GERADO por scripts/gerar-abi-console.mjs — NAO EDITE A MAO.
 *
 * Cada assinatura e cada seletor aqui saiu de contracts/out/**, o artefato que o
 * forge produziu do codigo implantado. O keccak que calculou os seletores de erro
 * e os topicos de evento foi conferido, nesta mesma execucao, contra os
 * ${conhecidos.length} seletores de funcao que o proprio forge escreveu.
 *
 * Editar este arquivo a mao reprova em scripts/check-console-abi.mjs.
 * Para atualizar:  forge build  &&  node scripts/gerar-abi-console.mjs
 */
(function (raiz) {
  "use strict";
  var ABI = ${JSON.stringify(saida, null, 2)};
  if (typeof module !== "undefined" && module.exports) { module.exports = ABI; }
  if (raiz) { raiz.TRIVIU_ABI = ABI; }
})(typeof window !== "undefined" ? window : null);
`;

export const gerado = corpo;
export const DESTINO = join(RAIZ, "site", "js", "abi-console.js");

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`) {
  const { writeFileSync } = await import("node:fs");
  writeFileSync(DESTINO, corpo);
  const nFn = Object.values(saida.contratos).reduce((n, c) => n + Object.keys(c.funcoes).length, 0);
  const nErr = Object.values(saida.contratos).reduce((n, c) => n + Object.keys(c.erros).length, 0);
  const nEv = Object.values(saida.contratos).reduce((n, c) => n + Object.keys(c.eventos).length, 0);
  const nEx = Object.values(saida.extras).reduce((n, c) => n + Object.keys(c.funcoes).length, 0);
  console.log(`✓ site/js/abi-console.js gerado`);
  console.log(`  keccak conferido contra ${conhecidos.length} seletores do forge + vetor keccak256("")`);
  console.log(`  ${nFn} funcoes · ${nErr} erros · ${nEv} eventos · ${nEx} assinaturas extras declaradas`);
}
