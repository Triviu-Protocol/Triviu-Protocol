/**
 * O COMMITMENT DO COFRE V0, fora do navegador.
 *
 * `TriviuVault` recalcula estes dois hashes on-chain a cada execução e recusa
 * com `CommitmentMismatch` se um bit divergir. Quem submete tem de produzir
 * exatamente os mesmos bytes que o `solc` produz — não os seus próprios.
 *
 * POR QUE ISTO NÃO É CÓDIGO NOVO. O caminho já existe em
 * `site/js/console-v0.js` (`montarExecucao`), montado para o navegador e
 * conferido contra a biblioteca real compilada, em `scripts/check-commitment.mjs`.
 * Aqui ele é o mesmo caminho, para o motor. O que muda é a ferramenta: no
 * navegador o keccak é `site/js/keccak.js`, um porte auditado; aqui é o `viem`,
 * que já é dependência deste pacote. A Escada de Reuso encerra no degrau 5 —
 * dependência já instalada resolve, e uma segunda implementação de keccak neste
 * repositório seria a terceira cópia da mesma aritmética.
 *
 * Os vetores do teste ao lado NÃO foram inventados: são os mesmos que
 * `check-commitment.mjs` confronta com `Commitment.sol` compilado pelo forge.
 * Bater com eles é bater com o compilador.
 */
import { decodeAbiParameters, encodeAbiParameters, keccak256, type Address, type Hex } from "viem";

/** Os oito campos que entram no `proposalHash`, na ordem que o contrato usa. */
export interface Proposal {
  chainId: bigint;
  vault: Address;
  nonce: bigint;
  configEpoch: bigint;
  strategy: Address;
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  lotId: bigint;
}

/** O que o `executionHash` acrescenta à proposta. */
export interface Execution {
  executor: Address;
  target: Address;
  spender: Address;
  amountIn: bigint;
  operatorMinOut: bigint;
  validUntil: bigint;
  declaredRefund: bigint;
  routeCalldata: Hex;
}

/**
 * `keccak256(abi.encode(chainid, vault, nonce, configEpoch, strategy, tokenIn,
 *  tokenOut, amountIn, lotId))`
 *
 * O `chainId` entra como valor e não é lido do cliente de propósito: o contrato
 * usa `block.chainid` do lugar onde ele roda, e um motor apontado para o fork
 * tem de calcular com a chain do fork. Deixar o cliente decidir esconderia essa
 * escolha dentro de uma dependência.
 */
export function proposalHash(p: Proposal): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "uint256" }, { type: "address" }, { type: "uint64" },
        { type: "uint64" }, { type: "address" }, { type: "address" },
        { type: "address" }, { type: "uint256" }, { type: "uint256" },
      ],
      [p.chainId, p.vault, p.nonce, p.configEpoch, p.strategy,
       p.tokenIn, p.tokenOut, p.amountIn, p.lotId],
    ),
  );
}

/**
 * `keccak256(abi.encode(proposal, executor, target, spender, amountIn,
 *  operatorMinOut, validUntil, declaredRefund, keccak256(routeCalldata)))`
 *
 * A rota entra pelo HASH e não por inteiro — é o que o contrato faz. Passar a
 * rota completa aqui daria outro valor, e o erro só apareceria na chain, depois
 * do gás pago.
 */
export function executionHash(proposal: Hex, e: Execution): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" }, { type: "address" }, { type: "address" },
        { type: "address" }, { type: "uint256" }, { type: "uint256" },
        { type: "uint64" }, { type: "uint256" }, { type: "bytes32" },
      ],
      [proposal, e.executor, e.target, e.spender, e.amountIn,
       e.operatorMinOut, e.validUntil, e.declaredRefund, keccak256(e.routeCalldata)],
    ),
  );
}

/**
 * A ABERTURA INTEIRA, montada de UM objeto só.
 *
 * Existe porque três campos significam a mesma coisa dos dois lados e eram
 * declarados separados — `amountIn` contra `amountIn`, `operatorMinOut` contra
 * `amountOutMin`, `validUntil` contra `deadline`. Nada os amarrava, e as três
 * divergências falham de formas diferentes:
 *
 *   amountIn        o cofre aprova um tamanho e o router executa outro
 *   operatorMinOut  o PISO DE PROTEÇÃO fica declarado num lugar e aplicado
 *                   noutro — o pior dos três, porque é a promessa ao usuário
 *   validUntil      o cofre acha a proposta válida e o router já expirou,
 *                   revertendo depois do gás pago
 *
 * O Escorpião achou a primeira e parou nela; o Tubarão-branco mediu a classe e
 * exigiu que divergir deixasse de ser POSSÍVEL, em vez de ser proibido por
 * comentário. Quem chama esta função não tem como errar os três: ela só recebe
 * um de cada.
 */
