/**
 * A rota da V3, e o destino conferido nos BYTES.
 *
 * O `SwapRouter` original foi a escolha ratificada, e não o `SwapRouter02`: o 02
 * removeu o `deadline` da struct, e sem ele o par `validUntil ↔ deadline` perde a
 * contraparte. Três pares amarrados virariam dois, e o conferidor passaria a
 * amarrar contra um campo inexistente sem ninguém notar.
 */
import { describe, expect, it } from "vitest";
import { decodeAbiParameters, encodeAbiParameters, keccak256, type Address, type Hex } from "viem";
import { destinoDaRota, exactInputSingle, montarAbertura } from "./commitment.js";

const VAULT = "0xDd2d59866E20Ed354EaFaB49FdbD6cFce7243508" as Address;
const EXECUTOR = "0x323C4192b269EA56aCd147dDbd3F71056E63E835" as Address;
/* SwapRouter ORIGINAL da Uniswap V3 — o 02 removeu o `deadline` da struct. */
const ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564" as Address;
const USDC = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" as Address;
const WMATIC = "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270" as Address;
const STRATEGY = "0x383fe3b67cFB0B57F77c31d8997946BDE5233466" as Address;

const PARAMS = [
  {
    type: "tuple",
    components: [
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
      { name: "fee", type: "uint24" },
      { name: "recipient", type: "address" },
      { name: "deadline", type: "uint256" },
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMinimum", type: "uint256" },
      { name: "sqrtPriceLimitX96", type: "uint160" },
    ],
  },
] as const;

const ABERTURA = {
  amountIn: 100000n,
  minOut: 710_215_198_863_636_363n,
  validUntil: 1_787_596_000n,
  path: [USDC, WMATIC] as const,
  vault: VAULT,
  executor: EXECUTOR,
  router: ROUTER,
  chainId: 137n,
  nonce: 0n,
  configEpoch: 4n,
  strategy: STRATEGY,
  lotId: 0n,
  declaredRefund: 0n,
} as const;

describe("rota V3 · exactInputSingle", () => {
  it("o seletor é o do SwapRouter original, e o número vem de fora deste arquivo", () => {
    /* `cast sig "exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))"`
       devolve 0x414bf389. Cravado como literal de propósito: se alguém mexer na
       assinatura, o teste tem de quebrar contra a verdade externa e não contra
       uma constante que mudaria junto. */
    const rota = exactInputSingle({
      tokenIn: USDC, tokenOut: WMATIC, fee: 500,
      toTheVault: VAULT, deadline: 1n, amountIn: 1n, amountOutMinimum: 1n,
    });
    expect(rota.slice(0, 10)).toBe("0x414bf389");
  });

  it("os três pares chegam INTEIROS na struct", () => {
    const { routeCalldata } = montarAbertura({ ...ABERTURA, rota: { tipo: "v3", fee: 500 } });
    const [p] = decodeAbiParameters(PARAMS, ("0x" + routeCalldata.slice(10)) as Hex);
    const s = p as {
      tokenIn: string; tokenOut: string; fee: number; recipient: string;
      deadline: bigint; amountIn: bigint; amountOutMinimum: bigint; sqrtPriceLimitX96: bigint;
    };

    expect(s.amountIn, "amountIn ↔ amountIn").toBe(ABERTURA.amountIn);
    expect(s.amountOutMinimum, "operatorMinOut ↔ amountOutMinimum").toBe(ABERTURA.minOut);
    expect(s.deadline, "validUntil ↔ deadline — o par que o SwapRouter02 destruiria").toBe(ABERTURA.validUntil);
    expect(s.tokenIn.toLowerCase()).toBe(USDC.toLowerCase());
    expect(s.tokenOut.toLowerCase()).toBe(WMATIC.toLowerCase());
    expect(s.fee).toBe(500);
    /* Zero, e é decisão: quem protege é o `amountOutMinimum`, que viaja no
       executionHash. Um segundo limite noutra unidade seria um quarto par
       podendo divergir dos outros três. */
    expect(s.sqrtPriceLimitX96, "limite de preço do pool desligado").toBe(0n);
  });

  it("a venda inverte os tokens, e o destino continua o cofre", () => {
    const venda = { ...ABERTURA, path: [WMATIC, USDC] as const, amountIn: 890000000000000000n, minOut: 84_261n };
    const { routeCalldata } = montarAbertura({ ...venda, rota: { tipo: "v3", fee: 500 } });
    const [p] = decodeAbiParameters(PARAMS, ("0x" + routeCalldata.slice(10)) as Hex);
    const s = p as { tokenIn: string; tokenOut: string; recipient: string };

    expect(s.tokenIn.toLowerCase()).toBe(WMATIC.toLowerCase());
    expect(s.tokenOut.toLowerCase()).toBe(USDC.toLowerCase());
    expect(s.recipient.toLowerCase()).toBe(VAULT.toLowerCase());
  });

  it("recusa fee que não cabe em uint24 ou que não é tier", () => {
    const base = {
      tokenIn: USDC, tokenOut: WMATIC, toTheVault: VAULT,
      deadline: 1n, amountIn: 1n, amountOutMinimum: 1n,
    };
    for (const fee of [0, -500, 0x1000000, 500.5]) {
      expect(() => exactInputSingle({ ...base, fee }), `fee ${fee}`).toThrow(/uint24|tier/);
    }
    expect(() => exactInputSingle({ ...base, fee: 500 })).not.toThrow();
    expect(() => exactInputSingle({ ...base, fee: 0xffffff })).not.toThrow();
  });
});

