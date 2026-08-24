/**
 * O estado e o Intent destes testes são os MEDIDOS na chain em 2026-08-24
 * contra o cofre `0xDd2d…3508` de Polygon 137, não inventados.
 */
import { describe, expect, it } from "vitest";
import { decodeFunctionData, parseAbi } from "viem";
import {
  decisaoDeSubmeter, montarSubmissao, submeterAbertura,
  type CarteiraClient, type EscolhasDoSubmissor,
} from "./submissao.js";
import type { EstadoDoCofre, Intent } from "./leitura.js";

const VAULT = "0xDd2d59866E20Ed354EaFaB49FdbD6cFce7243508";
const STRATEGY = "0x383fe3b67cFB0B57F77c31d8997946BDE5233466";
const ROUTER = "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff";  /* QuickSwap v2 */
const EXECUTOR = "0x323C4192b269EA56aCd147dDbd3F71056E63E835";
const USDC = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
const WMATIC = "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270";

/* Lido da chain: nonce 0, configEpoch 4, strategy apontada. */
const ESTADO: EstadoDoCofre = { nonce: 0n, configEpoch: 4n, strategy: STRATEGY };

/* O Intent que a ExampleStrategy propõe quando há saldo (registro de 2026-08-22). */
const INTENT: Intent = {
  side: 0,               /* compra */
  asset: WMATIC,
  base: USDC,
  amountIn: 100000n,     /* 0,1 USDC */
  minOut: 890000000000000000n,
  lotId: 0n,
};

const ESCOLHAS: EscolhasDoSubmissor = {
  executor: EXECUTOR,
  router: ROUTER,
  agora: 1_756_000_000n,
  janela: 600n,          /* 10 min, dentro do maxValidity de 900 s */
};

/**
 * O lote SUGERIDO é DIFERENTE do `intent.lotId` de propósito.
 *
 * A primeira versão destes testes usava zero nos dois, copiando o estado real da
 * chain — e por isso não via que `montarSubmissao` estava mandando o lote
 * devolvido no lugar do sugerido. O dado real escondeu o defeito, e só o red
 * team o achou. Dois valores distintos aqui é o que impede a cegueira voltar.
 */
const LOTE_SUGERIDO = 7n;

const routerAbi = parseAbi([
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[])",
]);

const montar = () =>
  montarSubmissao({ chainId: 137n, vault: VAULT, estado: ESTADO, intent: INTENT, candidateLotId: LOTE_SUGERIDO, escolhas: ESCOLHAS });

