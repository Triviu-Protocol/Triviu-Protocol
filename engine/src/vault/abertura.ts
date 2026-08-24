/**
 * A ABERTURA DE POSIÇÃO, do estado lido até a decisão de enviar.
 *
 * Isto é o que faltava: as peças existiam e nada as ligava. `lerEstado` lê o
 * cofre, `simular` pergunta à estratégia, `montarSubmissao` amarra os três pares,
 * `decisaoDeSubmeter` abre ou fecha a porta — e ninguém chamava ninguém.
 *
 * `dry_run` é VERDADEIRO por padrão. Este arquivo não envia nada sozinho.
 *
 * POR QUE ESTE CAMINHO E NÃO O `index.ts`
 *
 * O `index.ts` é o pipeline de ARBITRAGEM. Quatro medições independentes dizem
 * que ele não tem presa: 0 ciclos positivos em 4 varreduras · 0 positivas em 81
 * configurações (mediana −53 bps) · 1.298 cotações sem uma positiva · e a causa
 * medida — `WETH/USDC` no tick ±0,01% tem US$ 244 na V3 e US$ 12 na V4, com ordem
 * mediana de US$ 52,61 e ZERO swaps ≥ US$ 20.000 em 2.800 blocos.
 *
 * O cofre é outro produto: a abertura não é decisão de edge, é intenção do dono.
 * A matemática do ciclo entra aqui só para uma coisa — o PISO.
 */
import type { Address } from "viem";
import { cycleOut, type Hop } from "../graph/dimensionar.js";
import { lerEstado, simular, type EstadoDoCofre, type Intent, type VaultClient } from "./leitura.js";
import {
  decisaoDeSubmeter, montarSubmissao,
  type Decisao, type EscolhasDoSubmissor, type Submissao,
} from "./submissao.js";

/**
 * GUARDA · tolerância impossível.
 *
 * `executado/spot = γ / (1 + γ·x/Ri)`. Isolando o tamanho:
 *
 *     x/Ri = 1/(1 − L) − 1/γ
 *
 * O teto do ticket é uma FRAÇÃO da reserva, e a fração depende só da tolerância
 * `L` e da taxa `γ`. Quando `L ≤ (1 − γ)` essa fração fica NEGATIVA: a taxa da
 * pool sozinha já come a tolerância inteira, e NENHUM tamanho satisfaz o piso.
 *
 * Medido: `L = 0,10%` numa pool de 0,30% dá `−0,2008%`.
 *
 * Sem esta guarda a estratégia reverte 100% das vezes e o log diz "slippage" —
 * mandando quem investiga procurar profundidade quando o problema é aritmético.
 * Barata, e mata uma classe inteira de reversão silenciosa.
 */
export function toleranciaAlcancavel(toleranciaBps: number, gamma: number): boolean {
  if (!(gamma > 0) || gamma > 1) return false;
  const L = toleranciaBps / 10_000;
  if (!(L > 0) || L >= 1) return false;
  return 1 / (1 - L) - 1 / gamma > 0;
}

/** O maior ticket que ainda respeita a tolerância, em unidades do token que entra. */
export function tetoDoTicket(reservaIn: number, toleranciaBps: number, gamma: number): number {
  if (!toleranciaAlcancavel(toleranciaBps, gamma)) return 0;
  const L = toleranciaBps / 10_000;
  return reservaIn * (1 / (1 - L) - 1 / gamma);
}

/**
 * O piso do operador, calculado da profundidade real.
 *
 * `cycleOut` com UM hop é, por álgebra, a fórmula do swap de produto constante —
 * a composição de Möbius com um único hop É `γ·x·Ro/(Ri + γ·x)`. Verificado
 * contra o código: razão 1,000000000000000 em 4 de 4 pontos.
 *
 * O piso da ESTRATÉGIA continua valendo no cofre (`net ≥ intent.minOut`). Este
 * aqui é o `operatorMinOut`, que trava no `executionHash` no instante da
 * assinatura — e é o único que pode ser apertado com a profundidade do momento.
 */
export function pisoDoOperador(args: {
  amountIn: number;
  hop: Hop;
  toleranciaBps: number;
}): { minOut: number; esperado: number; alcancavel: boolean } {
  const alcancavel = toleranciaAlcancavel(args.toleranciaBps, args.hop.gamma);
  if (!alcancavel) return { minOut: 0, esperado: 0, alcancavel: false };
  const esperado = cycleOut(args.amountIn, [args.hop]);
  return { minOut: esperado * (1 - args.toleranciaBps / 10_000), esperado, alcancavel: true };
}

