#!/usr/bin/env node
/* INVARIANTE DA TESOURARIA  ·  treasury != 0 enquanto feeBps != 0  ·  2026-08-19
 * ---------------------------------------------------------------------------
 * O DEFEITO QUE ESTE PORTAO VIGIA, e ele nao e hipotetico:
 *
 *   ParameterRegistry.sol:142  aceita setTreasury(0) e a chamada SIMULA SUCESSO.
 *   TriviuLPVault.sol:750-752  com treasury == 0, _paga REVERTE.
 *
 * Consequencia: um parametro aceito em silencio congela TODO `fechar` lucrativo.
 * O dono da posicao fica preso — nao por bug de codigo, por configuracao valida
 * do ponto de vista do setter e invalida do ponto de vista de quem sai.
 *
 * A invariante e uma frase: se ha taxa a cobrar, tem de haver para onde manda-la.
 *
 * DUAS ORIGENS, sempre. Uma RPC que mente e um vetor conhecido nesta casa; duas
 * que discordam abortam em vez de escolher a que agrada.
 *
 * FALHA FECHADA em todos os caminhos: RPC muda, resposta curta, JSON quebrado ou
 * endpoints divergentes = REPROVA. Este portao nunca conclui "passou" por nao ter
 * conseguido ler.
 *
 * --controle t=<hex>,f=<n>   injeta valores SEM tocar a chain, so para provar que
 *                            o portao reprova. Um portao que so aprova e enfeite.
 */
const REGISTRY = "0x1Adab61ef019d853BBcFaf65E929961b11897856";
const SEL_FEE = "0x24a9d853";   // feeBps()   · lido de out/ParameterRegistry.json
const SEL_TRE = "0x61d027b3";   // treasury() · idem
const ENDPOINTS = [
  "https://polygon-bor-rpc.publicnode.com",
  "https://polygon.drpc.org",
];

async function ler(url, data) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "curl/8.0" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call",
      params: [{ to: REGISTRY, data }, "latest"] }),
  });
  if (!r.ok) throw new Error(`${url} devolveu HTTP ${r.status}`);
  const j = await r.json();
  if (j.error) throw new Error(`${url}: ${JSON.stringify(j.error)}`);
  const v = j.result;
  if (typeof v !== "string" || v.length !== 66)
    throw new Error(`${url}: palavra de 32 bytes esperada, veio ${JSON.stringify(v)}`);
  return v;
}

/* argv chega separado pelo shell: "--controle" e "t=...,f=..." sao DOIS itens.
   Junto tudo antes de casar — foi assim que a primeira calibracao saiu 2. */
const arg = process.argv.slice(2).join(" ").includes("--controle")
  ? process.argv.slice(2).join(" ") : null;
let feeHex, treHex, origem;

try {
  if (arg) {
    const m = /t=(0x[0-9a-fA-F]+),f=(\d+)/.exec(arg);
    if (!m) { console.error("uso: --controle t=0x...,f=3000"); process.exit(2); }
    treHex = "0x" + m[1].slice(2).padStart(64, "0");
    feeHex = "0x" + Number(m[2]).toString(16).padStart(64, "0");
    origem = "CONTROLE INJETADO (a chain nao foi lida)";
  } else {
    const [f1, f2] = await Promise.all(ENDPOINTS.map((u) => ler(u, SEL_FEE)));
    const [t1, t2] = await Promise.all(ENDPOINTS.map((u) => ler(u, SEL_TRE)));
    if (f1 !== f2 || t1 !== t2) {
      console.error("ORIGENS DIVERGEM — abortado sem escolher lado:");
      console.error(`  feeBps   ${f1}  vs  ${f2}`);
      console.error(`  treasury ${t1}  vs  ${t2}`);
      process.exit(1);
    }
    feeHex = f1; treHex = t1;
    origem = `${ENDPOINTS.length} endpoints concordando`;
  }
} catch (e) {
  console.error("leitura falhou — FALHA FECHADA, nao 'passou':", e.message);
  process.exit(1);
}

const feeBps = Number(BigInt(feeHex));
const treasury = "0x" + treHex.slice(-40);
const zerada = /^0x0{40}$/.test(treasury);

console.log(`invariante da tesouraria · ParameterRegistry ${REGISTRY}`);
console.log(`  origem ..... ${origem}`);
console.log(`  feeBps ..... ${feeBps}`);
console.log(`  treasury ... ${treasury}`);

if (feeBps !== 0 && zerada) {
  console.error(`\nINVARIANTE VIOLADA · feeBps = ${feeBps} com treasury zerada.`);
  console.error("  TriviuLPVault._paga (:750-752) reverte, e todo `fechar` lucrativo trava.");
  console.error("  Quem tem posicao aberta nao consegue sair com lucro.");
  process.exit(1);
}
console.log(feeBps === 0
  ? "\n✓ feeBps zerada — nao ha taxa a rotear, invariante nao se aplica"
  : "\n✓ ha taxa e ha para onde manda-la");