describe("destinoDaRota · o portão que a V3 realmente exercita", () => {
  it("lê o destino das duas rotas", () => {
    const v2 = montarAbertura(ABERTURA);
    const v3 = montarAbertura({ ...ABERTURA, rota: { tipo: "v3", fee: 500 } });

    expect(destinoDaRota(v2.routeCalldata).toLowerCase()).toBe(VAULT.toLowerCase());
    expect(destinoDaRota(v3.routeCalldata).toLowerCase()).toBe(VAULT.toLowerCase());
  });

  it("PEGA a rota que entrega no executor — o erro natural de quem monta a V3", () => {
    /* `recipient = executor` é o erro que se comete sem perceber, porque o
       executor é quem CHAMA. Se sair assim: o swap executa, a saída cai no
       executor, e `BalanceDeltaNonZero` reverte DEPOIS DO GÁS PAGO com uma
       mensagem que fala de saldo e não de destinatário.

       Calldata montada À MÃO com o destino errado — não dá para produzi-la por
       `montarAbertura`, que é justamente o ponto: o portão tem de ler bytes de
       qualquer origem, não só os que este arquivo escreveu. */
    const seletor = keccak256(
      new TextEncoder().encode(
        "exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))",
      ),
    ).slice(0, 10);
    const corpo = encodeAbiParameters(PARAMS, [
      {
        tokenIn: USDC, tokenOut: WMATIC, fee: 500,
        recipient: EXECUTOR, /* <- o defeito */
        deadline: 1n, amountIn: 1n, amountOutMinimum: 1n, sqrtPriceLimitX96: 0n,
      },
    ]);
    const ruim = (seletor + corpo.slice(2)) as Hex;

    expect(destinoDaRota(ruim).toLowerCase()).toBe(EXECUTOR.toLowerCase());
    expect(destinoDaRota(ruim).toLowerCase()).not.toBe(VAULT.toLowerCase());
  });

  it("RECUSA seletor que não sabe ler, em vez de chutar", () => {
    /* Devolver "provavelmente o cofre" para uma rota desconhecida seria pior que
       falhar: o portão passaria a aprovar exatamente o que não consegue ler. */
    expect(() => destinoDaRota("0xdeadbeef" as Hex)).toThrow(/não é nenhuma rota/);
  });

  it("o portão dentro de `montarAbertura` compara contra o cofre, não contra si mesmo", () => {
    /* A verdade (`vault`) entra por parâmetro; quem escreve os bytes é o
       codificador e quem os lê é o decodificador. Se os dois concordassem por
       construção, trocar dois campos de lugar passaria — e não passa, porque o
       teste dos três pares acima lê nomes e não posições. */
    const m = montarAbertura({ ...ABERTURA, rota: { tipo: "v3", fee: 500 } });
    expect(destinoDaRota(m.routeCalldata).toLowerCase()).toBe(ABERTURA.vault.toLowerCase());
  });

  it("o executionHash MUDA entre V2 e V3 com os mesmos três pares", () => {
    /* A rota entra no `executionHash`. Se ele não mudasse, uma proposta montada
       para a V2 seria aceita executando na V3 e vice-versa. */
    const v2 = montarAbertura(ABERTURA);
    const v3 = montarAbertura({ ...ABERTURA, rota: { tipo: "v3", fee: 500 } });

    expect(v3.executionHash).not.toBe(v2.executionHash);
    /* E o `proposalHash` NÃO muda: ele é sobre o que a estratégia propôs, que é
       o mesmo dos dois lados. Confundir os dois faria a troca de venue parecer
       troca de proposta. */
    expect(v3.proposalHash).toBe(v2.proposalHash);
  });

  it("tier diferente é rota diferente — e o hash sabe disso", () => {
    const t500 = montarAbertura({ ...ABERTURA, rota: { tipo: "v3", fee: 500 } });
    const t3000 = montarAbertura({ ...ABERTURA, rota: { tipo: "v3", fee: 3000 } });

    /* Na V3 o mesmo par existe em vários tiers com profundidades diferentes por
       ordens de grandeza. Escolher o tier errado é escolher outra pool com o
       mesmo nome, e o hash tem de distinguir. */
    expect(t3000.executionHash).not.toBe(t500.executionHash);
  });
});