/**
 * A profundidade da pool por onde a operação vai passar — com os tokens JUNTO.
 *
 * Os tokens não são decoração. O `params.example.toml` do motor vigia
 * `WMATIC/USDC.e`, e este cofre negocia `WMATIC/USDC NATIVO`: são pools
 * diferentes, com reservas diferentes. Um piso calculado da pool errada existe,
 * é plausível, tem a ordem de grandeza certa — e está errado. Ninguém percebe.
 *
 * Por isso o par viaja com a profundidade e é CONFERIDO contra o `Intent`.
 */
export interface ProfundidadeDaPool {
  pool: Address;
  tokenIn: Address;
  tokenOut: Address;
  /** Casas do token que ENTRA — para converter unidades do contrato em inteiras. */
  decimalsIn: number;
  /** Casas do token que SAI. */
  decimalsOut: number;
  /** Reservas em unidades INTEIRAS, como `monitor/pools.ts` as produz. */
  hop: Hop;
  toleranciaBps: number;
}

export type PisoCalculado =
  | { ok: true; piso: bigint; esperado: bigint }
  | { ok: false; porque: string };

/**
 * O piso do operador, em unidades do token que sai, a partir da profundidade.
 *
 * ARREDONDA PARA BAIXO, e é deliberado. `cycleOut` trabalha em ponto flutuante e
 * um piso de 0,89 WMATIC vira `8.9e17`, que precisa de 57 bits — o `float64` tem
 * 53 de mantissa, então os últimos dígitos não são exatos. Arredondar para baixo
 * deixa o piso alguns wei mais FROUXO; arredondar para cima o deixaria alguns wei
 * ACIMA do alcançável, transformando execução válida em revert. Entre perder dois
 * wei de proteção e queimar gás numa reversão, a escolha não é próxima.
 */
export function pisoDaProfundidade(
  intent: Intent,
  prof: ProfundidadeDaPool,
): PisoCalculado {
  const tokenIn = intent.side === 0 ? intent.base : intent.asset;
  const tokenOut = intent.side === 0 ? intent.asset : intent.base;
  const igual = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

  if (!igual(prof.tokenIn, tokenIn) || !igual(prof.tokenOut, tokenOut)) {
    return {
      ok: false,
      porque:
        `a profundidade é de ${prof.tokenIn}->${prof.tokenOut} e a operação é ` +
        `${tokenIn}->${tokenOut} (pool ${prof.pool}) — piso da pool errada é ` +
        `plausível e errado`,
    };
  }
  /* As MESMAS fronteiras que o cofre impõe em `_readDecimals`: 1 a 18. Sem isto,
     um `decimals()` mal lido produz piso com ordem de grandeza errada e sem erro
     nenhum — medido: `decimalsOut = 77` gera um piso de 77 dígitos, calado. É a
     família da pool errada: número que existe, tem forma, e está errado. */
  for (const [nome, d] of [["decimalsIn", prof.decimalsIn], ["decimalsOut", prof.decimalsOut]] as const) {
    if (!Number.isInteger(d) || d < 1 || d > 18) {
      return { ok: false, porque: `${nome} = ${d} fora da faixa 1..18 que o próprio cofre aceita` };
    }
  }
  if (!(prof.hop.reserveIn > 0) || !(prof.hop.reserveOut > 0)) {
    return { ok: false, porque: `pool ${prof.pool} sem reserva de um dos lados` };
  }

  /* UMA implementação do piso, e é esta que roda. `pisoDoOperador` fazia a mesma
     conta noutro lugar, com 5 testes cobrindo o caminho que NÃO executava — o red
     team achou. Agora ela é a única, e aqueles testes passaram a cobrir o real:
     ela faz a matemática em unidades inteiras, esta função faz as unidades. */
  const entradaInteira = Number(intent.amountIn) / 10 ** prof.decimalsIn;
  const calc = pisoDoOperador({
    amountIn: entradaInteira,
    hop: prof.hop,
    toleranciaBps: prof.toleranciaBps,
  });
  if (!calc.alcancavel) {
    return {
      ok: false,
      porque:
        `tolerância de ${prof.toleranciaBps} bps é inalcançável numa pool de ` +
        `${((1 - prof.hop.gamma) * 10_000).toFixed(0)} bps — a taxa sozinha já a consome`,
    };
  }

  const paraUnidades = (v: number) => BigInt(Math.floor(v * 10 ** prof.decimalsOut));
  const esperadoInteiro = calc.esperado;
  const piso = paraUnidades(calc.minOut);

  if (piso <= 0n) {
    return { ok: false, porque: "o piso calculado zerou — entrada pequena demais para a profundidade" };
  }
  return { ok: true, piso, esperado: paraUnidades(esperadoInteiro) };
}

