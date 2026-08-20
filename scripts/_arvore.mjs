/* A ÁRVORE PUBLICADA · uma resposta só para "o que roda aqui"  ·  2026-08-19
 * ---------------------------------------------------------------------------
 * Este módulo existe porque a mesma pergunta era respondida em OITO lugares, e
 * cada um respondia com um recorte próprio. O Tubarão-branco, na terceira
 * passagem em água limpa, atravessou os oito com uma letra:
 *
 *     site/js/carteira.mjs   +   <script type="module" src="/js/carteira.mjs">
 *     -> OK 15 de 15
 *
 *     os MESMOS bytes, mesma pasta, renomeados para .js
 *     -> RECUSA em 5 portões
 *
 * `endsWith(".js")` aparecia em `check-alcance-dom`, `check-assinatura` (duas
 * vezes), `check-csp`, `check-duas-fontes`, `check-origem-unica`,
 * `check-provedor-unico` e `check-sem-estilo-inline`. Nenhum estava errado
 * sozinho; juntos formavam um contorno com um buraco do tamanho de `.mjs`.
 *
 * Foi a SEXTA vez nesta onda que descoberta por recorte perdeu para quem
 * escreveu fora do recorte — depois do literal `eth_sendTransaction`, do literal
 * `window.ethereum`, da lista de agentes humanos, do `<script src>` sem
 * `import()`, e do diretório `site/js/`. A onda escreveu no próprio código
 * "cobrir TUDO e deixar a omissão reprovar", cobriu todo diretório, e continuou
 * não cobrindo toda extensão.
 *
 * ===========================================================================
 * O QUE ESTE MÓDULO RESPONDE
 * ===========================================================================
 *
 * `raizPublicada()`  — lida do `vercel.json`, não cravada. O guardião da árvore
 *                      publicada fundava a própria regra em "vercel.json declara
 *                      outputDirectory: site" e nunca lia o campo de volta;
 *                      trocá-lo para "." deixava a raiz virar o repositório
 *                      inteiro com os portões seguindo em `site/`.
 *
 * `paginas()`        — todo `.html` sob a raiz.
 *
 * `executaveis()`    — UNIÃO de duas perguntas, e a união é o ponto:
 *                      (a) todo arquivo sob a raiz com extensão de script
 *                          (`.js`, `.mjs`, `.cjs`) — pega o que nenhuma página
 *                          carrega hoje mas `import()` alcança amanhã;
 *                      (b) todo caminho que uma página referencia em
 *                          `<script src>`, QUALQUER que seja a extensão — pega
 *                          o que a lista de extensões não previu.
 *
 *                      (a) sozinha erra o exótico referenciado; (b) sozinha erra
 *                      o órfão alcançável. Juntas, um arquivo só escapa se não
 *                      tiver extensão de script E nenhuma página o citar — e aí
 *                      ele não é alcançável por `<script>` nem por `import()`
 *                      relativo a partir de um arquivo que já esteja coberto.
 *
 * O QUE ELE NÃO RESOLVE, dito para ninguém ler garantia onde não há: um arquivo
 * sem extensão de script, não citado por página nenhuma, alcançado por
 * `import()` com string montada em tempo de execução, continua invisível. Contra
 * isso a defesa não é descoberta — é a classe `sem-carteira` ter de provar que
 * não alcança, e isso vive no `check-assinatura`.
 */
