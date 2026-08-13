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
    CODIFICADOR_POR_TIPO: CODIFICADOR_POR_TIPO
  };
  if (typeof module !== "undefined" && module.exports) { module.exports = MOTOR; }
  if (raiz) { raiz.TRIVIU_MOTOR = MOTOR; }
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : null));
