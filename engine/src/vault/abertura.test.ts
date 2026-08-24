/**
 * Os números vêm de medição, não de invenção: o estado do cofre foi lido da chain
 * em 2026-08-24, e a tabela de tolerância impossível foi verificada contra o
 * código antes de virar teste.
 */
import { describe, expect, it } from "vitest";
import { decodeFunctionData, parseAbi } from "viem";
import {
  pisoDaProfundidade, pisoDoOperador, prepararAbertura, tetoDoTicket, toleranciaAlcancavel,
  TOLERANCIA_P99_BPS,
  type PedidoDeAbertura, type ProfundidadeDaPool,
} from "./abertura.js";
import { cycleOut, type Hop } from "../graph/dimensionar.js";
import type { Intent, VaultClient } from "./leitura.js";

const VAULT = "0xDd2d59866E20Ed354EaFaB49FdbD6cFce7243508";
const STRATEGY = "0x383fe3b67cFB0B57F77c31d8997946BDE5233466";
const ROUTER = "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff";
const EXECUTOR = "0x323C4192b269EA56aCd147dDbd3F71056E63E835";
const USDC = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
const WMATIC = "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270";

const AGORA = 1_756_000_000n;

const routerAbi = parseAbi([
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[])",
]);

/* Estado real do cofre em 2026-08-24: nonce 0, configEpoch 4, estratégia apontada. */
const RESPOSTAS = {
  nonce: 0n,
  configEpoch: 4n,
  strategy: STRATEGY,
  /* o Intent que a ExampleStrategy propõe quando há saldo */
  dryRunChecks: [0, WMATIC, USDC, 100000n, 890000000000000000n, 0n],
};

function cliente(respostas: Record<string, unknown>): VaultClient {
  return {
    async readContract({ functionName }) {
      const r = respostas[functionName];
      if (r instanceof Error) throw r;
      return r;
    },
  };
}

const PEDIDO: PedidoDeAbertura = {
  vault: VAULT,
  base: USDC,
  chainId: 137n,
  candidateLotId: 7n,
  escolhas: { executor: EXECUTOR, router: ROUTER, agora: AGORA, janela: 600n },
  maxValidity: 900n,
  agoraDaChain: AGORA,
  env: { TRIVIU_PRIVATE_KEY: "0x01", TRIVIU_I_ACCEPT_THE_RISK: "yes" },
};

describe("guarda · tolerância impossível", () => {
  it("recusa tolerância menor que a taxa da pool — em QUALQUER tamanho", () => {
    /* `x/Ri = 1/(1−L) − 1/γ` fica NEGATIVO quando L ≤ (1−γ): a taxa sozinha já
       come a tolerância inteira. Sem esta guarda a estratégia reverte 100% das
       vezes e o log diz "slippage" quando o problema é aritmético. */
    expect(toleranciaAlcancavel(10, 0.997), "0,10% numa pool de 0,30%").toBe(false);
    expect(toleranciaAlcancavel(10, 0.99), "0,10% numa pool de 1,00%").toBe(false);
    expect(toleranciaAlcancavel(30, 0.997), "0,30% numa pool de 0,30% — empate, não sobra nada").toBe(false);
  });

  it("aceita tolerância que sobrevive à taxa", () => {
    expect(toleranciaAlcancavel(10, 0.9995), "0,10% numa pool de 0,05%").toBe(true);
    expect(toleranciaAlcancavel(575, 0.997), "5,75% numa pool de 0,30%").toBe(true);
  });

  it("o teto do ticket reproduz a fração medida", () => {
    /* Verificado contra o código antes de virar teste: L=5,75% com γ=0,997 dá
       5,7999% da reserva. */
    const frac = tetoDoTicket(1_000_000, 575, 0.997) / 1_000_000;
    expect(frac).toBeCloseTo(0.057999, 6);
    /* E é zero, não negativo, quando é impossível — quem chamar não recebe um
       teto negativo para comparar. */
    expect(tetoDoTicket(1_000_000, 10, 0.997)).toBe(0);
  });

  it("o piso do operador NÃO nasce quando a tolerância é impossível", () => {
    const hop: Hop = { gamma: 0.997, reserveIn: 1e6, reserveOut: 2.5e6 };
    const r = pisoDoOperador({ amountIn: 1000, hop, toleranciaBps: 10 });
    expect(r.alcancavel).toBe(false);
    expect(r.minOut, "zero, e não um piso que passaria por acidente").toBe(0);
  });
});

