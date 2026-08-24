/**
 * O ESTADO DO COFRE, lido antes de montar qualquer coisa.
 *
 * `montarAbertura` precisa de `nonce`, `configEpoch`, `strategy` e do `Intent`
 * que a estratégia propõe. Os três primeiros o cofre expõe; o quarto vem de
 * `dryRunChecks`, que é `view` — não assina, não gasta, não muda nada.
 *
 * A ORDEM NÃO É ARBITRÁRIA. O cofre recalcula o `proposalHash` com o `nonce` e a
 * `configEpoch` DELE no instante da execução; ler cedo e submeter tarde produz um
 * commitment que a chain recusa. Por isso `lerEstado` lê os três no mesmo
 * `multicall`, e quem submete deve chamá-la o mais tarde possível.
 *
 * A RECUSA É RESPOSTA. `dryRunChecks` reverte com o erro do contrato quando algo
 * falta — `StrategyCallFailed` quando não há estratégia apontada,
 * `BaseNotEnabled` quando a moeda-base do cofre está desligada. Engolir isso e
 * devolver `null` jogaria fora a informação mais útil que a leitura produz.
 */
import { decodeErrorResult, parseAbi, type Address, type Hex } from "viem";
/* `semUrl` e `mensagemDoErro` moraram aqui até a varredura do motor achar as
   mesmas superfícies em `index.ts`, `verify-fork.ts` e `anvilFork.ts`. Foram
   para `seguranca/redigir.ts` sem uma vírgula de mudança: a redação tem de
   viver num lugar só, senão a próxima cópia envelhece sozinha. */
import { mensagemDoErro, semUrl } from "../seguranca/redigir.js";

export const vaultAbi = parseAbi([
  "function nonce() view returns (uint64)",
  "function configEpoch() view returns (uint64)",
  "function strategy() view returns (address)",
  "function dryRunChecks(uint256 candidateLotId, address base) view returns ((uint8,address,address,uint256,uint256,uint256))",
]);

/** Os erros que `dryRunChecks` produz e que dizem o que fazer a seguir. */
export const vaultErrorsAbi = parseAbi([
  "error StrategyCallFailed()",
  "error BaseNotEnabled()",
  "error CooldownActive()",
  "error AmountQuantizedToZero()",
  "error BaseNotCurated()",
  "error GuardRejected(address guard, bytes reason)",
]);

/** O que fazer diante de cada recusa, em uma frase. */
export const oQueFazer: Readonly<Record<string, string>> = {
  StrategyCallFailed:
    "não há estratégia apontada neste cofre, ou ela não respondeu — aponte uma com setStrategy",
  BaseNotEnabled:
    "a moeda-base deste cofre está desligada — ligue-a com setBaseCurrency",
  CooldownActive:
    "o intervalo mínimo entre execuções ainda não passou — veja cooldown em limits()",
  AmountQuantizedToZero:
    "a quantia ficou em zero depois da granularidade (quantum) — baixe o quantum ou deposite mais",
  BaseNotCurated:
    "o registro do protocolo não cura esta moeda-base; o ciclo só roda com uma curada",
  GuardRejected:
    "um guardião do cofre recusou a proposta — `detalhe` diz qual guardião e o motivo que ele devolveu",
};

export interface EstadoDoCofre {
  nonce: bigint;
  configEpoch: bigint;
  strategy: Address;
}

/** O que a estratégia propõe, decodificado. */
export interface Intent {
  side: number;          /* 0 = compra, 1 = venda */
  asset: Address;
  base: Address;
  amountIn: bigint;
  minOut: bigint;
  lotId: bigint;
}

