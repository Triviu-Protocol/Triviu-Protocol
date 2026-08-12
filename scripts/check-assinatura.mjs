#!/usr/bin/env node
/**
 * Guardiao da ASSINATURA: as regras que so passaram a existir quando o console
 * ganhou o direito de enviar uma transacao real (2026-08-12).
 *
 * As outras checagens do console conferem o que a tela DIZ contra o que os
 * contratos TEM. Esta confere o que o codigo FAZ no caminho que abre a carteira,
 * e ela existe porque as quatro coisas abaixo sao invisiveis numa revisao de
 * diff: todas parecem certas linha a linha e so estao erradas quando somadas.
 *
 *   1. METODO DE CARTEIRA FORA DA ALLOWLIST DE QUATRO.
 *      A lista cresceu em exatamente um. Um quinto metodo, ou qualquer forma de
 *      assinatura de mensagem, reprova aqui.
 *
 *   2. ffffffff… NA CONSTRUCAO DE UM approve.
 *      Aprovacao ilimitada e permissao permanente de esvaziar um token. O check e
 *      sobre os BYTES, nao sobre a palavra "unlimited": uma palavra de 32 bytes
 *      toda de uns na construcao reprova.
 *
 *   3. innerHTML RECEBENDO QUALQUER COISA QUE NAO SEJA LITERAL.
 *      Numa pagina que mostra o que voce vai assinar, HTML injetado reescreve a
 *      propria frase que o usuario esta conferindo. A regra aqui e mais dura que
 *      "nao injete dado do usuario": innerHTML so pode receber "" (limpar). O
 *      resto e textContent. Regra que depende de julgar se a string e confiavel
 *      sera julgada errado um dia; esta nao pede julgamento nenhum.
 *
 *   4. CALLDATA REMONTADA DENTRO DE UM HANDLER DE CLIQUE.
 *      A espinha. Se a tela desenha de um objeto e o clique monta outro, o
 *      usuario assina bytes que nunca leu — e nada na tela chega a mentir, o que
 *      torna o defeito invisivel justamente para quem esta conferindo. Entao a
 *      construcao (sig/pal/palNum) e proibida dentro de handler de clique e
 *      dentro de enviar(), e o envio e OBRIGADO a reconferir o hash e a chain.
 *
 * O QUE ESTE GUARDIAO NAO E
 * =========================
 * Ele e textual e estrutural, nao um analisador de fluxo de dados. Ele le o corpo
 * literal das funcoes que interessam. Uma construcao escondida atras de mais uma
 * camada de indirecao passaria — e por isso a checagem 4 tem as duas metades, a
 * negativa (nao construa) e a POSITIVA (reconfira o hash, reconfira a chain).
 * Dizer o alcance e parte do guardiao: um check que se anuncia mais forte do que
 * e vale menos que nenhum, porque compra confianca que nao pode pagar.
 *
 *   node scripts/check-assinatura.mjs
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const RAIZ = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const JS = join(RAIZ, "site", "js", "console.js");

const falhas = [];
const notas = [];
const falhar = (m) => falhas.push(m);

let js;
try {
  js = readFileSync(JS, "utf8");
} catch {
  console.error(`✗ ${JS} ausente — nao ha caminho de assinatura para conferir`);
  process.exit(1);
}

/* Remove comentarios e strings para as checagens ESTRUTURAIS. Sem isto, uma
   frase em prosa dentro de um comentario vira "codigo" e o guardiao reprova o
   arquivo por causa de uma explicacao — o falso alarme classico desta casa. */
function semComentarios(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
            .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + m.slice(p.length).replace(/./g, " "));
}
const CODIGO = semComentarios(js);

/* ------------------------------------------------------------------ item 1 -- */
const PERMITIDO = ["eth_accounts", "eth_requestAccounts", "eth_chainId", "eth_sendTransaction"];

