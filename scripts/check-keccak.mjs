#!/usr/bin/env node
/**
 * O KECCAK DO NAVEGADOR, CONFERIDO CONTRA TRES COISAS DIFERENTES.
 *
 * `site/js/keccak.js` e um PORTE de `scripts/keccak.mjs`, e um porte que ninguem
 * confere e uma copia que diverge. Este portao confere:
 *
 *   1. contra o SOLC   — os 133 seletores do artefato compilado. Cada seletor e
 *                        keccak256(assinatura).slice(0,10), e quem os escreveu
 *                        foi o compilador. 133 casos independentes.
 *   2. na FRONTEIRA    — 0, 1, 135, 136, 137, 271, 272, 273 e 288 bytes. Os 133
 *                        acima NAO cobrem isto: apenas UMA das assinaturas passa
 *                        dos 136 bytes de um bloco, e os hashes que o porte
 *                        existe para calcular tem 288 bytes, ou tres blocos.
 *                        Uma implementacao que erre a absorcao multi-bloco
 *                        passaria em 132 de 133 e falharia em tudo que importa.
 *   3. contra o ORIGEM — porte e original produzindo o mesmo valor nas mesmas
 *                        entradas. Duas canonicalizacoes do mesmo objeto se
 *                        separam sem ninguem notar, e este repositorio ja pagou
 *                        por isso: e a razao de site/js/motor.js existir.
 *
 * Condicao 3 do julgamento do Tubarao-branco (ONDA-TRIVIU-EXECUTAR).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { keccak256 as original } from "./keccak.mjs";

const RAIZ = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const falhas = [];
const notas = [];

/* Carrega o porte como o navegador carregaria: um script que se pendura numa
   raiz. Se a autoconferencia dele lancar, isto morre aqui — que e o ponto. */
const win = {};
try {
  new Function("window", readFileSync(join(RAIZ, "site/js/keccak.js"), "utf8"))(win);
} catch (e) {
  console.error(`✗ keccak: o porte NAO CARREGA — ${e.message}`);
  console.error("  A autoconferencia dele roda no carregamento de proposito: uma pagina que");
  console.error("  carregou e uma pagina cujo keccak reproduz os vetores conhecidos.");
  process.exit(1);
}
const K = win.TRIVIU_KECCAK;
if (!K) { console.error("✗ keccak: o porte carregou e nao expos TRIVIU_KECCAK"); process.exit(1); }
notas.push("o porte carrega, e carregar ja significa que os tres vetores internos passaram");

/* ── 1 · contra o solc ────────────────────────────────────────────────────── */
const abiWin = {};
new Function("window", readFileSync(join(RAIZ, "site/js/abi-v0-console.js"), "utf8"))(abiWin);
const ABI = abiWin.TRIVIU_ABI_V0 || abiWin.TRIVIU_ABI;

const pares = [];
for (const grupo of [ABI.contratos || {}, ABI.extras || {}]) {
  for (const c of Object.values(grupo)) {
    for (const [assinatura, f] of Object.entries(c.funcoes || {})) {
      if (f && f.seletor) pares.push([assinatura, String(f.seletor).toLowerCase()]);
    }
    for (const [sel, e] of Object.entries(c.erros || {})) {
      if (e && e.assinatura) pares.push([e.assinatura, String(sel).toLowerCase()]);
    }
  }
}
const erradas = pares.filter(([a, sel]) => K.keccak256(a).slice(0, 10) !== sel);
if (erradas.length) {
  falhas.push(`${erradas.length} de ${pares.length} seletores DIVERGEM do artefato compilado: ` +
    erradas.slice(0, 3).map(([a, s]) => `${a.slice(0, 40)} devia ser ${s}`).join(" · "));
} else {
  notas.push(`${pares.length} seletores reproduzidos, e quem os escreveu foi o solc`);
}

/* ── 2 · a fronteira dos blocos ───────────────────────────────────────────── */
const TAMANHOS = [0, 1, 135, 136, 137, 271, 272, 273, 288];
const fronteira = TAMANHOS.map((n) => {
  const t = "a".repeat(n);
  return [n, K.keccak256(t), original(t)];
});
const divergem = fronteira.filter(([, a, b]) => a !== b);
if (divergem.length) {
  falhas.push(`o porte diverge do original em ${divergem.length} tamanho(s): ` +
    divergem.map(([n]) => `${n} bytes`).join(", "));
} else {
  notas.push(`${TAMANHOS.length} tamanhos de fronteira batem (135/136/137 e 271/272/273 sao ` +
    `onde a absorcao de um segundo bloco entra)`);
}
/* E o que NENHUM dos 133 mede: quantos deles sao multi-bloco. */
const multi = pares.filter(([a]) => Buffer.byteLength(a, "utf8") >= 136).length;
notas.push(`dos ${pares.length} seletores, ${multi} passa(m) de 136 bytes — por isso a ` +
  `checagem de fronteira existe e nao e redundante`);

/* ── 3 · a porta de hexadecimal ───────────────────────────────────────────── */
/* Hashear os CARACTERES de um hex em vez dos seus bytes da outro valor, e a
   diferenca nao aparece em nenhum dos 133 seletores, que sao texto. */
const casosHex = [
  ["0x", 0],
  ["0x00", 1],
  ["0x" + "00".repeat(32), 32],
  ["0x" + "ff".repeat(136), 136],
  ["0x" + "ab".repeat(288), 288]
];
let hexOk = 0;
for (const [hex, n] of casosHex) {
  const bytes = new Uint8Array(n);
  const h = String(hex).slice(2);
  for (let i = 0; i < n; i++) bytes[i] = parseInt(h.substr(i * 2, 2), 16);
  if (K.keccak256Hex(hex) === K.keccak256Bytes(bytes)) hexOk += 1;
  else falhas.push(`keccak256Hex diverge de keccak256Bytes em ${n} bytes`);
}
if (hexOk === casosHex.length) {
  notas.push(`${hexOk} entradas hexadecimais concordam com a porta de bytes`);
}
/* A prova de que as duas portas NAO sao a mesma coisa: o texto "0x00" e um byte
   zero sao entradas diferentes e tem de dar hashes diferentes. */
if (K.keccak256("0x00") === K.keccak256Hex("0x00")) {
  falhas.push("keccak256(texto) e keccak256Hex(hex) devolveram o MESMO valor para '0x00' — " +
    "uma das duas nao esta convertendo, e a calldata sairia com o hash errado");
} else {
  notas.push("texto e hexadecimal sao tratados como coisas diferentes, que e o que sao");
}

/* ── saida ────────────────────────────────────────────────────────────────── */
if (falhas.length) {
  console.error(`✗ keccak: ${falhas.length} falha(s)`);
  for (const f of falhas) console.error("  " + f);
  process.exit(1);
}
console.log(`✓ keccak: porte conferido contra o solc, a fronteira dos blocos e o modulo de origem`);
for (const n of notas) console.log("  " + n);