export interface Abertura {
  /* o que a estratégia propôs */
  amountIn: bigint;
  minOut: bigint;
  validUntil: bigint;
  path: readonly Address[];
  /* onde ela roda */
  vault: Address;
  executor: Address;
  router: Address;
  /* o estado do cofre no instante da montagem */
  chainId: bigint;
  nonce: bigint;
  configEpoch: bigint;
  strategy: Address;
  lotId: bigint;
  declaredRefund: bigint;
}

export interface AberturaMontada {
  routeCalldata: Hex;
  proposalHash: Hex;
  executionHash: Hex;
}

/**
 * Por qual venue a rota passa.
 *
 * NÃO tem padrão, e a ausência é deliberada: um `fee` que ninguém escolheu é a
 * mesma classe do `MIN_OUT_PER_TICKET` que matou a estratégia anterior. Na V3 o
 * par existe em vários tiers com profundidades diferentes por ordens de
 * grandeza, e escolher o errado é escolher outra pool com o mesmo nome.
 */
export type Rota =
  | { tipo: "v2" }
  /** `fee` em milionésimos: 500 = 0,05%, 3000 = 0,30%. */
  | { tipo: "v3"; fee: number };

export function montarAbertura(a: Abertura & { rota?: Rota }): AberturaMontada {
  if (a.path.length < 2) {
    throw new Error("o path precisa de pelo menos dois tokens; com um não há troca");
  }
  const tokenIn = a.path[0]!;
  const tokenOut = a.path[a.path.length - 1]!;
  const rota: Rota = a.rota ?? { tipo: "v2" };

  /* UM `amountIn`, UM piso, UM prazo — os três vão para os dois lados a partir
     daqui, e não há como um chamador passar valores diferentes. */
  const routeCalldata =
    rota.tipo === "v2"
      ? swapExactTokensForTokens({
          amountIn: a.amountIn,
          amountOutMin: a.minOut,
          path: a.path,
          toTheVault: a.vault,
          deadline: a.validUntil,
        })
      : exactInputSingle({
          tokenIn,
          tokenOut,
          fee: rota.fee,
          toTheVault: a.vault,
          deadline: a.validUntil,
          amountIn: a.amountIn,
          amountOutMinimum: a.minOut,
        });

  /* A rota recém-montada é DECODIFICADA e o destino conferido contra o cofre.
     Não é auto-comparação: quem escreve os bytes é o codificador, quem os lê é
     um decodificador independente, e a verdade (`a.vault`) vem de fora dos dois.

     Isto existe porque na V3 o destino é um campo no MEIO de uma struct de oito,
     e `recipient = executor` é o erro natural de quem monta — o executor é quem
     CHAMA. Se sair assim, o swap executa, a saída cai no executor, e
     `BalanceDeltaNonZero` reverte DEPOIS DO GÁS PAGO, com uma mensagem que fala
     de saldo e não de destinatário. Aqui custa zero e diz o nome certo. */
  const destino = destinoDaRota(routeCalldata);
  if (destino.toLowerCase() !== a.vault.toLowerCase()) {
    throw new Error(
      `a rota entrega em ${destino} e o cofre é ${a.vault} — a saída TEM de ir ` +
        `direto ao cofre, senão o Executor reverte BalanceDeltaNonZero depois do gás`,
    );
  }

  const proposal = proposalHash({
    chainId: a.chainId, vault: a.vault, nonce: a.nonce,
    configEpoch: a.configEpoch, strategy: a.strategy,
    tokenIn, tokenOut, amountIn: a.amountIn, lotId: a.lotId,
  });

  const execution = executionHash(proposal, {
    executor: a.executor,
    /* Em QuickSwap V2 o `target` e o `spender` são o mesmo endereço; declarar
       os dois a partir de `router` guarda essa verdade num lugar só. Um router
       que separe os dois exige mudar aqui, e não em quem chama. */
    target: a.router, spender: a.router,
    amountIn: a.amountIn,
    operatorMinOut: a.minOut,
    validUntil: a.validUntil,
    declaredRefund: a.declaredRefund,
    routeCalldata,
  });

  return { routeCalldata, proposalHash: proposal, executionHash: execution };
}

/**
 * A rota de um swap V2, com o destino sendo o COFRE.
 *
 * Isto não é detalhe: `VaultExecution` mede `tokenOut.balanceOf(address(this))`
 * antes e depois, com `this` sendo o cofre; e `Executor.run` exige que os
 * saldos DELE voltem ao baseline (`BalanceDeltaNonZero`). Uma rota apontada
 * para o executor reverte depois do gás pago, e a assinatura do router não diz
 * nada sobre isso.
 */
