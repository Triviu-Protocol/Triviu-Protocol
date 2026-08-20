#!/usr/bin/env node
/* PORTAO DO F-2 · uma origem, e uma so  ·  2026-08-19
 * ---------------------------------------------------------------------------
 * Gate aberto pelo Tubarao-branco em 2026-08-12. A pagina ja conferia a origem
 * — `conferirOrigem()` existia, lia `/domain.config.json` e recusava host de
 * fora. O furo nao estava na checagem: estava na CARDINALIDADE.
 *
 *     hosts.indexOf(host) >= 0   ->   ok = true
 *     "served from " + host + ", the single host in /domain.config.json."
 *
 * A frase dizia "the single host". O codigo aceitava QUALQUER host da lista. E
 * a lista crescia sozinha: `set-domain.mjs --apply` fazia
 * `cfg.knownHosts = [...knownHosts, domain]`. Uma execucao do script de dominio
 * — operacao rotineira, sem cheiro de seguranca — legitimava duas origens para a
 * tela que pede assinatura, calada, ainda imprimindo a palavra "single".
 *
 * Duas origens servindo a mesma pagina de assinatura ensinam o usuario que dois
 * hostnames sao legitimos, e ai a unica defesa que ele tem contra uma copia
 * hospedada noutro lugar — reconhecer a origem — deixa de existir. Tolerável em
 * pagina de leitura; nao numa que assina.
 *
 * ===========================================================================
 * AS TRES REGRAS
 * ===========================================================================
 *
 * 1. O CONFIG DECLARA UMA. `knownHosts` tem tamanho 1 e o unico item e `domain`.
 *    Config e o que a arvore serve, nao um historico de hosts.
 * 2. A PAGINA COBRA A CARDINALIDADE. Quem assina recusa lista != 1 em vez de
 *    procurar o proprio host dentro dela. Comparar contra `hosts[0]`.
 * 3. O SCRIPT NAO FAZ CRESCER. `set-domain.mjs` substitui. Portao que so olha o
 *    estado de hoje nao impede a proxima execucao de reabrir o furo.
 *
 * O QUE ELE NAO PROVA: que o hostname antigo devolve 308 para o canonico. Isso
 * e configuracao de hospedagem, vive fora do repositorio, e afirmar aqui que
 * esta feito seria a mesma frase sem lastro que abriu este gate. Medido a mao em
 * 2026-08-19: `triviu-protocol.vercel.app/console/` -> 308
 * `https://triviu.vercel.app/console/`. Data e metodo ditos para que a proxima
 * pessoa saiba o que re-medir, nao para valer como garantia permanente.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { codigoNormalizado } from "./_comentarios.mjs";
import { executaveis, raizPublicada } from "./_arvore.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = raizPublicada(RAIZ).abs;
const JS = join(RAIZ, "site", "js");
const CONFIG = join(RAIZ, "site", "domain.config.json");
const falhas = [];

/* ------------------------------------------------ 1 · o config declara uma */

let cfg = null;
if (!existsSync(CONFIG)) {
  falhas.push("site/domain.config.json nao existe — a origem canonica nao esta declarada em lugar nenhum, " +
              "e portao que nao acha o alvo recusa");
} else {
  try { cfg = JSON.parse(readFileSync(CONFIG, "utf8")); }
  catch (e) { falhas.push(`site/domain.config.json nao e JSON valido (${e.message})`); }
}

if (cfg) {
  const hosts = Array.isArray(cfg.knownHosts) ? cfg.knownHosts : null;
  if (!hosts) falhas.push("domain.config.json nao tem `knownHosts` como lista");
  else if (hosts.length !== 1)
    falhas.push(
      `domain.config.json declara ${hosts.length} hosts [${hosts.join(", ")}]. A pagina que assina tem ` +
      "UMA origem. Se um deles e legado, ele nao pertence a esta lista: pertence a um 308 para o canonico"
    );
  else if (hosts[0] !== cfg.domain)
    falhas.push(`o unico knownHost e "${hosts[0]}" e o domain declarado e "${cfg.domain}" — divergem`);
}

/* ------------------------------- 2 · quem assina cobra a cardinalidade --- */

