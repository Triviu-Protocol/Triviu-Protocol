#!/usr/bin/env node
/**
 * keccak-256 do Ethereum, num lugar so.
 *
 * Extraido VERBATIM de scripts/gerar-abi-console.mjs em 2026-08-22, porque um
 * segundo gerador precisou dele e importar daquele arquivo EXECUTA o modulo
 * inteiro — que le contracts/out/** e morre com ENOENT desde caad24b, o commit
 * em que a linha V0 substituiu os contratos anteriores (TUBARAO-07).
 *
 * Uma definicao, dois consumidores. gerar-abi-console.mjs mantem a copia dele
 * ate voltar a rodar; quando voltar, migra para ca. A duplicacao fica DECLARADA
 * aqui em vez de silenciosa, e a razao e a mesma que fez site/js/motor.js
 * existir: duas canonicalizacoes do mesmo objeto se separam sem ninguem notar.
 *
 * O padding e 0x01 (Ethereum), NAO o 0x06 do SHA3-256 do NIST.
 */

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

/* Vetor conhecido do proprio Keccak. Quem importa daqui herda esta prova: se o
   modulo carregou sem lancar, o keccak reproduz a entrada vazia. Autoconferencia
   no carregamento, e nao um teste que alguem lembra de rodar. */
const VETOR_VAZIO = "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470";
if (keccak256("") !== VETOR_VAZIO) {
  throw new Error("keccak256 nao bate o vetor conhecido da entrada vazia — nada que dependa disto deve rodar");
}
