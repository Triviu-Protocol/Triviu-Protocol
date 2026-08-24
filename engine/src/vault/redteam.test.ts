/**
 * RED-TEAM · Escorpião · Hunter T4.
 *
 * Este arquivo não revisa: ataca. Cada caso abaixo é uma forma de o elo estar
 * errado que os testes existentes NÃO pegariam, e existe para doer aqui em vez
 * de na chain.
 *
 * O alvo declarado: `commitment.test.ts` afirma que "a rota entra pelo HASH, e
 * não por inteiro" comparando duas rotas de tamanhos diferentes. Duas rotas
 * diferentes dão hashes diferentes nas DUAS implementações — a certa e a errada.
 * Aquele teste não distingue o que promete distinguir.
 */
import { describe, expect, it } from "vitest";
import { encodeAbiParameters, keccak256, type Hex } from "viem";
import {
  executionHash, montarAbertura, proposalHash, swapExactTokensForTokens,
} from "./commitment.js";

const P = "0xdfbcbea8aa397604855c62d5c813cd0ddabce1dce98adb6b1087028eafa53d30" as Hex;
const A1 = "0x323C4192b269EA56aCd147dDbd3F71056E63E835";
const A2 = "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff";
const base = {
  executor: A1, target: A2, spender: A2,
  amountIn: 1234567n, operatorMinOut: 998877n,
  validUntil: 1900000000n, declaredRefund: 1000000n,
} as const;

/* Uma abertura completa, para os testes dos três pares. Os valores não são
   redondos: com números bonitos, uma troca de campo passa despercebida. */
const ABERTURA = {
  amountIn: 1234567n,
  minOut: 998877n,
  validUntil: 1900000000n,
  path: [A1, A2] as const,
  vault: "0xdbcc3fb13652451739008aeef0d1110863ac6d10",
  executor: A1,
  router: A2,
  chainId: 137n,
  nonce: 7n,
  configEpoch: 3n,
  strategy: A2,
  lotId: 0n,
  declaredRefund: 0n,
} as const;