/* A descoberta vem de `_arvore.mjs`. Este portao tinha recorte proprio por
   extensao (`endsWith(".js")`), e o Tubarao-branco atravessou os oito recortes
   desta casa com os mesmos bytes renomeados para `.mjs`. Uma pergunta, um lugar
   que responde. */
const ASSINAM = executaveis(RAIZ)
  .filter((rel) => /eth_sendTransaction/.test(codigoNormalizado(readFileSync(join(SITE, rel), "utf8"))));

if (!ASSINAM.length)
  falhas.push("nenhum arquivo que assina foi encontrado — ou a superficie sumiu, ou este portao procura " +
              "o nome errado. Falha fechada");

let comCardinalidade = 0;
for (const arq of ASSINAM) {
  const src = codigoNormalizado(readFileSync(join(SITE, arq), "utf8"));
  if (!/knownHosts/.test(src)) {
    falhas.push(`${arq}: assina e nao le knownHosts — nao confere de que origem esta sendo servido`);
    continue;
  }
  /* A regra e sobre a FORMA da checagem, nao sobre a existencia dela: procurar o
     proprio host dentro de uma lista aceita uma lista de qualquer tamanho. */
  if (/\bhosts\s*\.\s*indexOf\s*\(\s*host\s*\)\s*>=\s*0/.test(src) ||
      /\bhosts\s*\.\s*includes\s*\(\s*host\s*\)/.test(src))
    falhas.push(
      `${arq}: procura o proprio host DENTRO da lista (indexOf/includes). Isso aceita lista de qualquer ` +
      "tamanho, e foi assim que a frase \"the single host\" conviveu com duas origens legitimas"
    );
  if (!/hosts\s*\.\s*length\s*!==\s*1/.test(src))
    falhas.push(
      `${arq}: nao recusa quando knownHosts tem tamanho diferente de 1. Cobrar a cardinalidade na pagina ` +
      "e o que impede um config crescido de virar assinatura em origem nova"
    );
  else if (!/hosts\s*\[\s*0\s*\]\s*===\s*host/.test(src))
    falhas.push(`${arq}: confere o tamanho e nao compara contra hosts[0] — metade da regra`);
  else comCardinalidade++;
}

/* --------------------- 2b · a regra e EXERCIDA, nao lida --------------------
 *
 * As tres linhas acima olham a FORMA da checagem, e forma se imita. O Escorpiao
 * provou em 2026-08-19, com um ataque de cinco linhas que este portao aprovou:
 *
 *     if (hosts.length !== 1 && false) { ... }        <- casa a regex, nao roda
 *     else if (permitido || hosts[0] === host) { ok } <- aceita qualquer host
 *
 * Todo o texto que o portao procurava estava la. O efeito nao estava. E o
 * impacto foi medido, nao estimado: servida de `copia-do-atacante.vercel.app`
 * com dois hosts na lista, a pagina LIGAVA a assinatura e imprimia "the single
 * host".
 *
 * Contra isso so existe uma defesa, e ela ja estava provada nesta casa: o portao
 * da regra 6 nao caiu no mesmo ataque porque EXECUTA. Entao esta parte extrai
 * `conferirOrigem`, roda com `window` e `fetch` de mentira, e cobra o veredito
 * em tres cenarios. Forma imita-se; comportamento sob execucao, nao.
 */
const CENARIOS = [
  { nome: "um host, e e o nosso", hosts: ["a.exemplo"], host: "a.exemplo", esperado: true },
  { nome: "um host, e NAO e o nosso", hosts: ["a.exemplo"], host: "copia.exemplo", esperado: false },
  { nome: "dois hosts, servida pelo segundo", hosts: ["a.exemplo", "copia.exemplo"], host: "copia.exemplo", esperado: false },
  { nome: "dois hosts, servida pelo primeiro", hosts: ["a.exemplo", "copia.exemplo"], host: "a.exemplo", esperado: false },
  { nome: "lista vazia", hosts: [], host: "a.exemplo", esperado: false },
];

function corpoDaFuncao(src, nome) {
  const i = src.indexOf("function " + nome + "(");
  if (i < 0) return null;
  let n = 0, j = src.indexOf("{", i);
  if (j < 0) return null;
  for (let k = j; k < src.length; k++) {
    if (src[k] === "{") n += 1;
    else if (src[k] === "}") { n -= 1; if (n === 0) return src.slice(i, k + 1); }
  }
  return null;
}