export type Simulacao =
  | { ok: true; intent: Intent }
  /**
   * `detalhe` existe porque a falha carrega informação que o nome não carrega.
   *
   * `GuardRejected(address guard, bytes reason)` é o ÚNICO erro da tabela com
   * argumentos, e era o único cujos argumentos a leitura descartava: o cofre diz
   * QUAL guardião recusou e POR QUÊ, e nós devolvíamos só "um guardião recusou".
   *
   * E quando não há revert decodificável, `erro` é `null` tanto para um timeout
   * de rede quanto para uma recusa sem `data` — dois estados que pedem reação
   * oposta (tentar de novo · configurar). `detalhe` guarda a mensagem original
   * para que deixem de ser o mesmo estado na tela.
   */
  | { ok: false; erro: string | null; oQueFazer: string | null; detalhe: string | null };

/** O mínimo do cliente que este módulo usa — injetado, para o teste não pedir RPC. */
export interface VaultClient {
  readContract(args: {
    address: Address; abi: unknown; functionName: string; args?: readonly unknown[];
  }): Promise<unknown>;
}

export async function lerEstado(client: VaultClient, vault: Address): Promise<EstadoDoCofre> {
  try {
    const [nonce, configEpoch, strategy] = await Promise.all([
      client.readContract({ address: vault, abi: vaultAbi, functionName: "nonce" }),
      client.readContract({ address: vault, abi: vaultAbi, functionName: "configEpoch" }),
      client.readContract({ address: vault, abi: vaultAbi, functionName: "strategy" }),
    ]);
    return {
      nonce: BigInt(nonce as bigint),
      configEpoch: BigInt(configEpoch as bigint),
      strategy: strategy as Address,
    };
  } catch (e) {
    /* `simular` foi blindada e esta função não era — e é ela que roda PRIMEIRO
       em qualquer fluxo real. Sem este `catch`, a exceção crua do viem subia
       inteira: medido, 16 linhas com a URL do RPC e a chave da API dentro.
       Um módulo blindado e a irmã aberta é pior que os dois abertos, porque
       passa a impressão de que a classe está tratada.

       A falha CONTINUA sendo falha — não engolimos: o motor não pode montar uma
       abertura com `nonce` inventado.

       E o erro original NÃO viaja como `cause`, de propósito. O `cause` é
       exatamente o objeto que carrega a chave; anexá-lo devolveria o vazamento
       para quem imprimisse a cadeia. Perde-se rastreabilidade e ganha-se a
       credencial — a troca está declarada aqui para ninguém a desfazer sem ver. */
    const causa = semUrl(mensagemDoErro(e)) ?? "causa desconhecida";
    throw new Error(`não consegui ler o estado do cofre ${vault}: ${causa}`);
  }
}

/**
 * Traduz o revert de `dryRunChecks` no nome que o contrato declara.
 *
 * Um seletor sem nome já é melhor que "erro": ele identifica a causa e pode ser
 * procurado. Devolver `null` silenciosamente seria jogar fora o que a chain
 * disse.
 */
/** Procura `data` PELO CAMINHO, descendo por `cause`. O dado tem lugar. */
function dadoDoErro(e: unknown, profundidade = 0): Hex | null {
  if (!e || typeof e !== "object" || profundidade > 8) return null;
  const o = e as Record<string, unknown>;
  for (const chave of ["data", "raw", "errorData"]) {
    const v = o[chave];
    if (typeof v === "string" && /^0x[0-9a-fA-F]*$/.test(v) && v.length >= 10) return v as Hex;
    /* viem às vezes aninha: `{ data: { data: "0x..." } }` */
    if (v && typeof v === "object") {
      const dentro = dadoDoErro(v, profundidade + 1);
      if (dentro) return dentro;
    }
  }
  for (const chave of ["cause", "walk", "details", "error"]) {
    const dentro = dadoDoErro(o[chave], profundidade + 1);
    if (dentro) return dentro;
  }
  return null;
}

