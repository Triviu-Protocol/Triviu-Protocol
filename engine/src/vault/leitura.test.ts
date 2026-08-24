/**
 * O cliente é injetado, então estes testes não pedem RPC: eles medem a
 * DECODIFICAÇÃO e a tradução da recusa, que é onde o erro mora. Um teste que
 * precisasse de rede mediria o nó tanto quanto o código.
 */
import { describe, expect, it } from "vitest";
import { encodeErrorResult } from "viem";
import {
  detalheDoRevert, lerEstado, nomeDoRevert, oQueFazer, simular, vaultErrorsAbi,
  type VaultClient,
} from "./leitura.js";

const VAULT = "0xdbcc3fb13652451739008aeef0d1110863ac6d10";
const USDC = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
const WETH = "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619";

/** Um cliente que responde o que o teste mandar, e registra o que foi pedido. */
function clienteFalso(respostas: Record<string, unknown>): VaultClient & { pedidos: string[] } {
  const pedidos: string[] = [];
  return {
    pedidos,
    async readContract({ functionName }) {
      pedidos.push(functionName);
      const r = respostas[functionName];
      if (r instanceof Error) throw r;
      return r;
    },
  };
}

describe("leitura do cofre", () => {
  it("lê nonce, configEpoch e strategy — os três que entram no proposalHash", async () => {
    const c = clienteFalso({ nonce: 7n, configEpoch: 3n, strategy: WETH });
    const e = await lerEstado(c, VAULT);
    expect(e).toEqual({ nonce: 7n, configEpoch: 3n, strategy: WETH });
    /* Os três no mesmo instante: ler `nonce` cedo e submeter tarde produz um
       commitment que a chain recusa. */
    expect(c.pedidos.sort()).toEqual(["configEpoch", "nonce", "strategy"]);
  });

  it("decodifica o Intent que a estratégia propõe", async () => {
    const c = clienteFalso({ dryRunChecks: [1, WETH, USDC, 1234567n, 998877n, 0n] });
    const s = await simular(c, VAULT, USDC);
    expect(s.ok).toBe(true);
    if (!s.ok) return;
    /* `side` 1 é venda. Trocar por compra faria o cofre vender o que devia
       comprar, e o campo é um uint8 no meio de endereços — fácil de errar. */
    expect(s.intent.side).toBe(1);
    expect(s.intent.asset).toBe(WETH);
    expect(s.intent.amountIn).toBe(1234567n);
    expect(s.intent.minOut).toBe(998877n);
  });

  it("a recusa vira o NOME do erro do contrato, e não 'erro'", async () => {
    const erro = new Error("execution reverted");
    (erro as Error & { data?: string }).data = encodeErrorResult({
      abi: vaultErrorsAbi, errorName: "StrategyCallFailed",
    });
    const c = clienteFalso({ dryRunChecks: erro });
    const s = await simular(c, VAULT, USDC);
    expect(s.ok).toBe(false);
    if (s.ok) return;
    expect(s.erro).toBe("StrategyCallFailed");
    expect(s.oQueFazer).toContain("setStrategy");
  });

  it("BaseNotEnabled diz para ligar a moeda-base, não apenas que falhou", async () => {
    const erro = new Error("execution reverted");
    (erro as Error & { data?: string }).data = encodeErrorResult({
      abi: vaultErrorsAbi, errorName: "BaseNotEnabled",
    });
    const s = await simular(clienteFalso({ dryRunChecks: erro }), VAULT, USDC);
    expect(s.ok).toBe(false);
    if (s.ok) return;
    expect(s.erro).toBe("BaseNotEnabled");
    expect(s.oQueFazer).toContain("setBaseCurrency");
  });

  it("um erro que não conhecemos devolve o SELETOR, e não null", async () => {
    /* Devolver null jogaria fora o que a chain disse. Um seletor cru ainda
       identifica a causa e pode ser procurado no artefato. */
    const erro = new Error("reverted") as Error & { data?: string };
    erro.data = "0xdeadbeef";
    const s = await simular(clienteFalso({ dryRunChecks: erro }), VAULT, USDC);
    expect(s.ok).toBe(false);
    if (s.ok) return;
    expect(s.erro).toBe("0xdeadbeef");
    expect(s.oQueFazer).toBeNull();
  });

  it("todo erro do ABI tem tradução — senão a tabela mente por omissão", () => {
    /* A lista vem do ABI, não escrita à mão. Com os seis nomes fixos no teste,
       acrescentar um sétimo erro em `vaultErrorsAbi` sem tradução passava: o
       portão conferia a lista contra si mesma. */
    const doAbi = vaultErrorsAbi.filter((x) => x.type === "error").map((x) => x.name);
    expect(doAbi.length, "o ABI precisa declarar erros, senão o teste não mede nada").toBeGreaterThan(0);
    for (const nome of doAbi) {
      expect(oQueFazer[nome], `sem tradução para ${nome}`).toBeTruthy();
    }
    /* E o inverso: tradução para erro que não existe é entrada morta. */
    for (const nome of Object.keys(oQueFazer)) {
      expect(doAbi, `${nome} traduzido, mas não está no ABI`).toContain(nome);
    }
  });

  it("nomeDoRevert não inventa nome quando não há dado nenhum", () => {
    expect(nomeDoRevert(new Error("timeout"))).toBeNull();
    expect(nomeDoRevert(null)).toBeNull();
  });

  /* ── o formato REAL, que é onde a primeira versão falhava ────────────────
     Os testes acima usavam um erro sintético com `data` no topo. O viem devolve
     `address`, `functionName` e `args` ANTES, e um endereço tem 40 hex — casava
     a varredura de texto primeiro. Medido: a versão anterior devolvia
     `0xdbcc3fb1`, o começo do endereço do cofre, no lugar de `0x59bf6600`.
     O teste sintético provava o caso que não acontece. */
  it("ERRO REAL DO VIEM · o endereço vem antes do data e não pode ser confundido", () => {
    const data = encodeErrorResult({ abi: vaultErrorsAbi, errorName: "StrategyCallFailed" });
    const comoOViemDevolve = {
      name: "ContractFunctionExecutionError",
      address: VAULT,                       /* 40 hex, ANTES do data */
      functionName: "dryRunChecks",
      args: ["0", USDC],
      cause: { data },
    };
    expect(nomeDoRevert(comoOViemDevolve)).toBe("StrategyCallFailed");
  });

  it("erro com referência circular não derruba a leitura", () => {
    /* `JSON.stringify` lança em ciclo, e derrubar o processo por causa disso
       seria trocar um revert mal-nomeado por um motor morto. */
    const data = encodeErrorResult({ abi: vaultErrorsAbi, errorName: "BaseNotEnabled" });
    const circular: Record<string, unknown> = { cause: { data } };
    circular["self"] = circular;
    expect(() => nomeDoRevert(circular)).not.toThrow();
    expect(nomeDoRevert(circular)).toBe("BaseNotEnabled");
  });

  it("um endereço solto, sem data nenhum, NÃO vira nome de erro", () => {
    /* O caso puro do furo: só endereços no objeto. A versão anterior devolveria
       os primeiros quatro bytes de um deles. */
    expect(nomeDoRevert({ address: VAULT, args: [USDC, WETH] })).toBeNull();
  });

  /* ── erro COM argumentos ──────────────────────────────────────────────────
     Todos os testes acima usam erros SEM argumento: 4 bytes de `data`, só o
     seletor. `GuardRejected(address,bytes)` tem 132 bytes — o único erro com
     parâmetros da tabela, e a única faixa de tamanho que nenhum portão exercia.
     A medição existia, mas vivia num script solto no disco; um `>= 10` virado
     `=== 10` passaria por todos os outros dez testes. */
  it("erro COM argumentos (132 bytes) decodifica pelo caminho", () => {
    const data = encodeErrorResult({
      abi: vaultErrorsAbi, errorName: "GuardRejected",
      args: [USDC, "0xdeadbeef"],
    });
    expect((data.length - 2) / 2, "o vetor precisa ser longo, senão não mede nada").toBe(132);
    expect(nomeDoRevert({ address: VAULT, cause: { data } })).toBe("GuardRejected");
    expect(nomeDoRevert({ data })).toBe("GuardRejected");
  });

  it("o guardião que recusa chega até `simular` COM O ENDEREÇO e o motivo", async () => {
    /* Este teste exigia `oQueFazer` conter "recusou" — uma substring que passava
       numa frase que só repetia o nome do erro. O cofre diz QUAL guardião e POR
       QUÊ; exigir o endereço é exigir que essa informação sobreviva à leitura. */
    const erro = new Error("execution reverted") as Error & { data?: string };
    erro.data = encodeErrorResult({
      abi: vaultErrorsAbi, errorName: "GuardRejected",
      args: [WETH, "0xdeadbeef"],
    });
    const s = await simular(clienteFalso({ dryRunChecks: erro }), VAULT, USDC);
    expect(s.ok).toBe(false);
    if (s.ok) return;
    expect(s.erro).toBe("GuardRejected");
    expect(s.detalhe, "sem detalhe, o guardião e o motivo morreram na leitura").toBeTruthy();
    expect(s.detalhe, "o endereço do guardião tem de sobreviver").toContain(WETH);
    expect(s.detalhe).toContain("0xdeadbeef");
    expect(s.detalhe).toContain("guard");   /* nomeado pelo ABI, não posicional */
  });

  it("erro sem argumentos não INVENTA argumentos, mas guarda a mensagem", async () => {
    const erro = new Error("execution reverted") as Error & { data?: string };
    erro.data = encodeErrorResult({ abi: vaultErrorsAbi, errorName: "BaseNotEnabled" });
    /* O extrator de argumentos não fabrica nada quando não há argumentos... */
    expect(detalheDoRevert(erro)).toBeNull();
    /* ...e `simular` cai na mensagem, em vez de devolver `null` seco. */
    const s = await simular(clienteFalso({ dryRunChecks: erro }), VAULT, USDC);
    expect(s.ok).toBe(false);
    if (s.ok) return;
    expect(s.detalhe).toBe("execution reverted");
  });

  it("SELETOR DESCONHECIDO preserva a mensagem — é tudo o que resta", async () => {
    /* O pior dos quatro caminhos, e o que o ternário anterior descartava: sem
       tradução e sem nome conhecido, a mensagem é a única coisa em que o dono
       pode se apoiar. Medido perdendo-se: erro `0xdeadbeef`, detalhe `null`. */
    const erro = new Error("execution reverted: ERC20 transfer amount exceeds allowance") as Error & { data?: string };
    erro.data = "0xdeadbeef";
    const s = await simular(clienteFalso({ dryRunChecks: erro }), VAULT, USDC);
    expect(s.ok).toBe(false);
    if (s.ok) return;
    expect(s.erro).toBe("0xdeadbeef");
    expect(s.oQueFazer).toBeNull();
    expect(s.detalhe, "sem isto, o dono fica só com um hexadecimal").toBeTruthy();
    expect(s.detalhe).toContain("exceeds allowance");
  });

  /* ── LEI DO SANGUE ────────────────────────────────────────────────────────
     `detalhe` leva texto de erro do cliente RPC até a tela, e a `.message` do
     viem traz a URL do RPC inteira. URL de RPC de produção carrega a chave da
     API dentro dela. A mensagem abaixo é a MEDIDA contra viem 2.55.2, não uma
     inventada — só a URL foi trocada pela de um provedor real. */
  it("LEI #1 · a chave do RPC não chega ao `detalhe`", async () => {
    const CHAVE = "SEGREDO_ABC123XYZ";
    const medido =
      "HTTP request failed.\n\n" +
      "URL: https://polygon-mainnet.g.alchemy.com/v2/" + CHAVE + "\n" +
      'Request body: {"method":"eth_blockNumber"}\n\n' +
      "Details: fetch failed\nVersion: viem@2.55.2";
    /* `Error` cru, SEM `shortMessage`: é o caminho de fallback, o que continuava
       aberto quando a defesa era só a ordem da lista. */
    const s = await simular(clienteFalso({ dryRunChecks: new Error(medido) }), VAULT, USDC);
    expect(s.ok).toBe(false);
    if (s.ok) return;
    expect(s.detalhe, "detalhe vazio faria este teste passar à toa").toBeTruthy();
    expect(s.detalhe, "a chave da API vazou para a tela").not.toContain(CHAVE);
    expect(s.detalhe).not.toContain("alchemy.com");
    /* A redação DISPAROU — filtro que passa vazio não é filtro. */
    expect(s.detalhe, "a redação tem de ter agido, não o texto ter vindo limpo").toContain("[url removida]");
    /* E o que não é credencial sobrevive: redigir de mais também é defeito. */
    expect(s.detalhe).toContain("HTTP request failed.");
  });

  it("LEI #1 · URL SEM esquema também é redigida — o furo do red team", async () => {
    /* O regex exigia `://`. `polygon-mainnet.g.alchemy.com/v2/<CHAVE>` não casa
       e saía inteiro. Provado pelo Escorpião contra o filtro. */
    const CHAVE = "CHAVE_DO_ATACANTE_777";
    const s = await simular(
      clienteFalso({
        dryRunChecks: new Error("request to polygon-mainnet.g.alchemy.com/v2/" + CHAVE + " failed"),
      }),
      VAULT, USDC,
    );
    expect(s.ok).toBe(false);
    if (s.ok) return;
    expect(s.detalhe).not.toContain(CHAVE);
    expect(s.detalhe).not.toContain("alchemy.com");
    expect(s.detalhe).toContain("[url removida]");
    expect(s.detalhe, "o resto da frase tem de sobreviver").toContain("request to");
  });

  it("LEI #1 · REDAÇÃO NÃO COME O QUE NÃO É ENDEREÇO", async () => {
    /* Condição vinculante do juiz: redigir de mais também é defeito. Um filtro
       que apaga meio relatório para fechar um LOW troca um problema por outro.
       As cadeias abaixo são reais deste repositório e de mensagens do viem. */
    const legitimas = [
      "execution reverted: ERC20 transfer amount exceeds allowance",
      "Version: viem@2.55.2",
      "config/params.toml não encontrado",
      "src/vault/leitura.ts:118",
      "quantum 1.2.3/4 fora de faixa",
      "guard: 0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359 · reason: 0xdeadbeef",
      "Details: fetch failed",
    ];
    for (const texto of legitimas) {
      const s = await simular(clienteFalso({ dryRunChecks: new Error(texto) }), VAULT, USDC);
      expect(s.ok).toBe(false);
      if (s.ok) continue;
      expect(s.detalhe, `a redação comeu texto legítimo: ${texto}`).toBe(texto);
    }
  });

  it("LEI #1 · `lerEstado` não deixa a exceção crua subir — e não engole a falha", async () => {
    /* `simular` estava blindada e a irmã não, e `lerEstado` roda PRIMEIRO em
       qualquer fluxo real. Medido pelo red team: 16 linhas com a chave. */
    const CHAVE = "CHAVE_LER_ESTADO_555";
    const cru = new Error(
      "HTTP request failed.\n\nURL: https://polygon-mainnet.g.alchemy.com/v2/" + CHAVE + "\n\nDetails: fetch failed",
    );
    const c: VaultClient = { async readContract() { throw cru; } };
    await expect(lerEstado(c, VAULT), "a falha tem de continuar sendo falha").rejects.toThrow();
    let capturada: unknown;
    try { await lerEstado(c, VAULT); } catch (e) { capturada = e; }
    const msg = (capturada as Error).message;
    expect(msg, "a chave subiu junto com a exceção").not.toContain(CHAVE);
    expect(msg).not.toContain("alchemy.com");
    expect(msg, "quem lê tem de saber QUAL cofre falhou").toContain(VAULT);
    /* O `cause` não viaja de propósito: é o objeto que carrega a chave. */
    expect((capturada as Error).cause).toBeUndefined();
  });

  it("LEI #1 · websocket também é transporte de RPC e leva a mesma chave", async () => {
    const CHAVE = "CHAVE_WSS_999";
    const s = await simular(
      clienteFalso({ dryRunChecks: new Error("socket closed — wss://polygon.example/v2/" + CHAVE) }),
      VAULT, USDC,
    );
    expect(s.ok).toBe(false);
    if (s.ok) return;
    expect(s.detalhe).not.toContain(CHAVE);
    expect(s.detalhe).toContain("[url removida]");
  });

  it("erro no formato do viem usa `shortMessage`, não o despejo de 7 linhas", async () => {
    /* Todo erro do viem é `Error`, então checar `instanceof Error` primeiro fazia
       o `.message` ganhar sempre — URL, corpo da requisição e versão junto — e o
       ramo do `shortMessage` nunca rodava para o caso real. */
    class ComoOViem extends Error { shortMessage = "The request took too long to respond."; }
    const erro = new ComoOViem(
      "The request took too long to respond.\n\nURL: https://polygon-rpc.com\nRequest body: elided\n\nDetails: timeout\nVersion: viem",
    );
    const s = await simular(clienteFalso({ dryRunChecks: erro }), VAULT, USDC);
    expect(s.ok).toBe(false);
    if (s.ok) return;
    expect(s.detalhe).toBe("The request took too long to respond.");
    expect(String(s.detalhe).split("\n"), "uma linha, não sete").toHaveLength(1);
  });

  it("falha SEM revert preserva a mensagem — timeout não é recusa", async () => {
    /* Com `erro: null` sozinho, um nó fora do ar e uma recusa sem `data` viram o
       mesmo estado na tela, e as duas pedem reação oposta: tentar de novo contra
       configurar o cofre. */
    const s = await simular(clienteFalso({ dryRunChecks: new Error("HTTP request timed out") }), VAULT, USDC);
    expect(s.ok).toBe(false);
    if (s.ok) return;
    expect(s.erro).toBeNull();
    expect(s.detalhe).toBe("HTTP request timed out");
  });

  it("`data` curto demais NÃO vira seletor", () => {
    /* Um seletor tem 4 bytes: `0x` + 8 hex = 10 caracteres. O nó devolve `0x`
       puro num revert sem motivo, e isso é comum. Aceitar curto faria
       `slice(0, 10)` inventar um seletor que a chain nunca mandou. */
    expect(nomeDoRevert({ data: "0x" })).toBeNull();
    expect(nomeDoRevert({ data: "0x1234" })).toBeNull();
  });

  it("hex de 132 bytes SÓ em texto livre continua devolvendo null", () => {
    /* A troca que o juiz aceitou por escrito, cravada aqui para não afrouxar
       sem alguém perceber: a varredura de texto exige EXATAMENTE 8 hex com
       fronteira, e um `data` de 264 caracteres não tem fronteira no oitavo.
       Recusar de mais nunca custou dinheiro nesta casa. */
    const data = encodeErrorResult({
      abi: vaultErrorsAbi, errorName: "GuardRejected",
      args: [USDC, "0xdeadbeef"],
    });
    expect(nomeDoRevert({ mensagem: "reverted with " + data })).toBeNull();
  });
});