describe("piso do operador · vem da profundidade, não de constante", () => {
  const hop: Hop = { gamma: 0.997, reserveIn: 1e6, reserveOut: 2.5e6 };

  it("é o esperado da pool menos a tolerância", () => {
    const r = pisoDoOperador({ amountIn: 1000, hop, toleranciaBps: 100 });
    const esperado = cycleOut(1000, [hop]);
    expect(r.alcancavel).toBe(true);
    expect(r.minOut).toBeCloseTo(esperado * 0.99, 9);
  });

  it("um hop é IDÊNTICO ao swap de produto constante", () => {
    /* Compara contra a fórmula canônica, não contra si mesmo. `cycleOut` estava
       provado por álgebra e NÃO exercitado: os vetores têm mínimo de 2 hops. */
    for (const x of [1, 1e3, 5e5, 2e6]) {
      const direto = (hop.gamma * x * hop.reserveOut) / (hop.reserveIn + hop.gamma * x);
      expect(cycleOut(x, [hop]) / direto).toBeCloseTo(1, 12);
    }
  });

  it("ticket maior aperta o piso — porque a derrapagem cresce", () => {
    const pequeno = pisoDoOperador({ amountIn: 1000, hop, toleranciaBps: 100 });
    const grande = pisoDoOperador({ amountIn: 100_000, hop, toleranciaBps: 100 });
    /* O piso absoluto sobe (compra-se mais), mas por unidade cai. */
    expect(grande.minOut / 100_000).toBeLessThan(pequeno.minOut / 1000);
  });
});

