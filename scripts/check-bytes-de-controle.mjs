#!/usr/bin/env node
/**
 * PORTAO · byte de controle em arquivo de texto.
 *
 * POR QUE ELE EXISTE — tres vezes no mesmo dia, tres ferramentas diferentes
 * -------------------------------------------------------------------------
 * 2026-09-07:
 *
 *   1. Uma ferramenta de edicao converteu o escape de U+0000 em BYTE NUL
 *      literal dentro de `scripts/csp-por-rota.mjs`. O git passou a classificar
 *      como BINARIO o modulo do qual todos os portoes dependem — sem diff, sem
 *      blame, sem revisao por linha, e `* text=auto` nunca normaliza binario.
 *
 *   2. A mesma conversao numa mensagem de commit. O git recusou: "a NUL byte in
 *      commit log message not allowed". Este falhou alto, e por isso custou
 *      minutos em vez de um dia.
 *
 *   3. A CRASE do PowerShell dentro de um here-string `@"..."@` — que
 *      INTERPOLA — transformou `` `fetch-depth `` em FORM FEED (0x0C) seguido
 *      de "etch-depth", em `.github/workflows/ci.yml`. O GitHub nao conseguiu
 *      parsear o workflow: a corrida falhou em ZERO segundo, sem job nenhum, e
 *      por dois minutos a leitura obvia foi "o CI nao disparou".
 *
 * O padrao e um so, e nao e descuido de digitacao: uma ferramenta no caminho
 * COME um escape e grava o caractere. Nenhum dos tres apareceu ao ler o arquivo
 * na tela. Os tres so aparecem contando bytes.
 *
 * O QUE ELE REPROVA
 * -----------------
 * Qualquer byte de controle C0 num arquivo de TEXTO, exceto os tres que texto
 * legitimamente usa: TAB (0x09), LF (0x0A) e CR (0x0D). Reprova tambem DEL
 * (0x7F). Nomeia o arquivo, o offset e o contexto — porque "ha um byte errado
 * em algum lugar" nao conserta nada.
 *
 * O QUE ELE NAO JULGA, dito na cara
 * ---------------------------------
 * Binario de verdade: `.png`, `.ico`, `.woff2`, `.pdf`, `.zip`. A lista de
 * extensoes de texto e ALLOWLIST, e nao denylist, porque a forma que ninguem
 * enumerou sempre vence uma denylist — falha ja catalogada nesta casa.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep, extname } from "node:path";

const RAIZ = join(import.meta.dirname, "..");

const PULAR = new Set(["node_modules", ".git", ".next", "dist", "build", ".vercel",
                       "lib", "out", "cache", "broadcast", "coverage"]);

/** Allowlist: so estas extensoes sao julgadas como texto. */
const TEXTO = new Set([
  ".mjs", ".js", ".cjs", ".ts", ".tsx", ".json", ".md", ".html", ".css", ".txt",
  ".yml", ".yaml", ".sh", ".sol", ".toml", ".xml", ".svg", ".csv",
]);
/** Arquivos de texto sem extensao nenhuma. */
const SEM_EXTENSAO = new Set([
  ".vercelignore", ".gitignore", ".gitattributes", ".gitmodules", ".gitbook.yaml",
  "LICENSE", "Makefile",
]);

/** Os unicos bytes de controle que texto usa: TAB, LF, CR. */
const PERMITIDOS = new Set([0x09, 0x0a, 0x0d]);
const nomeDoByte = (c) =>
  ({ 0x00: "NUL", 0x0b: "VT", 0x0c: "FORM FEED", 0x1a: "SUB", 0x1b: "ESC",
     0x7f: "DEL" }[c] || `0x${c.toString(16).padStart(2, "0")}`);

function* varrer(dir) {
  for (const nome of readdirSync(dir)) {
    if (PULAR.has(nome)) continue;
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) { yield* varrer(p); continue; }
    if (TEXTO.has(extname(nome).toLowerCase()) || SEM_EXTENSAO.has(nome)) yield p;
  }
}

const falhas = [];
const extensoesVistas = new Set();
let julgados = 0;

for (const arquivo of varrer(RAIZ)) {
  const rel = relative(RAIZ, arquivo).split(sep).join("/");
  /* Este arquivo cita os bytes pelo NOME, nunca pelo byte — de proposito, para
     nao precisar de excecao. Se um dia precisar, a excecao vem com a razao. */
  const b = readFileSync(arquivo);
  julgados += 1;
  extensoesVistas.add(extname(rel).toLowerCase());
  for (let i = 0; i < b.length; i++) {
    const c = b[i];
    if ((c < 0x20 && !PERMITIDOS.has(c)) || c === 0x7f) {
      const antes = b.subarray(Math.max(0, i - 40), i).toString("utf8");
      const depois = b.subarray(i + 1, i + 30).toString("utf8");
      const linha = b.subarray(0, i).toString("utf8").split("\n").length;
      falhas.push(`${rel}:${linha} · offset ${i} · ${nomeDoByte(c)}\n` +
        `      …${antes.replace(/\n/g, "\\n")}[AQUI]${depois.replace(/\n/g, "\\n")}…`);
      break; /* um por arquivo basta para mandar consertar */
    }
  }
}

/**
 * Anti-cegueira, e a primeira versao disto era fraca — a mutacao provou.
 *
 * Encolher a allowlist de extensao nao produz alarme: produz SILENCIO. Tirar
 * `.mjs`, `.js` e `.cjs` deixava o portao ver 284 dos 341 arquivos, nao ver o
 * NUL plantado num `.mjs`, e imprimir OK.
 *
 * Um PISO DE CONTAGEM nao pega isso, e eu tentei: com 284 restantes qualquer
 * piso razoavel passa. Numero total nao representa cobertura por TIPO — a
 * mesma classe do piso que nao serve para duas pernas, ja catalogada aqui.
 *
 * A invariante certa nao e "quantos", e "quais": as extensoes que dominam esta
 * arvore tem de estar sendo efetivamente julgadas. Se `.mjs` sumir da
 * allowlist, isto reprova mesmo que 284 arquivos continuem passando.
 */
const ESPINHA = [".mjs", ".js", ".json", ".md", ".html", ".yml"];
const ausentes = ESPINHA.filter((e) => !extensoesVistas.has(e));
if (ausentes.length) {
  falhas.push(`o portao nao julgou NENHUM arquivo ${ausentes.join(", ")} — ` +
    `estas extensoes existem nesta arvore e sao a espinha dela. Ou a allowlist ` +
    `parou de casar, ou o recorte de diretorios engoliu demais. Nos dois casos ` +
    `este portao fica verde sobre o que deixou de olhar.`);
}

console.log(`arquivos de texto julgados: ${julgados}`);

if (falhas.length) {
  console.error(`\nREPROVA · ${falhas.length} arquivo(s) com byte de controle:`);
  for (const f of falhas) console.error(`  - ${f}`);
  console.error("\n  Quase sempre a causa e uma ferramenta no caminho que comeu um");
  console.error("  escape e gravou o caractere. Nao se escreve o caractere que a");
  console.error("  ferramenta come: no PowerShell, here-string literal e @'...'@,");
  console.error("  nao @\"...\"@ — este ultimo interpola e trata a crase como escape.");
  process.exit(1);
}
console.log("OK · nenhum byte de controle fora de TAB, LF e CR.");
