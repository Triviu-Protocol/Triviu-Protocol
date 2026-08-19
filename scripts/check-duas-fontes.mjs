#!/usr/bin/env node
/* PORTAO DO F-6 · o que CONFIRMA efeito sai de duas fontes  ·  2026-08-19
 * ---------------------------------------------------------------------------
 * Gate aberto pelo Tubarao-branco em 2026-08-12 — "uma RPC responde e ninguem
 * confere" — classificado MEDIUM em 2026-08-19.
 *
 * A pagina que assina oferece TRES endpoints num `<select>` e usava UM por
 * leitura. Para desenhar saldo, um basta: numero atrasado vira numero errado na
 * tela e a proxima leitura corrige. Para CONFIRMAR EFEITO nao basta — e a
 * diferenca esta escrita na propria pagina, na frase que ela imprime depois de
 * enviar:
 *
 *     "a receipt is not proof of effect"
 *
 * Ela estava certa e ficava pela metade: honesta quanto a NATUREZA da prova
 * (estado relido, nao recibo) e cega quanto a FONTE dela. Endpoint atrasado
 * responde estado velho e a pagina conclui que nada mudou; endpoint mentiroso
 * responde o que quiser. Nos dois casos o usuario fecha a tela acreditando.
 *
 * ===========================================================================
 * AS TRES REGRAS
 * ===========================================================================
 *
 * 1. EXISTE leitura de duas fontes. Sem `rpcDuplo` nao ha o que cobrar.
 * 2. ELA RECUSA quando as fontes divergem — nao escolhe lado. Nao ha desempate
 *    possivel entre duas respostas sobre o mesmo bloco; escolher uma seria
 *    inventar autoridade que a pagina nao tem.
 * 3. A CONFIRMACAO A USA. Ter a funcao e nao chama-la no caminho que confirma
 *    e a capability orfa que esta casa ja catalogou — poder no estacionamento.
 *
 * O QUE ELE NAO PROVA, dito para ninguem ler mais do que esta escrito: que os
 * dois endpoints sao independentes de verdade. Dois provedores atras do mesmo
 * upstream concordariam sempre, e este portao nao tem como saber. O que ele
 * garante e que a pagina PERGUNTA duas vezes e RECUSA na divergencia.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { codigoNormalizado } from "./_comentarios.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const JS = join(RAIZ, "site", "js");

/* Descobre quem confirma efeito, em vez de listar — a licao que o portao do F-4
   pagou com um commit acidental no mesmo dia. */
const CONFIRMADORES = readdirSync(JS)
  .filter((f) => f.endsWith(".js"))
  .filter((f) => /conferirEstadoNaChain/.test(codigoNormalizado(readFileSync(join(JS, f), "utf8"))));

const falhas = [];
let comDuplo = 0;

if (!CONFIRMADORES.length)
  falhas.push("nenhum arquivo com `conferirEstadoNaChain` — ou a confirmacao sumiu, ou este portao " +
              "esta procurando o nome errado. Falha fechada: portao que nao acha o alvo nao aprova");