export interface PedidoDeAbertura {
  vault: Address;
  base: Address;
  chainId: bigint;
  /** Lote sugerido à estratégia — o MESMO em `simular` e na submissão. */
  candidateLotId: bigint;
  escolhas: EscolhasDoSubmissor;
  /** `limits().maxValidity` do cofre, em segundos. */
  maxValidity: bigint;
  /** Relógio DA CHAIN, lido agora. Não o relógio local. */
  agoraDaChain: bigint;
  env: Record<string, string | undefined>;
  /** `execution.dry_run` do params.toml. Verdadeiro é o padrão. */
  dryRun?: boolean;
  /** Passou a simulação em fork? Sem ela a porta não abre. */
  simulacaoOk?: boolean;
  /**
   * A profundidade da pool, quando se tem. Sem ela o piso é o da estratégia —
   * FALHA PARA O SEGURO, não para o aberto: não conseguir medir a pool nunca
   * afrouxa o que já estava declarado.
   */
  profundidade?: ProfundidadeDaPool;
}

/**
 * De onde saiu o piso que foi assinado.
 *
 * Não é enfeite de log: quando o motor NÃO consegue apertar, o usuário fica com
 * o piso fixo da estratégia — que tolera 5,75% de perda contra o spot e não
 * acompanha profundidade nenhuma. Quem opera precisa saber em qual dos dois
 * mundos está, e o silêncio faria os dois parecerem iguais.
 */
export type OrigemDoPiso =
  | { apertado: true; piso: bigint; esperado: bigint; daEstrategia: bigint }
  | { apertado: false; piso: bigint; porque: string };

/**
 * A tolerância mínima que sobrevive à janela de validade.
 *
 * O `operatorMinOut` trava no `executionHash` no instante da assinatura, e o
 * cofre aceita `maxValidity` de 900 s. Se o preço andar CONTRA nesses 15 minutos,
 * reverte DEPOIS do gás pago.
 *
 * Medido na pool real, 200 janelas contíguas de 15 min, 201 amostras, cobertura
 * 100%: mediana absoluta 38,1 bps · p90 117,9 · p99 191,9 · máximo 247,8, com
 * **93 de 200 janelas adversas (46%)**.
 *
 * Origem: medição do terminal on-chain (`predators-protocol-master-f0`), em
 * `docs/PRDs/ONDA-TERCEIRO-TERMINAL-ENGATE-2026-08-24/medicao/janela_de_validade.py`
 * do repositório Predators. Registro o autor porque eu creditei o terminal errado
 * ao receber, e quem corrigiu foi o terminal que perdeu o crédito com a correção.
 *
 * Para não reverter em 99% das janelas medidas o piso precisa ceder ~192 bps.
 * O padrão anterior era 100 bps — apertado demais, e reverteria em mais de 1%
 * das janelas por movimento normal de preço, não por execução ruim.
 */
export const TOLERANCIA_P99_BPS = 192;

export type ResultadoDaAbertura =
  | { etapa: "recusado-pelo-cofre"; erro: string | null; oQueFazer: string | null; detalhe: string | null }
  | {
      /**
       * A rota não alcança o piso que a PRÓPRIA estratégia exige.
       *
       * Medido em 2026-08-24: a pool do router configurado
       * (`0x6D9e8dbB…C9D2`, QuickSwap v2 WMATIC/USDC nativo) tem **US$ 758** de
       * USDC e está **9,09% abaixo do spot**. Um ticket de 0,1 USDC entrega
       * 0,8558 WMATIC contra os 0,89 que a estratégia declara — faltam 3,84%.
       *
       * Sem esta parada, a transação sai, o router reverte no `amountOutMin`, e
       * o gás vira prejuízo. Com ela, o motor diz o que falta antes de gastar.
       */
      etapa: "rota-nao-alcanca-o-piso";
      esperado: bigint;
      exigidoPelaEstrategia: bigint;
      faltamBps: number;
      pool: Address;
    }
  | { etapa: "porta-fechada"; estado: EstadoDoCofre; intent: Intent; submissao: Submissao; decisao: Decisao; piso: OrigemDoPiso }
  | { etapa: "pronto-para-enviar"; estado: EstadoDoCofre; intent: Intent; submissao: Submissao; decisao: Decisao; piso: OrigemDoPiso };

