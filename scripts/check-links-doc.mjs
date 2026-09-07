#!/usr/bin/env node
/**
 * PORTAO · a documentacao nao pode mandar ninguem a uma rota que nao existe.
 *
 * POR QUE ELE EXISTE
 * ------------------
 * Medido em 2026-09-07, no README do repositorio PUBLICO, na tabela chamada
 * "Don't trust: verify" — a tabela cuja funcao literal e mandar a pessoa
 * conferir:
 *
 *     | Interactive simulator | triviu.vercel.app/simulate |
 *
 * `/simulate` tinha sido aposentada horas antes. Responde 308 para `/simulate/`,
 * que responde 308 para `/`. Quem clicasse para verificar caia na home, sem
 * simulador e sem explicacao.
 *
 * Nada quebrou. Nenhum portao viu. E o defeito e o mesmo, pela terceira vez no
 * mesmo dia: DECLARACAO que envelhece sem derrubar coisa alguma — o comentario
 * do `.vercelignore` afirmando um sha256 que ja nao batia, o `sitemap.xml`
 * pedindo indexacao de onze rotas mortas, e agora o README anunciando uma
 * ferramenta que saiu do ar.
 *
 * O QUE ELE JULGA
 * ---------------
 * Toda URL `https://triviu.vercel.app/...` escrita em `.md` do repositorio.
 * Cada uma tem de cair num destes tres:
 *
 *   1. rota SERVIDA — existe HTML publicado que responde nela;
 *   2. rota REDIRECIONADA — `vercel.json` a declara, e o destino final tambem
 *      precisa ser servido (cadeia seguida ate o fim, com trava de ciclo);
 *   3. arquivo publicado — um `.png`, `.js`, `.xml` que existe em `site/` e que
 *      o `.vercelignore` nao retem.
 *
 * Redirecionamento CONTA como valido de proposito: a URL leva a pessoa a algum
 * lugar real. Mas ele sai na tela com o destino ao lado, porque um link de
 * documentacao que custa um salto e um link que ficou velho e ninguem trocou.
 *
 * O QUE ELE NAO JULGA, dito na cara
 * ---------------------------------
 * Link para fora de `triviu.vercel.app`. Conferir host de terceiro exige rede,
 * e portao que depende de rede confunde queda alheia com regressao propria —
 * ja custou uma investigacao inteira nesta casa. O `gitbook.io` do whitepaper
 * externo, por exemplo, nao passa por aqui.
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { lerConfig, rotaDoArquivo, retidos, naoPublica, casa } from "./csp-por-rota.mjs";

const RAIZ = join(import.meta.dirname, "..");
const SITE = join(RAIZ, "site");
const ORIGEM = "https://triviu.vercel.app";

const PULAR = new Set(["node_modules", ".git", ".next", "dist", "build", ".vercel",
                       "lib", "out", "cache", "broadcast"]);

const RETIDOS = retidos(RAIZ);
const cfg = lerConfig(RAIZ);

/* ── o que a borda serve ──────────────────────────────────────────────────── */
const rotasServidas = new Set();
const arquivosPublicados = new Set();
(function andar(d) {
  for (const nome of readdirSync(d)) {
    const p = join(d, nome);
    const rel = relative(SITE, p).split(sep).join("/");
    if (statSync(p).isDirectory()) { andar(p); continue; }
    if (naoPublica(RETIDOS, rel)) continue;
    arquivosPublicados.add("/" + rel);
    if (nome.endsWith(".html")) rotasServidas.add(rotaDoArquivo(rel));
  }
})(SITE);

const redirects = (cfg.redirects || []).map((r) => [r.source, r.destination]);

/**
 * A borda NORMALIZA antes de olhar a lista de `redirects`, e este portao errou
 * isso na primeira execucao. Com `trailingSlash: true`, `/simulate` vira
 * `/simulate/` — e so DEPOIS o redirecionamento `/simulate/ -> /` dispara.
 * Sem modelar a normalizacao, `/simulate` nao casava com regra nenhuma, caia no
 * catch-all e o portao acusava pelo motivo errado.
 *
 * A excecao e a regra do PONTO, ja medida nesta casa: nome cujo ultimo segmento
 * tem ponto a Vercel le como arquivo com extensao e NAO acrescenta barra.
 */
function normalizar(rota) {
  if (rota === "/" || rota.endsWith("/")) return rota;
  if (arquivosPublicados.has(rota)) return rota;      /* /favicon.ico e afins */
  const ultimo = rota.split("/").pop();
  return ultimo.includes(".") ? rota : rota + "/";
}

