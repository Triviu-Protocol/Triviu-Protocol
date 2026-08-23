#!/usr/bin/env node
/**
 * ENSAIO DO CONSOLE CONTRA UM FORK — o ciclo inteiro, sem gastar e sem tocar na
 * carteira de ninguem.
 *
 * POR QUE ISTO EXISTE. Action item A6 do post-mortem de 2026-08-23. O console
 * atravessou 8 ondas, 106 blocos e 15 predadores sendo uma maquete, e o defeito
 * so apareceu quando o fundador clicou. A auditoria de 19/08 tinha declarado o
 * motivo, e ele era honesto:
 *
 *     "NAO CLIQUEI EM CONECTAR — isso abriria o MetaMask na maquina dele e eu
 *      nao inicio interacao com carteira alheia sem pedido."
 *
 * A fronteira estava certa. O que faltava era um lugar onde exercitar o fluxo
 * sem cruza-la. Um fork da Polygon e esse lugar: ele copia o estado real, entao
 * a conta ja tem os fundos que tem em mainnet, e nada do que acontece ali sai
 * dali.
 *
 * O QUE ESTE ENSAIO PROVA, e e por isso que ele nao reimplementa nada: a
 * calldata sai das FUNCOES DO PROPRIO CONSOLE, extraidas de js/assinar-v0.js e
 * executadas aqui. Se alguem mudar um seletor, um argumento ou a ordem das
 * palavras la, este ensaio quebra aqui. Um teste que monta a calldata por conta
 * propria prova o teste, nao o produto.
 *
 * O QUE ELE NAO PROVA: que a tela desenha certo, que o botao esta clicavel, que
 * o modal abre. Isso e DOM e continua exigindo um navegador. Ele prova que os
 * BYTES que o console monta fazem, na chain, o que o console diz que fazem.
 *
 *   node scripts/ensaio-console-fork.mjs
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const RAIZ = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const SITE = join(RAIZ, "site");
const PORTA = Number(process.argv.find((a, i) => process.argv[i - 1] === "--porta")) || 8899;
const FORK = "https://polygon-bor-rpc.publicnode.com";
const DONO = "0x930BB359901426a0D3139848a6C09f0C9EA0851a";
const INDICE = 1;                 /* indice 0 ja existe em mainnet; 1 nasce aqui */
/* A MOEDA E ESCOLHIVEL, e o ensaio prova por que isso importa. Medido no
   contrato: `_deposit` faz `safeTransferFrom` e nada mais, e a curadoria do
   ProtocolRegistry so pesa na EXECUCAO de ciclo. Entao criar, depositar e sacar
   tem de funcionar com um ERC-20 que o registro NAO cura — e o ensaio roda com
   um desses de proposito, porque provar so com a moeda curada nao prova nada
   sobre a afirmacao. */
const arg = (n) => process.argv.find((a, i) => process.argv[i - 1] === n);
const MOEDA = arg("--moeda") || "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
const QUANTIA = BigInt(arg("--quantia") || "1000000");

/* --------------------------------------------- as primitivas do proprio site */
const w = {};
new Function("window", readFileSync(join(SITE, "js/abi-v0-console.js"), "utf8"))(w);
new Function("window", readFileSync(join(SITE, "enderecos-v0.js"), "utf8"))(w);
w.TRIVIU_ABI = w.TRIVIU_ABI_V0;
new Function("window", readFileSync(join(SITE, "js/motor.js"), "utf8"))(w);
const M = w.TRIVIU_MOTOR, L = w.TRIVIU_V0, A = L.V0;

/* Extrai as funcoes de montagem DO ARQUIVO DO CONSOLE. A tecnica e a mesma que
   o check-assinatura usa para executar os dois lados do congelamento: ler o
   corpo literal e roda-lo. Assim nao ha copia para divergir. */