const mAllow = CODIGO.match(/var\s+CARTEIRA_PERMITIDO\s*=\s*\{([^}]*)\}/);
if (!mAllow) {
  falhar("console.js nao declara CARTEIRA_PERMITIDO — sem allowlist, nao ha trava nenhuma");
} else {
  const chaves = mAllow[1]
    .split(",")
    .map((p) => p.split(":")[0].trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
  for (const k of chaves) {
    if (!PERMITIDO.includes(k)) falhar(`CARTEIRA_PERMITIDO contem "${k}" — fora da allowlist de quatro`);
  }
  if (chaves.length !== 4) {
    falhar(`CARTEIRA_PERMITIDO tem ${chaves.length} metodos e a allowlist autorizada tem 4: ${PERMITIDO.join(" / ")}`);
  } else {
    notas.push(`carteira: ${chaves.join(" · ")}`);
  }
}

/* Metodos de assinatura de mensagem: proibidos em qualquer lugar do arquivo,
   inclusive em comentario. Aqui a varredura e no texto CRU de proposito — nomear
   um destes, mesmo para dizer que nao se usa, e o comeco de usar. */
for (const proibido of ["personal_sign", "eth_signTypedData", "eth_sendRawTransaction", "wallet_"]) {
  const n = (js.match(new RegExp(proibido, "g")) || []).length;
  if (n) falhar(`console.js menciona ${proibido} ${n}x — assinatura de mensagem e envio cru continuam vetados`);
}
{
  const n = (js.match(/eth_sign(?!edTypedData|TypedData)\b/g) || []).length;
  if (n) falhar(`console.js menciona eth_sign ${n}x — vetado`);
}

/* ------------------------------------------------------------------ item 2 -- */
/* Uma palavra de 32 bytes toda de uns, em qualquer forma que um literal possa
   tomar: 64 efes seguidos, ou "f".repeat(64), ou 2**256-1 escrito como literal. */
const PADROES_MAX = [
  { re: /["'`]0x[fF]{64}["'`]/g, why: "literal 0x + 64 efes (MAX_UINT256) no codigo" },
  { re: /["'`][fF]{64}["'`]/g, why: "literal de 64 efes no codigo" },
  { re: /["'`][fF]["'`]\s*\.\s*repeat\(\s*64\s*\)/g, why: '"f".repeat(64) — MAX_UINT256 montado' },
  { re: /115792089237316195423570985008687907853269984665640564039457584007913129639935/g, why: "MAX_UINT256 em decimal" },
];
for (const { re, why } of PADROES_MAX) {
  for (const m of CODIGO.matchAll(re)) falhar(`console.js contem ${why}: ${String(m[0]).slice(0, 40)}`);
}
/* E a metade positiva: a funcao que recusa tem de existir E ser chamada na
   construcao de todo approve. Sem isto o item 2 seria so a ausencia de um
   literal, e ausencia de literal nao impede montar o valor em tempo de execucao. */
if (!/function\s+recusarAprovacaoInfinita\s*\(/.test(CODIGO)) {
  falhar("console.js nao define recusarAprovacaoInfinita() — a recusa de aprovacao ilimitada sobre os bytes nao existe");
} else {
  const approves = [...CODIGO.matchAll(/sig\(\s*"erc20"\s*,\s*"approve\(address,uint256\)"\s*\)/g)];
  if (!approves.length) falhar("console.js nao constroi nenhum approve via sig() — o elo com o ABI sumiu");
  for (const m of approves) {
    /* A janela e a linha logica em que o approve e montado: o trecho entre o
       inicio da atribuicao `dados:` e o fim daquela expressao. Basta olhar para
       tras ate 200 caracteres e exigir que recusarAprovacaoInfinita envolva. */
    const antes = CODIGO.slice(Math.max(0, m.index - 200), m.index);
    if (!/recusarAprovacaoInfinita\s*\(/.test(antes)) {
      falhar("um approve e construido sem passar por recusarAprovacaoInfinita() — a checagem de bytes nao cobre esse caminho");
    }
  }
  if (approves.length) notas.push(`${approves.length} approve(s) construidos, todos sob recusarAprovacaoInfinita()`);
}

/* ------------------------------------------------------------------ item 3 -- */
/* innerHTML so pode receber "" — nada mais, nem literal bonito, nem constante. */
const innerHTMLs = [...CODIGO.matchAll(/\.innerHTML\s*=\s*([^;\n]+)/g)];
if (!innerHTMLs.length) {
  notas.push("innerHTML: nenhuma atribuicao no arquivo");
} else {
  let ok = 0;
  for (const m of innerHTMLs) {
    const valor = m[1].trim();
    if (valor === '""' || valor === "''") { ok += 1; continue; }
    falhar(`innerHTML recebe algo que nao e a string vazia: ${valor.slice(0, 60)} — use textContent`);
  }
  if (ok) notas.push(`innerHTML: ${ok} atribuicao(oes), todas a string vazia (limpar)`);
}
/* innerHTML nao e o unico caminho para HTML: estes tres tambem executam. */
for (const perigoso of ["outerHTML", "insertAdjacentHTML", "document.write"]) {
  if (new RegExp(perigoso.replace(".", "\\.")).test(CODIGO)) falhar(`console.js usa ${perigoso} — proibido nesta pagina`);
}
/* Regra 9 tambem cobre atributo style: CSS injetado reescreve o que o usuario
   acredita estar assinando (F-3 do Tubarao). Nenhum .style vindo de dado. */
for (const m of CODIGO.matchAll(/\.style\s*(\.[A-Za-z]+)?\s*=\s*([^;\n]+)/g)) {
  const valor = String(m[2]).trim();
  if (!/^["'][^"']*["']$/.test(valor)) {
    falhar(`atribuicao a .style que nao e literal: ${valor.slice(0, 60)} — CSS injetado reescreve o que se le antes de assinar`);
  }
}
/* setAttribute("style", …) e a mesma porta com outro nome. */
for (const m of CODIGO.matchAll(/setAttribute\(\s*["']style["']/g)) {
  falhar("console.js usa setAttribute(\"style\", …) — mesma porta que .style, e igualmente fechada");
}

/* ------------------------------------------------------------------ item 4 -- */
/** Extrai o corpo de uma funcao a partir do indice da sua primeira chave. */
function corpoDe(src, iAbre) {
  let n = 0;
  for (let i = iAbre; i < src.length; i++) {
    if (src[i] === "{") n += 1;
    else if (src[i] === "}") {
      n -= 1;
      if (n === 0) return src.slice(iAbre, i + 1);
    }
  }
  return null;
}

const CONSTRUCAO = [
  { re: /\bsig\s*\(/, nome: "sig(" },
  { re: /\bpal\s*\(/, nome: "pal(" },
  { re: /\bpalNum\s*\(/, nome: "palNum(" },
  { re: /\bconstruirPassos\s*\(/, nome: "construirPassos(" },
];

const regioes = [];

/* Todo handler de clique. */
for (const m of CODIGO.matchAll(/addEventListener\(\s*["']click["']\s*,\s*function\s*\([^)]*\)\s*/g)) {
  const iAbre = CODIGO.indexOf("{", m.index + m[0].length - 1);
  if (iAbre < 0) continue;
  const corpo = corpoDe(CODIGO, iAbre);
  if (corpo) regioes.push({ nome: "handler de clique", corpo });
}
if (!regioes.length) falhar("nenhum handler de clique encontrado — o parser deste guardiao nao esta enxergando o arquivo");

/* E a funcao de envio. */
{
  const m = CODIGO.match(/function\s+enviar\s*\(/);
  if (!m) {
    falhar("console.js nao define enviar() — o caminho de assinatura nao existe, ou mudou de nome sem atualizar este guardiao");
  } else {
    const iAbre = CODIGO.indexOf("{", m.index);
    const corpo = corpoDe(CODIGO, iAbre);
    if (!corpo) falhar("nao consegui delimitar o corpo de enviar()");
    else {
      regioes.push({ nome: "enviar()", corpo });

      /* METADE POSITIVA. A ausencia de construcao nao prova que o envio manda o
         objeto congelado; estas quatro presencas e que provam. */
      const exigidos = [
        /* Aceita hashDaCarga OU hashDaTx: fixar o NOME de uma funcao faz a guarda
           envelhecer no primeiro refactor, e ela ficou vermelha exatamente assim
           quando enviar() passou a conferir a CARGA em vez do objeto interno — que
           e a versao mais forte, nao a mais fraca. O que importa e a propriedade. */
        { re: /hashDa(Carga|Tx)\s*\(/, o: "recomputar o hash do objeto congelado" },
        { re: /p\.hash/, o: "comparar com o hash tirado no render" },
        { re: /eth_chainId/, o: "reconferir a chain no instante do clique (regra 4)" },
        { re: /seloAtual\s*\(\s*\)/, o: "conferir o selo das entradas (regra 3)" },
        { re: /p\.tx\b/, o: "enviar o objeto congelado, e nao um novo" },
      ];
      /* Endurecimento nascido do achado #1 da Medusa: o argumento de
         eth_sendTransaction tem de ser um IDENTIFICADOR — a mesma referencia que
         foi conferida. Um literal ali e um objeto novo montado no envio, e a
         impressao digital passa a provar o congelado em vez do enviado. */
      const envio = /eth_sendTransaction"\s*,\s*\[\s*([A-Za-z_$][\w$]*)\s*\]/.exec(corpo);
      if (!envio) {
        falhas.push("eth_sendTransaction nao recebe uma referencia unica ja conferida — " +
          "um objeto literal ali e montado no envio, e nao e o que foi congelado");
      }

      for (const e of exigidos) {
        if (!e.re.test(corpo)) falhar(`enviar() nao parece ${e.o} — exigido pelas regras 3 e 4`);
      }
      if (exigidos.every((e) => e.re.test(corpo))) {
        notas.push("enviar(): reconfere hash, selo e chain antes de abrir a carteira");
      }
    }
  }
}

for (const r of regioes) {
  for (const c of CONSTRUCAO) {
    if (c.re.test(r.corpo)) {
      falhar(`${r.nome} constroi calldata (${c.nome}) — a regra 3 proibe remontar fora do congelamento`);
    }
  }
}
notas.push(`${regioes.length} regiao(oes) de clique/envio varridas por construcao de calldata`);

/* O congelamento tem de existir de verdade: hash sobre os quatro campos. */
for (const campo of ["chainId", "to", "data", "value"]) {
  if (!new RegExp(`${campo}=`).test(js)) {
    falhar(`hashDaTx nao parece incluir o campo ${campo} — o hash tem de cobrir {chainId,to,data,value}`);
  }
}

/* ------------------------------------------------------------------ saida --- */
if (falhas.length) {
  console.error(`✗ assinatura: ${falhas.length} falha(s)`);
  for (const f of falhas) console.error("  " + f);
  process.exit(1);
}
console.log("✓ assinatura: allowlist de 4 · zero aprovacao infinita · innerHTML so vazio · calldata nao remontada no clique");
for (const n of notas) console.log("  " + n);
