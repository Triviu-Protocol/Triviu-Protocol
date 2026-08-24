/**
 * A SUBMISSÃO — o passo em que a chave privada entra.
 *
 * Tudo antes disto é leitura: `lerEstado` lê o cofre, `simular` pergunta à
 * estratégia o que ela propõe, `montarAbertura` amarra os três pares. Aqui a
 * proposta vira transação assinada, e a partir daqui erro custa dinheiro.
 *
 * DUAS PORTAS, e confundi-las é o erro caro:
 *
 *   execute(p)                  a ESTRATÉGIA propõe. O cofre chama a estratégia
 *                               que o dono apontou e usa o `minOut` DELA como
 *                               piso do líquido. É o caminho do produto — o que
 *                               roteia posição para o usuário. Exige operador.
 *
 *   executeAsOwner(intent, p)   o DONO propõe. A estratégia é ignorada e o piso
 *                               do líquido é o que o próprio dono declarar.
 *                               `callerMustBeOperator: false` — o dono paga o
 *                               próprio gás. É o caminho manual.
 *
 * A diferença não é de conveniência: em `execute` o piso vem de um contrato que
 * o operador não controla; em `executeAsOwner` o piso vem de quem assina.
 *
 * O QUE O COFRE EXIGE, medido em `VaultExecution.sol`:
 *
 *   :108  operador curado, quando `callerMustBeOperator`
 *   :110  `validUntil` no futuro e dentro de `maxValidity`
 *   :111  `declaredConfigEpoch` igual ao do cofre, senão `ConfigEpochStale`
 *   :112  cooldown desde a última execução
 *   :190  `gross >= operatorMinOut`      piso do operador, travado no hash
 *   :197  `net   >= intent.minOut`       piso da estratégia, sobre o líquido
 *
 * O `executionHash` é recomputado on-chain e comparado; divergir é
 * `CommitmentMismatch` depois do gás pago.
 */
