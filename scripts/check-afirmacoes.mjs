#!/usr/bin/env node
/**
 * PORTAO · toda afirmacao de hash escrita em documentacao tem de ser conferivel.
 *
 * POR QUE ELE EXISTE
 * ------------------
 * O `.vercelignore` afirmava, em comentario, que `/console/` servia o modelo
 * "byte a byte (sha256 771b657cef0907b8)". Era verdade quando foi escrito. Uma
 * hora depois o fundador pediu miniatura no link, o bloco de cabeca entrou nos
 * modelos servidos, e a linha passou a mentir — 200.249 b, sha256 c24eb17b.
 * Ninguem soube por um dia inteiro, porque comentario nao roda.
 *
 * Consertar a linha fecha a instancia. O que fecha a CLASSE e este portao: uma
 * afirmacao de hash so vale se alguma coisa a confere toda vez.
 *
 * A FORMA
 * -------
 *     @afirma <caminho-relativo-a-raiz>  sha256=<hex, 8..64>  [bytes=<n>]
 *     @afirma git:<sha1-do-blob>         sha256=<hex, 8..64>  [bytes=<n>]
 *
 * O prefixo `git:` serve para o que NAO esta mais na arvore: o console anterior
 * foi sobrescrito, e o endereco permanente dele e o blob no historico. Backup
 * que vive em diretorio temporario nao e backup — este atravessa qualquer clone.
 *
 * O QUE ELE REPROVA
 * -----------------
 *   1. arquivo (ou blob) que a afirmacao cita e nao existe
 *   2. sha256 que nao bate com o conteudo real
 *   3. `bytes=` que nao bate com o tamanho real
 *   4. hash com menos de 8 digitos — prefixo curto demais colide e nao afirma nada
 *   5. o repositorio inteiro sem NENHUMA afirmacao (ver MINIMO, abaixo)
 *
 * A 5 e contra a mutacao que CEGA o detector. Sem ela, apagar as linhas
 * `@afirma` deixa o portao verde sobre zero afirmacoes — que e exatamente a
 * forma de defeito que ele existe para impedir, so que um nivel acima.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const RAIZ = join(import.meta.dirname, "..");

/* Diretorios que nao se varre: nao sao fonte desta casa, e `site/` entra sim —
   e la que vivem os modelos, e uma afirmacao pode acabar dentro de um HTML. */
const PULAR = new Set(["node_modules", ".git", ".next", "dist", "build", ".vercel"]);

/* Extensoes que podem CARREGAR afirmacao. Ler .png atras de texto e desperdicio,
   e ler binario grande com regex de texto ja travou varredura nesta casa. */
const TEXTO = /\.(mjs|js|cjs|ts|json|md|html|css|txt|yml|yaml|sh|py|vercelignore|gitignore|gitattributes)$/i;
const SEM_EXTENSAO = /^(\.vercelignore|\.gitignore|\.gitattributes|Makefile)$/;

/**
 * Quantas afirmacoes o repositorio tem de ter, no minimo.
 *
 * Nao e meta: e trava anti-cegueira. Se alguem apagar as linhas `@afirma` — de
 * proposito ou num rebase infeliz — o portao passa a julgar o vazio e fica
 * verde. Com o minimo, apagar reprova.
 *
 * Suba este numero quando acrescentar afirmacoes permanentes. Baixa-lo exige
 * dizer aqui, por escrito, qual afirmacao deixou de existir e por que.
 */
const MINIMO = 9;

function* varrer(dir) {
  for (const nome of readdirSync(dir)) {
    if (PULAR.has(nome)) continue;
    const p = join(dir, nome);
    const st = statSync(p);
    if (st.isDirectory()) yield* varrer(p);
    else if (TEXTO.test(nome) || SEM_EXTENSAO.test(nome)) yield p;
  }
}

/* `@afirma <alvo> sha256=<hex> [bytes=<n>]`. O `bytes` e opcional porque nem
   toda afirmacao util traz tamanho; quando traz, e conferido. */
const LINHA = /@afirma\s+(\S+)\s+sha256=([0-9a-fA-F]+)(?:\s+bytes=(\d+))?/g;

const falhas = [];
const afirmacoes = [];

