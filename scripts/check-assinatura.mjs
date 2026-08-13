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
 *      autorizacao off-chain, reprova aqui.
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
 *      construcao (sig/pal/palNum/palInt) e proibida dentro de handler de clique
 *      e dentro de enviar(), e o envio e OBRIGADO a reconferir o hash e a chain.
 *
 * O QUE MUDOU EM 2026-08-12 (segunda passada, ONDA-TRIVIU-FACTORY-E-LP)
 * ====================================================================
 * Este guardiao lia UM arquivo: site/js/console.js. Isso bastava enquanto havia
 * um caminho de assinatura no site. Quando /console/ deixou de ser uma simulacao
 * e passou a abrir a carteira de verdade, passaram a existir dois — e um
 * guardiao que cobre um dos dois nao cobre nenhum, porque o descoberto e
 * exatamente onde a regra vai ser quebrada sem que ninguem veja.
 *
 * Entao a lista abaixo e a lista de arquivos que podem chamar uma carteira. Ela
 * e conferida contra o que o site REALMENTE carrega: se um HTML de site/ apontar
 * para um /js/*.js que nao esta aqui e esse arquivo mencionar eth_sendTransaction,
 * este guardiao reprova. Cobertura declarada a mao envelhece em silencio; esta
 * e cobrada contra o disco.
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
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { webcrypto } from "node:crypto";

const RAIZ = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const SITE = join(RAIZ, "site");

/* Todo arquivo que tem permissao de falar com uma carteira. Cada um passa pelas
   quatro checagens inteiras, sem excecao e sem modo reduzido. */
const ASSINANTES = [
  "js/console.js",     /* /calldata/ — o leitor de bytes do ciclo do Executor */
  "js/console-lp.js",  /* /console/  — o ciclo de vida de uma posicao no LPVault */
];

const falhas = [];
const notas = [];
const falhar = (m) => falhas.push(m);

/* O que EXECUTA numa tela de assinatura nao e mais um arquivo so. Desde
   2026-08-13 as primitivas moram em /js/motor.js e as telas as consomem — uma
   definicao, varios consumidores, que e o conserto estrutural do F-1 (duas
   copias de cargaDaTx que se separaram e deixaram a pagina recusando 100% dos
   envios com cinco guardioes verdes).

   Um guardiao que lesse so o arquivo da tela diria "nao define cargaDaTx" e
   estaria certo sobre o arquivo e errado sobre a PAGINA. Ele confere o que roda,
   entao le a uniao — e o motor entra UMA vez, porque duas entradas iguais
   inventariam uma segunda definicao que nao existe. */
let MOTOR_SRC = null;
function fonteExecutavel(rel) {
  const proprio = readFileSync(join(SITE, rel), "utf8");
  if (rel === "js/motor.js") return proprio;
  if (MOTOR_SRC === null) MOTOR_SRC = readFileSync(join(SITE, "js/motor.js"), "utf8");
  return MOTOR_SRC + "\n" + proprio;
}


/* Remove comentarios e strings para as checagens ESTRUTURAIS. Sem isto, uma
   frase em prosa dentro de um comentario vira "codigo" e o guardiao reprova o
   arquivo por causa de uma explicacao — o falso alarme classico desta casa. */
function semComentarios(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
            .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + m.slice(p.length).replace(/./g, " "));
}

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

const PERMITIDO = ["eth_accounts", "eth_requestAccounts", "eth_chainId", "eth_sendTransaction"];