/** `$1` no destino recebe o que o `(.*)` do source capturou. */
function substituir(source, destino, rota) {
  if (!source.includes("(.*)")) return destino;
  const partes = source.split("(.*)").map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const m = rota.match(new RegExp("^" + partes.join("(.*)") + "$"));
  if (!m) return destino;
  return destino.replace(/\$(\d)/g, (_, n) => m[Number(n)] ?? "");
}

/** Segue a cadeia ate o fim. Trava de ciclo em 10 saltos. */
function resolver(bruta) {
  const saltos = [];
  let atual = normalizar(bruta);
  for (let i = 0; i < 10; i++) {
    if (rotasServidas.has(atual) || arquivosPublicados.has(atual)) {
      return { fim: atual, saltos, ok: true };
    }
    const achado = redirects.find(([s]) => casa(s, atual));
    if (!achado) return { fim: atual, saltos, ok: false };
    let destino = substituir(achado[0], achado[1], atual);
    /* O catch-all `/(.*)` -> `https://triviu.vercel.app/$1` canoniza o HOST, nao
       o caminho. Depois da substituicao ele devolve a mesma rota — seguir isso
       como salto produziria um ciclo que nao existe na borda. */
    if (destino.startsWith(ORIGEM)) destino = destino.slice(ORIGEM.length) || "/";
    if (destino === atual) return { fim: atual, saltos, ok: false };
    saltos.push(destino);
    atual = normalizar(destino);
  }
  return { fim: atual, saltos, ok: false, ciclo: true };
}

/* ── as URLs escritas na documentacao ─────────────────────────────────────── */
function* markdowns(dir) {
  for (const nome of readdirSync(dir)) {
    if (PULAR.has(nome)) continue;
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) yield* markdowns(p);
    else if (nome.toLowerCase().endsWith(".md")) yield p;
  }
}

const URL_RE = new RegExp(ORIGEM.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([^\\s)\\]\"'<>`]*)", "g");

const falhas = [];
const comSalto = [];
let conferidas = 0;

for (const arquivo of markdowns(RAIZ)) {
  const rel = relative(RAIZ, arquivo).split(sep).join("/");
  const texto = readFileSync(arquivo, "utf8");
  for (const m of texto.matchAll(URL_RE)) {
    let rota = m[1] || "/";
    rota = rota.split("#")[0].split("?")[0];
    if (rota === "") rota = "/";
    conferidas += 1;
    const r = resolver(rota);
    const linha = texto.slice(0, m.index).split("\n").length;
    if (!r.ok) {
      falhas.push(`${rel}:${linha} · ${ORIGEM}${rota}` +
        (r.ciclo ? "  (ciclo de redirecionamento)"
                 : r.saltos.length ? `  (redireciona para ${r.fim}, que tambem nao e servida)`
                 : "  (nao e rota servida, nem redirecionada, nem arquivo publicado)"));
    } else if (r.saltos.length) {
      comSalto.push(`${rel}:${linha} · ${rota} -> ${r.saltos.join(" -> ")}`);
    }
  }
}

/**
 * Quantas URLs do proprio dominio a documentacao tem de ter, no minimo.
 *
 * Nao e meta: e trava anti-cegueira, e ela entrou porque a MUTACAO a exigiu.
 * Trocar o recorte de `.md` por uma extensao inexistente fazia o portao achar
 * ZERO URLs e imprimir "OK" — verde sobre nada, que e a forma de defeito que
 * ele existe para vigiar, um nivel acima. Mesma classe que um meta-guardiao
 * pegou no repositorio irmao no mesmo dia.
 *
 * Suba quando acrescentar links permanentes. Baixar exige dizer aqui qual link
 * deixou de existir e por que.
 */
const MINIMO = 5;
if (conferidas < MINIMO) {
  falhas.push(`a documentacao tem ${conferidas} URL(s) de triviu.vercel.app e o minimo ` +
    `declarado e ${MINIMO}. Ou alguem apagou os links, ou o recorte de arquivos ` +
    `parou de achar os .md — e nenhuma das duas se resolve deixando este portao ` +
    `julgar o vazio.`);
}

console.log(`URLs de triviu.vercel.app na documentacao: ${conferidas}`);
console.log(`  rotas servidas hoje: ${rotasServidas.size}  ·  redirecionamentos: ${redirects.length}`);
if (comSalto.length) {
  console.log(`\n  ${comSalto.length} link(s) que funcionam por REDIRECIONAMENTO — chegam, mas com salto:`);
  for (const s of comSalto) console.log(`    ${s}`);
}

if (falhas.length) {
  console.error(`\nREPROVA · ${falhas.length} link(s) de documentacao que nao levam a lugar nenhum:`);
  for (const f of falhas) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("\nOK · toda URL do proprio dominio escrita na documentacao chega a algum lugar real.");