/**
 * O caminho inteiro, sem assinar.
 *
 * Devolve em qual etapa parou e por quê, porque as três paradas pedem reações
 * diferentes: o cofre recusou (configure), a porta fechou (o motor barrou antes
 * do gás), ou está pronto — e enviar é uma chamada separada, deliberada.
 *
 * A ORDEM IMPORTA e não é arbitrária: `lerEstado` e `simular` leem o mesmo
 * instante do cofre. O cofre recalcula o `proposalHash` com o `nonce` e a
 * `configEpoch` DELE na execução; ler cedo e submeter tarde produz um commitment
 * que a chain recusa.
 */
export async function prepararAbertura(
  client: VaultClient,
  p: PedidoDeAbertura,
): Promise<ResultadoDaAbertura> {
  const estado = await lerEstado(client, p.vault);
  const s = await simular(client, p.vault, p.base, p.candidateLotId);

  if (!s.ok) {
    return { etapa: "recusado-pelo-cofre", erro: s.erro, oQueFazer: s.oQueFazer, detalhe: s.detalhe };
  }

  /* O piso do motor. Quando a profundidade não vem, ou vem da pool errada, ou a
     tolerância é inalcançável, `pisoApertado` fica indefinido e `montarSubmissao`
     usa o da estratégia. Nenhum desses caminhos AFROUXA nada. */
  const calculo = p.profundidade ? pisoDaProfundidade(s.intent, p.profundidade) : undefined;

  /* PARA ANTES DO GÁS quando a rota não alcança nem o piso da própria estratégia.
     Não é o piso do motor que barra aqui — é a aritmética da pool contra o que a
     estratégia já declarou. Deixar seguir só troca a recusa de graça por uma
     recusa paga. */
  if (calculo?.ok && p.profundidade && calculo.esperado < s.intent.minOut) {
    const falta = s.intent.minOut - calculo.esperado;
    return {
      etapa: "rota-nao-alcanca-o-piso",
      esperado: calculo.esperado,
      exigidoPelaEstrategia: s.intent.minOut,
      faltamBps: Number((falta * 10_000n) / s.intent.minOut),
      pool: p.profundidade.pool,
    };
  }

  const pisoApertado = calculo?.ok ? calculo.piso : undefined;

  const submissao = montarSubmissao({
    chainId: p.chainId,
    vault: p.vault,
    estado,
    intent: s.intent,
    candidateLotId: p.candidateLotId,
    pisoApertado,
    escolhas: p.escolhas,
  });

  const decisao = decisaoDeSubmeter({
    /* Verdadeiro por padrão, e a ausência do campo NÃO é permissão. */
    dryRun: p.dryRun ?? true,
    chainId: Number(p.chainId),
    simulacaoOk: p.simulacaoOk ?? false,
    env: p.env,
    estado,
    submissao,
    maxValidity: p.maxValidity,
    agoraDaChain: p.agoraDaChain,
  });

  /* O piso EFETIVO é o que foi para o struct, não o que se pretendeu: se o
     cálculo veio abaixo do da estratégia, `montarSubmissao` manteve o dela, e
     dizer "apertado" aqui seria mentir sobre o que foi assinado. */
  const efetivo = submissao.params.operatorMinOut;
  const piso: OrigemDoPiso =
    calculo?.ok && efetivo > s.intent.minOut
      ? { apertado: true, piso: efetivo, esperado: calculo.esperado, daEstrategia: s.intent.minOut }
      : {
          apertado: false,
          piso: efetivo,
          porque: calculo
            ? calculo.ok
              ? "o piso calculado não superou o da estratégia — o dela prevaleceu"
              : calculo.porque
            : "profundidade não informada — usando o piso fixo da estratégia",
        };

  return decisao.allowed
    ? { etapa: "pronto-para-enviar", estado, intent: s.intent, submissao, decisao, piso }
    : { etapa: "porta-fechada", estado, intent: s.intent, submissao, decisao, piso };
}