function corpoDe(src, i) {
  let n = 0;
  for (let k = i; k < src.length; k++) {
    if (src[k] === "{") n += 1;
    else if (src[k] === "}") { n -= 1; if (n === 0) return src.slice(i, k + 1); }
  }
  return null;
}
function fonte(src, nome) {
  const m = new RegExp(`function\\s+${nome}\\s*\\(([^)]*)\\)`).exec(src);
  if (!m) throw new Error("nao achei " + nome + " em assinar-v0.js");
  const i = src.indexOf("{", m.index + m[0].length - 1);
  return `function ${nome}(${m[1]}) ${corpoDe(src, i)}`;
}
const ASS = readFileSync(join(SITE, "js/assinar-v0.js"), "utf8");
const CTX = { conta: DONO, cofre: null, indice: INDICE, quantia: QUANTIA.toString(), moeda: MOEDA };
const construir = new Function("sig", "CODIFICADOR_POR_TIPO", "recusarAprovacaoInfinita", "L", "CTX", `
  ${fonte(ASS, "moedaDoPasso")}
  ${fonte(ASS, "montar")}
  ${fonte(ASS, "passoCriar")}
  ${fonte(ASS, "passoAprovar")}
  ${fonte(ASS, "passoDepositar")}
  ${fonte(ASS, "passoSacar")}
  ${fonte(ASS, "passoAtivo")}
  ${fonte(ASS, "passoEstrategia")}
  return { passoCriar, passoAprovar, passoDepositar, passoSacar, passoAtivo, passoEstrategia };
`)(M.sig, M.CODIFICADOR_POR_TIPO, M.recusarAprovacaoInfinita, L, CTX);
console.log("✓ construtores extraidos de js/assinar-v0.js:", Object.keys(construir).join(" · "));

/* ------------------------------------------------------------------ o fork - */
let id = 0;
const NO = `http://127.0.0.1:${PORTA}`;
async function rpc(method, params = []) {
  const r = await fetch(NO, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }) });
  const j = await r.json();
  if (j.error) throw new Error(method + ": " + (j.error.message || JSON.stringify(j.error)));
  return j.result;
}
const call = (to, data) => rpc("eth_call", [{ to, data }, "latest"]);
const N = (x) => BigInt(x || "0x0");
const pal = (h, i) => String(h || "").replace(/^0x/, "").slice(i * 64, (i + 1) * 64);
const End = (x) => "0x" + String(x).slice(-40);
const saldo = async (quem) => N(await call(MOEDA, M.sig("erc20", "balanceOf(address)") + M.CODIFICADOR_POR_TIPO.address(quem)));
let CASAS = 6;
const emUSD = (v) => (Number(v) / 10 ** CASAS).toFixed(6);

/* O NO E DE FORA, e nao subido daqui. A primeira versao deste ensaio dava
   `spawn("anvil", …, {shell:true})` e no Windows isso subia um processo que o
   script nao conseguia esperar direito: o `--silent` escondia a saida, o
   `Start-Process` perdia o handle, e a mensagem foi "o fork nao respondeu em
   60s" enquanto o anvil estava vivo e servindo. Medido: o mesmo comando, rodado
   por fora, respondeu na primeira tentativa.
   Entao o ensaio nao gerencia processo. Ele PROCURA um fork e diz exatamente
   como subir um se nao achar — e confere que o que achou e mesmo um fork DESTA
   chain, porque um no responder nao diz qual chain ele serve. Ja houve, nesta
   maquina, um servidor de outro projeto respondendo numa porta que eu achava
   minha e devolvendo o arquivo errado. */
console.log(`\nprocurando um fork da Polygon em ${NO}…`);
let pronto = false;
try {
  const cid = Number(N(await rpc("eth_chainId")));
  const bl = Number(N(await rpc("eth_blockNumber")));
  if (cid !== 137) {
    console.error(`✗ o no na porta ${PORTA} serve a chain ${cid}, e nao a 137. Nao e o fork da Polygon.`);
    process.exit(1);
  }
  console.log(`  fork servindo chain ${cid} no bloco ${bl}`);
  pronto = true;
} catch {
  console.error(`✗ nao ha nada respondendo em ${NO}.\n\n  Suba o fork numa janela a parte e rode isto de novo:\n\n` +
    `    anvil --fork-url ${FORK} --port ${PORTA}\n\n` +
    "  (sem --silent: e ele que esconde o erro quando o fork nao sobe)");
  process.exit(1);
}
if (!pronto) process.exit(1);

const fim = (code) => process.exit(code);