for (const arquivo of varrer(RAIZ)) {
  let texto;
  try {
    texto = readFileSync(arquivo, "utf8");
  } catch {
    continue; /* ilegivel e problema de outro portao */
  }
  if (!texto.includes("@afirma")) continue;
  const rel = relative(RAIZ, arquivo).split(sep).join("/");
  /* O proprio portao cita a forma na documentacao. Citar nao e afirmar. */
  if (rel === "scripts/check-afirmacoes.mjs") continue;
  for (const m of texto.matchAll(LINHA)) {
    afirmacoes.push({ onde: rel, alvo: m[1], hash: m[2].toLowerCase(), bytes: m[3] });
  }
}

for (const a of afirmacoes) {
  const etiqueta = `${a.onde} -> ${a.alvo}`;

  if (a.hash.length < 8) {
    falhas.push(`${etiqueta}: sha256 com ${a.hash.length} digitos; o minimo e 8 ` +
      `(prefixo curto colide e nao afirma nada)`);
    continue;
  }

  let conteudo;
  if (a.alvo.startsWith("git:")) {
    const blob = a.alvo.slice(4);
    try {
      conteudo = execFileSync("git", ["cat-file", "blob", blob],
        { cwd: RAIZ, maxBuffer: 256 * 1024 * 1024 });
    } catch {
      /* DUAS causas produzem o mesmo erro, e confundi-las e pior do que nao
         checar: "o backup sumiu" e alarme de incendio; "esta arvore nao tem o
         historico" e um detalhe de ambiente.

         Medido em 2026-09-07 na primeira execucao deste portao no CI:
         `actions/checkout@v4` clona com `fetch-depth: 1`, entao NENHUM blob
         antigo esta ali. O portao reprovou dizendo que o backup nao existia
         mais. O backup existia; quem nao existia era o historico.

         Ele continua REPROVANDO — portao que se cala quando nao pode medir
         passa por engano, e essa e falha catalogada nesta casa. O que muda e
         que a mensagem diz a verdade e traz o comando que resolve. */
      let raso = false;
      try {
        raso = execFileSync("git", ["rev-parse", "--is-shallow-repository"],
          { cwd: RAIZ, encoding: "utf8" }).trim() === "true";
      } catch { /* sem git: cai na mensagem generica */ }
      falhas.push(raso
        ? `${etiqueta}: blob nao alcancavel porque esta arvore e um CLONE RASO. ` +
          `Isto NAO diz que o backup sumiu — diz que o historico nao veio junto. ` +
          `Resolve com \`git fetch --unshallow\`, ou no CI com ` +
          `\`actions/checkout@v4\` + \`fetch-depth: 0\`.`
        : `${etiqueta}: blob ausente do historico numa arvore COMPLETA ` +
          `(o backup que esta afirmacao promete NAO existe mais)`);
      continue;
    }
  } else {
    try {
      conteudo = readFileSync(join(RAIZ, a.alvo));
    } catch {
      falhas.push(`${etiqueta}: arquivo nao existe`);
      continue;
    }
  }

  const real = createHash("sha256").update(conteudo).digest("hex");
  if (!real.startsWith(a.hash)) {
    falhas.push(`${etiqueta}: afirma sha256 ${a.hash}, e ` +
      `${real.slice(0, Math.max(16, a.hash.length))}`);
  }
  if (a.bytes !== undefined && Number(a.bytes) !== conteudo.length) {
    falhas.push(`${etiqueta}: afirma ${Number(a.bytes).toLocaleString("pt-BR")} b, ` +
      `e ${conteudo.length.toLocaleString("pt-BR")} b`);
  }
}

if (afirmacoes.length < MINIMO) {
  falhas.push(`o repositorio tem ${afirmacoes.length} afirmacao(oes) e o minimo ` +
    `declarado e ${MINIMO}. Ou alguem apagou linhas @afirma, ou o minimo ficou ` +
    `velho — e nenhuma das duas se resolve deixando este portao julgar o vazio.`);
}

console.log(`afirmacoes conferidas: ${afirmacoes.length}`);
for (const a of afirmacoes) {
  console.log(`  ${a.hash.slice(0, 16)}  ${a.alvo}${a.bytes ? `  ${Number(a.bytes).toLocaleString("pt-BR")} b` : ""}`);
}

if (falhas.length) {
  console.error(`\nREPROVA · ${falhas.length} afirmacao(oes) que nao se sustentam:`);
  for (const f of falhas) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("\nOK · toda afirmacao de hash bate com o byte.");