describe("montarSubmissao", () => {
  it("os 14 campos são exatamente os do struct do contrato, por NOME", () => {
    /* Lido de `contracts/src/vault/types/ExecutionParams.sol:20-35`. Um campo a
       mais ou a menos aqui é `execute` revertendo por decodificação. */
    const doContrato = [
      "executor", "target", "spender", "base", "operatorMinOut", "validUntil",
      "declaredConfigEpoch", "declaredRefund", "declaredGas", "declaredGasPrice",
      "declaredQuote", "candidateLotId", "routeCalldata", "executionHash",
    ];
    const p = montar().params;
    expect(Object.keys(p).sort()).toEqual([...doContrato].sort());
    expect(doContrato).toHaveLength(14);
    expect(p.executor).toBe(EXECUTOR);
    expect(p.target).toBe(ROUTER);
    expect(p.spender).toBe(ROUTER);
    expect(p.base).toBe(USDC);
    expect(p.validUntil).toBe(1_756_000_600n);
    expect(p.declaredConfigEpoch).toBe(4n);
  });

  it("o `candidateLotId` enviado é o SUGERIDO, não o que a estratégia devolveu", () => {
    /* `VaultExecution:67` pergunta à estratégia com `p.candidateLotId`; `:381`
       monta o hash com `intent.lotId`. São dois valores e o contrato usa cada um
       num lugar. Igualá-los faz o cofre perguntar com uma sugestão diferente da
       simulada, a estratégia responder outra coisa, e o hash recomputado não
       bater — `CommitmentMismatch` depois do gás pago. */
    const s = montar();
    expect(LOTE_SUGERIDO, "os dois têm de diferir, senão o teste é cego").not.toBe(INTENT.lotId);
    expect(s.params.candidateLotId, "mandou o devolvido no lugar do sugerido").toBe(LOTE_SUGERIDO);
    expect(s.params.candidateLotId).not.toBe(INTENT.lotId);
  });

  it("PAR · o piso do struct é o MESMO que foi para a rota", () => {
    /* O pior dos três pares: o piso prometido ao usuário declarado num lugar e
       aplicado noutro. Aqui os dois saem de `intent.minOut`. */
    const s = montar();
    const { args } = decodeFunctionData({ abi: routerAbi, data: s.routeCalldata });
    expect(args[1], "amountOutMin da rota").toBe(INTENT.minOut);
    expect(s.params.operatorMinOut, "operatorMinOut do struct").toBe(INTENT.minOut);
    expect(s.params.operatorMinOut).toBe(args[1]);
  });

  it("PAR · o `amountIn` do struct e o da rota são o mesmo", () => {
    const s = montar();
    const { args } = decodeFunctionData({ abi: routerAbi, data: s.routeCalldata });
    expect(args[0]).toBe(INTENT.amountIn);
  });

  it("PAR · o prazo do struct e o `deadline` da rota são o mesmo", () => {
    const s = montar();
    const { args } = decodeFunctionData({ abi: routerAbi, data: s.routeCalldata });
    expect(args[4], "deadline da rota").toBe(s.params.validUntil);
  });

  it("o destino da rota é o COFRE, não o executor", () => {
    /* `Executor.run` exige que os saldos dele voltem ao baseline. Uma rota
       apontada para o executor reverte depois do gás pago. */
    const { args } = decodeFunctionData({ abi: routerAbi, data: montar().routeCalldata });
    expect(args[3]).toBe(VAULT);
  });

  it("compra e venda invertem o `path`", () => {
    const compra = montar();
    const venda = montarSubmissao({
      chainId: 137n, vault: VAULT, estado: ESTADO,
      intent: { ...INTENT, side: 1 }, candidateLotId: LOTE_SUGERIDO, escolhas: ESCOLHAS,
    });
    const pc = decodeFunctionData({ abi: routerAbi, data: compra.routeCalldata }).args[2];
    const pv = decodeFunctionData({ abi: routerAbi, data: venda.routeCalldata }).args[2];
    expect(pc, "compra paga com a base").toEqual([USDC, WMATIC]);
    expect(pv, "venda entrega o ativo").toEqual([WMATIC, USDC]);
  });

  it("não há parâmetro por onde um `executionHash` forasteiro entre", () => {
    /* Condição escrita pelo juiz: quem submete CHAMA `montarAbertura`. Se um dia
       alguém acrescentar um campo de hash aqui, este teste falha por tipo — e o
       comentário explica por quê antes de alguém "consertar" o teste. */
    const chaves = Object.keys({ chainId: 0, vault: 0, estado: 0, intent: 0, escolhas: 0 });
    expect(chaves).not.toContain("executionHash");
    expect(chaves).not.toContain("proposalHash");
    /* E os hashes SAEM, provando que foram calculados aqui dentro. */
    const s = montar();
    expect(s.executionHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(s.proposalHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(s.params.executionHash, "o hash do struct é o calculado").toBe(s.executionHash);
  });

  it("`amountIn` zero é recusado — é o estado do cofre HOJE", () => {
    /* Saldo 0 USDC medido na chain em 2026-08-24: a estratégia propõe zero e o
       cofre reverte com `AmountQuantizedToZero`. Custa gás descobrir isso lá. */
    expect(() =>
      montarSubmissao({ chainId: 137n, vault: VAULT, estado: ESTADO, candidateLotId: LOTE_SUGERIDO,
        intent: { ...INTENT, amountIn: 0n }, escolhas: ESCOLHAS }),
    ).toThrow(/AmountQuantizedToZero/);
  });

  it("`side` fora de {0,1} é recusado em vez de virar venda calada", () => {
    /* `Side` do contrato só tem 0 e 1. Tratar 9 como venda inverteria o `path`
       sem avisar ninguém. */
    for (const side of [2, 9, -1]) {
      expect(() =>
        montarSubmissao({ chainId: 137n, vault: VAULT, estado: ESTADO, candidateLotId: LOTE_SUGERIDO,
          intent: { ...INTENT, side }, escolhas: ESCOLHAS }),
      ).toThrow(/side/);
    }
  });

  it("janela não-positiva é recusada antes de gastar gás", () => {
    for (const janela of [0n, -1n]) {
      expect(() =>
        montarSubmissao({ chainId: 137n, vault: VAULT, estado: ESTADO, intent: INTENT, candidateLotId: LOTE_SUGERIDO,
          escolhas: { ...ESCOLHAS, janela } }),
      ).toThrow(/janela/);
    }
  });

  it("mudar o nonce muda os dois hashes", () => {
    /* O cofre recalcula com o nonce DELE no instante da execução. Ler cedo e
       submeter tarde produz `CommitmentMismatch` depois do gás pago. */
    const a = montar();
    const b = montarSubmissao({ chainId: 137n, vault: VAULT, intent: INTENT, candidateLotId: LOTE_SUGERIDO, escolhas: ESCOLHAS,
      estado: { ...ESTADO, nonce: 1n } });
    expect(b.proposalHash).not.toBe(a.proposalHash);
    expect(b.executionHash).not.toBe(a.executionHash);
  });
});

describe("decisaoDeSubmeter · a porta antes da porta", () => {
  const comum = {
    chainId: 137, simulacaoOk: true, estado: ESTADO,
    maxValidity: 900n, agoraDaChain: ESCOLHAS.agora,
    env: { TRIVIU_PRIVATE_KEY: "0x01", TRIVIU_I_ACCEPT_THE_RISK: "yes" },
  };

  it("dry_run fecha a porta — é o padrão", () => {
    const d = decisaoDeSubmeter({ ...comum, dryRun: true, submissao: montar() });
    expect(d.allowed).toBe(false);
    expect(d.reason).toContain("dry_run");
  });

  it("sem simulação passando, não sai", () => {
    const d = decisaoDeSubmeter({ ...comum, dryRun: false, simulacaoOk: false, submissao: montar() });
    expect(d.allowed).toBe(false);
    expect(d.reason).toContain("simulation");
  });

  it("mainnet sem o reconhecimento de risco não sai", () => {
    const d = decisaoDeSubmeter({ ...comum, dryRun: false, submissao: montar(),
      env: { TRIVIU_PRIVATE_KEY: "0x01" } });
    expect(d.allowed).toBe(false);
    expect(d.reason).toContain("TRIVIU_I_ACCEPT_THE_RISK");
  });

  it("janela maior que o `maxValidity` do cofre é barrada AQUI, não na chain", () => {
    /* Sem esta porta, o cofre reverte com ValidityTooLong depois do gás pago. */
    const larga = montarSubmissao({ chainId: 137n, vault: VAULT, estado: ESTADO, intent: INTENT, candidateLotId: LOTE_SUGERIDO,
      escolhas: { ...ESCOLHAS, janela: 1200n } });
    const d = decisaoDeSubmeter({ ...comum, dryRun: false, submissao: larga });
    expect(d.allowed).toBe(false);
    expect(d.reason).toContain("ValidityTooLong");
    expect(d.reason).toContain("900");
  });

  it("configEpoch que mudou entre a leitura e o envio é barrado", () => {
    const d = decisaoDeSubmeter({ ...comum, dryRun: false, submissao: montar(),
      estado: { ...ESTADO, configEpoch: 5n } });
    expect(d.allowed).toBe(false);
    expect(d.reason).toContain("ConfigEpochStale");
  });

  it("RELÓGIO · leitura velha é vista, porque a porta compara com a chain", () => {
    /* A versão anterior recebia `agora` e o chamador passava o MESMO número dos
       dois lados, então `validUntil - agora` era sempre a janela e a porta ficava
       cega. O red team montou com o relógio 1 hora atrasado, a proposta já estava
       expirada na chain, e a porta abriu. */
    const velha = montarSubmissao({ chainId: 137n, vault: VAULT, estado: ESTADO, intent: INTENT,
      candidateLotId: LOTE_SUGERIDO, escolhas: { ...ESCOLHAS, agora: ESCOLHAS.agora - 3600n } });
    const d = decisaoDeSubmeter({ ...comum, dryRun: false, submissao: velha });
    expect(d.allowed).toBe(false);
    expect(d.reason).toContain("atrasado");
    expect(d.reason).toContain("3600");
  });

  it("RELÓGIO · adiantado também é visto, e a recusa diz qual dos dois foi", () => {
    const adiantada = montarSubmissao({ chainId: 137n, vault: VAULT, estado: ESTADO, intent: INTENT,
      candidateLotId: LOTE_SUGERIDO, escolhas: { ...ESCOLHAS, agora: ESCOLHAS.agora + 1800n } });
    const d = decisaoDeSubmeter({ ...comum, dryRun: false, submissao: adiantada });
    expect(d.allowed).toBe(false);
    expect(d.reason).toContain("adiantado");
  });

  it("desvio dentro da tolerância passa — a porta não é paranoica", () => {
    const quaseIgual = montarSubmissao({ chainId: 137n, vault: VAULT, estado: ESTADO, intent: INTENT,
      candidateLotId: LOTE_SUGERIDO, escolhas: { ...ESCOLHAS, agora: ESCOLHAS.agora - 30n } });
    const d = decisaoDeSubmeter({ ...comum, dryRun: false, submissao: quaseIgual });
    expect(d.allowed, d.reason).toBe(true);
  });

  it("com tudo aberto, deixa passar E entrega a autorização", () => {
    const d = decisaoDeSubmeter({ ...comum, dryRun: false, submissao: montar() });
    expect(d.allowed).toBe(true);
    if (!d.allowed) return;
    expect(d.autorizacao.submissao, "a submissão viaja dentro da autorização").toBeTruthy();
  });

  it("recusa NÃO entrega autorização — senão a porta seria decorativa", () => {
    const d = decisaoDeSubmeter({ ...comum, dryRun: true, submissao: montar() });
    expect(d.allowed).toBe(false);
    expect(d as unknown as Record<string, unknown>).not.toHaveProperty("autorizacao");
  });
});

describe("submeterAbertura · a chave privada", () => {
  const CHAVE = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

  /**
   * A autorização só nasce da porta. Não há construtor público, e é isso que
   * impede o que o red team fez: enviar sem consultar `dry_run` nem a simulação.
   */
  function autorizar() {
    const d = decisaoDeSubmeter({
      dryRun: false, chainId: 31337, simulacaoOk: true, estado: ESTADO,
      submissao: montar(), maxValidity: 900n, agoraDaChain: ESCOLHAS.agora,
      env: { TRIVIU_PRIVATE_KEY: "0x01" },
    });
    if (!d.allowed) throw new Error(`a porta não abriu no preparo do teste: ${d.reason}`);
    return d.autorizacao;
  }

  /* `.catch(e => e)` devolveria união de tipos E passaria calado se a promessa
     resolvesse em vez de lançar. Este exige a exceção. */
  async function oErroDe(p: Promise<unknown>): Promise<Error> {
    try {
      await p;
    } catch (e) {
      return e as Error;
    }
    throw new Error("esperava uma exceção e não veio nenhuma");
  }

  function carteiraQueFalha(erro: unknown): CarteiraClient {
    return { async writeContract() { throw erro; } };
  }

  it("sem autorização, recusa com a razão — e não com um TypeError", async () => {
    /* O tipo já barra em TypeScript; o red team precisou de `@ts-expect-error`
       para tentar. Isto cobre quem chamar de JS puro. */
    const e = await oErroDe(
      submeterAbertura({
        vault: VAULT, chainId: 31337, rpcUrl: "http://127.0.0.1:1",
        env: { TRIVIU_PRIVATE_KEY: CHAVE },
      } as unknown as Parameters<typeof submeterAbertura>[0]),
    );
    expect(e.message).toContain("decisaoDeSubmeter");
    expect(e.message).not.toContain("Cannot read properties");
  });

  it("sem chave no ambiente, recusa e diz onde a chave NÃO mora", async () => {
    await expect(
      submeterAbertura({ vault: VAULT, chainId: 137, rpcUrl: "http://127.0.0.1:1",
        autorizacao: autorizar(), env: {} }),
    ).rejects.toThrow(/never lives in the repo/);
  });

  it("mainnet sem reconhecimento de risco recusa mesmo com chave", async () => {
    await expect(
      submeterAbertura({ vault: VAULT, chainId: 137, rpcUrl: "http://127.0.0.1:1",
        autorizacao: autorizar(), env: { TRIVIU_PRIVATE_KEY: CHAVE } }),
    ).rejects.toThrow(/TRIVIU_I_ACCEPT_THE_RISK/);
  });

  it("LEI #1 · a chave privada não aparece no erro que sobe", async () => {
    const erro = new Error("execution reverted");
    const e = await oErroDe(submeterAbertura({
      vault: VAULT, chainId: 31337, rpcUrl: "http://127.0.0.1:1", autorizacao: autorizar(),
      env: { TRIVIU_PRIVATE_KEY: CHAVE }, client: carteiraQueFalha(erro),
    }));
    expect(e.message, "a chave vazou").not.toContain(CHAVE.slice(2));
    expect(e.message).toContain(VAULT);
  });

  it("LEI #1 · a URL do RPC não aparece no erro que sobe", async () => {
    const CHAVE_RPC = "SEGREDO_DO_PROVEDOR";
    const erro = new Error(`HTTP request failed.\n\nURL: https://polygon-mainnet.g.alchemy.com/v2/${CHAVE_RPC}`);
    const e = await oErroDe(submeterAbertura({
      vault: VAULT, chainId: 31337, rpcUrl: `https://polygon-mainnet.g.alchemy.com/v2/${CHAVE_RPC}`,
      autorizacao: autorizar(), env: { TRIVIU_PRIVATE_KEY: CHAVE }, client: carteiraQueFalha(erro),
    }));
    expect(e.message).not.toContain(CHAVE_RPC);
    expect(e.message).toContain("[url removida]");
  });

  it("o erro NÃO carrega `cause` — o original é o que traz a URL", async () => {
    const erro = new Error("qualquer coisa");
    const e = await oErroDe(submeterAbertura({
      vault: VAULT, chainId: 31337, rpcUrl: "http://127.0.0.1:1", autorizacao: autorizar(),
      env: { TRIVIU_PRIVATE_KEY: CHAVE }, client: carteiraQueFalha(erro),
    }));
    expect(e.cause).toBeUndefined();
  });

  it("envia UM struct com os 14 campos, e o hash é o montado", async () => {
    let visto: readonly unknown[] = [];
    const client: CarteiraClient = {
      async writeContract(a) { visto = a.args; return "0xfeed" as const; },
    };
    const s = montar();
    const tx = await submeterAbertura({
      vault: VAULT, chainId: 31337, rpcUrl: "http://127.0.0.1:1", autorizacao: autorizar(), env: { TRIVIU_PRIVATE_KEY: CHAVE }, client,
    });
    expect(tx).toBe("0xfeed");
    expect(visto, "o `execute` do cofre recebe UM argumento: o struct").toHaveLength(1);
    const enviado = visto[0] as Record<string, unknown>;
    expect(Object.keys(enviado)).toHaveLength(14);
    expect(enviado["executionHash"], "o hash enviado é o que `montarAbertura` calculou").toBe(s.executionHash);
    expect(enviado["operatorMinOut"], "o piso enviado é o da estratégia").toBe(INTENT.minOut);
  });
});