import { createWalletClient, defineChain, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { montarAbertura } from "./commitment.js";
import type { EstadoDoCofre, Intent } from "./leitura.js";
import { submitDecision, type SubmitGateDecision } from "../submit/tx.js";
import { erroParaLog } from "../seguranca/redigir.js";

export const MAINNET_CHAIN_ID = 137;

/** O que o submissor escolhe, e que o cofre não deduz por ele. */
export interface EscolhasDoSubmissor {
  executor: Address;
  router: Address;
  /** Segundos do RELÓGIO DA CHAIN, não do relógio local. */
  agora: bigint;
  /** Quanto tempo a proposta vale, em segundos. */
  janela: bigint;
  /** Reembolso de gás declarado; zero quando não se cobra. */
  declaredRefund?: bigint;
  declaredGas?: bigint;
  declaredGasPrice?: bigint;
  declaredQuote?: bigint;
}

/**
 * Os 14 campos de `ExecutionParams`, POR NOME.
 *
 * A primeira versão era tupla posicional, e o viem tipado a recusou. Ficou
 * melhor assim: numa tupla, `target` e `spender` são dois endereços vizinhos e
 * `declaredGas`/`declaredGasPrice`/`declaredQuote` são três `uint256` seguidos —
 * trocar dois de lugar compila, passa no teste que conta posições, e reverte
 * on-chain. Por nome, o compilador recusa.
 */
export interface ExecutionParams {
  executor: Address;
  target: Address;
  spender: Address;
  base: Address;
  operatorMinOut: bigint;
  validUntil: bigint;
  declaredConfigEpoch: bigint;
  declaredRefund: bigint;
  declaredGas: bigint;
  declaredGasPrice: bigint;
  declaredQuote: bigint;
  candidateLotId: bigint;
  routeCalldata: Hex;
  executionHash: Hex;
}

export interface Submissao {
  params: ExecutionParams;
  proposalHash: Hex;
  executionHash: Hex;
  routeCalldata: Hex;
  /**
   * O instante que a montagem usou. Fica registrado porque a porta precisa
   * comparar contra um relógio DIFERENTE: com o mesmo valor dos dois lados, a
   * checagem de validade se compara consigo mesma e não vê leitura velha.
   */
  agoraDaMontagem: bigint;
}

declare const marcaDaPorta: unique symbol;

/**
 * A prova de que a porta foi aberta — e para ESTA submissão.
 *
 * `submeterAbertura` exige este valor, e só `decisaoDeSubmeter` o produz. Sem
 * isto a porta era opcional: o red team enviou sem consultar `dry_run` nem a
 * simulação, e o único obstáculo era o comentário pedindo que o chamador
 * lembrasse. Comentário não é mecanismo.
 *
 * A submissão viaja DENTRO da autorização, então trocá-la depois de aprovada
 * também não passa.
 */
export interface Autorizacao {
  readonly [marcaDaPorta]: "decisaoDeSubmeter";
  readonly submissao: Submissao;
}

/**
 * Monta a submissão a partir do estado lido e do Intent proposto.
 *
 * NÃO aceita `executionHash` pronto, de propósito. O juiz da onda anterior
 * deixou escrito que quem submete tem de chamar `montarAbertura`: as peças
 * soltas continuam exportadas porque são os vetores confrontados com o `solc`,
 * e montar à mão faz os três pares (`amountIn`, piso, prazo) voltarem a poder
 * divergir. Aqui não há parâmetro por onde um hash forasteiro entre.
 */
export function montarSubmissao(args: {
  chainId: bigint;
  vault: Address;
  estado: EstadoDoCofre;
  intent: Intent;
  /**
   * O lote SUGERIDO — o mesmo que foi passado a `simular`/`dryRunChecks`.
   *
   * NÃO é `intent.lotId`. São dois valores diferentes e o contrato usa cada um
   * num lugar: `VaultExecution:67` faz `_buildView(p.candidateLotId, …)` e
   * pergunta à estratégia COM ELE, enquanto `:381` monta o `proposalHash` com
   * `intent.lotId`, que é o que ela DEVOLVEU.
   *
   * Igualar os dois quebra a venda: o cofre pergunta com uma sugestão diferente
   * da simulada, a estratégia pode responder outra coisa, e o hash recomputado
   * não bate — `CommitmentMismatch` depois do gás pago.
   *
   * O red team achou isto porque o dado medido tinha os dois valendo zero: o
   * estado real da chain escondeu o defeito por coincidência.
   */
  candidateLotId: bigint;
  /**
   * O piso APERTADO, calculado da profundidade real — o campo onde o motor
   * protege o usuário melhor do que o contrato consegue sozinho.
   *
   * `minRatioBps` é uma guarda global sobre o valor DECLARADO, e é `uint16`, e
   * exprime uma TAXA DE CÂMBIO em unidades inteiras — os `10^dec` do `mulDiv`
   * cancelam. Compra exige `P`, venda exige `1/P`, e um valor único tem de caber
   * em `min(P, 1/P)` com teto de 6,5535. Medido: no maior global que não trava a
   * venda de WMATIC/USDC, a COMPRA fica protegida a **1,19%** do valor justo.
   * Não é proteção fraca — é nenhuma. Por isso ele fica em zero.
   *
   * `operatorMinOut` não tem nenhum desses problemas: é `uint256`, é POR
   * EXECUÇÃO (logo por perna, sem reciprocidade), e trava no `executionHash` no
   * instante da assinatura — nem quem submeteu consegue afrouxá-lo depois.
   *
   * NUNCA fica abaixo de `intent.minOut`. O cofre já exige `net >= intent.minOut`
   * (`VaultExecution:197`), então declarar menos seria promessa que o contrato
   * não cumpre. Este parâmetro só APERTA.
   */
  pisoApertado?: bigint;
  escolhas: EscolhasDoSubmissor;
}): Submissao {
  const { chainId, vault, estado, intent, escolhas } = args;

  if (escolhas.janela <= 0n) {
    throw new Error("a janela precisa ser positiva; uma proposta já expirada gasta gás para reverter");
  }
  /* O cofre reverte `AmountQuantizedToZero`; é o estado do cofre vazio, e custa
     gás descobrir isso na chain. */
  if (intent.amountIn <= 0n) {
    throw new Error("a estratégia propôs amountIn zero — o cofre reverte com AmountQuantizedToZero; deposite antes");
  }
  /* `Side` do contrato só tem 0 (compra) e 1 (venda); `_askStrategy` recusa o
     resto. Aqui, tratar 9 como venda inverteria o `path` calado. */
  if (intent.side !== 0 && intent.side !== 1) {
    throw new Error(`side ${intent.side} não existe: 0 é compra, 1 é venda`);
  }
  const validUntil = escolhas.agora + escolhas.janela;

  /* `max`, e não substituição: um piso apertado que viesse ABAIXO do que a
     estratégia exige seria afrouxamento disfarçado de melhoria, e o cofre
     reverteria em `NetBelowStrategyMin` depois do gás pago. */
  const piso =
    args.pisoApertado !== undefined && args.pisoApertado > intent.minOut
      ? args.pisoApertado
      : intent.minOut;

  /* O `path` mínimo da abertura: paga-se com a base e recebe-se o ativo. Uma
     rota com mais saltos entra por aqui no dia em que o detector a produzir. */
  const path: readonly Address[] = intent.side === 0
    ? [intent.base, intent.asset]   /* compra: base -> ativo */
    : [intent.asset, intent.base];  /* venda:  ativo -> base */

  const montada = montarAbertura({
    amountIn: intent.amountIn,
    /* O piso vai INTEIRO para `montarAbertura`, que o escreve nos dois lados —
       `operatorMinOut` e o `amountOutMin` da rota. Apertar só um dos dois faria
       os três pares voltarem a poder divergir, que é o defeito que o juiz da
       onda anterior mandou tornar impossível. */
    minOut: piso,
    validUntil,
    path,
    vault,
    executor: escolhas.executor,
    router: escolhas.router,
    chainId,
    nonce: estado.nonce,
    configEpoch: estado.configEpoch,
    strategy: estado.strategy,
    lotId: intent.lotId,
    declaredRefund: escolhas.declaredRefund ?? 0n,
  });

  const params: ExecutionParams = {
    executor: escolhas.executor,
    /* Em QuickSwap V2 o alvo da chamada e quem recebe a aprovação são o mesmo
       endereço. Os dois saem de `router`, num lugar só. */
    target: escolhas.router,
    spender: escolhas.router,
    base: intent.base,
    /* A MESMA variável `piso` que foi para a rota, e não uma segunda derivação
       do mesmo valor: duas expressões que "deveriam dar o mesmo" é como os três
       pares divergiam antes. */
    operatorMinOut: piso,
    validUntil,
    declaredConfigEpoch: estado.configEpoch,
    declaredRefund: escolhas.declaredRefund ?? 0n,
    declaredGas: escolhas.declaredGas ?? 0n,
    declaredGasPrice: escolhas.declaredGasPrice ?? 0n,
    declaredQuote: escolhas.declaredQuote ?? 0n,
    /* O SUGERIDO, não o devolvido — ver o comentário do parâmetro. */
    candidateLotId: args.candidateLotId,
    routeCalldata: montada.routeCalldata,
    executionHash: montada.executionHash,
  };

  return {
    params,
    proposalHash: montada.proposalHash,
    executionHash: montada.executionHash,
    routeCalldata: montada.routeCalldata,
    agoraDaMontagem: escolhas.agora,
  };
}

/**
 * A porta antes da porta.
 *
 * Reusa `submitDecision` de `submit/tx.ts` em vez de escrever uma segunda
 * tabela-verdade: duas tabelas divergem, e a que ninguém lê é a que decide.
 * Acrescenta o que é do cofre e não existe lá.
 */
export type Decisao =
  | { allowed: false; reason: string }
  | { allowed: true; reason: string; autorizacao: Autorizacao };

/** Quanto tempo entre montar e submeter ainda é uma leitura fresca. */
export const DESVIO_TOLERADO_S = 300n;

export function decisaoDeSubmeter(args: {
  dryRun: boolean;
  chainId: number;
  simulacaoOk: boolean;
  env: Record<string, string | undefined>;
  estado: EstadoDoCofre;
  submissao: Submissao;
  /** `maxValidity` do cofre, em segundos, lido de `limits()`. */
  maxValidity: bigint;
  /**
   * O relógio DA CHAIN, lido AGORA — não o mesmo valor usado na montagem.
   *
   * A versão anterior recebia `agora` e o chamador passava naturalmente o mesmo
   * número dos dois lados. Com isso `validUntil - agora` era sempre a janela, e
   * a porta ficava cega a leitura velha: o red team montou com o relógio uma
   * hora atrasado, a proposta já estava expirada na chain, e a porta abriu.
   */
  agoraDaChain: bigint;
  desvioTolerado?: bigint;
}): Decisao {
  const base = submitDecision({
    dryRun: args.dryRun,
    chainId: args.chainId,
    simulationOk: args.simulacaoOk,
    env: args.env,
  });
  /* Devolvido explícito, e não `return base`: `SubmitGateDecision` tem
     `allowed: boolean` e não é união discriminada, então o compilador não a
     estreita — e aceitá-la aqui deixaria passar um "aberto" sem autorização. */
  if (!base.allowed) return { allowed: false, reason: base.reason };

  const { validUntil, declaredConfigEpoch } = args.submissao.params;
  const agora = args.agoraDaChain;

  /* O desvio é medido e reportado, não só usado: leitura velha de meia hora e
     relógio adiantado falham de formas diferentes, e quem lê a recusa precisa
     saber qual dos dois aconteceu. */
  const tolerado = args.desvioTolerado ?? DESVIO_TOLERADO_S;
  const desvio = agora - args.submissao.agoraDaMontagem;
  const distancia = desvio < 0n ? -desvio : desvio;
  if (distancia > tolerado) {
    return {
      allowed: false,
      reason: desvio > 0n
        ? `a montagem usou um relógio ${desvio}s atrasado em relação à chain (tolerado ${tolerado}s) — leia o estado de novo`
        : `a montagem usou um relógio ${distancia}s adiantado em relação à chain (tolerado ${tolerado}s) — o cofre usa o relógio DELE`,
    };
  }

  if (validUntil <= agora) {
    return { allowed: false, reason: "a proposta já expirou antes de sair — `validUntil` não está no futuro da chain" };
  }
  if (validUntil - agora > args.maxValidity) {
    return {
      allowed: false,
      reason: `janela de ${validUntil - agora}s excede o maxValidity do cofre (${args.maxValidity}s) — o cofre reverte com ValidityTooLong`,
    };
  }
  if (declaredConfigEpoch !== args.estado.configEpoch) {
    return {
      allowed: false,
      reason: "o configEpoch da submissão não é o que o cofre tem agora — alguém mexeu na config entre a leitura e o envio (ConfigEpochStale)",
    };
  }

  return {
    allowed: true,
    reason: base.reason,
    autorizacao: { submissao: args.submissao } as Autorizacao,
  };
}

/** O mínimo do cliente que a submissão usa — injetado, para o teste não pedir rede. */
export interface CarteiraClient {
  writeContract(args: {
    address: Address; abi: unknown; functionName: string; args: readonly unknown[];
    account: unknown; chain: unknown;
  }): Promise<Hex>;
}

const executeAbiFragment = [
  {
    type: "function",
    name: "execute",
    stateMutability: "nonpayable",
    inputs: [{
      name: "p", type: "tuple",
      components: [
        { name: "executor", type: "address" },
        { name: "target", type: "address" },
        { name: "spender", type: "address" },
        { name: "base", type: "address" },
        { name: "operatorMinOut", type: "uint256" },
        { name: "validUntil", type: "uint64" },
        { name: "declaredConfigEpoch", type: "uint64" },
        { name: "declaredRefund", type: "uint256" },
        { name: "declaredGas", type: "uint256" },
        { name: "declaredGasPrice", type: "uint256" },
        { name: "declaredQuote", type: "uint256" },
        { name: "candidateLotId", type: "uint256" },
        { name: "routeCalldata", type: "bytes" },
        { name: "executionHash", type: "bytes32" },
      ],
    }],
    outputs: [],
  },
] as const;

/**
 * Assina e envia. Só é chamada depois de `decisaoDeSubmeter` abrir.
 *
 * A chave privada vem do ambiente, deriva a conta e NÃO sai daqui — nem no
 * retorno, nem em erro. Medido: `privateKeyToAccount` com chave malformada
 * responde "invalid private key, expected hex or 32 bytes, got string" e não
 * ecoa o valor; e o erro de rede que sobe daqui passa por `erroParaLog`, porque
 * a `.message` do viem traz a URL do RPC com a credencial do provedor dentro.
 */
export async function submeterAbertura(args: {
  vault: Address;
  chainId: number;
  rpcUrl: string;
  /**
   * A prova de que a porta abriu — e a submissão viaja dentro dela.
   *
   * Não é `submissao: Submissao` de propósito: só `decisaoDeSubmeter` produz uma
   * `Autorizacao`, e é o que impede o chamador de enviar sem consultar
   * `dry_run` nem a simulação, como o red team fez.
   */
  autorizacao: Autorizacao;
  env: Record<string, string | undefined>;
  /** Injetável para o teste; em produção a carteira é montada aqui. */
  client?: CarteiraClient;
}): Promise<Hex> {
  /* O tipo já barra em TypeScript — o red team precisou de `@ts-expect-error`
     para tentar. Isto é para quem chamar de JS puro receber a razão em vez de
     um `Cannot read properties of undefined`. */
  if (!args.autorizacao?.submissao) {
    throw new Error("sem autorização: chame `decisaoDeSubmeter` primeiro e passe o que ela devolve");
  }
  const submissao = args.autorizacao.submissao;
  const chave = args.env["TRIVIU_PRIVATE_KEY"];
  if (!chave) throw new Error("TRIVIU_PRIVATE_KEY not set — the key never lives in the repo.");

  /* Defesa em profundidade: `decisaoDeSubmeter` já barrou o chamador, mas esta
     é a função que gasta, então ela reafirma o reconhecimento de risco. */
  if (args.chainId === MAINNET_CHAIN_ID && args.env["TRIVIU_I_ACCEPT_THE_RISK"] !== "yes") {
    throw new Error("mainnet submit refused: TRIVIU_I_ACCEPT_THE_RISK is not set");
  }

  const account = privateKeyToAccount(chave as `0x${string}`);
  const chain = defineChain({
    id: args.chainId,
    name: `configured-${args.chainId}`,
    nativeCurrency: { name: "native", symbol: "NATIVE", decimals: 18 },
    rpcUrls: { default: { http: [args.rpcUrl] } },
  });

  const client = args.client ?? createWalletClient({ account, chain, transport: http(args.rpcUrl) });

  try {
    return await client.writeContract({
      address: args.vault,
      abi: executeAbiFragment,
      functionName: "execute",
      args: [submissao.params],
      account,
      chain,
    });
  } catch (e) {
    /* Sem `cause`: o objeto original é o que carrega a URL do RPC. */
    throw new Error(`a submissão falhou no cofre ${args.vault}: ${erroParaLog(e)}`);
  }
}
