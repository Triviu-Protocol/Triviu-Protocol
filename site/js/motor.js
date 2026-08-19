/* =============================================================================
   MOTOR — as primitivas de assinatura, num lugar so.

   Este arquivo NAO e codigo novo. Cada funcao aqui saiu VERBATIM de
   site/js/console-lp.js, o motor que o Tubarao-branco auditou e que a regra 11
   prende. Ele existe por um motivo unico e ja pago em sangue: o console do
   modelo (triviu-console-lp.html) precisa das mesmas primitivas, e a alternativa
   — copiar — e literalmente o mecanismo do F-1, duas canonicalizacoes do mesmo
   objeto que se separaram sem ninguem notar e deixaram a pagina recusando 100%
   dos envios com cinco guardioes verdes.

   Uma definicao. Dois consumidores. O guardiao exige que continue assim.
   ============================================================================= */
(function (raiz) {
  "use strict";
  /* O ABI e resolvido no PRIMEIRO USO, nao na carga: este arquivo pode ser
     incluido antes de abi-console.js e a ordem das tags nao deve decidir se a
     assinatura funciona.

     Duas coisas que a primeira versao errou, e a prova diferencial contra o
     console-lp.js pegou as duas antes de qualquer uso:

     1. cacheava o resultado mesmo quando era `undefined` — bastava uma chamada
        antes do livro carregar para o motor ficar quebrado para sempre, e
        silenciosamente.
     2. trocava o erro alto do original ("no such signature in the compiled
        ABI") por um `Cannot read properties of undefined`, que nao diz a quem
        le o que fazer.

     Guardar so o que resolveu, e falhar dizendo o nome do que falta. */
  var ABI = null;
  function abi() {
    if (ABI) return ABI;
    var a = raiz && raiz.TRIVIU_ABI;
    if (!a || !a.contratos) {
      throw new Error("TRIVIU_ABI nao carregou: /js/abi-console.js precisa vir antes de qualquer assinatura");
    }
    ABI = a;
    return ABI;
  }
  var END = /^0x[0-9a-fA-F]{40}$/;
  function hashCanon(canon) {
    if (!window.crypto || !window.crypto.subtle) {
      return Promise.reject(new Error(
        "this browser exposes no crypto.subtle on this origin, so the transaction cannot be frozen " +
        "and hashed. Nothing is offered for signature without that freeze — the freeze is the only " +
        "thing tying what you read to what you send."));
    }
    return window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(canon)).then(function (buf) {
      var a = new Uint8Array(buf), out = "";
      for (var i = 0; i < a.length; i++) out += a[i].toString(16).padStart(2, "0");
      return out;
    });
  }

  function cargaDaTx(tx) {
    return Object.freeze({ from: tx.de, to: tx.to, data: tx.data, value: tx.value });
  }

  function hashDaCarga(carga, chainId) {
    return hashCanon(
      "chainId=" + String(chainId) +
      "|from=" + String(carga.from).toLowerCase() +
      "|to=" + String(carga.to).toLowerCase() +
      "|data=" + String(carga.data).toLowerCase() +
      "|value=" + String(carga.value).toLowerCase());
  }

  function sig(papel, assinatura) {
    var g = (abi().contratos && ABI.contratos[papel]) || (abi().extras && ABI.extras[papel]);
    var f = g && g.funcoes && g.funcoes[assinatura];
    if (!f) throw new Error("no such signature in the compiled ABI: " + papel + "." + assinatura);
    return f.seletor;
  }

  function pal(hex) { return String(hex).replace(/^0x/, "").toLowerCase().padStart(64, "0"); }

  function palNum(v) { return BigInt(v).toString(16).padStart(64, "0"); }

  function palInt(v) { return BigInt.asUintN(256, BigInt(v)).toString(16).padStart(64, "0"); }

  function palavra(hex, i) { var x = String(hex).replace(/^0x/, ""); return x.slice(i * 64, (i + 1) * 64); }

  var CODIFICADOR_POR_TIPO = {
    address: function (v) {
      if (!END.test(String(v))) throw new Error("o valor exibido nao e um endereco: " + v);
      return pal(v);
    },
    uint8: palNum, uint16: palNum, uint24: palNum, uint32: palNum,
    uint64: palNum, uint128: palNum, uint256: palNum,
    int24: palInt, int128: palInt, int256: palInt,
    bool: function (v) { return palNum(v ? 1 : 0); }
  }

  function conferirTelaContraCalldata(p) {
    var nome = p.assinatura || "(passo sem assinatura)";
    var dados = String(p.dados == null ? "" : p.dados).replace(/^0x/, "").toLowerCase();
    if (!/^[0-9a-f]*$/.test(dados)) throw new Error(nome + ": a calldata tem caractere fora do hexadecimal");
    if (dados.length < 8) throw new Error(nome + ": a calldata nao tem nem os 4 bytes do seletor");

    /* O seletor sai OUTRA VEZ da assinatura que o cartao imprime, e nao do que
       ja esta na calldata. Cartao dizendo uma funcao e bytes chamando outra e
       exatamente o ataque que isto fecha. */
    var esperadoSel = String(sig(p.papel, p.assinatura)).replace(/^0x/, "").toLowerCase();
    if (dados.slice(0, 8) !== esperadoSel) {
      throw new Error(nome + ": o cartao imprime esta funcao e a calldata leva o seletor 0x" +
        dados.slice(0, 8) + ", que e de outra");
    }

    var corpo = dados.slice(8);
    if (corpo.length % 64 !== 0) {
      throw new Error(nome + ": os argumentos nao fecham em palavras de 32 bytes (" +
        (corpo.length / 2) + " bytes)");
    }
    var palavras = corpo.length / 64;
    var args = p.args || [];
    var ligadas = 0;
    var soltas = [];

    for (var i = 0; i < args.length; i++) {
      var a = args[i];
      var cod = CODIFICADOR_POR_TIPO[a.tipo];
      if (!cod) { soltas.push(a.tipo + " " + a.nome); continue; }
      if (i >= palavras) {
        throw new Error(nome + ": o cartao imprime " + args.length +
          " argumentos e a calldata so tem " + palavras + " palavras");
      }
      var esperada;
      try { esperada = String(cod(a.valor)).toLowerCase(); }
      catch (e) {
        throw new Error(nome + ": o valor exibido de `" + a.nome + "` nao codifica como " +
          a.tipo + " — " + (e && e.message ? e.message : String(e)));
      }
      var vinda = corpo.slice(i * 64, (i + 1) * 64);
      if (esperada !== vinda) {
        throw new Error(nome + ": o cartao imprime `" + a.nome + " = " + a.valor +
          "`, que codifica " + esperada + ", e a calldata leva " + vinda + " nessa posicao");
      }
      ligadas += 1;
    }

    /* Sobra e tao grave quanto diferenca: bytes indo para a carteira que a tela
       nunca imprimiu. So da para exigir contagem exata quando TODO argumento e
       de tipo estatico — com tipo dinamico a cabeca leva deslocamento e a cauda
       vem depois, e a conta nao e mais de um-para-um. Nesse caso a checagem nao
       e silenciosamente pulada: o que ficou solto sai no cartao, pelo nome. */
    if (soltas.length === 0 && palavras !== args.length) {
      throw new Error(nome + ": a calldata leva " + palavras + " palavras e o cartao mostra " +
        args.length + " — ha bytes indo para a carteira que a tela nao imprime");
    }

    return { ligadas: ligadas, palavras: palavras, soltas: soltas };
  }

  /* ==========================================================================
   * A DEPENDENCIA QUE FICOU PARA TRAS · defeito VIVO ate 2026-08-19
   * ==========================================================================
   *
   * `recusarAprovacaoInfinita` foi extraida para ca e chamava `tiposPorPalavra`,
   * que ficou nas DUAS telas — dentro do IIFE de cada uma. Closure em JavaScript
   * captura o escopo onde a funcao foi DEFINIDA, nao onde e chamada. Entao a
   * regra 6, a que impede aprovacao ilimitada, lancava
   * `ReferenceError: tiposPorPalavra is not defined` em TODA invocacao.
   *
   * Medido em 2026-08-19, e nao inferido:
   *   git show HEAD:site/js/motor.js   -> chama 1x, define 0x
   *   curl .../js/motor.js (producao)  -> chama 1x, define 0x
   *   node -e "MOTOR.recusarAprovacaoInfinita(...)" -> ReferenceError
   *
   * Consequencia em producao: todo passo de `approve` lancava ANTES de montar
   * calldata, nas duas telas que assinam. Falhou FECHADO — nada foi assinado,
   * que e a direcao misericordiosa — e o fluxo central do produto estava
   * quebrado no ar sem que nenhum portao visse.
   *
   * E e exatamente o mecanismo que o cabecalho deste arquivo descreve como razao
   * de existir: "duas canonicalizacoes do mesmo objeto que se separaram sem
   * ninguem notar". A extracao que consertou o F-1 abriu este, deixando metade
   * da dupla para tras.
   *
   * A funcao vem VERBATIM das telas — as duas copias eram byte-identicas — com
   * uma unica troca: `ABI` vira `abi()`, o resolvedor preguicoso deste arquivo,
   * porque aqui o livro nao esta no escopo do modulo.
   */
  function tiposPorPalavra(papel, assinatura) {
    /* VERBATIM das telas, e o `ABI` livre e de proposito.
       Trocar por `abi()` parecia mais seguro e quebrou o `provarRegra6` do
       `check-assinatura`, que EXTRAI o fonte desta funcao e o executa com
       `new Function("ABI", ...)` — nesse escopo `abi` nao existe, toda assinatura
       era pulada, e o portao passou a dizer "nenhuma palavra sem sinal foi
       exercitada". No motor `ABI` ja esta resolvido quando esta funcao roda:
       `recusarAprovacaoInfinita(sig(...) + ...)` avalia `sig()` primeiro, e e
       `sig()` que chama `abi()`. */
    /* O livro vem do `ABI` livre quando ha um — e ha em dois contextos diferentes:
       no motor, resolvido por `sig()` antes desta chamada; e dentro do
       `provarRegra6` do `check-assinatura`, que EXTRAI o fonte desta funcao e a
       executa com `new Function("ABI", ...)`. Nomear `abi()` aqui quebraria o
       segundo, e assumir `ABI` ja resolvido quebra quem chama a regra 6 direto,
       sem `sig()` antes. O fallback cobre os dois sem nomear nenhum dos dois. */
    var livro = ABI || (typeof window !== "undefined" && window && window.TRIVIU_ABI) || null;
    if (!livro) return null;
    var g = (livro.contratos && livro.contratos[papel]) || (livro.extras && livro.extras[papel]);
    var f = g && g.funcoes && g.funcoes[assinatura];
    if (!f || !f.entradas) return null;
    var fora = [], ok = true;
    function achatar(tipo) {
      tipo = String(tipo).trim();
      if (/^\(.*\)$/.test(tipo)) {
        var s = tipo.slice(1, -1), n = 0, atual = "";
        for (var i = 0; i < s.length; i++) {
          var c = s.charAt(i);
          if (c === "(") n += 1;
          else if (c === ")") n -= 1;
          if (c === "," && n === 0) { achatar(atual); atual = ""; continue; }
          atual += c;
        }
        if (atual.trim()) achatar(atual);
        return;
      }
      if (!/^(address|bool|uint\d+|int\d+|bytes\d+)$/.test(tipo)) { ok = false; return; }
      fora.push(tipo);
    }
    f.entradas.forEach(function (e) { achatar(e.tipo); });
    return ok ? fora : null;
  }

  /* ==========================================================================
   * F-6b · "ILIMITADO" E MAGNITUDE, NAO UM VALOR EXATO
   * ==========================================================================
   *
   * A primeira versao recusava exatamente UM numero: `2^256-1`. Passavam
   * `2^255`, `type(uint128).max` e `0xffffffffffffffffffffffff` — o maximo de 96
   * bits, que e o padrao de allowance de UNI, COMP e de todo token que guarda
   * permissao em 96 bits. Todos ilimitados na pratica, todos aprovados.
   *
   * O mais duro: a propria pagina SABE dizer isso, e diz — no caminho de
   * LEITURA, em `console-lp.js`: "so it is unlimited in practice whatever the
   * exact number says". A regra 7 e semantica sobre magnitude; a regra 6 era
   * literal sobre bytes. As duas nunca conversaram, e o gate F-6b e essa
   * conversa que faltava.
   *
   * O CORTE E 2^128, e ele nao e arbitrario. Um token de 18 casas com
   * fornecimento de um trilhao de unidades tem 1e30 unidades-base. 2^128 e
   * ~3,4e38 — oito ordens de grandeza acima do maior fornecimento plausivel.
   * Nenhuma aprovacao honesta precisa passar dali; qualquer valor acima e
   * ilimitado na pratica, escreva-se como se escrever.
   *
   * `int` continua isento: em complemento de dois, palavra alta e numero
   * negativo, e -1 num campo assinado nao e aprovacao infinita. Quando o
   * artefato nao casa palavra a palavra, tudo e tratado como sem sinal — recusar
   * demais e o modo de falha correto aqui.
   */
  /* DUAS REGRAS, porque magnitude sozinha nao alcanca.
   *
   * Um corte so por tamanho tem de escolher entre deixar passar `uint96 max`
   * (~7,9e28) ou reprovar uma quantia legitima grande — um bilhao de tokens de
   * 18 casas e 1e27, a uma ordem de distancia. Nao ha numero que separe os dois
   * com folga.
   *
   * O que separa e a FORMA. "Ilimitado" nao e um numero qualquer: e sempre um
   * maximo canonico, `2^N - 1`, porque quem escreve `type(uintN).max` esta
   * dizendo "sem limite" e nao "esta quantia". Uma quantia real cair exatamente
   * num desses e coincidencia de 1 em 2^N.
   *
   *   REGRA A · o valor e `2^N - 1` para uma largura usada em allowance
   *   REGRA B · o valor passa de 2^128, que e absurdo por tamanho sozinho
   *
   * A largura de 96 bits esta na lista porque e o padrao de UNI, COMP e de todo
   * token que guarda permissao em 96 bits — o caso exato que o Tubarao-branco
   * nomeou ao abrir o F-6b, e o que a primeira versao desta regra deixava passar. */
  var TETO_APROVACAO = (1n << 128n);
  var LARGURAS_MAX = [64, 88, 96, 104, 112, 120, 128, 160, 192, 208, 224, 240, 256];
  function ehMaximoCanonico(v) {
    for (var i = 0; i < LARGURAS_MAX.length; i++) {
      if (v === (1n << BigInt(LARGURAS_MAX[i])) - 1n) return LARGURAS_MAX[i];
    }
    return 0;
  }

  function recusarAprovacaoInfinita(dados, papel, assinatura) {
    var corpo = String(dados).replace(/^0x/, "").slice(8);
    var n = Math.floor(corpo.length / 64);
    var tipos = tiposPorPalavra(papel, assinatura);
    var confiavel = !!tipos && tipos.length === n;
    for (var i = 0; i < n; i++) {
      var pal32 = corpo.slice(i * 64, (i + 1) * 64);
      var v;
      try { v = BigInt("0x" + pal32); } catch (e) { continue; }
      var largura = ehMaximoCanonico(v);
      if (!largura && v < TETO_APROVACAO) continue;
      if (confiavel && /^int\d+$/.test(tipos[i])) continue;   /* -1 em complemento de dois */

      throw new Error(
        "refused to build this call: word " + (i + 1) + " of its calldata is 0x" +
        pal32.replace(/^0+/, "") + ", which is " +
        (largura
          ? "type(uint" + largura + ").max — the canonical way of writing \"no limit\". A real amount " +
            "landing exactly on it is a 1-in-2^" + largura + " coincidence, and this page does not bet on that"
          : "above 2^128: no honest approval needs a number eight orders of magnitude past the " +
            "largest plausible token supply") +
        ". It is unlimited in practice whatever the exact number says. " +
        (confiavel
          ? "The compiled artefact declares that argument as " + tipos[i] + ", which is unsigned."
          : "The argument types could not be matched word for word against the compiled artefact, " +
            "so every word is treated as unsigned.") +
        " This page approves an exact amount or it approves nothing.");
    }
    return dados;
  }
  /* ==========================================================================
   * F-4 · O PROVEDOR E CAPTURADO UMA VEZ, E A TROCA DELE E UM EVENTO
   * ==========================================================================
   *
   * Gate aberto pelo Tubarao-branco em 2026-08-12: "window.ethereum confiado
   * como ultimo a escrever". Classificado MEDIUM em 2026-08-19, e a ameaca nao
   * e um atacante — e uma colisao corriqueira:
   *
   *   duas carteiras instaladas disputam `window.ethereum` (MetaMask e Coinbase
   *   Wallet fazem isso). A segunda vence a corrida DEPOIS da carga da pagina.
   *   O codigo antigo relia `window.ethereum` a cada chamada, entao passava a
   *   falar com o objeto NOVO — enquanto os listeners de `chainChanged`, que
   *   foram registrados uma unica vez na carga, seguiam presos ao objeto VELHO.
   *   O usuario troca de chain, o handler nao dispara, e a calldata congelada
   *   para uma chain fica armada para ser assinada em outra.
   *
   * O handler que deveria impedir isso esta escrito e correto. Ele so nunca era
   * chamado. Era o F-5 desarmado pelo F-4 — e por isso os dois se fecham aqui.
   *
   * A DESCOBERTA E PADRAO, NAO INVENCAO. O EIP-6963 existe exatamente porque
   * `window.ethereum` e um slot unico que varias carteiras disputam: cada uma
   * ANUNCIA a si mesma num evento, com um `uuid` estavel, e a pagina escolhe em
   * vez de aceitar quem escreveu por ultimo. A Escada de Reuso parou no degrau 4
   * (feature nativa da plataforma) — nao ha descoberta a escrever, ha padrao a
   * usar. `window.ethereum` fica como fallback para carteira que ainda nao
   * anuncia.
   *
   * FALHA FECHADA NA TROCA. Quando a identidade do provedor muda, esta camada
   * NAO tenta adivinhar o que aconteceu enquanto ninguem olhava: ela avisa quem
   * assina, e quem assina invalida. Trocar de provedor no meio de uma calldata
   * congelada e indistinguivel de trocar de chain sem aviso — e a resposta certa
   * para o indistinguivel e recusar, nao supor.
   */
  /* ESTE ARQUIVO NAO FALA COM A CARTEIRA — ele so a ENCONTRA e a segura.
   *
   * Tentei centralizar aqui a allowlist e a chamada. O `check-assinatura` recusou,
   * e recusou com razao: um arquivo que chama `eth_sendTransaction` E um assinante,
   * e assinante tem de cumprir congelamento, regra 6 sobre os bytes e regra 11 —
   * que uma biblioteca de primitivas nao tem como cumprir, porque nao tem fluxo.
   *
   * Entao a divisao ficou nesta linha, e ela e a que o portao desenhou: o motor
   * DESCOBRE e GUARDA; quem CHAMA e a tela, com a allowlist dela. Por isso
   * `descobrirProvedor` recebe o fallback de fora em vez de ler `window.ethereum`
   * — tocar o slot aqui faria deste arquivo um alcancador de carteira sem trava,
   * que e exatamente o que o portao veta. */
  var PROVEDOR = null;        // o objeto capturado · unica fonte
  var UUID = null;            // identidade estavel (EIP-6963) quando ha
  var OUVINTES = [];          // { evento, fn } re-registrados a cada troca
  var AO_TROCAR = [];         // quem quer saber que o provedor mudou

  function anexarOuvintes(p) {
    if (!p || typeof p.on !== "function") return 0;
    for (var i = 0; i < OUVINTES.length; i++) p.on(OUVINTES[i].evento, OUVINTES[i].fn);
    return OUVINTES.length;
  }
  function desanexarOuvintes(p) {
    if (!p || typeof p.removeListener !== "function") return;
    for (var i = 0; i < OUVINTES.length; i++) p.removeListener(OUVINTES[i].evento, OUVINTES[i].fn);
  }

  /* Adota um provedor. Devolve `true` se a identidade MUDOU — e mudanca de
     identidade e o que dispara a invalidacao la em cima. */
  function adotar(p, uuid) {
    if (!p) return false;
    var mesmo = (p === PROVEDOR) && (uuid == null || uuid === UUID);
    if (mesmo) return false;
    var tinha = PROVEDOR !== null;
    desanexarOuvintes(PROVEDOR);
    PROVEDOR = p;
    UUID = uuid || null;
    anexarOuvintes(PROVEDOR);
    if (tinha) for (var i = 0; i < AO_TROCAR.length; i++) AO_TROCAR[i](UUID);
    return tinha;
  }

  function provedor() { return PROVEDOR; }

  /* Registra um ouvinte UMA vez na lista, e o anexa ao provedor atual. Ele
     acompanha as trocas sozinho — quem chama nunca mais precisa re-registrar,
     que era exatamente o passo esquecido. */
  function ouvir(evento, fn) {
    OUVINTES.push({ evento: evento, fn: fn });
    if (PROVEDOR && typeof PROVEDOR.on === "function") PROVEDOR.on(evento, fn);
  }
  function aoTrocarProvedor(fn) { AO_TROCAR.push(fn); }

  /* Descoberta. Chamar cedo e chamar de novo nao faz mal: `adotar` so age quando
     a identidade muda. */
  function descobrirProvedor(aoAparecer, fallback, tardioDe) {
    if (!raiz || !raiz.addEventListener) return;
    raiz.addEventListener("eip6963:announceProvider", function (ev) {
      var d = ev && ev.detail;
      if (!d || !d.provider) return;
      var trocou = adotar(d.provider, d.info && d.info.uuid);
      if (aoAparecer) aoAparecer(d.info || null, trocou);
    });
    try { raiz.dispatchEvent(new Event("eip6963:requestProvider")); } catch (e) { /* navegador antigo */ }

    if (fallback) adotar(fallback, null);

    /* Carteira que injeta TARDE. Sem isto a pagina nascia com o botao desligado
       e nunca o religava — nao perde fundo, perde a tela. */
    raiz.addEventListener("ethereum#initialized", function () {
      var tardio = tardioDe && tardioDe();
      if (tardio) { var t = adotar(tardio, null); if (aoAparecer) aoAparecer(null, t); }
    }, { once: true });
  }

  var MOTOR = {
    END: END,
    sig: sig, pal: pal, palNum: palNum, palInt: palInt, palavra: palavra,
    cargaDaTx: cargaDaTx, hashDaCarga: hashDaCarga, hashCanon: hashCanon,
    conferirTelaContraCalldata: conferirTelaContraCalldata,
    recusarAprovacaoInfinita: recusarAprovacaoInfinita, tiposPorPalavra: tiposPorPalavra,
    CODIFICADOR_POR_TIPO: CODIFICADOR_POR_TIPO,
    provedor: provedor, ouvir: ouvir, aoTrocarProvedor: aoTrocarProvedor,
    descobrirProvedor: descobrirProvedor, adotarProvedor: adotar
  };
  if (typeof module !== "undefined" && module.exports) { module.exports = MOTOR; }
  if (raiz) { raiz.TRIVIU_MOTOR = MOTOR; }
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : null));