describe("piso apertado · o motor protegendo melhor que o contrato", () => {
  /* WMATIC/USDC com reservas plausíveis: 500k USDC contra 4,72M WMATIC a
     POL ≈ US$ 0,1059. Unidades INTEIRAS, como `monitor/pools.ts` as produz. */
  const POOL_CERTA: ProfundidadeDaPool = {
    pool: "0x0000000000000000000000000000000000000AAA",
    tokenIn: USDC, tokenOut: WMATIC,
    decimalsIn: 6, decimalsOut: 18,
    hop: { gamma: 0.997, reserveIn: 500_000, reserveOut: 4_721_435 },
    toleranciaBps: 100,
  };
  const INTENT_COMPRA: Intent = {
    side: 0, asset: WMATIC, base: USDC,
    amountIn: 100000n, minOut: 890000000000000000n, lotId: 0n,
  };

  /* A MESMA pool vista pela venda: entra WMATIC, sai USDC, e as casas viram
     junto (18 -> 6). POL a US$ 0,13 para a venda de 0,89 WMATIC superar com folga
     os 0,1 USDC que a estratégia exige — a faixa em que o aperto acontece. */
  const POOL_VENDA: ProfundidadeDaPool = {
    pool: "0x0000000000000000000000000000000000000BBB",
    tokenIn: WMATIC, tokenOut: USDC,
    decimalsIn: 18, decimalsOut: 6,
    hop: { gamma: 0.997, reserveIn: 4_721_435, reserveOut: 613_786 },
    toleranciaBps: 100,
  };

  it("APERTA acima do piso fixo da estratégia", () => {
    const r = pisoDaProfundidade(INTENT_COMPRA, POOL_CERTA);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    /* A estratégia declara 0,89 WMATIC por 0,1 USDC — 8,9 por USDC. A pool real
       entrega ~9,44, então 1% de tolerância deixa o piso acima do fixo. */
    expect(r.piso).toBeGreaterThan(INTENT_COMPRA.minOut);
    /* O esperado vem da FÓRMULA canônica, não de um número que eu estimei: a
       primeira versão deste teste trazia 0,9349 calculado de cabeça, e o valor
       real é 0,93204. O erro estava na minha conta, não no código. */
    const { gamma, reserveIn, reserveOut } = POOL_CERTA.hop;
    const x = 0.1;
    const canonico = (gamma * x * reserveOut) / (reserveIn + gamma * x);
    expect(Number(r.piso) / 1e18).toBeCloseTo(canonico * 0.99, 9);
  });

  it("RECUSA profundidade da POOL ERRADA — o número plausível e falso", () => {
    /* O motor vigia WMATIC/USDC.e e o cofre negocia WMATIC/USDC NATIVO. Um piso
       tirado da pool errada tem a ordem de grandeza certa e está errado. */
    const USDCe = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
    const r = pisoDaProfundidade(INTENT_COMPRA, { ...POOL_CERTA, tokenIn: USDCe });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.porque).toContain(USDCe);
    expect(r.porque).toContain("errada");
  });

  it("RECUSA tolerância inalcançável em vez de devolver piso impossível", () => {
    const r = pisoDaProfundidade(INTENT_COMPRA, { ...POOL_CERTA, toleranciaBps: 10 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.porque).toContain("inalcançável");
  });

  it("RECUSA decimais fora da faixa 1..18 que o COFRE aceita", () => {
    /* O red team mediu: `decimalsOut = 77` produzia um piso de 77 dígitos, sem
       erro nenhum. O próprio cofre valida 1..18 em `_readDecimals`; o motor
       aceitava qualquer coisa. É a família da pool errada — número que existe,
       tem forma, e está errado por ordens de grandeza. */
    for (const patch of [{ decimalsOut: 77 }, { decimalsIn: 0 }, { decimalsOut: 19 }, { decimalsIn: 6.5 }]) {
      const r = pisoDaProfundidade(INTENT_COMPRA, { ...POOL_CERTA, ...patch });
      expect(r.ok, JSON.stringify(patch)).toBe(false);
      if (r.ok) continue;
      expect(r.porque).toContain("1..18");
    }
    /* E os válidos continuam passando — a guarda não pode recusar o normal. */
    expect(pisoDaProfundidade(INTENT_COMPRA, { ...POOL_CERTA, decimalsIn: 6, decimalsOut: 18 }).ok).toBe(true);
  });

  it("UMA implementação do piso — `pisoDaProfundidade` usa `pisoDoOperador`", () => {
    /* Eram duas contas iguais em lugares diferentes, e os 5 testes de
       `pisoDoOperador` cobriam a que NÃO rodava. Agora batem por construção: se
       divergirem, é porque alguém reintroduziu a duplicata. */
    const r = pisoDaProfundidade(INTENT_COMPRA, POOL_CERTA);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const direto = pisoDoOperador({
      amountIn: Number(INTENT_COMPRA.amountIn) / 10 ** POOL_CERTA.decimalsIn,
      hop: POOL_CERTA.hop,
      toleranciaBps: POOL_CERTA.toleranciaBps,
    });
    expect(Number(r.piso) / 1e18).toBeCloseTo(direto.minOut, 9);
    expect(Number(r.esperado) / 1e18).toBeCloseTo(direto.esperado, 9);
  });

  it("RECUSA pool sem reserva de um dos lados", () => {
    const r = pisoDaProfundidade(INTENT_COMPRA, { ...POOL_CERTA, hop: { ...POOL_CERTA.hop, reserveOut: 0 } });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.porque).toContain("sem reserva");
  });

  it("a venda inverte o par exigido — e a pool de compra é recusada nela", () => {
    const venda = { ...INTENT_COMPRA, side: 1, amountIn: 890000000000000000n, minOut: 100000n };
    const r = pisoDaProfundidade(venda, POOL_CERTA);
    expect(r.ok, "a pool está no sentido USDC->WMATIC; a venda vai ao contrário").toBe(false);
  });

  it("a venda com a pool no sentido CERTO nasce, e as casas invertem junto", () => {
    /* O par não é a única coisa que vira na venda: entram 18 casas (WMATIC) e
       saem 6 (USDC), exatamente o contrário da compra. Trocar só o par e manter
       6/18 erraria o piso por 1e12 sem erro nenhum — a família da pool errada. */
    const venda: Intent = {
      side: 1, asset: WMATIC, base: USDC,
      amountIn: 890000000000000000n, minOut: 100000n, lotId: 3n,
    };
    const r = pisoDaProfundidade(venda, POOL_VENDA);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { gamma, reserveIn, reserveOut } = POOL_VENDA.hop;
    const x = 0.89;
    const canonico = (gamma * x * reserveOut) / (reserveIn + gamma * x);
    /* EXATO, e não aproximado: em USDC uma unidade É 1e-6, então `toBeCloseTo`
       com 6 casas exigiria precisão abaixo da granularidade do token e reprovaria
       o truncamento que `pisoDaProfundidade` faz de propósito. Comparar contra o
       piso da fórmula testa as unidades E prende o arredondamento para baixo — se
       alguém trocar por `ceil`, o piso sobe acima do alcançável e isto acusa. */
    expect(r.esperado, "saída em 6 casas, não em 18").toBe(BigInt(Math.floor(canonico * 1e6)));
    expect(r.piso).toBe(BigInt(Math.floor(canonico * 0.99 * 1e6)));
  });

  it("NUNCA afrouxa: piso calculado abaixo do da estratégia é descartado", async () => {
    /* A FAIXA ESTREITA que ainda exercita isto: a pool tem de entregar ACIMA do
       piso da estratégia (senão a guarda nova para antes do gás) mas o piso
       calculado, já com a tolerância, tem de cair ABAIXO dele.
         entrega 0,8950 >= 0,89 exigido        -> passa da guarda
         piso 0,8950 x 0,99 = 0,8861 < 0,89    -> o da estratégia prevalece
       Sem essa faixa o teste mediria a guarda nova, não o "nunca afrouxa". */
    const rasa = { ...POOL_CERTA, hop: { gamma: 0.997, reserveIn: 500_000, reserveOut: 4_488_465 } };
    const r = await prepararAbertura(cliente(RESPOSTAS), {
      ...PEDIDO, dryRun: false, simulacaoOk: true, profundidade: rasa,
    });
    expect(r.etapa).toBe("pronto-para-enviar");
    if (r.etapa !== "pronto-para-enviar") return;
    expect(r.submissao.params.operatorMinOut, "manteve o da estratégia").toBe(890000000000000000n);
    expect(r.piso.apertado).toBe(false);
    if (r.piso.apertado) return;
    expect(r.piso.porque).toContain("não superou");
  });

  it("PARA ANTES DO GÁS quando a rota não alcança o piso da estratégia", async () => {
    /* A pool REAL do router configurado, medida na chain em 2026-08-24:
       QuickSwap v2 WMATIC/USDC nativo 0x6D9e8dbB…C9D2 tem 758,43 USDC contra
       6.510,87 WMATIC — 9,09% abaixo do spot. O ticket de 0,1 USDC entrega
       0,8558 WMATIC contra os 0,89 que a estratégia exige.

       Sem esta parada a transação sai, o router reverte no amountOutMin e o gás
       vira prejuízo. É o estado REAL de hoje, não hipótese. */
    const poolReal: ProfundidadeDaPool = {
      ...POOL_CERTA,
      pool: "0x6D9e8dbB2779853db00418D4DcF96F3987CFC9D2",
      hop: { gamma: 0.997, reserveIn: 758.426755, reserveOut: 6510.872954557265 },
    };
    const r = await prepararAbertura(cliente(RESPOSTAS), {
      ...PEDIDO, dryRun: false, simulacaoOk: true, profundidade: poolReal,
    });
    expect(r.etapa).toBe("rota-nao-alcanca-o-piso");
    if (r.etapa !== "rota-nao-alcanca-o-piso") return;
    expect(Number(r.esperado) / 1e18).toBeCloseTo(0.855783, 5);
    expect(r.exigidoPelaEstrategia).toBe(890000000000000000n);
    expect(r.faltamBps, "3,84% = 384 bps").toBeCloseTo(384, -1);
    expect(r.pool).toBe("0x6D9e8dbB2779853db00418D4DcF96F3987CFC9D2");
  });

  it("a tolerância padrão medida cobre o p99 da janela de validade", () => {
    /* 200 janelas contíguas de 15 min: p99 = 191,9 bps. O padrão anterior era
       100 bps — reverteria em mais de 1% das janelas por movimento normal de
       preço, não por execução ruim. */
    expect(TOLERANCIA_P99_BPS).toBeGreaterThanOrEqual(192);
    expect(toleranciaAlcancavel(TOLERANCIA_P99_BPS, 0.997), "e continua alcançável numa pool de 0,30%").toBe(true);
  });

  it("o piso apertado vai para os DOIS lados — struct e rota", async () => {
    const r = await prepararAbertura(cliente(RESPOSTAS), {
      ...PEDIDO, dryRun: false, simulacaoOk: true, profundidade: POOL_CERTA,
    });
    expect(r.etapa).toBe("pronto-para-enviar");
    if (r.etapa !== "pronto-para-enviar") return;
    expect(r.piso.apertado).toBe(true);
    const { args } = decodeFunctionData({ abi: routerAbi, data: r.submissao.routeCalldata });
    expect(args[1], "amountOutMin da rota").toBe(r.submissao.params.operatorMinOut);
    expect(r.submissao.params.operatorMinOut).toBeGreaterThan(890000000000000000n);
  });

  /* A VENDA, DE PONTA A PONTA.
     Terceira vez que esta perna é a descoberta: primeiro os dois `lotId`
     igualados, depois o `minRatioBps` de 65.535 que a travaria, e o juiz da onda
     mediu o caminho À MÃO porque nenhum teste o percorria. É a metade do produto
     que FECHA posição. */
  const RESPOSTAS_VENDA = {
    ...RESPOSTAS,
    /* side=1, entram 0,89 WMATIC, saem no mínimo 0,1 USDC, lote 3. */
    dryRunChecks: [1, WMATIC, USDC, 890000000000000000n, 100000n, 3n],
  };

  it("a VENDA chega a PRONTO, e o `path` inverte junto com o piso", async () => {
    const r = await prepararAbertura(cliente(RESPOSTAS_VENDA), {
      ...PEDIDO, dryRun: false, simulacaoOk: true, profundidade: POOL_VENDA,
    });
    expect(r.etapa).toBe("pronto-para-enviar");
    if (r.etapa !== "pronto-para-enviar") return;

    expect(r.intent.side, "é venda, e não a compra por engano").toBe(1);
    expect(r.piso.apertado).toBe(true);

    /* O `path` é `[ativo, base]` — o contrário da compra. Invertê-lo compila,
       passa em qualquer teste que só olhe números, e o router entrega o token
       errado. */
    const { args } = decodeFunctionData({ abi: routerAbi, data: r.submissao.routeCalldata });
    expect(args[2], "ativo -> base").toEqual([WMATIC, USDC]);
    expect(args[1], "amountOutMin da rota").toBe(r.submissao.params.operatorMinOut);

    /* O piso vem da fórmula canônica, em 6 casas, e SUPERA o da estratégia. */
    const { gamma, reserveIn, reserveOut } = POOL_VENDA.hop;
    const canonico = (gamma * 0.89 * reserveOut) / (reserveIn + gamma * 0.89);
    expect(r.submissao.params.operatorMinOut).toBe(BigInt(Math.floor(canonico * 0.99 * 1e6)));
    expect(r.submissao.params.operatorMinOut).toBeGreaterThan(100000n);

    /* `base` continua sendo a base do cofre mesmo quando ela é o token que SAI —
       o campo nomeia a moeda-base, não a perna. */
    expect(r.submissao.params.base).toBe(USDC);

    /* Os dois lotes seguem separados NA VENDA, que é onde igualá-los quebra. */
    expect(r.submissao.params.candidateLotId, "o sugerido").toBe(7n);
    expect(r.intent.lotId, "o que a estratégia devolveu").toBe(3n);
  });

  it("a VENDA também para antes do gás quando a pool não paga o piso", async () => {
    /* Mesma pool da compra, vista ao contrário: POL a US$ 0,1059 faz 0,89 WMATIC
       renderem ~0,0940 USDC contra os 0,1 exigidos. É o estado de HOJE, e o juiz
       da onda o mediu à mão antes de existir teste. */
    const rasa: ProfundidadeDaPool = {
      ...POOL_VENDA,
      hop: { gamma: 0.997, reserveIn: 4_721_435, reserveOut: 500_000 },
    };
    const r = await prepararAbertura(cliente(RESPOSTAS_VENDA), {
      ...PEDIDO, dryRun: false, simulacaoOk: true, profundidade: rasa,
    });
    expect(r.etapa).toBe("rota-nao-alcanca-o-piso");
    if (r.etapa !== "rota-nao-alcanca-o-piso") return;
    const canonico = (0.997 * 0.89 * 500_000) / (4_721_435 + 0.997 * 0.89);
    expect(r.esperado).toBe(BigInt(Math.floor(canonico * 1e6)));
    expect(r.exigidoPelaEstrategia, "o piso em USDC, não em WMATIC").toBe(100000n);
    expect(r.faltamBps).toBeGreaterThan(0);
  });

  it("sem profundidade, DIZ que não apertou — silêncio faria os dois mundos parecerem iguais", async () => {
    const r = await prepararAbertura(cliente(RESPOSTAS), { ...PEDIDO, dryRun: false, simulacaoOk: true });
    expect(r.etapa).toBe("pronto-para-enviar");
    if (r.etapa !== "pronto-para-enviar") return;
    expect(r.piso.apertado).toBe(false);
    if (r.piso.apertado) return;
    expect(r.piso.porque).toContain("não informada");
    expect(r.piso.piso, "e o piso é o da estratégia").toBe(890000000000000000n);
  });
});