export function swapExactTokensForTokens(args: {
  amountIn: bigint;
  amountOutMin: bigint;
  path: readonly Address[];
  toTheVault: Address;
  deadline: bigint;
}): Hex {
  const seletor = keccak256(
    new TextEncoder().encode(
      "swapExactTokensForTokens(uint256,uint256,address[],address,uint256)",
    ),
  ).slice(0, 10) as Hex;
  const corpo = encodeAbiParameters(
    [{ type: "uint256" }, { type: "uint256" }, { type: "address[]" },
     { type: "address" }, { type: "uint256" }],
    [args.amountIn, args.amountOutMin, [...args.path], args.toTheVault, args.deadline],
  );
  return (seletor + corpo.slice(2)) as Hex;
}

/**
 * A struct do `exactInputSingle`, em ordem — e a ordem É a interface.
 *
 * Trocar `recipient` e `deadline` de lugar compila, passa em qualquer teste que
 * conte campos, e produz uma transação que entrega no lugar errado num prazo
 * absurdo. Por isso a lista abaixo é declarada uma vez e usada pelo codificador
 * E pelo decodificador: se alguém reordenar, os dois mudam juntos e o teste de
 * ida-e-volta continua verde — mas os VETORES cravados quebram, que é onde a
 * ordem realmente está guardada.
 */
const EXACT_INPUT_SINGLE_PARAMS = [
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

/**
 * A rota de um swap V3 pelo `SwapRouter` ORIGINAL, com o destino sendo o COFRE.
 *
 * O router original, e não o `SwapRouter02`: o 02 REMOVEU o `deadline` da struct,
 * e sem ele o par `validUntil ↔ deadline` perde a contraparte. Os três pares
 * amarrados viram dois, e o conferidor passaria a amarrar contra um campo que
 * não existe — silêncio, que é exatamente o que ele existe para impedir.
 *
 * `sqrtPriceLimitX96 = 0` desliga o limite de preço do próprio pool. É
 * deliberado: quem protege aqui é o `amountOutMinimum`, que é o mesmo piso que
 * viaja no `executionHash`. Um segundo limite, expresso noutra unidade, seria um
 * quarto par podendo divergir dos outros três.
 */
export function exactInputSingle(args: {
  tokenIn: Address;
  tokenOut: Address;
  /** Milionésimos: 500 = 0,05%, 3000 = 0,30%. */
  fee: number;
  toTheVault: Address;
  deadline: bigint;
  amountIn: bigint;
  amountOutMinimum: bigint;
}): Hex {
  if (!Number.isInteger(args.fee) || args.fee <= 0 || args.fee > 0xffffff) {
    throw new Error(`fee ${args.fee} não cabe em uint24 ou não é tier válido`);
  }
  const seletor = keccak256(
    new TextEncoder().encode(
      "exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))",
    ),
  ).slice(0, 10) as Hex;
  const corpo = encodeAbiParameters(EXACT_INPUT_SINGLE_PARAMS, [
    {
      tokenIn: args.tokenIn,
      tokenOut: args.tokenOut,
      fee: args.fee,
      recipient: args.toTheVault,
      deadline: args.deadline,
      amountIn: args.amountIn,
      amountOutMinimum: args.amountOutMinimum,
      sqrtPriceLimitX96: 0n,
    },
  ]);
  return (seletor + corpo.slice(2)) as Hex;
}

/** Seletor do `swapExactTokensForTokens` da V2, calculado uma vez. */
const SEL_V2 = keccak256(
  new TextEncoder().encode("swapExactTokensForTokens(uint256,uint256,address[],address,uint256)"),
).slice(0, 10);

/** Seletor do `exactInputSingle` da V3. */
const SEL_V3 = keccak256(
  new TextEncoder().encode(
    "exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))",
  ),
).slice(0, 10);

/**
 * Para onde uma rota entrega, lida dos BYTES.
 *
 * Existe para ser chamada sobre calldata que este arquivo NÃO montou — a de um
 * detector, a de um operador, a de uma transação já assinada. Sobre a que ele
 * montou, é a conferência de ida-e-volta dentro de `montarAbertura`.
 *
 * Recusa em vez de adivinhar: um seletor desconhecido não vira "provavelmente o
 * cofre". Se não dá para ler o destino, não dá para afirmar que ele está certo.
 */
export function destinoDaRota(routeCalldata: Hex): Address {
  const seletor = routeCalldata.slice(0, 10);
  const corpo = ("0x" + routeCalldata.slice(10)) as Hex;

  if (seletor === SEL_V2) {
    const [, , , to] = decodeAbiParameters(
      [{ type: "uint256" }, { type: "uint256" }, { type: "address[]" },
       { type: "address" }, { type: "uint256" }],
      corpo,
    );
    return to as Address;
  }
  if (seletor === SEL_V3) {
    const [p] = decodeAbiParameters(EXACT_INPUT_SINGLE_PARAMS, corpo);
    return (p as { recipient: Address }).recipient;
  }
  throw new Error(
    `seletor ${seletor} não é nenhuma rota que este motor sabe ler — não dá para ` +
      `afirmar para onde ela entrega, então não dá para afirmar que está certa`,
  );
}
