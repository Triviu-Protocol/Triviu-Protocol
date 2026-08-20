#!/usr/bin/env node
/* PORTAO · o que sobe e o que o git conhece  ·  2026-08-19
 * ---------------------------------------------------------------------------
 * `vercel.json` declara `"outputDirectory": "site"`. Entao o que esta sob
 * `site/` E o site — nao o que foi commitado, nao o que passou no CI: o que
 * esta no DISCO naquele diretorio, no instante do `vercel --prod`.
 *
 * Durante meses conviveram ali cinco arquivos fora do git, e um deles —
 * `js/modelo-2.js`, 176 KB — abre carteira e assina. Ele reprovava em 91 pontos
 * das regras de assinatura, nao tinha allowlist declarada, nao conferia origem, e
 * escrevia em quase quarenta pontos com `innerHTML`. Nada disso impedia o
 * proximo deploy de publica-lo, porque nenhum passo entre "editar" e "publicar"
 * olhava para essa pasta.
 *
 * O trilho ate dizia "5 fora do git (subiriam num `vercel --prod`)". Dizer nao e
 * impedir. Esta casa ja aprendeu, mais de uma vez, que aviso sem consequencia
 * nao e guarda e que comando em transcricao nao e portao.
 *
 * ===========================================================================
 * A REGRA, e ela e uma so
 * ===========================================================================
 *
 *   Todo arquivo sob `site/` esta no git.
 *
 * Nao "todo arquivo relevante". Nao "todo `.js`". Todo. A regra e larga de
 * proposito: o defeito nao foi alguem publicar codigo perigoso de proposito —
 * foi um rascunho ficar num diretorio que por acaso era a raiz publicada. Regra
 * estreita erraria o proximo rascunho, que vai ter outro nome e outra extensao.
 *
 * O conserto do incidente que gerou este portao foi ESTRUTURAL, e a escolha
 * merece registro: havia a opcao de declarar os arquivos num `.vercelignore`, e
 * ela foi recusada. `.vercelignore` e uma promessa que esta arvore nao consegue
 * testar — so um deploy real diria se a Vercel a honrou, e deploy e do Leao. Ja
 * "o arquivo nao esta sob a raiz publicada" se verifica aqui, agora, sem rede e
 * sem confiar em ninguem. Os cinco foram MOVIDOS para `modelo/`, com o mesmo
 * layout relativo, hash a hash conferido — servir `modelo/` como raiz mantem os
 * caminhos absolutos funcionando para quem quiser abrir o modelo.
 *
 * O QUE ELE NAO PROVA: que o conteudo commitado e seguro. Isso e dos outros doze
 * portoes. Este aqui garante uma coisa so — que o que sobe passou por eles.
 */
import { readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { raizPublicada } from "./_arvore.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
/* A RAIZ SAI DO `vercel.json`, e nao daqui.
   Este portao fundava a propria regra em "vercel.json declara outputDirectory:
   site" e nunca lia o campo de volta. Trocar para "." fazia a raiz publicada
   virar o repositorio inteiro — `scripts/`, `contracts/`, `.githooks/` — com
   este guardiao seguindo em `site/` e dizendo OK. Afirmar sobre uma config sem
   le-la e a mesma familia de defeito que esta onda persegue. */
const { abs: SITE, dir: DIR_PUBLICADO, fonte: FONTE_DA_RAIZ } = raizPublicada(RAIZ);
const falhas = [];
const notas = [];

if (!existsSync(SITE)) {
  console.error("✗ arvore publicavel: `site/` nao existe — o portao nao consegue olhar, entao recusa.");
  process.exit(1);
}

/* Anda a raiz publicada inteira. Sem filtro por extensao: ver o cabecalho. */
const noDisco = [];
(function andar(d) {
  for (const nome of readdirSync(d)) {
    const p = join(d, nome);
    if (statSync(p).isDirectory()) andar(p);
    else noDisco.push(relative(RAIZ, p).split(sep).join("/"));
  }
})(SITE);

/* A FONTE DA VERDADE E O GIT, e quando ela nao existe o portao DIZ.
 *
 * O trilho roda este guardiao em duas arvores. No DISCO ha `.git` e a pergunta
 * faz sentido. No INDICE materializado (`git checkout-index` num diretorio
 * temporario) nao ha `.git` nenhum — e ali a resposta e trivialmente sim, porque
 * cada byte daquela arvore SAIU do indice. Declarar isso e diferente de aprovar
 * calado: quem le o relatorio precisa saber qual das duas coisas aconteceu. */
const ls = spawnSync("git", ["-C", RAIZ, "ls-files", DIR_PUBLICADO === "." ? "." : DIR_PUBLICADO], { encoding: "utf8" });
const temGit = !ls.error && ls.status === 0;

let conhecidos = null;
if (temGit) {
  conhecidos = new Set(ls.stdout.split("\n").map((l) => l.trim()).filter(Boolean));
  const forasteiros = noDisco.filter((p) => !conhecidos.has(p));
  for (const f of forasteiros)
    falhas.push(
      `${f} esta sob a raiz publicada e NAO esta no git. Um \`vercel --prod\` o publica sem que ` +
      "portao nenhum o tenha lido. Commite-o (e ai os outros portoes o julgam) ou tire-o de `site/`"
    );
} else {
  notas.push(
    "sem `.git` nesta arvore — ela foi materializada do indice, entao todo arquivo aqui veio do " +
    "indice por construcao. A regra vale trivialmente e NAO foi exercida: quem a exerce e a " +
    "passagem sobre o DISCO"
  );
}

console.log(`portao da arvore publicavel · raiz: ${DIR_PUBLICADO}  (${FONTE_DA_RAIZ})`);
console.log(`  arquivos sob a raiz ........... ${noDisco.length}`);
console.log(`  conhecidos pelo git ........... ${temGit ? conhecidos.size : "n/a — sem git aqui"}`);
console.log(`  fora do git ................... ${temGit ? noDisco.filter((p) => !conhecidos.has(p)).length : "NAO CONFERIDO"}`);
for (const n of notas) console.log(`  nota: ${n}`);
console.log("  NAO conferido ................. se o conteudo commitado e seguro — isso e dos outros portoes.");
console.log("                                  Este garante so que o que sobe passou por eles");

if (falhas.length) {
  console.error("\nARVORE PUBLICAVEL SUJA:");
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
/* O VISTO DIZ O QUE FOI CONFERIDO, e nao mais do que isso.
 *
 * A versao anterior imprimia "✓ tudo que sobe num deploy desta arvore esta no
 * git" NA MESMA execucao em que imprimia "fora do git ... NAO CONFERIDO" — o
 * relatorio se contradizia em quatro linhas de distancia. O Tubarao-branco pegou
 * em agua limpa e classificou LOW, e LOW aqui e generoso: um visto que afirma
 * mais do que mediu e a origem da familia de defeitos que esta onda inteira
 * perseguiu. */
if (temGit) {
  console.log("\n✓ tudo que sobe num deploy desta arvore esta no git, e portanto sob os outros portoes");
} else {
  console.log("\n· nada a objetar, e nada foi exercido: esta arvore nao tem git, entao a regra vale");
  console.log("  trivialmente. Quem a exerce e a passagem sobre o DISCO — procure o visto la");
}