describe("prepararAbertura · o caminho inteiro", () => {
  it("PARA no cofre quando ele recusa, e diz o que fazer", async () => {
    /* É o estado REAL de hoje: saldo 0 USDC, e o cofre reverte. */
    const erro = new Error("execution reverted") as Error & { data?: string };
    erro.data = "0x780942a0"; /* AmountQuantizedToZero */
    const r = await prepararAbertura(cliente({ ...RESPOSTAS, dryRunChecks: erro }), PEDIDO);
    expect(r.etapa).toBe("recusado-pelo-cofre");
    if (r.etapa !== "recusado-pelo-cofre") return;
    expect(r.erro).toBe("AmountQuantizedToZero");
    expect(r.oQueFazer, "não basta dizer que falhou").toContain("quantum");
  });

  it("`dry_run` é o PADRÃO — omitir o campo não é permissão", async () => {
    const semCampo = { ...PEDIDO };
    delete (semCampo as Partial<PedidoDeAbertura>).dryRun;
    const r = await prepararAbertura(cliente(RESPOSTAS), semCampo);
    expect(r.etapa).toBe("porta-fechada");
    if (r.etapa !== "porta-fechada") return;
    expect(r.decisao.reason).toContain("dry_run");
  });

  it("sem simulação passando, a porta fecha mesmo com dry_run off", async () => {
    const r = await prepararAbertura(cliente(RESPOSTAS), { ...PEDIDO, dryRun: false });
    expect(r.etapa).toBe("porta-fechada");
    if (r.etapa !== "porta-fechada") return;
    expect(r.decisao.reason).toContain("simulation");
  });

  it("com tudo aberto chega a PRONTO, e o lote sugerido sobrevive", async () => {
    const r = await prepararAbertura(cliente(RESPOSTAS), { ...PEDIDO, dryRun: false, simulacaoOk: true });
    expect(r.etapa).toBe("pronto-para-enviar");
    if (r.etapa !== "pronto-para-enviar") return;
    /* O `candidateLotId` é 7 e o `intent.lotId` é 0 — dois campos, e o contrato
       usa cada um num lugar. Igualá-los quebra a venda. */
    expect(r.submissao.params.candidateLotId).toBe(7n);
    expect(r.intent.lotId).toBe(0n);
    expect(r.estado.configEpoch).toBe(4n);
  });

  it("lê nonce, configEpoch e strategy ANTES de montar", async () => {
    /* O cofre recalcula o proposalHash com o nonce DELE na execução: ler cedo e
       submeter tarde produz CommitmentMismatch depois do gás pago. */
    const pedidos: string[] = [];
    const c: VaultClient = {
      async readContract({ functionName }) {
        pedidos.push(functionName);
        return (RESPOSTAS as Record<string, unknown>)[functionName];
      },
    };
    await prepararAbertura(c, { ...PEDIDO, dryRun: false, simulacaoOk: true });
    expect(pedidos.slice(0, 3).sort()).toEqual(["configEpoch", "nonce", "strategy"]);
    expect(pedidos).toContain("dryRunChecks");
  });
});