let exercidos = 0;
for (const arq of ASSINAM) {
  const src = codigoNormalizado(readFileSync(join(SITE, arq), "utf8"));
  const corpo = corpoDaFuncao(src, "conferirOrigem");
  if (!corpo) {
    falhas.push(`${arq}: nao achei conferirOrigem() para EXECUTAR. Portao que nao consegue exercer a regra ` +
                "nao aprova por ter lido o texto dela");
    continue;
  }
  let erroDoArquivo = false;
  for (const c of CENARIOS) {
    const ORIGEM = { ok: false, motivo: "", host: null };
    const janela = { location: { host: c.host, protocol: "https:" } };
    const buscar = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ knownHosts: c.hosts }) });
    let obtido;
    try {
      const criar = new Function("ORIGEM", "window", "fetch", corpo + "; return conferirOrigem;");
      obtido = await criar(ORIGEM, janela, buscar)();
    } catch (e) {
      falhas.push(`${arq}: conferirOrigem lancou ${e.name} no cenario "${c.nome}" (${e.message}). ` +
                  "Isso nao e recusa, e a regra quebrada");
      erroDoArquivo = true;
      break;
    }
    if (!!obtido.ok !== c.esperado) {
      falhas.push(
        `${arq}: cenario "${c.nome}" — hosts=[${c.hosts.join(", ")}] servida de ${c.host} · ` +
        `esperado assinatura ${c.esperado ? "LIGADA" : "desligada"}, obtido ${obtido.ok ? "LIGADA" : "desligada"}. ` +
        (obtido.ok ? "Uma copia hospedada noutro lugar assinaria." : "A origem legitima nao assinaria.")
      );
      erroDoArquivo = true;
    }
  }
  if (!erroDoArquivo) exercidos += 1;
}

/* ---------------------------------- 3 · o script de dominio nao faz crescer */

const SD = join(RAIZ, "scripts", "set-domain.mjs");
if (!existsSync(SD)) {
  falhas.push("scripts/set-domain.mjs nao existe — o portao nao consegue olhar quem escreve o config");
} else {
  const sd = codigoNormalizado(readFileSync(SD, "utf8"));
  if (/cfg\s*\.\s*knownHosts\s*=\s*\[\s*\.\.\.\s*knownHosts/.test(sd) || /knownHosts\s*\.\s*push\s*\(/.test(sd))
    falhas.push(
      "set-domain.mjs ACRESCENTA a knownHosts. Uma execucao de rotina passa a lista para 2 e legitima " +
      "uma segunda origem na pagina que assina. Ele tem de SUBSTITUIR: apos a reescrita, o que a arvore " +
      "serve e um host so"
    );
  if (!/cfg\s*\.\s*knownHosts\s*=\s*\[\s*domain\s*\]/.test(sd))
    falhas.push("set-domain.mjs nao grava `cfg.knownHosts = [domain]` — sem isso o config nao converge para um");
}

/* ------------------------------------------------------------- relatorio */

console.log("portao do F-2 · uma origem, e uma so");
console.log(`  knownHosts declarados ......... ${cfg && Array.isArray(cfg.knownHosts) ? cfg.knownHosts.length : "?"}  (${cfg && cfg.domain ? cfg.domain : "?"})`);
console.log(`  paginas que assinam ........... ${ASSINAM.length}  (${ASSINAM.join(", ") || "nenhuma"})`);
console.log(`  cobram a cardinalidade ........ ${comCardinalidade} de ${ASSINAM.length}`);
console.log(`  EXERCIDOS em ${CENARIOS.length} cenarios .... ${exercidos} de ${ASSINAM.length}`);
console.log("  NAO conferido ................. se o hostname antigo devolve 308 para o canonico — isso e");
console.log("                                  hospedagem, vive fora deste repositorio e se re-mede a mao");

if (falhas.length) {
  console.error("\nF-2 ABERTO:");
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log("\n✓ uma origem no config, cobrada por quem assina, e o script de dominio nao a faz crescer");