describe("red-team — o que os testes existentes deixariam passar", () => {
  it("ATAQUE 1 · a rota entra pelo hash, provado contra a implementação ERRADA", () => {
    /* A implementação errada passaria a rota como `bytes` no abi.encode. Monto
       ela aqui e exijo que o resultado seja DIFERENTE do nosso. O teste
       existente compara duas rotas entre si, o que não separa as duas
       implementações — ambas dão valores diferentes para rotas diferentes. */
    const rota: Hex = "0xdeadbeefcafe";
    const nosso = executionHash(P, { ...base, routeCalldata: rota });
    const errada = keccak256(
      encodeAbiParameters(
        [{ type: "bytes32" }, { type: "address" }, { type: "address" },
         { type: "address" }, { type: "uint256" }, { type: "uint256" },
         { type: "uint64" }, { type: "uint256" }, { type: "bytes" }],
        [P, base.executor, base.target, base.spender, base.amountIn,
         base.operatorMinOut, base.validUntil, base.declaredRefund, rota],
      ),
    );
    expect(nosso).not.toBe(errada);
  });

  it("ATAQUE 2 · o seletor sai dos BYTES da assinatura, não do texto tratado como hex", () => {
    /* `keccak256` do viem trata string que começa com 0x como HEX e o resto
       como... erro. Se alguém trocasse `new TextEncoder().encode(sig)` por
       `sig` direto, o viem lançaria — mas se a assinatura por acaso começasse
       com "0x", ele hasharia os bytes errados em silêncio. O seletor tem de
       bater com o conhecido, e o conhecido não é opinião. */
    const rota = swapExactTokensForTokens({
      amountIn: 1n, amountOutMin: 1n, path: [A1, A2],
      toTheVault: A2, deadline: 1n,
    });
    expect(rota.slice(0, 10)).toBe("0x38ed1739");
  });

  it("ATAQUE 3 · trocar o chainId muda o hash — o fork não é a mainnet", () => {
    /* O contrato usa `block.chainid`. Um motor apontado para o fork calculando
       com 137 produz um commitment que a chain do fork recusa, e o erro só
       aparece depois do gás. */
    const p = {
      chainId: 137n, vault: A1, nonce: 7n, configEpoch: 3n, strategy: A2,
      tokenIn: A1, tokenOut: A2, amountIn: 1234567n, lotId: 0n,
    } as const;
    expect(proposalHash(p)).not.toBe(proposalHash({ ...p, chainId: 31337n }));
  });

  it("ATAQUE 4 · trocar target e spender entre si muda o hash", () => {
    /* Em QuickSwap V2 os dois são o mesmo endereço, e por isso um bug que os
       trocasse passaria despercebido no caso feliz. Com endereços diferentes,
       a ordem tem de importar. */
    const a = executionHash(P, { ...base, target: A1, spender: A2, routeCalldata: "0x00" });
    const b = executionHash(P, { ...base, target: A2, spender: A1, routeCalldata: "0x00" });
    expect(a).not.toBe(b);
  });

  it("ATAQUE 5 · rota vazia não é o mesmo que rota ausente", () => {
    /* `keccak256("0x")` é o hash da entrada vazia e tem valor definido. Uma
       implementação que tratasse rota vazia como "pular o campo" produziria
       outro commitment. */
    const comVazia = executionHash(P, { ...base, routeCalldata: "0x" });
    const comUmByte = executionHash(P, { ...base, routeCalldata: "0x00" });
    expect(comVazia).not.toBe(comUmByte);
    expect(comVazia).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("ATAQUE 6 · o path da rota é ordenado, e inverter muda a calldata", () => {
    /* Comprar e vender são o mesmo par em ordens opostas. Um bug que ignorasse
       a ordem faria o cofre comprar quando a estratégia mandou vender. */
    const compra = swapExactTokensForTokens({
      amountIn: 1n, amountOutMin: 1n, path: [A1, A2], toTheVault: A2, deadline: 1n });
    const venda = swapExactTokensForTokens({
      amountIn: 1n, amountOutMin: 1n, path: [A2, A1], toTheVault: A2, deadline: 1n });
    expect(compra).not.toBe(venda);
  });

  /* ── os TRÊS pares, amarrados por construção ─────────────────────────────
     O ataque 7 abaixo achou UM par e parou nele. O Tubarão-branco mediu a
     classe: são três campos que significam a mesma coisa dos dois lados, e
     testar só o primeiro ensina que os outros dois não importam.
     `montarAbertura` recebe UM de cada e escreve nos dois lados — os testes
     abaixo provam que a amarração é real, e não uma promessa de comentário. */
  it("PAR 1 · amountIn vai igual para a rota e para o commitment", () => {
    const m = montarAbertura(ABERTURA);
    /* O `amountIn` aparece na calldata da rota como a primeira palavra depois
       do seletor; se o commitment usasse outro, o cofre aprovaria um tamanho e
       o router executaria outro. */
    const naRota = BigInt("0x" + m.routeCalldata.slice(10, 74));
    expect(naRota).toBe(ABERTURA.amountIn);
    /* E mudar o amountIn muda o commitment — os dois andam juntos. */
    const outro = montarAbertura({ ...ABERTURA, amountIn: ABERTURA.amountIn + 1n });
    expect(outro.executionHash).not.toBe(m.executionHash);
    expect(outro.routeCalldata).not.toBe(m.routeCalldata);
  });

  it("PAR 2 · o PISO vai igual para os dois lados — a promessa ao usuário", () => {
    /* Este é o pior dos três: `operatorMinOut` no commitment e `amountOutMin`
       na rota são a proteção do usuário. Declarada num lugar e aplicada noutro,
       ela não protege — e nenhum guardião reclama, porque os dois valores são
       válidos isoladamente. */
    const m = montarAbertura(ABERTURA);
    const naRota = BigInt("0x" + m.routeCalldata.slice(74, 138));
    expect(naRota).toBe(ABERTURA.minOut);
    const outro = montarAbertura({ ...ABERTURA, minOut: ABERTURA.minOut + 1n });
    expect(outro.executionHash).not.toBe(m.executionHash);
    expect(outro.routeCalldata).not.toBe(m.routeCalldata);
  });

  it("PAR 3 · validUntil e deadline são o mesmo instante", () => {
    /* Divergindo, o cofre acha a proposta válida e o router já expirou: reverte
       depois do gás pago, e o log não diz por quê. */
    const m = montarAbertura(ABERTURA);
    const outro = montarAbertura({ ...ABERTURA, validUntil: ABERTURA.validUntil + 1n });
    expect(outro.executionHash).not.toBe(m.executionHash);
    expect(outro.routeCalldata).not.toBe(m.routeCalldata);
  });

  it("montarAbertura recusa path de um token só", () => {
    expect(() => montarAbertura({ ...ABERTURA, path: [A1] })).toThrow(/pelo menos dois/);
  });

  it("ATAQUE 7 · o amountIn do commitment e o da rota são campos separados", () => {
    /* Nada no tipo obriga os dois a coincidirem. Se divergirem, o cofre aprova
       um tamanho e o router executa outro. Este teste não conserta isso — ele
       DECLARA que a coincidência não é garantida por construção, e é dívida
       para quem montar a submissão. */
    const rota = swapExactTokensForTokens({
      amountIn: 999n, amountOutMin: 1n, path: [A1, A2], toTheVault: A2, deadline: 1n });
    const h = executionHash(P, { ...base, amountIn: 1234567n, routeCalldata: rota });
    /* Monta sem reclamar: o elo aceita a divergência em silêncio. */
    expect(h).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
