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
import { encodeAbiParameters, keccak256, type Address, type Hex } from "viem";

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

export function montarAbertura(a: Abertura): AberturaMontada {
  if (a.path.length < 2) {
    throw new Error("o path precisa de pelo menos dois tokens; com um não há troca");
  }
  const tokenIn = a.path[0]!;
  const tokenOut = a.path[a.path.length - 1]!;

  /* UM `amountIn`, UM piso, UM prazo — os três vão para os dois lados a partir
     daqui, e não há como um chamador passar valores diferentes. */
  const routeCalldata = swapExactTokensForTokens({
    amountIn: a.amountIn,
    amountOutMin: a.minOut,
    path: a.path,
    toTheVault: a.vault,
    deadline: a.validUntil,
  });

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