try {
  await rpc("anvil_impersonateAccount", [DONO]);
  /* Dez mil POL, e nao dez. A primeira versao deu 10 POL e o no recusou com
     "Insufficient funds for gas * price + value" — porque a reserva nao e o gas
     GASTO, e sim `gasLimit x gasPrice`, e sem limite explicito o limite e o do
     BLOCO. Medido no fork: gasPrice 203 gwei e limite de bloco da Polygon em
     30M, o que reserva 6 POL por transacao antes de executar qualquer coisa.
     O saldo de POL do fundador nao e o que este ensaio mede — o que ele mede e
     a moeda-base, e essa continua sendo a real, copiada do estado de mainnet. */
  await rpc("anvil_setBalance", [DONO, "0x" + (10n ** 22n).toString(16)]);
  console.log(`  personificando ${DONO} · gas garantido no fork\n`);

  /* O recibo e ESPERADO, e nao lido no mesmo tique do envio. O anvil mina na
     hora, mas "minerar na hora" e uma promessa sobre o bloco, nao sobre quando
     o recibo aparece na API — a primeira versao disto leu null e morreu com
     "Cannot read properties of null", que e a mensagem menos util possivel para
     um ensaio de transacao. O produto ja esperava; o ensaio tambem espera. */
  const enviar = async (rot, p) => {
    const h = await rpc("eth_sendTransaction", [{ from: DONO, to: p.alvo, data: p.dados }]);
    let rec = null;
    for (let i = 0; i < 40 && !rec; i++) {
      rec = await rpc("eth_getTransactionReceipt", [h]);
      if (!rec) await new Promise((r) => setTimeout(r, 250));
    }
    if (!rec) throw new Error(rot + ": o recibo de " + h + " nao apareceu em 10s no fork");
    const ok = rec.status === "0x1";
    console.log(`  ${ok ? "✓" : "✗"} ${rot.padEnd(26)} ${p.assinatura.padEnd(34)} gas ${Number(N(rec.gasUsed))}`);
    if (!ok) throw new Error(rot + " reverteu no fork · tx " + h);
    return rec;
  };

  /* O INDICE E MEDIDO NO FORK, e nao escolhido aqui. Um fork guarda o que as
     execucoes anteriores fizeram nele: a primeira vez que este ensaio rodou, ele
     leu o recibo cedo demais, morreu achando que nada tinha acontecido, e a
     transacao FOI minerada. Na rodada seguinte o `createVault` do mesmo indice
     reverteu com `FailedDeployment()` — que e o CREATE2 dizendo que ja existe
     codigo naquele endereco.
     A mensagem de erro estava certa e a conclusao facil seria errada: o defeito
     nao estava na calldata, estava no estado herdado. Entao o ensaio procura o
     primeiro indice livre em vez de assumir um. */
  let indiceLivre = null, cofre = null;
  for (let i = INDICE; i < INDICE + 20; i++) {
    const cand = End(pal(await call(A.factory,
      M.sig("factory", "vaultAddress(address,uint256)") + M.CODIFICADOR_POR_TIPO.address(DONO) + M.CODIFICADOR_POR_TIPO.uint256(String(i))), 0));
    if ((await rpc("eth_getCode", [cand, "latest"])) === "0x") { indiceLivre = i; cofre = cand; break; }
  }
  if (indiceLivre === null) throw new Error("nao achei indice livre entre " + INDICE + " e " + (INDICE + 19) + " no fork");
  CTX.indice = indiceLivre;
  CTX.cofre = cofre;
  console.log(`  primeiro indice livre no fork: ${indiceLivre} · cofre previsto ${cofre}`);

  /* As casas vem da MOEDA, e nao de um 6 fixo: DAI tem 18, WBTC tem 8, e um
     numero formatado com as casas erradas mente por tres ordens de grandeza. */
  CASAS = Number(N(await call(MOEDA, M.sig("erc20", "decimals()"))));
  const simbolo = await call(MOEDA, M.sig("erc20", "symbol()")).then((h) => {
    const c = h.replace(/^0x/, ""); const n = Number(BigInt("0x" + c.slice(64, 128)));
    let s = ""; for (let i = 0; i < n; i++) s += String.fromCharCode(parseInt(c.slice(128 + i * 2, 130 + i * 2), 16));
    return s;
  }).catch(() => "?");
  const curada = await call(A.protocolRegistry,
    M.sig("protocolRegistry", "isBaseCurrency(address)") + M.CODIFICADOR_POR_TIPO.address(MOEDA))
    .then((h) => N(h) !== 0n).catch(() => null);
  console.log(`  moeda do ensaio: ${simbolo} (${MOEDA}) · ${CASAS} casas · curada para ciclo: ${curada}`);

  const carteira0 = await saldo(DONO);
  console.log(`  carteira antes: ${emUSD(carteira0)}   cofre antes: ${emUSD(await saldo(cofre))}\n`);
  /* A QUANTIA SE AJUSTA AO SALDO REAL. Fixar 1,00 fez o ensaio reprovar quando a
     conta do fundador desceu para 0,619850 — e nao havia defeito nenhum: o
     ensaio e que estava afirmando algo sobre o saldo dele. Um teste que exige um
     saldo especifico e um teste que quebra quando o dono usa o proprio dinheiro,
     e um teste que reprova sem defeito e um teste que se aprende a ignorar. */
  let quantia = QUANTIA;
  if (carteira0 < quantia) {
    quantia = carteira0 / 2n;
    console.log(`  saldo ${emUSD(carteira0)} menor que ${emUSD(QUANTIA)}; o ensaio usa metade: ${emUSD(quantia)}`);
  }
  if (quantia === 0n) { console.error(`✗ a conta nao tem ${simbolo} nenhum para o ensaio exercitar`); fim(1); }
  CTX.quantia = quantia.toString();

  console.log("  --- o ciclo, com a calldata do console ---");
  await enviar("1 · criar o cofre", construir.passoCriar());
  const nasceu = (await rpc("eth_getCode", [cofre, "latest"])) !== "0x";
  console.log(`      cofre existe on-chain: ${nasceu}`);
  if (!nasceu) throw new Error("createVault nao produziu contrato no endereco previsto");

  await enviar("2 · aprovar a quantia", construir.passoAprovar());
  /* A allowance e lida NA MOEDA APROVADA. A primeira versao lia em
     `A.baseCurrency` enquanto o approve ia para a moeda escolhida: aprovava DAI e
     conferia USDC. O zero que saiu dali se lia como falha do produto e era falha
     do teste — que e o modo mais caro de errar, porque manda consertar o que
     estava certo. */
  const allow = N(await call(MOEDA,
    M.sig("erc20", "allowance(address,address)") + M.CODIFICADOR_POR_TIPO.address(DONO) + M.CODIFICADOR_POR_TIPO.address(cofre)));
  console.log(`      allowance: ${emUSD(allow)}  (esperado ${emUSD(quantia)}) ${allow === QUANTIA ? "ok" : "DIVERGE"}`);
  if (allow !== quantia) throw new Error("allowance diferente da quantia aprovada");

  await enviar("3 · depositar", construir.passoDepositar());
  const cCofre = await saldo(cofre), cCart = await saldo(DONO);
  console.log(`      cofre: ${emUSD(cCofre)}   carteira: ${emUSD(cCart)}`);
  if (cCofre !== quantia) throw new Error(`o cofre ficou com ${emUSD(cCofre)} e deveria ter ${emUSD(quantia)}`);
  if (cCart !== carteira0 - quantia) throw new Error("a carteira nao debitou exatamente a quantia");

  await enviar("4 · sacar de volta", construir.passoSacar());
  const fCofre = await saldo(cofre), fCart = await saldo(DONO);
  console.log(`      cofre: ${emUSD(fCofre)}   carteira: ${emUSD(fCart)}`);
  if (fCofre !== 0n) throw new Error(`sobrou ${emUSD(fCofre)} no cofre`);
  if (fCart !== carteira0) throw new Error(`a carteira voltou com ${emUSD(fCart)} e saiu com ${emUSD(carteira0)}`);

  /* ─── A CERCA, que passou de recusa a assinatura em 2026-08-23 ───────────
     Os dois primeiros atos de politica do cofre. `setStrategy` e o unico com
     getter publico no artefato, entao e ele que prova o EFEITO e nao so a
     ausencia de reversao — `setAllowedAsset` nao expoe leitura, e dizer que ele
     "funcionou" porque nao reverteu seria comprar mais do que a medicao vende. */
  CTX.alvo = "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619";   /* WETH */
  CTX.ligado = true;
  await enviar("5 · liberar WETH na cerca", construir.passoAtivo());

  const ESTRATEGIA = "0x383fe3b67cFB0B57F77c31d8997946BDE5233466";
  CTX.alvo = ESTRATEGIA;
  await enviar("6 · apontar a estrategia", construir.passoEstrategia());
  const lida = End(pal(await call(cofre, M.sig("vault", "strategy()")), 0));
  console.log(`      strategy() = ${lida}`);
  if (lida.toLowerCase() !== ESTRATEGIA.toLowerCase()) {
    throw new Error(`o cofre aponta para ${lida} e o passo mandou ${ESTRATEGIA}`);
  }

  console.log(`\n✓ ciclo fechado com aritmetica exata: ${emUSD(carteira0)} -> ${emUSD(cCart)} -> ${emUSD(fCart)}`);
  console.log("  6 de 6 atos executados com a calldata que o console monta · nada foi gasto em mainnet");
  fim(0);
} catch (e) {
  console.error("\n✗ ENSAIO FALHOU:", e.message);
  fim(1);
}
