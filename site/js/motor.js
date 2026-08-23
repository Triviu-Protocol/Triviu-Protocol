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

  /* A largura que o tipo DECLARA. `palNum` nunca soube de qual tipo foi chamada:
     uint8 e uint256 codificavam pela mesma funcao, e por isso 999 num campo de
     oito bits saia como uma palavra de 256 bits que a tela dizia ser 999 e a
     chain leria como 231. TUBARAO-25. */
  function larguraDe(tipo) {
    var m = /^(u?int)(\d+)$/.exec(String(tipo));
    if (!m) return null;
    var bits = Number(m[2]);
    if (!(bits > 0 && bits <= 256 && bits % 8 === 0)) return null;
    return { comSinal: m[1] === "int", bits: bits };
  }

  function limitesDe(L) {
    if (L.comSinal) {
      var meio = 1n << BigInt(L.bits - 1);
      return { piso: -meio, teto: meio - 1n };
    }
    return { piso: 0n, teto: (1n << BigInt(L.bits)) - 1n };
  }

  /* O que a TELA mostra, lido como valor. Estrito de proposito — cada recusa
     aqui corresponde a um jeito medido de a tela prometer uma coisa e a chain
     executar outra. */
  function valorDaTela(tipo, v) {
    if (tipo === "address") {
      if (!END.test(String(v))) throw new Error("o valor exibido nao e um endereco: " + v);
      return String(v).toLowerCase();
    }
    if (tipo === "bool") {
      if (v === true || v === "true") return true;
      if (v === false || v === "false") return false;
      throw new Error("campo bool exibindo " + JSON.stringify(v) + ": aqui vale `true` ou " +
        "`false`, e nada mais. Texto qualquer e verdadeiro em JavaScript — foi assim que a " +
        "STRING \"false\" virou 1 e `setAllowedAsset(token, false)` liberou o ativo que a tela " +
        "dizia estar bloqueando.");
    }
    var L = larguraDe(tipo);
    if (!L) throw new Error("tipo sem largura conhecida: " + tipo);
    var t = typeof v === "string" ? v.trim() : v;
    if (t === "" || t === null || t === undefined) {
      throw new Error("campo " + tipo + " vazio. Vazio nao e zero: zero se escreve `0`, e a " +
        "diferenca entre os dois e a diferenca entre um numero e um descuido.");
    }
    if (typeof t === "string" && /^[+-]?0[xX]/.test(t)) {
      throw new Error("campo " + tipo + " recebeu `" + v + "`: aqui o numero se escreve em " +
        "decimal. `0x10` e dezesseis para a maquina e dez para quem le, e o cartao imprime o " +
        "texto cru — um campo aceita uma forma so.");
    }
    if (typeof t === "number" && !Number.isInteger(t)) {
      throw new Error("campo " + tipo + " recebeu " + t + ", que nao e inteiro.");
    }
    var n;
    try { n = BigInt(t); }
    catch (e) { throw new Error("campo " + tipo + " recebeu `" + v + "`, que nao e inteiro."); }
    var lim = limitesDe(L);
    if (n < lim.piso || n > lim.teto) {
      throw new Error("o valor " + n + " nao cabe em " + tipo +
        " (de " + lim.piso + " a " + lim.teto + ")");
    }
    return n;
  }

  /* O caminho INVERSO: a palavra que vai na calldata, lida de volta como valor.
     Existe para que a conferencia deixe de derivar o esperado pela mesma funcao
     que produziu o observado — comparar um erro contra ele mesmo sempre bate.
     TUBARAO-26, o achado que sustenta os outros. */
  function valorDaCalldata(tipo, palavra) {
    var w = String(palavra).toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(w)) {
      throw new Error("palavra de calldata malformada num campo " + tipo + ": " + palavra);
    }
    if (tipo === "address") {
      if (!/^0{24}/.test(w)) {
        throw new Error("a palavra do campo address carrega bytes altos nao-zerados: 0x" + w);
      }
      return "0x" + w.slice(24);
    }
    if (tipo === "bool") {
      var b = BigInt("0x" + w);
      if (b === 0n) return false;
      if (b === 1n) return true;
      throw new Error("a palavra de um campo bool nao e 0 nem 1: " + b);
    }
    var L = larguraDe(tipo);
    if (!L) throw new Error("tipo sem largura conhecida: " + tipo);
    var bruto = BigInt("0x" + w);
    var n = L.comSinal ? BigInt.asIntN(256, bruto) : bruto;
    var lim = limitesDe(L);
    if (n < lim.piso || n > lim.teto) {
      throw new Error("a calldata leva " + n + " num campo " + tipo + ", onde nao cabe");
    }
    return n;
  }

  /* Tabela escrita por extenso, e nao gerada: a lista de tipos que esta pagina
     sabe assinar tem de ser LEGIVEL aqui. `uint112` entra agora porque
     `setLimits(uint64,uint64,uint16,uint112)` o pede — e so entra depois de o
     range passar a valer, que era a condicao do Tubarao. */
  var CODIFICADOR_POR_TIPO = {
    address: function (v) { return pal(valorDaTela("address", v)); },
    bool: function (v) { return palNum(valorDaTela("bool", v) ? 1 : 0); },
    uint8: function (v) { return palNum(valorDaTela("uint8", v)); },
    uint16: function (v) { return palNum(valorDaTela("uint16", v)); },
    uint24: function (v) { return palNum(valorDaTela("uint24", v)); },
    uint32: function (v) { return palNum(valorDaTela("uint32", v)); },
    uint64: function (v) { return palNum(valorDaTela("uint64", v)); },
    uint112: function (v) { return palNum(valorDaTela("uint112", v)); },
    uint128: function (v) { return palNum(valorDaTela("uint128", v)); },
    uint256: function (v) { return palNum(valorDaTela("uint256", v)); },
    int24: function (v) { return palInt(valorDaTela("int24", v)); },
    int128: function (v) { return palInt(valorDaTela("int128", v)); },
    int256: function (v) { return palInt(valorDaTela("int256", v)); }
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

    /* Compara VALOR contra VALOR, e nao bytes contra bytes.
       A versao anterior codificava `a.valor` com a MESMA funcao que montar() usa
       para produzir a calldata, e comparava as duas saidas. Um erro dentro do
       codificador aparecia identico dos dois lados e passava: foi assim que
       `bool` recebendo a string "false" levou 1 para a chain enquanto o cartao
       imprimia `false`, com esta conferencia dizendo que estava tudo certo.
       Agora um lado vem da tela e o outro vem da calldata, pelo caminho inverso.
       Verificador que deriva o esperado pela funcao que produziu o observado nao
       verifica nada. */
    for (var i = 0; i < args.length; i++) {
      var a = args[i];
      if (!CODIFICADOR_POR_TIPO[a.tipo]) { soltas.push(a.tipo + " " + a.nome); continue; }
      if (i >= palavras) {
        throw new Error(nome + ": o cartao imprime " + args.length +
          " argumentos e a calldata so tem " + palavras + " palavras");
      }
      var naTela;
      try { naTela = valorDaTela(a.tipo, a.valor); }
      catch (e) {
        throw new Error(nome + ": o valor exibido de `" + a.nome + "` nao vale como " +
          a.tipo + " — " + (e && e.message ? e.message : String(e)));
      }
      var vinda = corpo.slice(i * 64, (i + 1) * 64);
      var naCalldata;
      try { naCalldata = valorDaCalldata(a.tipo, vinda); }
      catch (e) {
        throw new Error(nome + ": a calldata nao se le como " + a.tipo + " no campo `" +
          a.nome + "` — " + (e && e.message ? e.message : String(e)));
      }
      if (naTela !== naCalldata) {
        throw new Error(nome + ": o cartao imprime `" + a.nome + " = " + a.valor +
          "`, que vale " + naTela + ", e a calldata leva " + naCalldata + " nessa posicao");
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

  /** Os tipos, palavra a palavra, como o artefato compilado os declara. Tuplas
      sao achatadas — um struct de dez campos estaticos ocupa dez palavras, na
      ordem. Devolve null diante de qualquer tipo dinamico ou desconhecido,
      porque com tipo dinamico a posicao da palavra deixa de ser a posicao do
      argumento e a correspondencia que esta funcao promete some.

      ESTAVA FALTANDO AQUI, e a falta foi medida em 2026-08-22 ao tentar consumir
      o motor sozinho: `MOTOR.recusarAprovacaoInfinita(...)` lancava
      `ReferenceError: tiposPorPalavra is not defined`.

      Nao quebrou em producao por ACIDENTE DE ORDEM DE CARGA: as duas paginas que
      trazem motor.js — /calldata/ e /console/ — tambem trazem console.js, que a
      define como global, e o motor a alcancava por escopo lexico. Tirar
      console.js de uma dessas paginas apagaria a recusa de aprovacao ilimitada
      em SILENCIO, e o sintoma so apareceria no primeiro approve.
      Guarda que depende de coincidencia nao e guarda.

      O cabecalho deste arquivo diz que cada funcao aqui saiu VERBATIM de
      console-lp.js. Esta saiu do mesmo lugar, e agora saiu inteira. As duas
      telas mantem a copia delas: dentro deste IIFE vale esta, por escopo lexico,
      e mexer em dois arquivos que ja passam nao estava no escopo desta onda. */
  function tiposPorPalavra(papel, assinatura) {
    /* A raiz do ABI e resolvida SEM alcancar o escopo deste modulo quando ela
       ja existe, e a razao foi medida em 2026-08-23: o check-assinatura EXTRAI
       esta funcao do arquivo e a EXECUTA isolada, injetando o ABI compilado
       como `ABI`. A primeira versao chamava `abi()` — um helper que so existe
       dentro deste IIFE — e la fora aquilo era um ReferenceError engolido pelo
       `catch` do guardiao.
       O efeito nao foi um teste vermelho apontando para ca. Foi a REGRA 6
       deixar de ser medida nos quatro caminhos de assinatura ao mesmo tempo,
       com o guardiao dizendo "nenhuma palavra sem sinal foi exercitada" —
       uma frase que se le como ruido e significa que a trava contra aprovacao
       ilimitada parou de ser exercitada.
       A regra que sai daqui: funcao que um guardiao executa isolada nao pode
       depender de escopo que so existe aqui dentro. */
    /* `raizAbi`, e nao `raiz`: `raiz` ja e o parametro do IIFE deste arquivo
       (linha 14) e significa o WINDOW. Declarar um `var raiz` aqui dentro com
       outro significado nao muda nada hoje — muda o que a proxima edicao
       encontra, dentro justamente da funcao que decide se uma aprovacao
       ilimitada e recusada. TUBARAO-24. */
    var raizAbi = (typeof ABI !== "undefined" && ABI) || abi();
    var g = (raizAbi.contratos && raizAbi.contratos[papel]) ||
            (raizAbi.extras && raizAbi.extras[papel]);
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

  function recusarAprovacaoInfinita(dados, papel, assinatura) {
    var corpo = String(dados).replace(/^0x/, "").slice(8);
    var n = Math.floor(corpo.length / 64);
    var tipos = tiposPorPalavra(papel, assinatura);
    var confiavel = !!tipos && tipos.length === n;
    for (var i = 0; i < n; i++) {
      if (!/^f{64}$/i.test(corpo.slice(i * 64, (i + 1) * 64))) continue;
      if (confiavel && /^int\d+$/.test(tipos[i])) continue;   /* -1 em complemento de dois */
      throw new Error(
        "refused to build this call: word " + (i + 1) + " of its calldata is all-ones (2^256-1), and " +
        (confiavel
          ? "the compiled artefact declares that argument as " + tipos[i] + ", which is unsigned — so " +
            "that word is the unlimited approval and not a negative number."
          : "the argument types could not be matched word for word against the compiled artefact, so " +
            "every word is treated as unsigned.") +
        " This page approves an exact amount or it approves nothing.");
    }
    return dados;
  }
  var MOTOR = {
    END: END,
    sig: sig, pal: pal, palNum: palNum, palInt: palInt, palavra: palavra,
    cargaDaTx: cargaDaTx, hashDaCarga: hashDaCarga, hashCanon: hashCanon,
    conferirTelaContraCalldata: conferirTelaContraCalldata,
    recusarAprovacaoInfinita: recusarAprovacaoInfinita,
    CODIFICADOR_POR_TIPO: CODIFICADOR_POR_TIPO,
    valorDaTela: valorDaTela, valorDaCalldata: valorDaCalldata,
    larguraDe: larguraDe, limitesDe: limitesDe
  };
  if (typeof module !== "undefined" && module.exports) { module.exports = MOTOR; }
  if (raiz) { raiz.TRIVIU_MOTOR = MOTOR; }
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : null));
