#!/usr/bin/env node
/**
 * Gera site/js/abi-v0-console.js a partir de contracts/abi/*.json â€” os ABIs
 * commitados da linha V0, os mesmos que um consumidor sem Foundry usaria.
 *
 * POR QUE NAO REUSAR gerar-abi-console.mjs
 * ========================================
 * Aquele le contracts/out/**, os artefatos do forge, e a linha V0 nao esta la â€”
 * ela esta em contracts/abi/*.json, que o CI mantem atual (job `contracts`,
 * passo "ABIs are current"). Sao duas fontes para duas linhas, e misturar as
 * duas foi exatamente o defeito que TUBARAO-07 descreveu: `TriviuVault` existe
 * nas duas com o mesmo nome e codigo diferente.
 *
 * O KECCAK VEM DAQUELE ARQUIVO, E COM A AUTOCONFERENCIA JUNTA
 * ==========================================================
 * `keccak256` e importado de gerar-abi-console.mjs em vez de reescrito. Aquele
 * modulo confere o proprio keccak contra os seletores que o forge escreveu antes
 * de gerar qualquer coisa, e aborta se um bit divergir â€” importar de la e herdar
 * essa prova. Uma segunda implementacao seria uma segunda coisa para divergir.
 *
 * Medido em 2026-08-22, ao escrever isto: dos nove seletores que eu havia
 * cravado a mao numa tabela, QUATRO estavam errados â€” e eram os quatro que eu
 * havia deduzido em vez de medido. Seletor nao se digita.
 *
 *   node scripts/gerar-abi-v0.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { keccak256 } from "./keccak.mjs";

const RAIZ = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const ABI_DIR = join(RAIZ, "contracts", "abi");
const DESTINO = join(RAIZ, "site", "js", "abi-v0-console.js");

/* papel na tela -> arquivo de ABI. O papel e o nome que o motor usa em
   sig(papel, assinatura), e ele nomeia a FUNCAO no fluxo, nao o arquivo. */
const PAPEIS = [
  ["factory", "VaultFactory"],
  ["vault", "TriviuVault"],
  ["protocolRegistry", "ProtocolRegistry"],
  ["escapeHatch", "EscapeHatch"],
];

/** Um input de ABI vira o tipo canonico: tupla vira "(a,b,c)", array preserva o sufixo. */
function tipoCanonico(e) {
  if (e.type.startsWith("tuple")) {
    return "(" + (e.components || []).map(tipoCanonico).join(",") + ")" + e.type.slice("tuple".length);
  }
  return e.type;
}
const assinatura = (i) => `${i.name}(${(i.inputs || []).map(tipoCanonico).join(",")})`;

const saida = { gerado: "scripts/gerar-abi-v0.mjs", linha: "V0", contratos: {}, extras: {} };

for (const [papel, arquivo] of PAPEIS) {
  const bruto = JSON.parse(readFileSync(join(ABI_DIR, arquivo + ".json"), "utf8"));
  const abi = Array.isArray(bruto) ? bruto : bruto.abi || [];
  const alvo = { contrato: arquivo, funcoes: {}, erros: {}, eventos: {} };

  for (const item of abi) {
    const sig = assinatura(item);
    if (item.type === "function") {
      alvo.funcoes[sig] = {
        seletor: keccak256(sig).slice(0, 10),
        mutabilidade: item.stateMutability,
        entradas: (item.inputs || []).map((i) => ({ nome: i.name, tipo: tipoCanonico(i) })),
        saidas: (item.outputs || []).map((o) => ({ nome: o.name, tipo: tipoCanonico(o) })),
      };
    } else if (item.type === "error") {
      alvo.erros[keccak256(sig).slice(0, 10)] = {
        assinatura: sig,
        entradas: (item.inputs || []).map((i) => ({ nome: i.name, tipo: tipoCanonico(i) })),
      };
    } else if (item.type === "event") {
      alvo.eventos[sig] = {
        topico: keccak256(sig),
        indexados: (item.inputs || []).filter((i) => i.indexed).map((i) => i.name),
      };
    }
  }
  saida.contratos[papel] = alvo;
}

/* O ERC-20 nao tem artefato nesta arvore: nenhum contrato da V0 o declara como
   interface propria. As quatro que o fluxo usa entram aqui, com a procedencia na
   cara â€” o seletor continua saindo do keccak conferido, nenhum hex e digitado.
   `approve` esta aqui porque o passo 07 do fluxo o assina, e o motor exige que
   todo approve passe por sig() antes de recusarAprovacaoInfinita(). */
saida.extras.erc20 = {
  origem: "EIP-20 · sem artefato nesta arvore; seletor pelo keccak conferido, nunca digitado",
  funcoes: {},
};
for (const [sig, ins] of [
  ["approve(address,uint256)", [["spender", "address"], ["value", "uint256"]]],
  ["balanceOf(address)", [["owner", "address"]]],
  ["allowance(address,address)", [["owner", "address"], ["spender", "address"]]],
  ["decimals()", []],
  ["symbol()", []],
]) {
  saida.extras.erc20.funcoes[sig] = {
    seletor: keccak256(sig).slice(0, 10),
    mutabilidade: sig.startsWith("approve") ? "nonpayable" : "view",
    entradas: ins.map(([nome, tipo]) => ({ nome, tipo })),
    saidas: [],
  };
}

const nFn = Object.values(saida.contratos).reduce((n, c) => n + Object.keys(c.funcoes).length, 0);
const nErr = Object.values(saida.contratos).reduce((n, c) => n + Object.keys(c.erros).length, 0);

const corpo = `/* GERADO por scripts/gerar-abi-v0.mjs â€” NAO EDITE A MAO.
 *
 * Os ABIs da linha V0, no formato que site/js/motor.js consome em
 * sig(papel, assinatura). Cada seletor saiu do keccak-256 que
 * scripts/gerar-abi-console.mjs confere contra os seletores escritos pelo forge
 * antes de gerar qualquer coisa â€” nenhum hex foi digitado.
 *
 * Fonte: contracts/abi/*.json, que o CI mantem atual (job \`contracts\`, passo
 * "ABIs are current"). NAO e contracts/out/**: aquele traz a outra linha, e
 * \`TriviuVault\` existe nas duas com o mesmo nome e codigo diferente.
 *
 * Para atualizar:  sh contracts/script/abi.sh && node scripts/gerar-abi-v0.mjs
 */
(function (raiz) {
  "use strict";
  var ABI = ${JSON.stringify(saida, null, 2)};
  if (typeof module !== "undefined" && module.exports) { module.exports = ABI; }
  if (raiz) { raiz.TRIVIU_ABI_V0 = ABI; }
})(typeof window !== "undefined" ? window : null);
`;

writeFileSync(DESTINO, corpo);
console.log("ok site/js/abi-v0-console.js gerado");
console.log(`  ${PAPEIS.length} papeis · ${nFn} funcoes · ${nErr} erros · ${Object.keys(saida.extras.erc20.funcoes).length} extras ERC-20`);
for (const [papel] of PAPEIS) {
  console.log(`    ${papel.padEnd(18)} ${Object.keys(saida.contratos[papel].funcoes).length} funcoes`);
}