export function nomeDoRevert(e: unknown): string | null {
  /* PELO CAMINHO primeiro, e não por varredura de texto.
     A versão anterior fazia `JSON.stringify(e)` e casava `0x[0-9a-fA-F]{8,}`.
     Medido com um erro no formato REAL do viem — que traz `address`,
     `functionName` e `args` ANTES do `data`: ela devolvia `0xdbcc3fb1`, os
     quatro primeiros bytes do ENDEREÇO DO COFRE, em vez de `0x59bf6600`.
     A tradução então não achava entrada, e a tela mostrava um hexadecimal sem
     sentido no lugar de "aponte uma estratégia" — que é o valor inteiro desta
     função. O teste antigo passava porque usava um erro sintético, com `data`
     no topo e nada mais: provava o caso que não acontece. */
  const doCaminho = dadoDoErro(e);
  if (doCaminho) {
    try {
      return decodeErrorResult({ abi: vaultErrorsAbi, data: doCaminho }).errorName;
    } catch {
      /* Não está entre os erros que conhecemos: o seletor cru ainda identifica a
         causa e pode ser procurado no artefato. */
      return doCaminho.slice(0, 10);
    }
  }

  /* Último recurso: varredura de texto, exigindo EXATAMENTE 8 hex seguidos de
     fim ou de não-hex. Um seletor tem 4 bytes; um endereço tem 20, e o `{8}`
     com fronteira recusa os dois casos que a versão anterior confundia.
     `stringify` sob try/catch porque objeto de erro com ciclo é comum, e
     derrubar a leitura inteira por causa disso seria trocar um revert
     mal-nomeado por um processo morto. */
  let texto = "";
  try { texto = JSON.stringify(e ?? ""); } catch { return null; }
  const m = /0x[0-9a-fA-F]{8}(?![0-9a-fA-F])/.exec(texto);
  if (!m) return null;
  try {
    return decodeErrorResult({ abi: vaultErrorsAbi, data: m[0] as Hex }).errorName;
  } catch {
    return m[0];
  }
}

/**
 * Os argumentos que o erro carrega, nomeados pelo ABI. `null` quando o erro não
 * tem argumentos — aí o nome já disse tudo.
 *
 * Separada de `nomeDoRevert` de propósito: o contrato daquela função é devolver
 * o NOME, e está correto. Esta acrescenta, não altera.
 */
export function detalheDoRevert(e: unknown): string | null {
  const data = dadoDoErro(e);
  if (!data) return null;
  try {
    const d = decodeErrorResult({ abi: vaultErrorsAbi, data });
    if (!d.args || d.args.length === 0) return null;
    const nomes = d.abiItem.inputs;
    return d.args
      .map((v, i) => `${nomes[i]?.name ?? i}: ${String(v)}`)
      .join(" · ");
  } catch {
    return null;
  }
}

export async function simular(
  client: VaultClient, vault: Address, base: Address, candidateLotId = 0n,
): Promise<Simulacao> {
  try {
    const r = (await client.readContract({
      address: vault, abi: vaultAbi, functionName: "dryRunChecks",
      args: [candidateLotId, base],
    })) as readonly [number, Address, Address, bigint, bigint, bigint];
    return {
      ok: true,
      intent: {
        side: Number(r[0]), asset: r[1], base: r[2],
        amountIn: BigInt(r[3]), minOut: BigInt(r[4]), lotId: BigInt(r[5]),
      },
    };
  } catch (e) {
    const erro = nomeDoRevert(e);
    /* `??` e não um ternário sobre `erro`. São QUATRO os caminhos em que a falha
       chega aqui, e o ternário só cobria dois:
         1. erro nomeado COM argumentos  -> os argumentos
         2. erro nomeado SEM argumentos  -> a mensagem
         3. seletor cru desconhecido     -> a mensagem, que é tudo o que resta
         4. nome vindo da varredura de texto (sem `data` no caminho) -> a mensagem
       O caso 3 era o pior: sem tradução e sem nome conhecido, a mensagem era a
       única coisa em que se apoiar, e o ternário a descartava porque `erro` era
       truthy. Medido: `erro: "0xdeadbeef"` com "ERC20 transfer amount exceeds
       allowance" perdido. */
    const detalhe = semUrl(detalheDoRevert(e) ?? mensagemDoErro(e));
    return { ok: false, erro, oQueFazer: erro ? (oQueFazer[erro] ?? null) : null, detalhe };
  }
}