import { readdirSync, statSync, existsSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

/* Extensões que o navegador executa como script. Fechada de propósito e curta:
   a rede de segurança para o que ela não prevê é a união com o que as páginas
   referenciam, logo abaixo. */
const EXT_SCRIPT = [".js", ".mjs", ".cjs"];

export function raizPublicada(RAIZ) {
  const cfg = join(RAIZ, "vercel.json");
  let dir = "site";
  let fonte = "padrao deste repositorio (vercel.json ausente ou sem outputDirectory)";
  if (existsSync(cfg)) {
    try {
      const j = JSON.parse(readFileSync(cfg, "utf8"));
      if (typeof j.outputDirectory === "string" && j.outputDirectory.trim()) {
        dir = j.outputDirectory.trim();
        fonte = "vercel.json -> outputDirectory";
      }
    } catch { /* JSON quebrado e materia de outro portao; aqui cai no padrao */ }
  }
  const abs = join(RAIZ, dir === "." ? "" : dir);
  return { dir, abs, fonte };
}

function andar(dir, acc, RAIZ, ignorar) {
  for (const nome of readdirSync(dir)) {
    if (ignorar.has(nome)) continue;
    const abs = join(dir, nome);
    if (statSync(abs).isDirectory()) andar(abs, acc, RAIZ, ignorar);
    else acc.push(relative(RAIZ, abs).split(sep).join("/"));
  }
}

/* SÓ `.git`, e só porque varrê-lo não significa nada.
 *
 * Aqui morava a OITAVA instância da classe desta onda, e ela foi escrita no
 * mesmo commit que fechou a sexta e a sétima. O conjunto era
 * `[".git","node_modules",".vercel","out","dist",".next"]`, criado para impedir
 * que `outputDirectory: "."` varresse a pasta do git — preocupação legítima, de
 * RAIZ — e aplicado RECURSIVAMENTE, em toda profundidade.
 *
 * O Tubarão-branco mediu a consequência, e ela é total:
 *
 *     site/.next/wallet.js         -> 0 portões recusam
 *     site/out/wallet.js           -> 0
 *     site/dist/wallet.js          -> 0
 *     site/node_modules/wallet.js  -> 0
 *     site/nx/wallet.js            -> 5      <- a única variável é o NOME
 *
 * A Vercel publica `site/` inteiro. Uma pasta chamada `dist` lá dentro é
 * servida como qualquer outra, e ficava fora de toda descoberta — do rol
 * fechado, do alcance de DOM, da origem única, do provedor único.
 *
 * `node_modules` sob a raiz publicada NÃO é exceção: é achado. Se ele está lá,
 * está sendo servido, e o portão tem de dizer isso. O único nome que sobra é
 * `.git`, porque varrer objetos do git não responde nenhuma pergunta e custa
 * tempo — e o git nunca é servido. */
const NUNCA = new Set([".git"]);

export function tudoSobAraiz(RAIZ) {
  const { abs } = raizPublicada(RAIZ);
  if (!existsSync(abs)) return [];
  const acc = [];
  andar(abs, acc, abs, NUNCA);
  return acc;
}

export function paginas(RAIZ) {
  return tudoSobAraiz(RAIZ).filter((p) => p.endsWith(".html"));
}

/* rel do script -> páginas que o carregam. Casa QUALQUER caminho e QUALQUER
   extensão: o recorte `"/(js\/[^"]+\.js)"` já foi atravessado duas vezes. */
export function carregadosPorPagina(RAIZ) {
  const { abs } = raizPublicada(RAIZ);
  const mapa = new Map();
  for (const pag of paginas(RAIZ)) {
    const html = readFileSync(join(abs, pag), "utf8");
    for (const m of html.matchAll(/<script\b[^>]*\bsrc\s*=\s*(["'])([^"']+)\1/gi)) {
      const bruto = m[2].split("?")[0].split("#")[0];
      if (/^[a-z]+:/i.test(bruto) || bruto.startsWith("//")) continue;   /* externo: materia do check-csp */
      let rel;
      if (bruto.startsWith("/")) rel = bruto.slice(1);
      else {
        const dirDaPagina = pag.includes("/") ? pag.slice(0, pag.lastIndexOf("/")) : "";
        rel = join(dirDaPagina, bruto).split(sep).join("/");
      }
      if (!mapa.has(rel)) mapa.set(rel, []);
      mapa.get(rel).push(pag);
    }
  }
  return mapa;
}

export function executaveis(RAIZ) {
  const porExtensao = tudoSobAraiz(RAIZ).filter((p) => EXT_SCRIPT.some((e) => p.endsWith(e)));
  const porReferencia = [...carregadosPorPagina(RAIZ).keys()];
  return [...new Set([...porExtensao, ...porReferencia])].sort();
}

export { EXT_SCRIPT };