for (const arq of CONFIRMADORES) {
  const src = codigoNormalizado(readFileSync(join(JS, arq), "utf8"));
  const linhaDe = (i) => src.slice(0, i).split("\n").length;

  /* 1 · existe */
  if (!/function\s+rpcDuplo\s*\(/.test(src)) {
    falhas.push(`${arq}: confirma efeito e nao tem leitura de duas fontes (rpcDuplo ausente)`);
    continue;
  }
  comDuplo++;

  /* 2 · recusa na divergencia, nao escolhe lado */
  const corpo = src.slice(src.indexOf("function rpcDuplo"), src.indexOf("function rpcDuplo") + 1400);
  if (!/\bthrow\b/.test(corpo))
    falhas.push(
      `${arq}: rpcDuplo nao LANCA quando as fontes divergem. Comparar e seguir e pior que nao comparar — ` +
      `da a aparencia de dupla fonte com o comportamento de fonte unica`
    );
  if (/\breturn\s+r\[0\]\s*;/.test(corpo) && !/\bthrow\b/.test(corpo))
    falhas.push(`${arq}: rpcDuplo escolhe a primeira resposta em caso de divergencia — nao ha desempate honesto`);

  /* 3 · a confirmacao usa */
  const iConf = src.indexOf("conferirEstadoNaChain");
  const janela = src.slice(iConf, iConf + 900);
  if (!/rpcDuplo|CONFIRMANDO\s*=\s*true/.test(janela))
    falhas.push(
      `${arq}:${linhaDe(iConf)} conferirEstadoNaChain nao aciona a leitura de duas fontes. ` +
      `Ter a funcao e nao chama-la no caminho que confirma e poder no estacionamento`
    );

  /* 3b · e a janela FECHA — flag que fica aberta faz leitura de tela pagar o
     custo e transforma atraso comum em erro */
  if (/CONFIRMANDO\s*=\s*true/.test(src)) {
    const abre = (src.match(/CONFIRMANDO\s*=\s*true/g) || []).length;
    const fecha = (src.match(/CONFIRMANDO\s*=\s*false/g) || []).length;
    if (fecha < abre + 1)
      falhas.push(
        `${arq}: a janela de confirmacao abre ${abre}x e fecha ${fecha}x. Ela precisa fechar no caminho ` +
        `de sucesso E no de erro, senao uma leitura de tela posterior vira erro por divergencia que e so atraso`
      );
  }
}

/* ------------------- 4 · a recusa e EXERCIDA, nao lida ---------------------
 *
 * A regra 2 acima procura a palavra `throw` numa janela de 1400 caracteres. O
 * Escorpiao derrubou isso em 2026-08-19 com uma edicao de doze caracteres:
 *
 *     if (false) throw new Error(...)
 *
 * A palavra continua la. A recusa nao. Um portao que conta palavras aprova uma
 * pagina que compara duas fontes, ve que discordam, e segue em frente — que e
 * exatamente o estado que este gate existe para impedir, agora com a aparencia
 * de dupla fonte por cima.
 *
 * Entao ele executa. `rpcDuplo` e extraida e rodada com dependencias de mentira
 * (`$`, `ENDPOINTS`, `rpcEm`, `rpc`, `hostDe`) em tres cenarios. O que se cobra
 * nao e a presenca de um `throw`: e que fontes discordantes NAO produzam
 * resultado.
 */
const CENARIOS_F6 = [
  { nome: "as duas fontes concordam", a: { r: "0x1" }, b: { r: "0x1" }, deveLancar: false },
  { nome: "as duas fontes DISCORDAM", a: { r: "0x1" }, b: { r: "0x2" }, deveLancar: true },
  { nome: "discordam so num campo aninhado", a: { r: { v: 1, n: 7 } }, b: { r: { v: 1, n: 8 } }, deveLancar: true },
];

function corpoDaFuncao(src, nome) {
  const i = src.indexOf("function " + nome + "(");
  if (i < 0) return null;
  let n = 0;
  const j = src.indexOf("{", i);
  if (j < 0) return null;
  for (let k = j; k < src.length; k++) {
    if (src[k] === "{") n += 1;
    else if (src[k] === "}") { n -= 1; if (n === 0) return src.slice(i, k + 1); }
  }
  return null;
}

let exercidos = 0;
for (const arq of CONFIRMADORES) {
  const src = codigoNormalizado(readFileSync(join(JS, arq), "utf8"));
  const corpo = corpoDaFuncao(src, "rpcDuplo");
  if (!corpo) continue;   /* a regra 1 acima ja reprovou a ausencia */

  let ok = true;
  for (const c of CENARIOS_F6) {
    const amb = {
      $: () => ({ value: "https://a.exemplo" }),
      ENDPOINTS: ["https://a.exemplo", "https://b.exemplo"],
      hostDe: (u) => u,
      rpc: () => Promise.resolve(c.a.r),
      rpcEm: (url) => Promise.resolve(url === "https://a.exemplo" ? c.a.r : c.b.r),
    };
    let lancou = false, erro = null;
    try {
      const criar = new Function("$", "ENDPOINTS", "hostDe", "rpc", "rpcEm",
        corpo + "; return rpcDuplo;");
      await criar(amb.$, amb.ENDPOINTS, amb.hostDe, amb.rpc, amb.rpcEm)("eth_call", []);
    } catch (e) { lancou = true; erro = e; }

    if (lancou && erro && erro.name !== "Error") {
      falhas.push(`${arq}: rpcDuplo lancou ${erro.name} no cenario "${c.nome}" (${erro.message}). ` +
                  "Isso nao e recusa, e a regra quebrada");
      ok = false; break;
    }
    if (lancou !== c.deveLancar) {
      falhas.push(
        `${arq}: cenario "${c.nome}" — esperado ${c.deveLancar ? "RECUSA" : "resultado"}, ` +
        `obtido ${lancou ? "recusa" : "resultado"}. ` +
        (c.deveLancar
          ? "Duas fontes discordando produziram um valor: a pagina escolheu um lado, e nao ha desempate honesto entre elas."
          : "Duas fontes concordando foram recusadas: o gate travaria a confirmacao legitima.")
      );
      ok = false;
    }
  }
  if (ok) exercidos += 1;
}

console.log(`portao do F-6 · duas fontes onde se confirma efeito`);
console.log(`  arquivos que confirmam ........ ${CONFIRMADORES.length}  (${CONFIRMADORES.join(", ") || "nenhum"})`);
console.log(`  com leitura de duas fontes .... ${comDuplo}`);
console.log(`  EXERCIDOS em ${CENARIOS_F6.length} cenarios .... ${exercidos} de ${CONFIRMADORES.length}`);
console.log(`  NAO conferido ................. se os dois endpoints sao mesmo independentes — dois provedores`);
console.log(`                                  atras do mesmo upstream concordariam sempre, e isso nao se le no codigo`);

if (falhas.length) {
  console.error("\nF-6 ABERTO:");
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log("\n✓ a confirmacao de efeito pergunta a duas fontes e recusa quando elas divergem");
