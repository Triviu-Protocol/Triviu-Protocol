/**
 * O QUE NUNCA SAI DO MOTOR.
 *
 * Este módulo existe porque a URL do RPC carrega a credencial DENTRO dela:
 * `polygon-mainnet.g.alchemy.com/v2/<CHAVE>`. Não é um header que se possa
 * omitir — é o endereço em si.
 *
 * Medido contra viem 2.55.2, com transporte em `127.0.0.1:1` e uma chave
 * plantada na URL:
 *
 *     === .message ===                        === .shortMessage ===
 *     HTTP request failed.                    HTTP request failed.
 *     URL: http://127.0.0.1:1/v2/SEGREDO      (nada mais)
 *     Request body: {"method":"eth_..."}
 *     Version: viem@2.55.2
 *
 * E a exceção de `submitCycle` — a única função do motor que gasta — sai com
 * 19 linhas dessas. O catch de topo do `index.ts` imprimia isso cru.
 *
 * REFUTADO, para ninguém reinvestigar: a CHAVE PRIVADA não vaza por aqui.
 * `privateKeyToAccount` com chave malformada devolve "invalid private key,
 * expected hex or 32 bytes, got string" e não ecoa o valor em campo nenhum, e
 * ela não aparece em nenhum campo da exceção de `submitCycle`.
 *
 * A redação mora AQUI, num lugar só. Cópia em N arquivos é o defeito voltando
 * com outra roupa.
 */

/** Substitui qualquer URL do texto. `null` e vazio atravessam intactos. */
export function semUrl(texto: string | null): string | null {
  if (!texto) return texto;
  return (
    texto
      /* Qualquer esquema, não só http/https: `ws://` e `wss://` também são
         transportes de RPC e carregam a mesma chave. */
      .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, "[url removida]")
      /* E host+caminho SEM esquema, que atravessa qualquer regex que exija
         `://`. O último rótulo antes da barra tem de ser alfabético
         (`[a-z]{2,}`), e é isso que impede o filtro de comer o que não é
         endereço:
           `src/vault/leitura.ts`  -> "src" não tem ponto antes da barra
           `1.2.3/4`               -> "3" não é alfabético
           `config/params.toml`    -> "config" não tem ponto antes da barra
         Redigir de mais também é defeito, e o teste de sobrevivência é quem
         prende essa fronteira no lugar. */
      .replace(/\b[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.[a-z]{2,}\/\S*/gi, "[url removida]")
  );
}

/**
 * A mensagem que o erro traz, sem a URL.
 *
 * `shortMessage` ANTES de `.message`, e por medição: todo erro do viem é um
 * `Error`, então testar `instanceof Error` primeiro fazia o `.message` ganhar
 * sempre e deixava o ramo do `shortMessage` inalcançável para o caso que esta
 * função existe para tratar. Acesso por colchete alcança o `message` de um
 * `Error` pela cadeia de protótipo, então não é preciso um ramo separado.
 *
 * A ordem sozinha NÃO é a defesa — `semUrl` é. A ordem só reduz o ruído.
 */
export function mensagemDoErro(e: unknown): string | null {
  if (typeof e === "string") return e || null;
  if (!e || typeof e !== "object") return null;
  for (const chave of ["shortMessage", "message", "details"]) {
    const v = (e as Record<string, unknown>)[chave];
    if (typeof v === "string" && v) return v;
  }
  return null;
}

/**
 * O que imprimir de um erro sem publicar credencial.
 *
 * É esta função que os `catch` de topo devem usar. `console.error(err)` cru
 * despeja o objeto inteiro do viem — 19 linhas, `URL:` inclusa.
 */
export function erroParaLog(e: unknown): string {
  const m = semUrl(mensagemDoErro(e));
  if (m) return m;
  let bruto: string;
  try {
    bruto = String(e);
  } catch {
    /* Objeto com `toString` hostil: um erro não pode derrubar o log do erro. */
    return "erro sem mensagem legível";
  }
  return semUrl(bruto) ?? "erro sem mensagem legível";
}

/**
 * Para onde o motor está apontado, no mínimo que responde a pergunta.
 *
 * A pergunta é "estou no fork local ou na mainnet?". Host raiz e porta
 * respondem isso. Tudo o mais é lugar onde credencial cabe:
 *
 *   - CAMINHO   `/v2/<CHAVE>`        — Alchemy, Infura
 *   - QUERY     `?apiKey=<CHAVE>`
 *   - USERINFO  `usuario:<SENHA>@`
 *   - SUBDOMÍNIO `<CHAVE>.rpc.exemplo`
 *
 * Os três primeiros `URL.origin` já descarta — medido, não presumido. O QUARTO
 * não: `origin` só o deixava em minúsculas, e um provedor que ponha credencial
 * no subdomínio continuaria publicando. Não posso descartar que exista, então o
 * subdomínio cai também.
 *
 * E o retorno NÃO tem esquema, de propósito: tudo o que sai pelo módulo de
 * saída passa por `semUrl`, e `https://alchemy.com` casaria `://` e viraria
 * `[url removida]` — a linha de diagnóstico apagaria a si mesma. Sem esquema e
 * sem barra, o resultado atravessa a redação por construção, não por sorte.
 */
export function origemDe(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    /* Não é URL: pode ser qualquer coisa, então trata como texto suspeito. */
    return semUrl(url) ?? "[url removida]";
  }
  const porta = u.port ? `:${u.port}` : "";
  return hostRaiz(u.hostname) + porta;
}

/** `polygon-mainnet.g.alchemy.com` -> `alchemy.com`. IP e host simples ficam. */
function hostRaiz(hostname: string): string {
  /* IPv4 (`127.0.0.1`) e IPv6 (`[::1]`) não têm subdomínio para cair, e
     loopback não carrega chave de provedor nenhuma. */
  if (/^[\d.]+$/.test(hostname) || hostname.startsWith("[")) return hostname;
  const rotulos = hostname.split(".");
  return rotulos.length <= 2 ? hostname : rotulos.slice(-2).join(".");
}
