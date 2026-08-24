/**
 * Os vetores abaixo NÃO foram gerados por este arquivo.
 *
 * Eles vêm de `scripts/check-commitment.mjs`, que compila um contrato de teste
 * chamando `Commitment.sol` REAL e compara a saída do `forge` com a do cliente.
 * Comparar este módulo contra eles é comparar contra o `solc` — comparar contra
 * uma segunda implementação nossa mediria consistência, não correção, e esse é
 * o defeito que este repositório já pagou para aprender.
 *
 * Se um destes falhar, a submissão do motor reverteria com `CommitmentMismatch`
 * na chain, depois do gás pago.
 */
import { describe, expect, it } from "vitest";
import { keccak256 } from "viem";
import { executionHash, proposalHash, swapExactTokensForTokens } from "./commitment.js";

/* O mesmo CASO de scripts/check-commitment.mjs, campo a campo. */
const CASO = {
  chainId: 137n,
  vault: "0xdbcc3fb13652451739008aeef0d1110863ac6d10",
  nonce: 7n,
  configEpoch: 3n,
  strategy: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6",
  tokenIn: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
  tokenOut: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619",
  amountIn: 1234567n,
  lotId: 0n,
  executor: "0x323C4192b269EA56aCd147dDbd3F71056E63E835",
  target: "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff",
  spender: "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff",
  operatorMinOut: 998877n,
  validUntil: 1900000000n,
  declaredRefund: 1000000n,
  /* Escrita inteira e não concatenada: o `tsc` recusou a concatenação porque
     `Hex` é `0x${string}` e uma soma de strings devolve `string`. A recusa está
     certa — é o tipo impedindo que qualquer texto chegue onde só calldata
     deveria. */
  routeCalldata:
    "0x38ed1739000000000000000000000000000000000000000000000000000000000012d68700000000000000000000000000000000000000000000000000000000000f4240",
} as const;

/* Os dois valores que o forge imprimiu, chamando a biblioteca real. */
const DO_SOLC = {
  proposta: "0xdfbcbea8aa397604855c62d5c813cd0ddabce1dce98adb6b1087028eafa53d30",
  execucao: "0x5303f49ede8e6698728fc78c3546b283315464f42309c78813fe9321e60366f5",
} as const;

describe("commitment — contra a biblioteca compilada, não contra nós mesmos", () => {
  it("proposalHash reproduz o que Commitment.proposalHash calcula no solc", () => {
    const nosso = proposalHash({
      chainId: CASO.chainId, vault: CASO.vault, nonce: CASO.nonce,
      configEpoch: CASO.configEpoch, strategy: CASO.strategy,
      tokenIn: CASO.tokenIn, tokenOut: CASO.tokenOut,
      amountIn: CASO.amountIn, lotId: CASO.lotId,
    });
    expect(nosso).toBe(DO_SOLC.proposta);
  });

  it("executionHash reproduz o que Commitment.executionHash calcula no solc", () => {
    const nosso = executionHash(DO_SOLC.proposta, {
      executor: CASO.executor, target: CASO.target, spender: CASO.spender,
      amountIn: CASO.amountIn, operatorMinOut: CASO.operatorMinOut,
      validUntil: CASO.validUntil, declaredRefund: CASO.declaredRefund,
      routeCalldata: CASO.routeCalldata,
    });
    expect(nosso).toBe(DO_SOLC.execucao);
  });

  it("a rota entra pelo HASH, e não por inteiro", () => {
    /* Se `executionHash` passasse a rota completa em vez do hash dela, este
       teste passaria por acidente quando a rota coubesse em 32 bytes. Duas
       rotas de mesmo tamanho e conteúdo diferente têm de dar hashes
       diferentes. */
    const base = {
      executor: CASO.executor, target: CASO.target, spender: CASO.spender,
      amountIn: CASO.amountIn, operatorMinOut: CASO.operatorMinOut,
      validUntil: CASO.validUntil, declaredRefund: CASO.declaredRefund,
    };
    const a = executionHash(DO_SOLC.proposta, { ...base, routeCalldata: "0xdeadbeef" });
    const b = executionHash(DO_SOLC.proposta, { ...base, routeCalldata: "0xdeadbeef00" });
    expect(a).not.toBe(b);
  });

  it("um bit a mais no nonce muda o proposalHash", () => {
    const p = {
      chainId: CASO.chainId, vault: CASO.vault, nonce: CASO.nonce,
      configEpoch: CASO.configEpoch, strategy: CASO.strategy,
      tokenIn: CASO.tokenIn, tokenOut: CASO.tokenOut,
      amountIn: CASO.amountIn, lotId: CASO.lotId,
    };
    /* O cofre incrementa o nonce a cada execução. Montar com um nonce velho e
       submeter é a forma mais provável de errar, e tem de doer aqui. */
    expect(proposalHash({ ...p, nonce: CASO.nonce + 1n })).not.toBe(DO_SOLC.proposta);
  });

  it("a rota de swap V2 carrega o seletor real e aponta para o cofre", () => {
    const rota = swapExactTokensForTokens({
      amountIn: 1234567n, amountOutMin: 998877n,
      path: [CASO.tokenIn, CASO.tokenOut],
      toTheVault: CASO.vault, deadline: 1900000000n,
    });
    /* 0x38ed1739 é o seletor conhecido de swapExactTokensForTokens; ele foi
       medido, não digitado — vem do keccak da assinatura. */
    expect(rota.slice(0, 10)).toBe("0x38ed1739");
    /* O DESTINO é o cofre. Se um dia alguém trocar por `executor`, a chain
       reverte com BalanceDeltaNonZero depois do gás pago — e este teste é mais
       barato que descobrir lá. */
    expect(rota.toLowerCase()).toContain(CASO.vault.slice(2).toLowerCase());
  });

  it("o seletor sai do keccak da assinatura, e não de constante digitada", () => {
    const daAssinatura = keccak256(
      new TextEncoder().encode(
        "swapExactTokensForTokens(uint256,uint256,address[],address,uint256)",
      ),
    ).slice(0, 10);
    expect(daAssinatura).toBe("0x38ed1739");
  });
});
