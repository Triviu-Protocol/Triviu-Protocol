/**
 * As cadeias de teste abaixo são MEDIDAS, não inventadas: saíram do viem 2.55.2
 * com uma chave plantada na URL e de mensagens reais deste repositório.
 */
import { describe, expect, it } from "vitest";
import { erroParaLog, mensagemDoErro, origemDe, semUrl } from "./redigir.js";

const CHAVE = "SEGREDO_ABC123XYZ";
const MEDIDO_DO_VIEM =
  "HTTP request failed.\n\n" +
  "URL: https://polygon-mainnet.g.alchemy.com/v2/" + CHAVE + "\n" +
  'Request body: {"method":"eth_blockNumber"}\n\n' +
  "Details: fetch failed\nVersion: viem@2.55.2";

describe("semUrl", () => {
  it("corta URL com esquema e a chave vai junto", () => {
    const saida = semUrl(MEDIDO_DO_VIEM)!;
    expect(saida).not.toContain(CHAVE);
    expect(saida).not.toContain("alchemy.com");
    expect(saida, "a redação tem de ter AGIDO, não o texto ter vindo limpo").toContain("[url removida]");
    expect(saida, "o resto da mensagem sobrevive").toContain("HTTP request failed.");
  });

  it("corta host+caminho SEM esquema — o furo que o red team atravessou", () => {
    const saida = semUrl("request to polygon-mainnet.g.alchemy.com/v2/" + CHAVE + " failed")!;
    expect(saida).not.toContain(CHAVE);
    expect(saida).toContain("[url removida]");
    expect(saida).toContain("request to");
  });

  it("corta ws:// e wss:// — websocket é transporte de RPC", () => {
    for (const esquema of ["ws", "wss"]) {
      const saida = semUrl(`socket closed — ${esquema}://rpc.exemplo.com/v2/${CHAVE}`)!;
      expect(saida, esquema).not.toContain(CHAVE);
    }
  });

  it("NÃO COME o que não é endereço", () => {
    /* Redigir de mais também é defeito. Todas reais deste repositório ou de
       mensagens do viem. */
    const legitimas = [
      "execution reverted: ERC20 transfer amount exceeds allowance",
      "Version: viem@2.55.2",
      "config/params.toml não encontrado",
      "src/vault/leitura.ts:118",
      "quantum 1.2.3/4 fora de faixa",
      "guard: 0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359 · reason: 0xdeadbeef",
      "Details: fetch failed",
      "params.toml: network.rpc_url must be a string",
      "pool 0xcA11bde05977b3631167028862bE2a173976CA11 did not answer — skipped, not guessed.",
    ];
    for (const texto of legitimas) {
      expect(semUrl(texto), `a redação comeu texto legítimo: ${texto}`).toBe(texto);
    }
  });

  it("`null` e vazio atravessam sem virar string", () => {
    expect(semUrl(null)).toBeNull();
    expect(semUrl("")).toBe("");
  });
});

describe("mensagemDoErro", () => {
  it("prefere `shortMessage` ao despejo de 7 linhas", () => {
    class ComoOViem extends Error { shortMessage = "The request took too long to respond."; }
    expect(mensagemDoErro(new ComoOViem(MEDIDO_DO_VIEM))).toBe("The request took too long to respond.");
  });

  it("alcança `message` de um `Error` comum pela cadeia de protótipo", () => {
    expect(mensagemDoErro(new Error("timeout"))).toBe("timeout");
  });

  it("não inventa mensagem onde não há", () => {
    expect(mensagemDoErro(null)).toBeNull();
    expect(mensagemDoErro({})).toBeNull();
    expect(mensagemDoErro(42)).toBeNull();
  });
});

describe("erroParaLog · o que os sinks imprimem", () => {
  it("a chave do RPC não chega ao log", () => {
    const saida = erroParaLog(new Error(MEDIDO_DO_VIEM));
    expect(saida).not.toContain(CHAVE);
    expect(saida).toContain("[url removida]");
  });

  it("erro sem `message` ainda produz alguma coisa legível", () => {
    expect(erroParaLog("caiu a rede")).toBe("caiu a rede");
    expect(erroParaLog(42)).toBe("42");
    expect(erroParaLog(null)).toBe("null");
  });

  it("objeto com `toString` hostil não derruba o log do erro", () => {
    /* Um erro ao imprimir o erro apaga a única pista que sobrou. */
    const hostil = { toString() { throw new Error("nem isso"); } };
    expect(() => erroParaLog(hostil)).not.toThrow();
    expect(erroParaLog(hostil)).toBe("erro sem mensagem legível");
  });

  it("`toString` hostil que ainda assim tem URL no `message` é redigido", () => {
    const misto = {
      message: "falhou em https://rpc.exemplo.com/v2/" + CHAVE,
      toString() { throw new Error("nem isso"); },
    };
    expect(erroParaLog(misto)).not.toContain(CHAVE);
  });
});

describe("origemDe · o diagnóstico que sobra", () => {
  it("derruba os QUATRO lugares onde credencial de provedor cabe", () => {
    /* caminho · query · userinfo · subdomínio */
    expect(origemDe("https://polygon-mainnet.g.alchemy.com/v2/" + CHAVE)).toBe("alchemy.com");
    expect(origemDe("https://rpc.exemplo.com/?apiKey=" + CHAVE)).toBe("exemplo.com");
    expect(origemDe("https://usuario:SENHA@rpc.exemplo.com/x")).toBe("exemplo.com");
    expect(origemDe("wss://rpc.exemplo.com/ws/" + CHAVE)).toBe("exemplo.com");
  });

  it("o RESÍDUO do subdomínio está FECHADO", () => {
    /* Este teste nasceu chamado "RESÍDUO DECLARADO" e afirmava o contrário:
       que `origin` deixava a chave do subdomínio passar, só em minúsculas. Era
       honesto e era um buraco conhecido. O juiz recusou buraco conhecido em
       controle de Lei do Sangue — pelo mesmo critério com que recusou "a ordem
       da lista é a defesa" — e o teste mudou de valor, que é para isso que ele
       existia. */
    const saida = origemDe("https://CHAVE_NO_SUBDOMINIO.rpc.exemplo.com/");
    expect(saida).toBe("exemplo.com");
    expect(saida.toLowerCase()).not.toContain("chave_no_subdominio");
  });

  it("preserva o que a linha serve para responder", () => {
    /* "Estou no fork local ou na mainnet?" — host e porta respondem. IP não tem
       subdomínio para cair, e loopback não carrega chave de provedor nenhuma. */
    expect(origemDe("http://127.0.0.1:8545")).toBe("127.0.0.1:8545");
    expect(origemDe("http://localhost:8545")).toBe("localhost:8545");
  });

  it("o retorno ATRAVESSA a redação — senão a linha apagaria a si mesma", () => {
    /* Tudo o que sai pela porta passa por `semUrl`. Se `origemDe` devolvesse
       esquema, `https://alchemy.com` casaria `://` e viraria `[url removida]`. */
    for (const url of ["https://polygon-mainnet.g.alchemy.com/v2/" + CHAVE, "http://127.0.0.1:8545"]) {
      const o = origemDe(url);
      expect(semUrl(o), `a redação comeu o próprio diagnóstico: ${o}`).toBe(o);
    }
  });

  it("o que não é URL cai na redação, não passa cru", () => {
    expect(origemDe("isto não é url mas tem rpc.exemplo.com/v2/" + CHAVE)).not.toContain(CHAVE);
  });
});