const CONSTRUCAO = [
  { re: /\bsig\s*\(/, nome: "sig(" },
  { re: /\bpal\s*\(/, nome: "pal(" },
  { re: /\bpalNum\s*\(/, nome: "palNum(" },
  { re: /\bpalInt\s*\(/, nome: "palInt(" },
  { re: /\bconstruirPassos\s*\(/, nome: "construirPassos(" },
  { re: /\bconstruirAbrir\s*\(/, nome: "construirAbrir(" },
  { re: /\bconstruirColetar\s*\(/, nome: "construirColetar(" },
  { re: /\bconstruirFechar\s*\(/, nome: "construirFechar(" },
  { re: /\bconstruirAutorizar\s*\(/, nome: "construirAutorizar(" },
];

/* Uma palavra de 32 bytes toda de uns, em qualquer forma que um literal possa
   tomar: 64 efes seguidos, ou "f".repeat(64), ou 2**256-1 escrito como literal. */
const PADROES_MAX = [
  { re: /["'`]0x[fF]{64}["'`]/g, why: "literal 0x + 64 efes (MAX_UINT256) no codigo" },
  { re: /["'`][fF]{64}["'`]/g, why: "literal de 64 efes no codigo" },
  { re: /["'`][fF]["'`]\s*\.\s*repeat\(\s*64\s*\)/g, why: '"f".repeat(64) — MAX_UINT256 montado' },
  { re: /115792089237316195423570985008687907853269984665640564039457584007913129639935/g, why: "MAX_UINT256 em decimal" },
];

function conferir(rel) {
  let js;
  try {
    js = fonteExecutavel(rel);
  } catch {
    falhar(`${rel} ausente — a lista de assinantes nomeia um arquivo que nao existe`);
    return;
  }
  const CODIGO = semComentarios(js);

  /* ---------------------------------------------------------------- item 1 -- */
  const mAllow = CODIGO.match(/var\s+CARTEIRA_PERMITIDO\s*=\s*\{([^}]*)\}/);
  if (!mAllow) {
    falhar(`${rel} nao declara CARTEIRA_PERMITIDO — sem allowlist, nao ha trava nenhuma`);
  } else {
    const chaves = mAllow[1]
      .split(",")
      .map((p) => p.split(":")[0].trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
    for (const k of chaves) {
      if (!PERMITIDO.includes(k)) falhar(`${rel}: CARTEIRA_PERMITIDO contem "${k}" — fora da allowlist de quatro`);
    }
    if (chaves.length !== 4) {
      falhar(`${rel}: CARTEIRA_PERMITIDO tem ${chaves.length} metodos e a allowlist autorizada tem 4: ${PERMITIDO.join(" / ")}`);
    } else {
      notas.push(`${rel} · carteira: ${chaves.join(" · ")}`);
    }
  }

  /* Autorizacao off-chain: proibida em qualquer lugar do arquivo, inclusive em
     comentario. A varredura e no texto CRU de proposito — nomear um destes,
     mesmo para dizer que nao se usa, e o comeco de usar. */
  for (const proibido of ["personal_sign", "eth_signTypedData", "eth_sendRawTransaction", "wallet_"]) {
    const n = (js.match(new RegExp(proibido, "g")) || []).length;
    if (n) falhar(`${rel} menciona ${proibido} ${n}x — autorizacao off-chain e envio cru continuam vetados`);
  }
  {
    const n = (js.match(/eth_sign(?!edTypedData|TypedData)\b/g) || []).length;
    if (n) falhar(`${rel} menciona eth_sign ${n}x — vetado`);
  }

  /* ---------------------------------------------------------------- item 2 -- */
  for (const { re, why } of PADROES_MAX) {
    for (const m of CODIGO.matchAll(re)) falhar(`${rel} contem ${why}: ${String(m[0]).slice(0, 40)}`);
  }
  /* E a metade positiva: a funcao que recusa tem de existir E ser chamada na
     construcao de todo approve. Sem isto o item 2 seria so a ausencia de um
     literal, e ausencia de literal nao impede montar o valor em tempo de execucao.

     O papel entra como grupo e nao como "erc20" fixo: o approve de ERC-721 tem a
     MESMA assinatura e o MESMO seletor, e um regex preso a "erc20" deixaria de
     ver o do position manager exatamente quando ele apareceu. */
  if (!/function\s+recusarAprovacaoInfinita\s*\(/.test(CODIGO)) {
    falhar(`${rel} nao define recusarAprovacaoInfinita() — a recusa de aprovacao ilimitada sobre os bytes nao existe`);
  } else {
    const approves = [...CODIGO.matchAll(/sig\(\s*"(erc20|erc721)"\s*,\s*"approve\(address,uint256\)"\s*\)/g)];
    if (!approves.length) falhar(`${rel} nao constroi nenhum approve via sig() — o elo com o ABI sumiu`);
    for (const m of approves) {
      const antes = CODIGO.slice(Math.max(0, m.index - 200), m.index);
      if (!/recusarAprovacaoInfinita\s*\(/.test(antes)) {
        falhar(`${rel}: um approve (${m[1]}) e construido sem passar por recusarAprovacaoInfinita() — a checagem de bytes nao cobre esse caminho`);
      }
    }
    if (approves.length) notas.push(`${rel} · ${approves.length} approve(s) construidos, todos sob recusarAprovacaoInfinita()`);
  }

  /* ---------------------------------------------------------------- item 3 -- */
  const innerHTMLs = [...CODIGO.matchAll(/\.innerHTML\s*=\s*([^;\n]+)/g)];
  if (!innerHTMLs.length) {
    notas.push(`${rel} · innerHTML: nenhuma atribuicao no arquivo`);
  } else {
    let ok = 0;
    for (const m of innerHTMLs) {
      const valor = m[1].trim();
      if (valor === '""' || valor === "''") { ok += 1; continue; }
      falhar(`${rel}: innerHTML recebe algo que nao e a string vazia: ${valor.slice(0, 60)} — use textContent`);
    }
    if (ok) notas.push(`${rel} · innerHTML: ${ok} atribuicao(oes), todas a string vazia (limpar)`);
  }
  for (const perigoso of ["outerHTML", "insertAdjacentHTML", "document.write"]) {
    if (new RegExp(perigoso.replace(".", "\\.")).test(CODIGO)) falhar(`${rel} usa ${perigoso} — proibido nesta pagina`);
  }
  /* Regra 9 tambem cobre atributo style: CSS injetado reescreve o que o usuario
     acredita estar assinando (F-3 do Tubarao). Nenhum .style vindo de dado. */
  for (const m of CODIGO.matchAll(/\.style\s*(\.[A-Za-z]+)?\s*=\s*([^;\n]+)/g)) {
    const valor = String(m[2]).trim();
    if (!/^["'][^"']*["']$/.test(valor)) {
      falhar(`${rel}: atribuicao a .style que nao e literal: ${valor.slice(0, 60)} — CSS injetado reescreve o que se le antes de assinar`);
    }
  }
  for (const _ of CODIGO.matchAll(/setAttribute\(\s*["']style["']/g)) {
    falhar(`${rel} usa setAttribute("style", …) — mesma porta que .style, e igualmente fechada`);
  }

  /* ---------------------------------------------------------------- item 4 -- */
  const regioes = [];
  for (const m of CODIGO.matchAll(/addEventListener\(\s*["']click["']\s*,\s*function\s*\([^)]*\)\s*/g)) {
    const iAbre = CODIGO.indexOf("{", m.index + m[0].length - 1);
    if (iAbre < 0) continue;
    const corpo = corpoDe(CODIGO, iAbre);
    if (corpo) regioes.push({ nome: "handler de clique", corpo });
  }
  if (!regioes.length) falhar(`${rel}: nenhum handler de clique encontrado — o parser deste guardiao nao esta enxergando o arquivo`);

  {
    const m = CODIGO.match(/function\s+enviar\s*\(/);
    if (!m) {
      falhar(`${rel} nao define enviar() — o caminho de assinatura nao existe, ou mudou de nome sem atualizar este guardiao`);
    } else {
      const iAbre = CODIGO.indexOf("{", m.index);
      const corpo = corpoDe(CODIGO, iAbre);
      if (!corpo) falhar(`${rel}: nao consegui delimitar o corpo de enviar()`);
      else {
        regioes.push({ nome: "enviar()", corpo });

        /* METADE POSITIVA. A ausencia de construcao nao prova que o envio manda o
           objeto congelado; estas presencas e que provam.

           A LINHA QUE SAIU DAQUI, e por que ela saiu. Havia aqui um
           `/hashDa(Carga|Tx)\s*\(/` — uma alternancia que aceitava os DOIS nomes
           — e o comentario que a acompanhava explicava que fixar o nome de uma
           funcao faz a guarda envelhecer. O raciocinio estava certo e a conclusao
           estava errada. A guarda tinha ficado VERMELHA no dia em que as duas
           canonicalizacoes se separaram, que e exatamente o dia em que ela devia
           ficar vermelha, e o conserto aplicado foi alargar a guarda ate ela
           voltar ao verde. Depois disso ela passou a atestar, por dez meses de
           commits e cinco execucoes verdes, um caminho de assinatura que recusava
           100% dos envios.

           A licao nao e "fixe o nome". E que a alternativa a fixar um nome nao e
           aceitar dois nomes — e parar de perguntar por nome. O que substitui
           esta linha esta em provarCongelamento(): descobre quem canonicaliza
           procurando quem chama o digest, exige que exista UM so, e EXECUTA os
           dois lados para comparar os digests. Guarda que pergunta "o trecho esta
           la?" foi o que falhou; a que pergunta "os dois lados produzem o mesmo
           numero?" nao tem como falhar do mesmo jeito. */
        const exigidos = [
          { re: /p\.hash/, o: "comparar com o hash tirado no render" },
          { re: /eth_chainId/, o: "reconferir a chain no instante do clique (regra 4)" },
          { re: /seloAtual\s*\(\s*\)/, o: "conferir o selo das entradas (regra 3)" },
          { re: /p\.tx\b/, o: "enviar o objeto congelado, e nao um novo" },
        ];
        /* Endurecimento nascido do achado #1 da Medusa: o argumento de
           eth_sendTransaction tem de ser um IDENTIFICADOR — a mesma referencia
           que foi conferida. Um literal ali e um objeto novo montado no envio, e
           a impressao digital passa a provar o congelado em vez do enviado. */
        const envio = /eth_sendTransaction"\s*,\s*\[\s*([A-Za-z_$][\w$]*)\s*\]/.exec(corpo);
        if (!envio) {
          falhar(`${rel}: eth_sendTransaction nao recebe uma referencia unica ja conferida — ` +
            "um objeto literal ali e montado no envio, e nao e o que foi congelado");
        }

        for (const e of exigidos) {
          if (!e.re.test(corpo)) falhar(`${rel}: enviar() nao parece ${e.o} — exigido pelas regras 3 e 4`);
        }
        if (exigidos.every((e) => e.re.test(corpo))) {
          notas.push(`${rel} · enviar(): reconfere hash, selo e chain antes de abrir a carteira`);
        }
      }
    }
  }

  for (const r of regioes) {
    for (const c of CONSTRUCAO) {
      if (c.re.test(r.corpo)) {
        falhar(`${rel}: ${r.nome} constroi calldata (${c.nome}) — a regra 3 proibe remontar fora do congelamento`);
      }
    }
  }
  notas.push(`${rel} · ${regioes.length} regiao(oes) de clique/envio varridas por construcao de calldata`);
}

/* ========================================================================== *
 *  5. O CONGELAMENTO, PROVADO POR EXECUCAO
 * ========================================================================== *
 * As quatro checagens acima sao textuais: perguntam se um trecho esta la. Esta
 * nao pergunta nada — ela RODA os dois lados e compara os numeros que saem.
 *
 * POR QUE ELA EXISTE. Em 2026-08-13 mediu-se que o caminho de assinatura das
 * duas telas recusava 100% dos envios, e que este guardiao estava VERDE em cima
 * disso, nas cinco execucoes anteriores. O defeito: existiam DUAS
 * canonicalizacoes do mesmo objeto, uma no congelamento com quatro campos e
 * outra no envio com cinco. Digests diferentes, sempre. A guarda da epoca
 * aceitava qualquer uma das duas por nome, entao a diferenca entre elas era
 * literalmente o que ela nao conseguia ver.
 *
 * O que ela prova agora, e nesta ordem:
 *
 *   a. existe UM digest (quem chama crypto.subtle.digest) e UMA canonicalizacao
 *      (quem chama o digest). Duas canonicalizacoes do mesmo objeto e o defeito
 *      na sua forma de origem, e ela reprova ali, antes de qualquer execucao.
 *   b. existe UM construtor da carga, e ele NAO esta dentro de enviar(): a carga
 *      nasce no congelamento e o envio a LE.
 *   c. os dois lados chamam a MESMA canonicalizacao — descoberta, nao digitada
 *      aqui: o nome sai do arquivo auditado.
 *   d. EXECUTA a expressao de hash do congelamento e a do envio, como estao
 *      escritas no arquivo, sobre a mesma transacao sintetica, e exige digests
 *      IGUAIS. Se um lado ganhar, perder ou reordenar um campo, os numeros
 *      divergem e isto fica vermelho.
 *   e. a canonicalizacao cobre os cinco campos que decidem o que a chain executa
 *      e quem esta assinando — conferido DENTRO do corpo dela, e nao no arquivo
 *      inteiro, que e onde uma frase em prosa satisfaz um regex.
 *
 * O ALCANCE, dito para nao ser comprado por mais do que vale: a execucao usa uma
 * transacao sintetica e nao abre carteira nenhuma. Ela prova que os dois lados
 * concordam, nao que o objeto entregue a carteira e o que a tela desenhou — quem
 * prova isso e a checagem 4, exigindo que eth_sendTransaction receba a mesma
 * referencia ja conferida. As duas juntas fecham o circuito; nenhuma o fecha
 * sozinha. E se a extracao falhar em qualquer ponto, isto REPROVA em vez de
 * pular: guardiao que nao consegue medir e obrigado a dizer que nao mediu.
 */
function todasFuncoes(src) {
  const out = [];
  for (const m of src.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/g)) {
    const i = src.indexOf("{", m.index + m[0].length - 1);
    if (i < 0) continue;
    const corpo = corpoDe(src, i);
    if (!corpo) continue;
    out.push({ nome: m[1], params: m[2], corpo, fonte: `function ${m[1]}(${m[2]}) ${corpo}`,
               ini: m.index, fim: i + corpo.length });
  }
  return out;
}

/** Argumentos de uma chamada, com parenteses equilibrados, a partir do indice do
    nome. Devolve { args, fim } — regex nao serve porque os argumentos contem
    parenteses e virgulas proprios. */
function argumentosDe(src, iNome, nome) {
  const iAbre = src.indexOf("(", iNome + nome.length);
  if (iAbre < 0) return null;
  let n = 0;
  for (let i = iAbre; i < src.length; i++) {
    if (src[i] === "(") n += 1;
    else if (src[i] === ")") {
      n -= 1;
      if (n === 0) return { args: src.slice(iAbre + 1, i), fim: i + 1 };
    }
  }
  return null;
}

const TX_SINTETICA = {
  chainId: 137,
  to: "0xC52BaD280809672D8EC5D1fcF2d7eCa45a2a423E",
  data: "0x095ea7b3000000000000000000000000c52bad280809672d8ec5d1fcf2d7eca45a2a423e" +
        "00000000000000000000000000000000000000000000000000000000000f4240",
  value: "0x0",
  de: "0xb5Fb0CDaab5784cBE05CcB9D843DaFe4663883C5",
};

async function provarCongelamento(rel) {
  let js;
  try { js = fonteExecutavel(rel); } catch { return; }
  const CODIGO = semComentarios(js);
  const fs_ = todasFuncoes(CODIGO);
  const dizer = (m) => falhar(`${rel}: [congelamento] ${m}`);

  /* ---- a. um digest, uma canonicalizacao -------------------------------- */
  const digests = fs_.filter((f) => /crypto\s*\.\s*subtle\s*\.\s*digest/.test(f.corpo));
  if (digests.length !== 1) {
    dizer(`esperava UMA funcao chamando crypto.subtle.digest e achei ${digests.length}` +
      (digests.length ? ` (${digests.map((f) => f.nome).join(", ")})` : "") +
      ". Sem um digest unico nao ha o que comparar.");
    return;
  }
  const digest = digests[0];
  const chamaDigest = new RegExp(`\\b${digest.nome}\\s*\\(`);
  const canons = fs_.filter((f) => f.nome !== digest.nome && chamaDigest.test(f.corpo) &&
                                   !(f.ini < digest.ini && f.fim > digest.fim));
  if (canons.length !== 1) {
    dizer(`${canons.length} funcao(oes) canonicalizam para ${digest.nome}()` +
      (canons.length ? `: ${canons.map((f) => f.nome).join(", ")}` : "") +
      ". Tem de haver UMA. Duas canonicalizacoes do mesmo objeto e o defeito de " +
      "2026-08-13 na sua forma de origem: cada lado chama a sua, os digests nunca batem, " +
      "e o caminho de assinatura recusa tudo enquanto parece implementado.");
    return;
  }
  const canon = canons[0];

  /* ---- e. os cinco campos, dentro do corpo da canonicalizacao ----------- */
  for (const campo of ["chainId", "from", "to", "data", "value"]) {
    if (!new RegExp(`["'|]${campo}=`).test(canon.corpo)) {
      dizer(`${canon.nome}() nao serializa o campo ${campo}. A impressao digital tem de cobrir ` +
        "{chainId, from, to, data, value}: os quatro que decidem o que a chain executa, e o quinto " +
        "porque uma allowance pertence ao endereco que a concede.");
    }
  }

  /* ---- b. um construtor da carga, fora de enviar() ---------------------- */
  const constrs = fs_.filter((f) => /Object\s*\.\s*freeze\s*\(\s*\{[^}]*\bfrom\s*:/.test(f.corpo));
  if (constrs.length !== 1) {
    dizer(`esperava UM construtor da carga (Object.freeze({from,…})) e achei ${constrs.length}` +
      (constrs.length ? `: ${constrs.map((f) => f.nome).join(", ")}` : "") +
      ". Dois literais equivalentes em lugares diferentes foi como o defeito entrou.");
    return;
  }
  const construtor = constrs[0];
  const fEnviar = fs_.find((f) => f.nome === "enviar");
  if (!fEnviar) { dizer("nao achei enviar()"); return; }
  if (/Object\s*\.\s*freeze\s*\(\s*\{[^}]*\bfrom\s*:/.test(fEnviar.corpo)) {
    dizer("enviar() constroi a carga. Ela tem de nascer no congelamento e ser LIDA aqui — " +
      "um objeto novo no envio faz a impressao digital provar o congelado em vez do enviado.");
  }

  /* ---- c. os dois lados chamam a mesma canonicalizacao ------------------ */
  const usos = [];
  for (const m of CODIGO.matchAll(new RegExp(`\\b${canon.nome}\\s*\\(`, "g"))) {
    const a = argumentosDe(CODIGO, m.index, canon.nome);
    if (a) usos.push({ i: m.index, args: a.args.trim(), fim: a.fim });
  }
  const noEnviar = usos.filter((u) => u.i > fEnviar.ini && u.i < fEnviar.fim);
  const fCongela = fs_.filter((f) => /\.hash\s*=\s*[\w$]/.test(f.corpo) && f.nome !== "enviar");
  const congelaMin = fCongela.length
    ? fCongela.reduce((a, b) => (b.fim - b.ini < a.fim - a.ini ? b : a))
    : null;
  const noCongelar = congelaMin ? usos.filter((u) => u.i > congelaMin.ini && u.i < congelaMin.fim) : [];

  if (noEnviar.length !== 1) {
    dizer(`enviar() chama ${canon.nome}() ${noEnviar.length}x — esperava exatamente 1.`); return;
  }
  if (!congelaMin) { dizer("nao achei a funcao que atribui .hash no congelamento"); return; }
  if (noCongelar.length !== 1) {
    dizer(`o congelamento (${congelaMin.nome}) chama ${canon.nome}() ${noCongelar.length}x — esperava 1.`); return;
  }

  /* ---- d. EXECUTA os dois lados e compara ------------------------------- */
  const prefixoCong = congelaMin.corpo.slice(0, noCongelar[0].i - congelaMin.ini);
  const prefixoEnv = fEnviar.corpo.slice(0, noEnviar[0].i - fEnviar.ini);
  /* Do congelamento: as atribuicoes em p.<campo> que precedem o hash.
     Do envio: os `var X = <caminho>;` simples que precedem o hash. Qualquer coisa
     que nao caiba nesses dois moldes nao e executavel aqui, e o guardiao reprova
     em vez de adivinhar. */
  const preludioCong = [...prefixoCong.matchAll(/\bp\.[\w$]+\s*=\s*[^;]+;/g)].map((m) => m[0]).join("\n");
  const preludioEnv = [...prefixoEnv.matchAll(/\bvar\s+[\w$]+\s*=\s*[\w$.]+\s*;/g)].map((m) => m[0]).join("\n");
  const exprCong = `${canon.nome}(${noCongelar[0].args})`;
  const exprEnv = `${canon.nome}(${noEnviar[0].args})`;

  let hCong, hEnv;
  try {
    const criar = new Function("window", "TextEncoder", "TX", `
      ${digest.fonte}
      ${canon.fonte}
      ${construtor.fonte}
      var p = { tx: TX };
      ${preludioCong}
      var __c = ${exprCong};
      ${preludioEnv}
      var __e = ${exprEnv};
      return Promise.all([__c, __e]);
    `);
    [hCong, hEnv] = await criar({ crypto: webcrypto }, TextEncoder, TX_SINTETICA);
  } catch (e) {
    dizer(`nao consegui EXECUTAR os dois lados (${e.message}). Um guardiao que nao mede tem de ` +
      "reprovar: verde sem medicao foi exatamente o que deixou passar o defeito de 2026-08-13.");
    return;
  }
  if (hCong !== hEnv) {
    dizer("os dois lados produzem impressoes digitais DIFERENTES sobre a MESMA transacao. " +
      `congelamento (${congelaMin.nome}) -> ${String(hCong).slice(0, 16)}… · envio -> ` +
      `${String(hEnv).slice(0, 16)}…. A reconferencia do clique nunca pode passar, e o caminho ` +
      "de assinatura recusa 100% dos envios enquanto aparenta estar implementado.\n" +
      `      congelamento: ${exprCong}\n      envio:        ${exprEnv}`);
    return;
  }
  notas.push(`${rel} · congelamento PROVADO por execucao: ${construtor.nome}() constroi · ` +
    `${canon.nome}() canonicaliza (unica) · ${digest.nome}() digere · os dois lados batem em ` +
    `${String(hCong).slice(0, 16)}…`);
}

/* ========================================================================== *
 *  6. A REGRA 6, PROVADA POR EXECUCAO E EM CIMA DO ABI
 * ========================================================================== *
 * A checagem 2 pergunta se recusarAprovacaoInfinita() e chamada. Esta pergunta o
 * que ela FAZ, e o motivo e um falso positivo medido: a versao cega varria toda
 * palavra de 32 bytes e recusava `abrir()` com tickLower = -1, porque um int24
 * negativo em complemento de dois E a palavra toda-de-uns. Recusar o usuario
 * legitimo e um defeito com o mesmo peso de aceitar o ilegitimo — os dois fazem
 * a pagina dizer uma coisa falsa sobre a calldata que ela mesma montou.
 *
 * Os casos nao sao escritos a mao. Saem do ABI compilado: para cada assinatura
 * que o arquivo constroi via sig(), os tipos por palavra sao derivados e entao
 *
 *     palavra COM SINAL toda-de-uns   -> tem de PASSAR   (e -1, e legitimo)
 *     palavra SEM SINAL toda-de-uns   -> tem de ABORTAR  (e a aprovacao infinita)
 *
 * Assim o teste acompanha o contrato: um int24 novo nasce coberto, e um approve
 * novo nasce coberto, sem ninguem lembrar de vir aqui somar um caso.
 */
function carregarAbi() {
  const src = readFileSync(join(SITE, "js/abi-console.js"), "utf8");
  const w = {};
  new Function("window", src)(w);
  return w.TRIVIU_ABI;
}

function provarRegra6(rel) {
  let js;
  try { js = fonteExecutavel(rel); } catch { return; }
  const CODIGO = semComentarios(js);
  const dizer = (m) => falhar(`${rel}: [regra 6] ${m}`);
  const fs_ = todasFuncoes(CODIGO);
  const recusa = fs_.find((f) => f.nome === "recusarAprovacaoInfinita");
  const tipos = fs_.find((f) => f.nome === "tiposPorPalavra");
  if (!recusa || !tipos) {
    dizer("nao achei recusarAprovacaoInfinita() e/ou tiposPorPalavra() para executar."); return;
  }

  let ABI, R, T;
  try {
    ABI = carregarAbi();
    const criar = new Function("ABI", `${tipos.fonte}\n${recusa.fonte}\n` +
      "return { R: recusarAprovacaoInfinita, T: tiposPorPalavra };");
    ({ R, T } = criar(ABI));
  } catch (e) { dizer(`nao consegui executar a recusa (${e.message}).`); return; }

  const UNS = "f".repeat(64), ZERO = "0".repeat(64);
  const assinaturas = new Map();
  for (const m of CODIGO.matchAll(/\bsig\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)/g)) {
    assinaturas.set(`${m[1]}|${m[2]}`, [m[1], m[2]]);
  }
  let okSinal = 0, okSemSinal = 0, dinamicas = 0, semArgs = 0;
  for (const [papel, assin] of assinaturas.values()) {
    let ts;
    try { ts = T(papel, assin); } catch { continue; }
    /* Sem argumento nenhum e tipo dinamico sao coisas diferentes e sao contadas
       como coisas diferentes: `feeBps()` nao tem palavra para exercitar, e
       `executeCycle(…[])` tem palavras que esta derivacao nao sabe posicionar.
       Somar as duas num numero so inflaria o que este teste alcanca. */
    if (!ts) { dinamicas += 1; continue; }
    if (!ts.length) { semArgs += 1; continue; }
    let sel;
    try { sel = ((ABI.contratos && ABI.contratos[papel]) || ABI.extras[papel]).funcoes[assin].seletor; }
    catch { continue; }
    const monta = (i) => sel + ts.map((_, k) => (k === i ? UNS : ZERO)).join("");
    ts.forEach((t, i) => {
      const assinado = /^int\d+$/.test(t);
      let passou = true;
      try { R(monta(i), papel, assin); } catch { passou = false; }
      if (assinado && !passou) {
        dizer(`${papel}.${assin}: a palavra ${i + 1} e ${t}, COM SINAL, e toda-de-uns nela vale -1 — ` +
          "um valor legitimo. A recusa a tratou como aprovacao infinita. Foi exatamente assim que " +
          "abrir() com tickLower = -1 era recusada.");
      } else if (!assinado && passou) {
        dizer(`${papel}.${assin}: a palavra ${i + 1} e ${t}, SEM SINAL, e toda-de-uns nela e 2^256-1 — ` +
          "a aprovacao ilimitada. A recusa deixou passar.");
      } else if (assinado) okSinal += 1;
      else okSemSinal += 1;
    });
  }
  if (!okSemSinal) dizer("nenhuma palavra sem sinal foi exercitada — o teste nao mediu a regra 6.");
  notas.push(`${rel} · regra 6 PROVADA por execucao sobre o ABI: ${okSemSinal} palavra(s) sem sinal ` +
    `abortam · ${okSinal} palavra(s) com sinal passam (−1 legitimo) · ${semArgs} assinatura(s) sem ` +
    `argumento (nada a exercitar) · ${dinamicas} de tipo dinamico caem na varredura cega, que recusa ` +
    "demais e nunca de menos");
}

for (const rel of ASSINANTES) conferir(rel);
for (const rel of ASSINANTES) await provarCongelamento(rel);
for (const rel of ASSINANTES) provarRegra6(rel);

/* ------------------------------------------------- cobertura, cobrada do disco --
   A lista acima e escrita a mao, e lista escrita a mao envelhece. Isto e o que a
   impede: varre o site inteiro, junta todo /js/*.js que algum HTML carrega, e
   reprova se algum deles falar com carteira sem estar sob as quatro checagens.
   Um arquivo novo que abra a carteira e um arquivo novo que passa por aqui. */
{
  const htmls = [];
  (function andar(d) {
    for (const nome of readdirSync(d)) {
      const p = join(d, nome);
      if (statSync(p).isDirectory()) andar(p);
      else if (nome.endsWith(".html")) htmls.push(p);
    }
  })(SITE);

  const carregados = new Map();   /* rel do js -> paginas que o carregam */
  for (const arquivo of htmls) {
    const html = readFileSync(arquivo, "utf8");
    const pagina = relative(SITE, arquivo).split(sep).join("/");
    for (const m of html.matchAll(/<script\b[^>]*\bsrc\s*=\s*"\/(js\/[^"]+\.js)"/gi)) {
      const rel = m[1];
      if (!carregados.has(rel)) carregados.set(rel, []);
      carregados.get(rel).push(pagina);
    }
  }

  /* Dois niveis, e a distincao nao e burocratica: ela e a diferenca entre pedir
     um endereco e mover dinheiro.

     NIVEL 1 · quem PODE ENVIAR passa pelas quatro checagens inteiras.
     NIVEL 2 · quem so fala com a carteira para ler tem de PROVAR que nao pode
               enviar: allowlist contida nos tres metodos somente-leitura, e zero
               mencao a envio ou a autorizacao off-chain, em qualquer lugar do
               arquivo.

     A primeira versao deste bloco exigia nivel 1 de todo mundo, e a medicao
     mostrou por que isso estava errado: site/js/positions.js declara uma
     allowlist de DOIS metodos, os dois de leitura. Exigir dele a lista de quatro
     teria AFROUXADO uma pagina que ja era mais fechada que a regra. Um guardiao
     que empurra um arquivo para uma trava mais larga em nome da uniformidade
     esta trabalhando contra o proprio motivo de existir. */
  const SOMENTE_LEITURA = ["eth_accounts", "eth_requestAccounts", "eth_chainId"];
  let n2 = 0;
  for (const [rel, paginas] of carregados) {
    if (ASSINANTES.includes(rel)) continue;
    let src = "";
    try { src = readFileSync(join(SITE, rel), "utf8"); } catch { continue; }
    if (!/window\.ethereum|eth_requestAccounts|eth_sendTransaction/.test(src)) continue;

    const onde = `${rel} (carregado por ${paginas.join(", ")})`;
    for (const proibido of ["eth_sendTransaction", "eth_sendRawTransaction", "personal_sign", "eth_signTypedData", "wallet_"]) {
      if (new RegExp(proibido).test(src)) {
        falhar(`${onde} menciona ${proibido} e NAO esta na lista de assinantes deste guardiao. ` +
          "Um caminho de assinatura sem guarda e o caminho onde a regra sera quebrada sem que " +
          "ninguem veja. Some-o a ASSINANTES ou tire o envio dele.");
      }
    }
    const m = semComentarios(src).match(/var\s+CARTEIRA_PERMITIDO\s*=\s*\{([^}]*)\}/);
    if (!m) {
      falhar(`${onde} toca window.ethereum sem declarar CARTEIRA_PERMITIDO — sem allowlist nao ha trava, ` +
        "e a proxima linha a ser somada ali sera somada sem que nada reprove.");
      continue;
    }
    const chaves = m[1].split(",").map((p) => p.split(":")[0].trim().replace(/^["']|["']$/g, "")).filter(Boolean);
    for (const k of chaves) {
      if (!SOMENTE_LEITURA.includes(k)) {
        falhar(`${onde}: allowlist contem "${k}", que nao e um dos tres metodos somente-leitura ` +
          `(${SOMENTE_LEITURA.join(" / ")}). Um arquivo fora da lista de assinantes so pode ler.`);
      }
    }
    n2 += 1;
    notas.push(`${rel} · somente-leitura, allowlist de ${chaves.length}: ${chaves.join(" · ")}`);
  }
  notas.push(`${carregados.size} arquivo(s) /js/*.js carregados pelo site · ${ASSINANTES.length} sob as quatro ` +
    `checagens · ${n2} conferido(s) como somente-leitura · o resto nao toca carteira`);
}

/* ============================================================================
 *  REGRA 11 · TELA CONTRA CARTEIRA — e por que ela existe
 *
 *  As dez regras acima conferem CONGELAMENTO contra ENVIO. Sao os dois lados do
 *  envio. Nenhuma delas olha para o que a TELA imprime. O red-team do N2 do
 *  Tubarao-branco mediu o buraco: das 8 mutacoes dele, 4 ficaram verdes com os
 *  cinco guardioes rodando, e as 4 eram a mesma familia — a calldata levando
 *  uma coisa e o cartao dizendo outra.
 *
 *  Duas checagens aqui, e a segunda e a que importa:
 *
 *  ESTRUTURAL · o cartao le `p.carga` (o objeto congelado que a carteira recebe)
 *  e nao `p.tx`; e `conferirTelaContraCalldata` e chamada ANTES de `p.tx` nascer.
 *
 *  EXECUTADA · a funcao real e extraida do arquivo e RODADA contra uma mutacao.
 *  Se ela nao recusar, reprova. Grep sozinho aceita um stub que sempre devolve
 *  ok — e um guardiao que confere a existencia de uma trava sem nunca puxar a
 *  maçaneta ja passou verde cinco vezes nesta casa sobre um caminho que recusava
 *  100% dos envios. Nao se repete.
 * ========================================================================== */
function regra11(rel) {
  const src = fonteExecutavel(rel);
  const onde = `${rel} · regra 11`;
  const limpo = semComentarios(src);

  if (!/function\s+conferirTelaContraCalldata\s*\(/.test(limpo)) {
    falhar(`${onde}: nao existe conferirTelaContraCalldata. Sem ela nada liga o que a tela ` +
      `imprime ao que a carteira recebe, e as duas sao expressoes independentes dos mesmos valores.`);
    return;
  }
  const iChamada = limpo.indexOf("p.ligacao = conferirTelaContraCalldata(p)");
  const iTx = limpo.indexOf("p.tx = {");
  if (iChamada < 0 || iTx < 0 || iChamada > iTx) {
    falhar(`${onde}: a ligacao precisa rodar ANTES de p.tx nascer. Passo que nao amarra nao pode ` +
      `virar transacao — depois de existir tx, congelar e desenhar, recusar ja e tarde.`);
  }
  const leTx = (limpo.match(/p\.tx\.(data|to|value)\b/g) || []).length;
  if (leTx > 0) {
    falhar(`${onde}: o cartao volta a ler p.tx.{data,to,value} em ${leTx} ponto(s). p.tx NAO e ` +
      `congelado; p.carga e. Desenhar de um e enviar o outro e como as quatro cegueiras entraram.`);
  }
  if (!/pre\.textContent\s*=\s*p\.carga\.data/.test(limpo)) {
    falhar(`${onde}: o <pre> da calldata precisa imprimir p.carga.data — a calldata que VAI, nao uma copia.`);
  }

  /* --- a parte executada --- */
  const pega = (cabeca) => {
    const i = src.indexOf(cabeca);
    if (i < 0) return "";
    let d = 0;
    for (let k = src.indexOf("{", i); k < src.length; k++) {
      if (src[k] === "{") d += 1;
      else if (src[k] === "}") { d -= 1; if (d === 0) return src.slice(i, k + 1); }
    }
    return "";
  };
  const mEnd = /var END = (\/.*\/);/.exec(src);
  if (!mEnd) { falhar(`${onde}: nao achei o regex END para montar a prova executada.`); return; }
  const pecas = ["function pal(hex)", "function palNum(v)", "function palInt(v)",
    "var CODIFICADOR_POR_TIPO =", "function conferirTelaContraCalldata(p)"].map(pega).join("\n");

  let conferir;
  try {
    conferir = new Function("SELETORES", `"use strict";
      var END = ${mEnd[1]};
      function sig(papel, assinatura) {
        var k = papel + "." + assinatura;
        if (!(k in SELETORES)) throw new Error("no such signature: " + k);
        return SELETORES[k];
      }
      ${pecas}
      return conferirTelaContraCalldata;`)({ "erc20.approve(address,uint256)": "0x095ea7b3" });
  } catch (e) {
    falhar(`${onde}: a funcao nao carrega isolada — ${e.message}`);
    return;
  }

  const A = "0xC52BaD280809672D8EC5D1fcF2d7eCa45a2a423E";
  const pal = (w) => w.replace(/^0x/, "").toLowerCase().padStart(64, "0");
  const num = (v) => BigInt(v).toString(16).padStart(64, "0");
  const passo = () => ({
    papel: "erc20", assinatura: "approve(address,uint256)",
    args: [{ nome: "spender", tipo: "address", valor: A },
           { nome: "amount", tipo: "uint256", valor: "10000000" }],
    dados: "0x095ea7b3" + pal(A) + num(10000000n),
  });

  const recusa = (mutar) => {
    const p = passo();
    mutar(p);
    try { conferir(p); return false; } catch { return true; }
  };

  let controleOk = true;
  try { conferir(passo()); } catch (e) { controleOk = false; falhar(`${onde}: recusa um passo LEGITIMO — ${e.message}`); }

  const vetores = [
    ["valor exibido menor do que a calldata codifica", (p) => { p.args[1].valor = "1"; }],
    ["endereco exibido diferente do que vai na calldata", (p) => { p.args[0].valor = "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270"; }],
    ["palavra a mais na calldata que a tela nao mostra", (p) => { p.dados += num(1n); }],
    ["seletor de outra funcao", (p) => { p.dados = "0xdeadbeef" + p.dados.slice(10); }],
  ];
  const cegos = vetores.filter(([, m]) => !recusa(m)).map(([n]) => n);
  if (cegos.length) {
    falhar(`${onde}: a ligacao NAO recusa ${cegos.length} de ${vetores.length} mutacoes — ${cegos.join(" · ")}. ` +
      `Uma trava que nao tranca e pior que nenhuma, porque o cartao passa a afirmar que trancou.`);
  } else if (controleOk) {
    notas.push(`${rel} · regra 11 executada: ${vetores.length}/${vetores.length} mutacoes recusadas, ` +
      `controle legitimo passa, cartao desenha de p.carga`);
  }
}

for (const a of ASSINANTES) regra11(a);

/* ------------------------------------------------------------------ saida --- */
if (falhas.length) {
  console.error(`✗ assinatura: ${falhas.length} falha(s)`);
  for (const f of falhas) console.error("  " + f);
  process.exit(1);
}
console.log(`✓ assinatura: ${ASSINANTES.length} caminho(s) de assinatura · allowlist de 4 · zero aprovacao infinita · innerHTML so vazio · calldata nao remontada no clique`);
for (const n of notas) console.log("  " + n);
