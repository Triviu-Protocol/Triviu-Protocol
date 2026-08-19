
/* =============================================================================
   /console/ — le a chain, monta a calldata, congela, e ENVIA o que congelou.

   Ate 2026-08-12 este arquivo nao tinha metodo de envio. Agora tem exatamente um,
   e a autorizacao e nominal: o fundador autorizou, com estas palavras, "a
   assinatura real no console". Nenhum veredito de predador substitui essa frase,
   e ela autoriza isto e nada alem — a lista de metodos de carteira cresceu em UM.

   As dez regras do Tubarao-branco estao implementadas como CODIGO neste arquivo,
   nao como comentario. Onde uma regra vira uma linha, a linha esta marcada:

     R1  origem unica          conferirOrigem() — knownHosts de /domain.config.json
     R2  endereco de calldata  travarEnderecoDoLivro() · travarTokenParaCalldata()
     R3  congelamento          CONGELAMENTO · cargaDaTx() + hashDaCarga() · UMA
                               canonicalizacao dos dois lados · conferido no clique
     R4  chain no clique       eth_chainId IMEDIATAMENTE antes do request
     R5  allowlist +1          CARTEIRA_PERMITIDO — quatro, e o resto LANCA
     R6  zero aprovacao infinita  recusarAprovacaoInfinita() sobre os BYTES
     R7  allowance existente   lerAllowance() antes de pedir outra, e o passo de zerar
     R8  value explicito       toda tx congelada carrega value, nunca por omissao
     R9  nada em innerHTML     innerHTML so recebe "" · o resto e textContent
     R10 estimativa que reverte bloqueia  p.podeEnviar

   As travas LANCAM excecao em vez de avisar. Uma promessa em prosa qualquer um
   edita; um throw tem de ser apagado, e apagar aparece no diff. Sao conferidas de
   fora por scripts/check-assinatura.mjs e scripts/check-console-abi.mjs.

   O elo com os contratos e a segunda invariante: nenhuma assinatura de funcao e
   nenhum seletor de 4 bytes e digitado aqui. Tudo passa por sig(papel, assinatura),
   que le a tabela gerada de contracts/out e lanca se a assinatura nao existir.
   Foi assim que o console anterior errou — nomeou 16 funcoes que os contratos nao
   tem — e e o unico jeito de o erro nao voltar.
   ========================================================================== */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var TRACO = "—";   /* o traco que significa "nao lido". Nunca um numero. */

  /* ------------------------------------------------------------------ tema -- */
  /* REGRA 9, e ela comeca aqui e nao na calldata. Os dois icones eram strings de
     SVG entregues a innerHTML. Sao literais, e literal a regra permite — mas um
     guardiao que precisa DECIDIR se a string atribuida e literal decide errado no
     dia em que ela vier de uma variavel montada, e esse dia chega sem aviso.
     Entao os icones passam a ser construidos por DOM, innerHTML nesta pagina so
     pode receber "" (limpar), e o guardiao para de julgar: ele compara. Uma regra
     que depende de julgamento e uma regra que um dia sera julgada errado. */
  var SVGNS = "http://www.w3.org/2000/svg";
  function svgIcone(desenho) {
    var s = document.createElementNS(SVGNS, "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("fill", "none");
    s.setAttribute("stroke", "currentColor");
    s.setAttribute("stroke-width", "2");
    s.setAttribute("stroke-linecap", "round");
    s.setAttribute("stroke-linejoin", "round");
    s.setAttribute("aria-hidden", "true");
    desenho.forEach(function (d) {
      var e = document.createElementNS(SVGNS, d.tag);
      Object.keys(d.attrs).forEach(function (k) { e.setAttribute(k, d.attrs[k]); });
      s.appendChild(e);
    });
    return s;
  }
  var SOL = [
    { tag: "circle", attrs: { cx: "12", cy: "12", r: "4" } },
    { tag: "path", attrs: { d: "M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" } }
  ];
  var LUA = [
    { tag: "path", attrs: { d: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" } }
  ];
  function limpar(el) { while (el && el.firstChild) el.removeChild(el.firstChild); }
  function temaAtual() {
    var s = null;
    try { s = localStorage.getItem("triviu-theme"); } catch (e) {}
    if (s) return s;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  function aplicarTema(t) {
    document.documentElement.setAttribute("data-theme", t);
    var b = $("theme"); if (!b) return;
    limpar(b);
    b.appendChild(svgIcone(t === "dark" ? SOL : LUA));
    b.setAttribute("aria-label", t === "dark" ? "Switch to light theme" : "Switch to dark theme");
  }
  aplicarTema(temaAtual());
  /* Mesma guarda do irmao /js/console-lp.js, e pelo mesmo motivo medido: sem ela,
     hospedar este motor numa pagina sem #theme mata o IIFE inteiro na carga e a
     tela de assinatura fica inerte sem erro visivel. A chave `triviu-theme` e
     partilhada, entao um controle de tema que viva fora deste arquivo continua
     concordando com aplicarTema() sem precisar deste botao existir. */
  var botaoTema = $("theme");
  if (botaoTema) {
    botaoTema.addEventListener("click", function () {
      var prox = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      try { localStorage.setItem("triviu-theme", prox); } catch (e) {}
      aplicarTema(prox);
    });
  }

  /* ============================================================== TRAVAS ==== */
  /* REGRA 5 — a lista cresceu em EXATAMENTE UM, e o um esta nomeado.
     Tres metodos devolvem algo que o usuario ja controla; o quarto envia uma
     transacao que ele aprova na propria carteira. Nao ha um quinto.

     O que continua RECUSADO nao esta escrito numa lista de proibidos, e isso e
     deliberado: a estrutura e uma allowlist, entao qualquer metodo que nao esteja
     nas quatro chaves abaixo LANCA — os de assinatura de mensagem inclusive, sem
     precisar ser nomeado. Lista de proibidos esquece um; allowlist nao tem como.
     A diferenca importa porque assinatura de mensagem e o vetor mais barato que
     existe: uma ordem off-chain assinada nao custa gas e nao aparece na chain ate
     ser usada contra voce. */
  var CARTEIRA_PERMITIDO = { eth_accounts: 1, eth_requestAccounts: 1, eth_chainId: 1, eth_sendTransaction: 1 };
  /* eth_getTransactionReceipt entra na lista de RPC, que e toda somente-leitura, e
     e ele que fecha o circuito: sem recibo, "enviei" seria a ultima coisa que esta
     pagina saberia dizer sobre a transacao.
     O comentario esta AQUI FORA e nao dentro do literal de propósito — os
     guardioes leem estas chaves com um parser de texto, e um comentario dentro das
     chaves vira uma chave inventada e um alarme falso. Alarme falso treina gente a
     ignorar guardiao, que e o unico jeito de um guardiao morrer sem ser apagado. */
  var RPC_PERMITIDO = {
    eth_call: 1, eth_chainId: 1, eth_getCode: 1, eth_getLogs: 1,
    eth_blockNumber: 1, eth_gasPrice: 1, eth_estimateGas: 1, eth_getBalance: 1,
    eth_getTransactionReceipt: 1
  };

  function pedirCarteira(metodo, params) {
    if (!CARTEIRA_PERMITIDO[metodo]) {
      throw new Error("blocked: this page may only call " +
        Object.keys(CARTEIRA_PERMITIDO).join(" / ") + " on a wallet. Refused: " + metodo);
    }
    /* F-4 · fala com o provedor CAPTURADO, nunca com o slot relido. Quem captura
       e motor.js, e a captura e uma so para as duas telas que assinam. */
    var pv = MOTOR.provedor();
    if (!pv) throw new Error("no wallet provider in this browser");
    return pv.request(params ? { method: metodo, params: params } : { method: metodo });
  }

  var idRpc = 0;
  /* F-6 · a leitura que CONFIRMA efeito sai de duas fontes. A razao inteira esta
     no gemeo `console-lp.js`: "a receipt is not proof of effect" e uma frase
     honesta quanto a natureza da prova e cega quanto a fonte dela. Endpoint
     atrasado responde estado velho; mentiroso responde o que quiser. */
  function hostDe(u) { try { return new URL(u).host; } catch (e) { return String(u); } }

  function rpcDuplo(metodo, params) {
    var escolhido = $("c-rpc").value;
    var outro = null;
    for (var i = 0; i < ENDPOINTS.length; i++) {
      if (ENDPOINTS[i] !== escolhido) { outro = ENDPOINTS[i]; break; }
    }
    if (!outro) return rpc(metodo, params).then(function (v) { return { valor: v, fontes: 1 }; });
    return Promise.all([rpcEm(escolhido, metodo, params), rpcEm(outro, metodo, params)])
      .then(function (r) {
        var x = JSON.stringify(r[0]), y = JSON.stringify(r[1]);
        if (x !== y) {
          throw new Error(
            "the two endpoints disagree about the state this transaction was supposed to change, and " +
            "this page will not pick a winner between them. " + hostDe(escolhido) + " answered " + x +
            " and " + hostDe(outro) + " answered " + y + ". Read again in a moment: one of them is " +
            "behind, and which one is not something this page can decide.");
        }
        return { valor: r[0], fontes: 2 };
      });
  }

  function rpcEm(url, metodo, params) {
    if (!RPC_PERMITIDO[metodo]) {
      throw new Error("blocked: this page may only call " +
        Object.keys(RPC_PERMITIDO).join(" / ") + " over RPC. Refused: " + metodo);
    }
    if (!/^https:\/\//i.test(url)) return Promise.reject(new Error("the endpoint must be an https URL"));
    return rpcBruto(url, metodo, params);
  }

  function rpc(metodo, params) {
    if (!RPC_PERMITIDO[metodo]) {
      throw new Error("blocked: this page may only call " +
        Object.keys(RPC_PERMITIDO).join(" / ") + " over RPC. Refused: " + metodo);
    }
    var url = $("c-rpc").value;
    if (!/^https:\/\//i.test(url)) return Promise.reject(new Error("the endpoint must be an https URL"));
    return rpcBruto(url, metodo, params);
  }

  function rpcBruto(url, metodo, params) {
    idRpc += 1;
    return fetch(url, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: idRpc, method: metodo, params: params })
    }).then(function (r) {
      if (!r.ok) throw new Error("the endpoint answered HTTP " + r.status);
      return r.json();
    }).then(function (j) {
      if (j && j.error) {
        var e = new Error(j.error.message || "RPC error");
        /* Os bytes da reversao. Os tres endpoints desta lista devolvem em
           `error.data`; alguns clientes aninham em `error.data.data`. Guardados
           crus para serem decodificados pelo seletor, nunca adivinhados. */
        var d = j.error.data;
        if (d && typeof d === "object") d = d.data || d.originalError && d.originalError.data;
        if (typeof d === "string") e.dadosRevert = d;
        throw e;
      }
      return j.result;
    });
  }
  /* Dentro da janela de confirmacao, toda leitura vai a duas fontes — inclusive
     as que forem escritas amanha. Fora dela, uma basta: numero atrasado na tela
     se corrige na proxima leitura; confirmacao de efeito, nao. */
  var CONFIRMANDO = false;
  var call = function (to, data) {
    var args = [{ to: to, data: data }, "latest"];
    if (!CONFIRMANDO) return rpc("eth_call", args);
    return rpcDuplo("eth_call", args).then(function (r) { return r.valor; });
  };

  /* ================================================================= ABI ==== */
  /* ------------------------------------------------------------- o motor ---
     As primitivas de assinatura moram em /js/motor.js e este arquivo as
     CONSOME. A tela irma (console-lp.js) consome as MESMAS. Enquanto cada uma
     carregava a sua copia, duas canonicalizacoes do mesmo objeto podiam
     divergir sem que nada acusasse — e divergiram, e a pagina passou a recusar
     100% dos envios com os cinco guardioes verdes por cima. Esse e o F-1.

     Este arquivo liga 10 nomes, nao 11: palInt nunca existiu aqui, porque nao
     ha tick int24 nesta tela. Ligar o que este arquivo nao usava seria alargar
     a superficie por simetria, e simetria nao e razao. */
  var MOTOR = window.TRIVIU_MOTOR;
  if (!MOTOR) throw new Error("TRIVIU_MOTOR nao carregou: /js/motor.js precisa vir antes de /js/console.js");
  var sig = MOTOR.sig, pal = MOTOR.pal, palNum = MOTOR.palNum, palavra = MOTOR.palavra,
      cargaDaTx = MOTOR.cargaDaTx, hashDaCarga = MOTOR.hashDaCarga, hashCanon = MOTOR.hashCanon,
      conferirTelaContraCalldata = MOTOR.conferirTelaContraCalldata,
      recusarAprovacaoInfinita = MOTOR.recusarAprovacaoInfinita,
      CODIFICADOR_POR_TIPO = MOTOR.CODIFICADOR_POR_TIPO;

  var ABI = window.TRIVIU_ABI;
  var LIVRO = window.TRIVIU_ENDERECOS;

  /** Seletor de 4 bytes de uma assinatura, vindo da tabela gerada de contracts/out.
      Lanca se a assinatura nao existir — que e o ponto do arquivo inteiro. */


  /* ---------------------------------------------------------------- codec -- */



  function paraEndereco(w) { return "0x" + w.slice(24); }
  function u(w) { return BigInt("0x" + w); }
  var END = /^0x[0-9a-fA-F]{40}$/;

  /* Inteiro -> decimal exato. Sem float: um saldo arredondado impresso sem dizer
     que foi arredondado e a mesma invencao que um placeholder.

     E sem CORTE, tambem. A versao herdada de /positions cortava a fracao em 8
     casas para caber na tela; aqui isso seria a mesma mentira com outro nome —
     0.000232994269207027 WETH sairia 0.00023299 e nada na tela diria que o resto
     existe. Uma pagina que existe para mostrar o byte exato antes de uma
     assinatura nao pode abreviar o numero que o byte carrega. Zeros a direita
     caem porque nao mudam o valor; digito significativo nenhum cai. */
  function comCasas(valor, casas) {
    var s = BigInt(valor).toString();
    if (!casas) return s;
    while (s.length <= casas) s = "0" + s;
    var inteiro = s.slice(0, s.length - casas);
    var frac = s.slice(s.length - casas).replace(/0+$/, "");
    return frac ? inteiro + "." + frac : inteiro;
  }
  /* Decimal digitado -> unidades inteiras do token. Recusa mais casas do que o
     token tem, em vez de truncar em silencio. */
  function paraUnidades(texto, casas) {
    var s = String(texto == null ? "" : texto).trim();
    if (!/^\d+(\.\d+)?$/.test(s)) return null;
    var p = s.split(".");
    var frac = p[1] || "";
    if (frac.length > casas) return null;
    return BigInt(p[0] + frac.padEnd(casas, "0"));
  }

  /* ------------------------------------------------- REGRA 3 · o hash ------
     UMA canonicalizacao e UM objeto, e as duas coisas sao a mesma correcao.

     O DEFEITO QUE ESTAS LINHAS FECHAM, medido em 2026-08-13 executando as duas
     funcoes que viviam aqui: existiam DUAS canonicalizacoes do mesmo objeto.
     congelar() tirava a impressao digital de {chainId,to,data,value} e enviar()
     recalculava sobre {chainId,FROM,to,data,value}. Serializacoes diferentes,
     digests diferentes, sempre — a reconferencia do clique nunca podia passar.
     Medido: 200 de 200 transacoes distintas RECUSADAS, 100%, nas DUAS telas. O
     defeito e o mesmo nos dois arquivos porque um e porte do outro, e foi
     portado junto: quando a correcao da carga entrou em enviar(), o lado do
     congelamento ficou onde estava.

     `from` ENTRA na canonicalizacao, e a versao com quatro campos e que estava
     errada: uma allowance pertence ao endereco que a concede, entao trocar
     `from` troca o que se esta assinando.

     A serializacao e montada a mao, campo a campo, e NAO por JSON.stringify: a
     ordem das chaves de um objeto e do objeto, e um dia alguem reordena o literal
     achando que ordem de chave nao muda nada. Aqui muda — mudaria o hash, e um
     hash que muda por refatoracao e um alarme que dispara sozinho ate alguem
     desliga-lo. Caixa baixa nos dois campos hex porque EIP-55 e checksum de
     digitacao, nao identidade, e a mesma decisao ja esta tomada no livro-razao.

     SHA-256 do WebCrypto, e nao o keccak que o gerador tem: este hash nunca vai a
     chain nem sai desta pagina — ele so precisa detectar que dois objetos
     diferem. crypto.subtle exige contexto seguro; se nao existir, nao ha
     congelamento e portanto nao ha envio. Falha fechada, declarada em tela. */
  /** A CARGA: o objeto exato que eth_sendTransaction vai receber. Nasce UMA vez,
      no congelamento, congelado, e e esta referencia que a tela imprime, que o
      clique reconfere e que a carteira recebe. Existir num unico lugar e o que
      impede que dois literais equivalentes se separem — foi assim que o defeito
      acima entrou, com um literal de cada lado do arquivo. */






  /* ------------------------------------------- REGRA 6 · sobre os BYTES ----
     Nao "o codigo aprova o valor exato" — isso e uma afirmacao sobre intencao, e
     intencao nao e verificavel depois que alguem edita. Esta funcao le a calldata
     JA CONSTRUIDA e recusa a palavra toda-de-uns. Vale para approve e para
     qualquer outra coisa que venha a ser montada aqui.

     Esta tela nao tem hoje nenhum argumento COM SINAL, e por isso o falso
     positivo medido na tela irma — `abrir()` com tickLower = -1 recusada, porque
     -1 em complemento de dois ocupa a palavra inteira com uns — nao chega a
     acontecer aqui. A correcao entra assim mesmo: a diferenca entre "nao tem o
     defeito" e "nao pode ter o defeito" e a unica que sobrevive ao proximo
     argumento int24 que alguem somar a esta pagina sem lembrar deste comentario.

     A recusa NAO afrouxa: ela pergunta o que a palavra E, e a resposta vem do
     ARTEFATO COMPILADO. Palavra toda-de-uns em argumento SEM SINAL continua
     recusada em qualquer chamada, approve ou nao. Falha FECHADA: sem tipos
     derivaveis — o caso de executeCycle, que carrega um array dinamico — a
     varredura volta a ser cega, recusando demais e nunca de menos. */

  /** Os tipos, palavra a palavra, como o artefato compilado os declara. Tuplas
      estaticas sao achatadas. Devolve null diante de qualquer tipo dinamico ou
      desconhecido, porque com tipo dinamico a posicao da palavra deixa de ser a
      posicao do argumento e a correspondencia que esta funcao promete some. */
  function tiposPorPalavra(papel, assinatura) {
    var g = (ABI.contratos && ABI.contratos[papel]) || (ABI.extras && ABI.extras[papel]);
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



  /** Decodifica os bytes de uma reversao pelo seletor de 4 bytes. Se o seletor
      nao estiver na tabela, devolve null — e a tela mostra o hex cru, que e a
      verdade, em vez de um nome que combinaria. */
  var MAPA_ERROS = null;
  function mapaErros() {
    if (MAPA_ERROS) return MAPA_ERROS;
    MAPA_ERROS = {};
    Object.keys(ABI.contratos).forEach(function (papel) {
      var erros = ABI.contratos[papel].erros || {};
      Object.keys(erros).forEach(function (sel) {
        MAPA_ERROS[sel.toLowerCase()] = { onde: ABI.contratos[papel].contrato, def: erros[sel] };
      });
    });
    /* Error(string) e Panic(uint256) nao constam de ABI nenhuma: o compilador as
       insere. Vem das assinaturas extras declaradas no gerador. */
    MAPA_ERROS[sig("solidity", "Error(string)")] =
      { onde: "solidity", def: { assinatura: "Error(string)", entradas: [{ nome: "reason", tipo: "string" }] } };
    MAPA_ERROS[sig("solidity", "Panic(uint256)")] =
      { onde: "solidity", def: { assinatura: "Panic(uint256)", entradas: [{ nome: "code", tipo: "uint256" }] } };
    return MAPA_ERROS;
  }
  /** Uma frase para o erro de uma chamada, e as quatro respostas sao diferentes:
      reverteu com erro nomeado · reverteu com seletor desconhecido · reverteu
      SEM dados · nem chegou a reverter (a rede falhou). A terceira e a mais
      informativa das quatro e a que quase virou um "with 0x" ilegivel: um
      dispatcher que nao acha a funcao reverte vazio, e vazio e exatamente o que
      se ve quando a funcao nao existe naquele contrato. */
  function explicarRevert(e) {
    var dados = e.dadosRevert;
    if (typeof dados === "string" && dados.replace(/^0x/, "").length === 0) {
      return "reverted with no data at all — which is what a contract does when no function of its " +
        "own matches the four bytes it was handed";
    }
    var d = decodificarRevert(dados);
    if (d && d.nome) return "reverts: " + (d.texto || d.nome) + "  — " + d.seletor + ", an error declared by " + d.onde;
    if (d) return "reverts, and the four bytes " + d.seletor + " are not an error this repository " +
      "declares, so they are shown raw rather than guessed";
    return "was not estimated: " + e.message;
  }

  function decodificarRevert(dados) {
    if (typeof dados !== "string" || !/^0x[0-9a-fA-F]*$/.test(dados) || dados.length < 10) return null;
    var sel = dados.slice(0, 10).toLowerCase();
    var achado = mapaErros()[sel];
    if (!achado) return { seletor: sel, nome: null, texto: null };
    /* CONSERTO 2026-08-12, e o defeito era desta funcao desde que ela existe.
       Os argumentos comecam DEPOIS dos quatro bytes do seletor. A versao anterior
       indexava as palavras de 32 bytes sobre a string inteira da reversao, que
       abre com o prefixo e com o seletor — quatro bytes de deslocamento em cada
       argumento. Medido contra uma reversao real do TriviuLPVault: um tokenId de
       seis digitos saiu com setenta e tres, e o endereco do dono saiu com quatro
       bytes de zero na frente e os quatro ultimos perdidos.

       Aqui o defeito nunca apareceu porque os erros que esta tela costuma
       encontrar nao carregam argumento; ele apareceu na tela irma, que le erros
       de tres. Nao ter aparecido nao e nao existir, e o que o torna perigoso e
       que o NOME saia certo: a tela dizia o erro verdadeiro e, ao lado, com a
       mesma tipografia de valor medido, numeros que nao eram os da chain. Numero
       errado com cara de lido e pior que traco. */
    var corpo = "0x" + dados.slice(10);
    var partes = [];
    (achado.def.entradas || []).forEach(function (ent, i) {
      var w = palavra(corpo, i);
      if (!w || w.length < 64) { partes.push(ent.nome + "=" + TRACO); return; }
      if (ent.tipo === "address") partes.push(ent.nome + "=" + paraEndereco(w));
      else if (/^uint|^int/.test(ent.tipo)) partes.push(ent.nome + "=" + u(w).toString());
      else if (ent.tipo === "string") partes.push(ent.nome + "=(string, not decoded here)");
      else partes.push(ent.nome + "=0x" + w);
    });
    return {
      seletor: sel, nome: achado.def.assinatura, onde: achado.onde,
      texto: achado.def.assinatura.replace(/\(.*/, "") + "(" + partes.join(", ") + ")"
    };
  }

  /* ------------------------------------------------------------------ DOM -- */
  function txt(el, s) { if (el) el.textContent = s; }
  /* As classes de VALOR — m, v, cod, mono — recebem translate="no", e isso nao e
     detalhe de estilo. Medido em 2026-08-12 com o tradutor do Chrome ligado nesta
     pagina: `setTreasury(address,string)` virou `definirTesouro(endereço,string)`,
     `Triviu` virou `Curiosidades`, e o argumento `100.5` virou `100,5` — separador
     decimal trocado. Numa tela cuja unica razao de existir e mostrar o byte exato
     antes de uma assinatura, o tradutor do proprio navegador reescrevendo valor e
     defeito de correcao, nao de aparencia. A prosa continua traduzivel de
     proposito: ela e para entender, os valores sao para conferir. */
  var CLASSES_DE_VALOR = /(^|\s)(m|v|cod|mono)(\s|$)/;
  function novo(tag, cls, conteudo) {
    var e = document.createElement(tag);
    if (cls) {
      e.className = cls;
      if (CLASSES_DE_VALOR.test(cls)) e.setAttribute("translate", "no");
    }
    if (conteudo !== undefined) e.textContent = conteudo;
    return e;
  }
  /* ---------------------------------------------------------- as tres vozes --
     Nao ha uma regiao viva so, e nao ha uma para cada coisa. Ha tres canais, e a
     escolha entre eles e a politeness que o caso merece:

       estado()  -> role="status", aria-live="polite". Comecou, andou, terminou.
                    Nao interrompe, porque nada aqui e urgente.
       erro()    -> role="alert", assertive. A leitura PAROU e nao existe campo
                    para onde mandar o foco: endpoint mudo, chain errada, chamada
                    sem resposta. Interrompe, porque o que vier depois nao vale.
       recusar() -> nem uma nem outra. O campo recusado recebe aria-invalid, a
                    mensagem entra no span que o proprio campo referencia em
                    aria-describedby, e o foco vai para la. Assim a razao e lida
                    pelo MESMO evento de foco que poe o cursor no lugar do
                    conserto. Uma mensagem assertiva disparada no mesmo instante
                    de uma mudanca de foco e justamente a que se perde, e esta e
                    a que nao pode se perder.

     estado() e erro() se apagam mutuamente: uma pagina que fala por duas bocas
     ao mesmo tempo nao fala. */
  /* ------------------------------------------------- teclado nas tabelas -----
     WCAG 2.1.1: uma regiao que rola na horizontal tem de ser alcancavel pelo
     teclado, senao quem nao usa mouse nao chega a ponta direita dela. Mas rolar
     nao e propriedade do elemento, e condicao de largura — medido nesta pagina:

       container 1000px : scrollWidth == clientWidth nas 4 tabelas, ROLA=false
       container  360px : 287>266 e 277>266 em duas delas, ROLA=true

     Um tabindex fixo no HTML seria, portanto, quatro paradas de tabulacao mortas
     no desktop e a coisa certa no telefone. Entao o tabindex e o role entram e
     saem conforme a medida, na carga, no resize e depois de cada redesenho — e
     o nome sai da <caption> que ja existia, via o aria-labelledby que fica no
     HTML esperando o role chegar. */
  function ajustarRolagem() {
    var rs = document.querySelectorAll(".rolagem");
    for (var i = 0; i < rs.length; i++) {
      var e = rs[i];
      if (e.scrollWidth > e.clientWidth) {
        e.setAttribute("tabindex", "0");
        e.setAttribute("role", "region");
      } else {
        e.removeAttribute("tabindex");
        e.removeAttribute("role");
      }
    }
  }
  var tRolagem = null;
  window.addEventListener("resize", function () {
    if (tRolagem) clearTimeout(tRolagem);
    tRolagem = setTimeout(ajustarRolagem, 150);
  });

  function estado(s) { txt($("c-estado"), s); txt($("c-erro"), ""); }
  function erro(s) { txt($("c-estado"), ""); txt($("c-erro"), s); }
  function estadoFluxo(s) { txt($("c-fluxo-estado"), s); txt($("c-fluxo-erro"), ""); }
  function erroFluxo(s) { txt($("c-fluxo-estado"), ""); txt($("c-fluxo-erro"), s); }
  function progresso(s) { txt($("c-prog"), s); }
  function ocupadoPassos(v) { $("c-passos").setAttribute("aria-busy", v ? "true" : "false"); }

  var CAMPOS = ["c-endereco", "c-ativo", "c-principal", "c-lucro"];
  function recusar(campoId, msg) {
    var c = $(campoId), e = $(campoId + "-erro");
    if (e) txt(e, msg);
    if (c) { c.setAttribute("aria-invalid", "true"); c.focus(); }
  }
  function limparRecusa() {
    CAMPOS.forEach(function (id) {
      var c = $(id); if (c) c.removeAttribute("aria-invalid");
      txt($(id + "-erro"), "");
    });
  }
  function morrer(motivo) {
    $("c-fatal").hidden = false;
    txt($("c-fatal-txt"), motivo);
    ["c-ler", "c-montar", "c-conectar"].forEach(function (id) { $(id).disabled = true; });
    /* Os campos tambem: um input habilitado abaixo de uma pagina morta convida a
       digitar num formulario que nao vai responder. */
    CAMPOS.forEach(function (id) { var c = $(id); if (c) c.disabled = true; });
    estado("Nothing can be read. The reason is at the top of the page.");
  }
  /* Serial, nao paralelo: endpoint publico entrega conjunto parcial sob rajada, e
     um conjunto parcial com cara de completo e pior que um lento. */
  function emSerie(itens, fn) {
    var p = Promise.resolve();
    itens.forEach(function (it, i) { p = p.then(function () { return fn(it, i); }); });
    return p;
  }

  /* ================================================================ BOOT ==== */
  /* Os tres endpoints que responderam eth_chainId = 137 em 2026-08-12 E que a
     Content-Security-Policy desta origem nomeia em connect-src. A lista e fechada
     porque o navegador fecha: um quarto host seria bloqueado pelo browser, nao
     por esta pagina. */
  var ENDPOINTS = [
    "https://polygon-bor-rpc.publicnode.com",
    "https://polygon.drpc.org",
    "https://1rpc.io/matic"
  ];
  ENDPOINTS.forEach(function (u2, i) {
    var o = document.createElement("option");
    o.value = u2; o.textContent = u2.replace(/^https:\/\//, "");
    if (i === 0) o.selected = true;
    $("c-rpc").appendChild(o);
  });

  var CHAIN = 137n;
  /* Bloco em que os tres primeiros contratos foram criados, de
     contracts/broadcast/Deploy.s.sol/137/run-latest.json. E um numero de bloco,
     nao um endereco: serve so para dar inicio a varredura de eventos. */
  var BLOCO_CRIACAO = 91858844;
  var JANELA = 10000;      /* teto de faixa que estes endpoints aceitam por chamada */
  var JANELAS_INICIO = 5;  /* a faixa onde as liberacoes originais foram gravadas */
  var JANELAS_FIM = 3;     /* e o pedaco recente, para nao perder mudanca de ontem */

  if (!LIVRO || typeof LIVRO.exigirVivo !== "function") {
    morrer("The address ledger (/enderecos.js) did not load, so this page has no address it is " +
      "allowed to use. It keeps no spare copy: a second copy of the ledger is exactly the failure " +
      "the ledger exists to prevent.");
    return;
  }
  if (!ABI || !ABI.contratos) {
    morrer("The selector table (/js/abi-console.js) did not load. Without it this page has no " +
      "function name it is allowed to print, and it will not fall back to names typed by hand — " +
      "that fallback is the bug this page was built to end.");
    return;
  }

  var REGISTRY = null, EXECUTOR = null, GASTANK = null, LPVAULT = null, NPM = null;
  try {
    REGISTRY = LIVRO.exigirVivo(LIVRO.VIVOS.parameterRegistry, "parameterRegistry");
    EXECUTOR = LIVRO.exigirVivo(LIVRO.VIVOS.triviuExecutor, "triviuExecutor");
    GASTANK = LIVRO.exigirVivo(LIVRO.VIVOS.gasTank, "gasTank");
    LPVAULT = LIVRO.exigirVivo(LIVRO.VIVOS.triviuLPVault, "triviuLPVault");
  } catch (e) {
    morrer("The address ledger rejected one of its own entries: " + e.message);
    return;
  }
  txt($("c-a-registry"), REGISTRY);
  txt($("c-a-executor"), EXECUTOR);
  txt($("c-a-gastank"), GASTANK);
  txt($("c-a-lpvault"), LPVAULT);

  /* ============================================ REGRA 2 · endereco em calldata */
  /* Os quatro contratos do Triviu saem de exigirVivo(), que NAO devolve o texto
     que recebeu: devolve a constante do livro. Comparar byte a byte e o que a
     propria funcao ja faz — ela lanca em orfao, em papel trocado e em
     desconhecido. A comparacao explicita abaixo e redundante de proposito: e a
     regra escrita como codigo no ponto onde a regra vale, e nao a trinta linhas
     de distancia dentro de outro arquivo.

     O TOKEN e o unico endereco de calldata que NAO pode sair de exigirVivo(), e
     isto esta declarado em vez de disfarcado. Ele nao esta no livro e nao poderia
     estar: a lista de tokens e do ParameterRegistry e muda por pull request. Se
     eu o passasse por exigirVivo() a funcao lancaria DESCONHECIDO em todos os
     oito, e a tela pararia de funcionar — entao a tentacao seria afrouxar
     exigirVivo(), que e exatamente como uma trava morre. Ele passa por outra
     trava, com quatro exigencias, todas ABORTANDO:
       1. veio do evento TokenAllowed do Registry que o livro nomeia
       2. isAllowedToken confirma AO VIVO, relido no instante do congelamento
       3. nao e nenhum dos quatro orfaos do livro
       4. tem codigo na chain
     O que isso NAO prova esta dito na tela: que o token e bom. Prova que o
     Registry o admite hoje, que e uma afirmacao menor e verdadeira. */
  function travarEnderecoDoLivro(endereco, papel) {
    var canon = LIVRO.exigirVivo(endereco, papel);
    if (String(canon).toLowerCase() !== String(endereco).toLowerCase()) {
      throw new Error("ABORTED: the address for " + papel + " diverged from the ledger constant.");
    }
    return canon;
  }

  function ehOrfao(endereco) {
    var baixo = String(endereco).toLowerCase();
    var orfaos = LIVRO.ORFAOS || [];
    for (var i = 0; i < orfaos.length; i++) {
      if (String(orfaos[i].endereco).toLowerCase() === baixo) return orfaos[i];
    }
    return null;
  }

  /* ================================================= REGRA 1 · uma origem ==== */
  /* O caminho de assinatura e servido por exatamente uma origem, e qual e ela nao
     esta digitada aqui: sai de /domain.config.json, o mesmo arquivo unico que o
     resto do site usa, pela mesma razao pela qual endereco sai do livro-razao.
     Dois hostnames servindo a pagina que assina ensinam o usuario que dois
     hostnames sao legitimos, e ali morre a unica defesa que ele tem contra
     phishing: uma origem memorizada.

     Falha FECHADA. Se o arquivo nao carregar, se o host nao constar, ou se a
     pagina estiver aberta de file://, o envio fica desligado e a leitura
     continua. Um gate que falha aberto e um gate decorativo. */
  var ORIGEM = { ok: false, motivo: "the origin has not been checked yet", host: null };
  function conferirOrigem() {
    var host = (window.location && window.location.host) || "";
    ORIGEM.host = host;
    if (window.location && window.location.protocol !== "https:" && host !== "localhost" &&
        !/^127\.0\.0\.1(:|$)/.test(host)) {
      ORIGEM.ok = false;
      ORIGEM.motivo = "this page is not on https (it is on " + (window.location.protocol || "?") +
        "), so signing stays off. A page that asks for a signature over a channel anyone on the path " +
        "can rewrite is a page that asks you to sign whatever they rewrote it to.";
      return Promise.resolve(ORIGEM);
    }
    return fetch("/domain.config.json", { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (cfg) {
        var hosts = (cfg && cfg.knownHosts) || [];
        /* A CARDINALIDADE E A REGRA, e ela e conferida aqui porque a frase abaixo
           dizia "the single host" enquanto o codigo aceitava QUALQUER host da
           lista. Nao era exagero de redacao: `set-domain.mjs --apply` ACRESCENTA
           o dominio a lista, entao uma unica execucao do script legitimava duas
           origens para a pagina que assina — sem alarme, e ainda imprimindo a
           palavra "single". Duas origens servindo a mesma tela de assinatura
           destroem a unica defesa que o usuario tem contra phishing: uma origem
           memorizada. Lista com tamanho diferente de 1 e recusa, nao aviso. */
        if (hosts.length !== 1) {
          ORIGEM.ok = false;
          ORIGEM.motivo = "the canonical host list in /domain.config.json has " + hosts.length +
            " entries [" + hosts.join(", ") + "], and this page only signs when it has exactly one. " +
            "More than one hostname serving the same signing page teaches you that several are " +
            "legitimate, and that is the door phishing walks through. Signing stays off.";
        } else if (hosts[0] === host) {
          ORIGEM.ok = true;
          ORIGEM.motivo = "served from " + host + ", the single host in /domain.config.json.";
        } else {
          ORIGEM.ok = false;
          ORIGEM.motivo = "this page is being served from " + (host || "an origin with no host") +
            ", and the canonical host list in /domain.config.json is [" + hosts.join(", ") + "]. " +
            "Signing is off. This is the check, not a formality: a copy of this page on another " +
            "hostname is what a phishing page IS.";
        }
        return ORIGEM;
      })
      .catch(function (e) {
        ORIGEM.ok = false;
        ORIGEM.motivo = "the canonical host list (/domain.config.json) did not load (" + e.message +
          "), so this page cannot tell whether it is being served from the origin it belongs to. " +
          "Signing stays off — the check failing closed is the point of having it.";
        return ORIGEM;
      });
  }

  /* A superficie externa completa dos tres contratos cujo codigo-fonte esta neste
     repositorio. Renderizada da tabela gerada — se o contrato ganhar ou perder uma
     funcao, esta lista muda sozinha e o guardiao cobra a diferenca. */
  (function () {
    var corpo = $("c-superficie");
    corpo.innerHTML = "";
    var n = 0;
    ["parameterRegistry", "triviuExecutor", "gasTank", "lpVault"].forEach(function (papel) {
      var c = ABI.contratos[papel];
      Object.keys(c.funcoes).sort().forEach(function (assin) {
        var f = c.funcoes[assin];
        var tr = document.createElement("tr");
        tr.appendChild(novo("td", "m", f.seletor));
        tr.appendChild(novo("td", "m", assin));
        /* Nome do contrato e mutabilidade sao identificadores da ABI, nao prosa:
           entram como valor para o tradutor nao os reescrever. */
        tr.appendChild(novo("td", "m", c.contrato));
        tr.appendChild(novo("td", "m", f.mutabilidade));
        corpo.appendChild(tr);
        n += 1;
      });
    });
    var tr2 = document.createElement("tr");
    var td = novo("td", null, n + " functions in total. Everything a user or an owner can call on the " +
      "four contracts whose source is here. approve() is not in this list because it lives on the " +
      "token, not on a Triviu contract. TriviuLPVault joined the list on 2026-08-12: its source was " +
      "copied in and compiled here, and the artefact reproduces the deployed bytecode byte for byte " +
      "outside the 19 immutable windows the constructor writes — 380 bytes differ, all 380 inside " +
      "those windows, zero outside. Until that was measured the vault had one hand-declared signature " +
      "and this sentence said its source was elsewhere. It is not elsewhere any more.");
    td.colSpan = 4; tr2.appendChild(td); corpo.appendChild(tr2);
  })();
  ajustarRolagem();

  if (!MOTOR.provedor()) {
    $("c-conectar").disabled = true;
    $("c-conectar").title = "No wallet provider in this browser. Type an address instead.";
  }

  /* ============================================================ CARTEIRA ==== */
  function verChain(idHex) {
    var n;
    try { n = BigInt(idHex); } catch (e) { txt($("c-w-chain"), TRACO); return; }
    txt($("c-w-chain"), n.toString() + "  (" + idHex + ")");
    var alerta = $("c-chain-alerta");
    if (n === CHAIN) {
      alerta.hidden = true;
      return true;
    }
    alerta.hidden = false;
    txt($("c-chain-txt"),
      "Your wallet is on chain " + n.toString() + " (" + idHex + "). The four Triviu contracts have " +
      "code on chain " + CHAIN.toString() + ", and nowhere this page can reach. Nothing was encoded " +
      "against chain " + n.toString() + ": calldata built for one chain and signed on another is how " +
      "an address that means one thing here means something else there. Switch the wallet to chain " +
      CHAIN.toString() + " and read again. This page will not ask the wallet to switch for you — it " +
      "asks the wallet for nothing but an address and a chain id.");
    return false;
  }

  $("c-conectar").addEventListener("click", function () {
    estado("Asking the wallet for an address and a chain id. Nothing else is requested.");
    Promise.resolve()
      .then(function () { return pedirCarteira("eth_accounts"); })
      .then(function (contas) {
        if (contas && contas.length) return contas;
        return pedirCarteira("eth_requestAccounts");
      })
      .then(function (contas) {
        if (!contas || !contas.length) { erro("The wallet returned no address."); return null; }
        $("c-endereco").value = contas[0];
        txt($("c-w-conta"), contas[0]);
        return pedirCarteira("eth_chainId");
      })
      .then(function (cid) {
        if (cid == null) return;
        var ok = verChain(cid);
        estado(ok
          ? "Address and chain id taken from the wallet. Nothing was signed and nothing was approved. Read the chain next."
          : "The wallet is on another chain. Nothing was read; the box above says which chain answered.");
      })
      .catch(function (e) { erro("Wallet: " + e.message); });
  });

  /* REGRA 4 · segunda metade. Ate esta onda estes dois handlers AVISAVAM — F-5 do
     Tubarao, aberto: "chainChanged avisa mas nao invalida". Enquanto a pagina so
     lia, avisar bastava. Agora que existe um objeto congelado esperando um
     clique, avisar e o defeito: a chain sob os bytes muda, o aviso rola para fora
     da vista, e o botao continua armado. Os dois INVALIDAM. */
  /* F-4/F-5 · registrados uma vez, RE-ANEXADOS a cada troca de provedor. O corpo
     dos handlers nao mudou: eles ja invalidavam certo, so nao eram chamados
     quando outra carteira tomava o slot depois da carga. */
  MOTOR.ouvir("chainChanged", function (cid) {
      verChain(cid);
      invalidarCongelamento("The wallet changed chain while these bytes were frozen. They are void: " +
        "calldata built for one chain and signed on another is how an address that means one thing " +
        "here means something else there. Encode again.");
      estado("The wallet changed chain. Read again: everything below was read against the previous one.");
    });
  MOTOR.ouvir("accountsChanged", function (contas) {
      var a = contas && contas.length ? contas[0] : "";
      $("c-endereco").value = a;
      txt($("c-w-conta"), a || TRACO);
      invalidarCongelamento("The wallet changed account while these bytes were frozen. They are void: " +
        "they were built for the previous address, and an allowance belongs to the address that " +
        "granted it. Read the chain again, then encode again.");
      estado("The wallet changed account. Read again: the balances below belong to the previous address.");
    });

  /* F-4 · a troca de provedor INVALIDA, porque ela e indistinguivel: enquanto o
     objeto trocava, esta tela nao foi avisada de chain nem de conta. Recusa por
     nao saber. */
  MOTOR.aoTrocarProvedor(function () {
    invalidarCongelamento("The wallet provider itself changed while these bytes were frozen. They are " +
      "void: while the swap happened this page was not being told about chain or account changes, so it " +
      "cannot know what those bytes would be signed against. Read the chain again, then encode again.");
    estado("The wallet provider changed. Read again: everything below was read through the previous one.");
    $("c-conectar").disabled = false;
    $("c-conectar").title = "";
  });

  /* O fallback e passado DAQUI, e nao lido dentro do motor: um arquivo que
     alcanca a carteira precisa declarar a allowlist, e a allowlist mora nesta
     tela. Foi o `check-assinatura` que desenhou esta fronteira. */
  MOTOR.descobrirProvedor(function () {
    $("c-conectar").disabled = false;
    $("c-conectar").title = "";
  }, window.ethereum, function () { return window.ethereum; });

  /* ============================================================== LEITURA === */
  var lendo = false;
  // Simetrica a `lendo`, e pelo mesmo motivo: `montar()` termina numa promessa
  // (a estimativa de gas em serie), entao um segundo clique entra enquanto o
  // primeiro ainda esta estimando. Sem isto os cartoes sao redesenhados sob os
  // pes da estimativa em voo, e a conclusao do primeiro sobrescreve a do segundo:
  // o usuario le uma contagem de reverts que nao pertence ao que esta na tela.
  var montando = false;
  var ESTADO = { tokens: [], gasPrice: null, dono: null };

  $("c-ler").addEventListener("click", function () { ler(); });
  /* Enter le, a partir do campo de endereco. Nao ha <form> nesta pagina de
     proposito (o submit nativo poria o endereco na URL, e dali no historico e no
     Referer), entao cada Enter e ligado a mao. Os campos do fluxo, mais abaixo,
     tem o seu — antes nao tinham, e um usuario de teclado que digitava o
     principal e apertava Enter recebia silencio. */
  $("c-endereco").addEventListener("keydown", function (ev) {
    if (ev.key === "Enter") { ev.preventDefault(); ler(); }
  });

  var avisos = [];
  function ler() {
    if (lendo) { estado("Still reading. This click did nothing."); return; }
    limparRecusa();
    var dono = ($("c-endereco").value || "").trim();
    if (!END.test(dono)) {
      recusar("c-endereco", "That is not a 40-hex-character address, so nothing was read. It needs 0x " +
        "followed by 40 hex characters.");
      return;
    }
    lendo = true;
    $("c-ler").disabled = true;
    avisos = [];
    ESTADO = { tokens: [], alvos: [], gasPrice: null, dono: dono };
    estado("Reading from " + $("c-rpc").value);
    progresso("");

    var passo = 0;
    function marcar(s) { passo += 1; progresso("step " + passo + " · " + s); }

    rpc("eth_chainId", [])
      .then(function (cid) {
        txt($("c-w-rpcchain"), BigInt(cid).toString() + "  (" + cid + ")");
        if (BigInt(cid) !== CHAIN) {
          throw new Error("that endpoint is chain " + BigInt(cid).toString() + ", and these contracts " +
            "are on " + CHAIN.toString() + ". Nothing was read rather than reading the wrong chain.");
        }
        txt($("c-w-conta"), dono);
        marcar("code");
        return emSerie(
          [["c-c-registry", REGISTRY], ["c-c-executor", EXECUTOR], ["c-c-gastank", GASTANK], ["c-c-lpvault", LPVAULT]],
          function (par) {
            return rpc("eth_getCode", [par[1], "latest"]).then(function (c) {
              txt($(par[0]), c && c !== "0x" ? ((c.length - 2) / 2) + " bytes" : "no code");
              ajustarRolagem();
            });
          });
      })
      .then(function () {
        marcar("registry state");
        var leituras = [
          ["c-feebps", sig("parameterRegistry", "feeBps()"), "n"],
          ["c-treasury", sig("parameterRegistry", "treasury()"), "a"],
          ["c-owner", sig("parameterRegistry", "owner()"), "a"],
          ["c-pendente", sig("parameterRegistry", "pendingOwner()"), "a"],
          ["c-slippage", sig("parameterRegistry", "maxSlippageBps()"), "n"],
          ["c-minprofit", sig("parameterRegistry", "defaultMinProfit()"), "n"]
        ];
        return emSerie(leituras, function (l) {
          return call(REGISTRY, l[1]).then(function (r) {
            if (!r || r === "0x") { txt($(l[0]), TRACO); return; }
            var w = palavra(r, 0);
            if (l[2] === "a") {
              var a = paraEndereco(w);
              txt($(l[0]), /^0x0{40}$/.test(a) ? a + "  (address zero)" : a);
            } else {
              var v = u(w);
              txt($(l[0]), l[0] === "c-feebps" ? v.toString() + " bps  (" + (Number(v) / 100) + "% of profit)" : v.toString());
            }
          }).catch(function () { txt($(l[0]), TRACO); });
        });
      })
      .then(function () {
        return call(EXECUTOR, sig("triviuExecutor", "MAX_FEE_BPS()")).then(function (r) {
          var v = u(palavra(r, 0));
          txt($("c-maxfee"), v.toString() + " bps  (" + (Number(v) / 100) + "% of profit, hardcoded)");
        }).catch(function () { txt($("c-maxfee"), TRACO); });
      })
      .then(function () {
        marcar("executor integrity");
        return call(EXECUTOR, sig("triviuExecutor", "registry()")).then(function (r) {
          var a = paraEndereco(palavra(r, 0));
          var bate = a.toLowerCase() === REGISTRY.toLowerCase();
          txt($("c-integridade"),
            "The Executor's registry() answered " + a + ", and the ledger's ParameterRegistry is " +
            REGISTRY + " — " + (bate ? "the same contract." : "A DIFFERENT CONTRACT.") +
            " This is worth reading rather than assuming: two orphaned Registries from failed deploy " +
            "runs are alive on this chain with byte-identical state to the real one, so state alone " +
            "cannot tell them apart. The Executor's pointer is immutable, fixed in its constructor, " +
            "which is why this comparison settles it.");
        }).catch(function () {
          txt($("c-integridade"), "The Executor's registry() did not answer, so this check reads " + TRACO +
            " rather than a reassuring sentence.");
        });
      })
      .then(function () {
        marcar("LP vault");
        return call(LPVAULT, sig("lpVault", "positionManager()")).then(function (r) {
          var a = paraEndereco(palavra(r, 0));
          if (!END.test(a) || /^0x0{40}$/.test(a)) throw new Error("empty position manager");
          var baixo = a.toLowerCase();
          var orfaos = LIVRO.ORFAOS || [];
          for (var i = 0; i < orfaos.length; i++) {
            if (String(orfaos[i].endereco).toLowerCase() === baixo) {
              throw new Error("the vault pointed at " + a + ", which the ledger lists as an orphan");
            }
          }
          NPM = a;
          txt($("c-a-npm"), NPM);
          return rpc("eth_getCode", [NPM, "latest"]).then(function (c) {
            txt($("c-c-npm"), c && c !== "0x" ? ((c.length - 2) / 2) + " bytes" : "no code");
          });
        }).catch(function (e) {
          NPM = null;
          txt($("c-a-npm"), TRACO); txt($("c-c-npm"), TRACO);
          /* Falha PARCIAL: a leitura continua. Nao vai para a regiao viva porque
             a regiao viva e sobrescrita pela mensagem de conclusao segundos
             depois — o aviso sumiria da tela sem nunca ter sido lido. Fica na
             lista e sai na conclusao, que e onde ele sobrevive. */
          avisos.push("the vault's positionManager() did not answer (" + e.message + "), so the two " +
            "position counts read " + TRACO);
        });
      })
      .then(function () {
        /* A demonstracao de que um seletor presente no bytecode nao e uma funcao
           que o contrato tem. Deliberadamente uma chamada que se espera reverter. */
        return call(LPVAULT, sig("parameterRegistry", "feeBps()")).then(function (r) {
          txt($("c-lp-feebps"), "Measured now: feeBps() on the vault ANSWERED 0x" + palavra(r, 0) +
            " — which contradicts the paragraph above; treat the paragraph as stale, not the reading.");
        }).catch(function (e) {
          txt($("c-lp-feebps"), "Measured now: feeBps() on the vault " + explicarRevert(e) + ".");
        });
      })
      .then(function () {
        marcar("owner balance and gas price");
        return rpc("eth_getBalance", [dono, "latest"]).then(function (b) {
          txt($("c-w-saldo"), comCasas(BigInt(b), 18) + " POL");
        }).catch(function () { txt($("c-w-saldo"), TRACO); });
      })
      .then(function () {
        return rpc("eth_gasPrice", []).then(function (g) {
          ESTADO.gasPrice = BigInt(g);
        }).catch(function () { ESTADO.gasPrice = null; });
      })
      .then(function () {
        marcar("allowed tokens");
        return varrer(ABI.contratos.parameterRegistry.eventos["TokenAllowed(address,bool,string)"].topico);
      })
      .then(function (r) {
        txt($("c-tokens-faixa"), r.descricao);
        return emSerie(r.enderecos, function (a, i) {
          progresso("token " + (i + 1) + " of " + r.enderecos.length);
          return lerToken(a, dono);
        }).then(function () { desenharTokens(); ajustarRolagem(); });
      })
      .then(function () {
        marcar("allowed routers");
        return varrer(ABI.contratos.parameterRegistry.eventos["TargetAllowed(address,bool,string)"].topico)
          .then(function (r) {
            return emSerie(r.enderecos, function (a) { return lerAlvo(a); })
              .then(function () { desenharAlvos(r); ajustarRolagem(); });
          });
      })
      .then(function () {
        if (!NPM) { txt($("c-pos-conta"), TRACO); txt($("c-pos-vault"), TRACO); return; }
        marcar("positions");
        var selBal = sig("erc20", "balanceOf(address)");
        return call(NPM, selBal + pal(dono))
          .then(function (b) { txt($("c-pos-conta"), b && b !== "0x" ? u(palavra(b, 0)).toString() : TRACO); })
          .then(function () { return call(NPM, selBal + pal(LPVAULT)); })
          .then(function (b) { txt($("c-pos-vault"), b && b !== "0x" ? u(palavra(b, 0)).toString() : TRACO); })
          .catch(function () { txt($("c-pos-conta"), TRACO); txt($("c-pos-vault"), TRACO); });
      })
      .then(function () {
        progresso("");
        estado("Read complete against chain " + CHAIN.toString() + ". " + ESTADO.tokens.length +
          " allowed token(s), " + ESTADO.alvos.length + " allowed router(s)." +
          (avisos.length ? " " + avisos.length + " thing(s) did not read: " + avisos.join("; ") + "." : "") +
          " Reading asked your wallet for nothing and sent nothing: every call above went to the " +
          "endpoint in the form, not to the wallet." +
          " The asset list in the flow section below is now filled from what was read.");
      })
      .catch(function (e) {
        progresso("");
        erro("Stopped: " + e.message);
      })
      // `finally` e nao `then`. Aqui NAO havia bug: o `.catch` acima absorve a
      // rejeicao, entao o `.then` rodava de qualquer jeito. E endurecimento, e nao
      // conserto — cobre o unico caso que faltava, o de o proprio `catch` lancar.
      // Dito assim de proposito: a primeira versao deste comentario afirmava um
      // defeito que a cadeia nao tinha, e comentario que exagera o que corrigiu
      // e a mesma mentira do numero sem fonte, contada no fonte.
      // `montar()` era diferente: la nao ha `.catch`, e a rejeicao deixaria
      // `montando = true` para sempre. Aquele sim era o defeito que o N2 pediu.
      .finally(function () { lendo = false; $("c-ler").disabled = false; });
  }

  /* --------------------------------------------------------------- eventos -- */
  /* Uma mapping nao se enumera: nao existe getter que devolva todos os tokens
     liberados. Entao os candidatos saem dos eventos, e a confirmacao sai de uma
     chamada ao vivo. A faixa varrida e IMPRESSA: um recorte que nao diz onde
     termina e um recorte que passa por completo. */
  function varrer(topico) {
    return rpc("eth_blockNumber", []).then(function (bn) {
      var ultimo = Number(BigInt(bn));
      var faixas = [];
      var fimInicio = Math.min(BLOCO_CRIACAO + JANELAS_INICIO * JANELA - 1, ultimo);
      var comecoFim = Math.max(ultimo - JANELAS_FIM * JANELA + 1, BLOCO_CRIACAO);
      if (comecoFim <= fimInicio + 1) faixas.push([BLOCO_CRIACAO, ultimo]);
      else { faixas.push([BLOCO_CRIACAO, fimInicio]); faixas.push([comecoFim, ultimo]); }

      var janelas = [];
      faixas.forEach(function (f) {
        for (var b = f[0]; b <= f[1]; b += JANELA) janelas.push([b, Math.min(b + JANELA - 1, f[1])]);
      });

      var vistos = {}, ordem = [], falhou = 0;
      return emSerie(janelas, function (j) {
        return rpc("eth_getLogs", [{
          address: REGISTRY, topics: [topico],
          fromBlock: "0x" + j[0].toString(16), toBlock: "0x" + j[1].toString(16)
        }]).then(function (logs) {
          (logs || []).forEach(function (lg) {
            var a = paraEndereco(String(lg.topics[1]).replace(/^0x/, ""));
            if (!vistos[a.toLowerCase()]) { vistos[a.toLowerCase()] = 1; ordem.push(a); }
          });
        }).catch(function () { falhou += 1; });
      }).then(function () {
        var desc = faixas.length === 1
          ? ("Scanned blocks " + faixas[0][0] + " to " + faixas[0][1] + " — the whole history since " +
             "the Registry was created, with nothing skipped.")
          : ("Scanned blocks " + faixas[0][0] + "–" + faixas[0][1] + " and " + faixas[1][0] + "–" +
             faixas[1][1] + ". Blocks " + (faixas[0][1] + 1) + "–" + (faixas[1][0] - 1) + " were NOT " +
             "scanned: these endpoints cap a log query at " + JANELA + " blocks and walking the gap would " +
             "be dozens of round trips. Everything listed below is confirmed live, so what you see is " +
             "true; what could be missing is a token allowed inside the gap.");
        if (falhou) desc += " " + falhou + " of " + janelas.length + " windows did not answer, so this list may be short.";
        return { enderecos: ordem, descricao: desc, janelas: janelas.length, falhou: falhou };
      });
    });
  }

  /* ---------------------------------------------------------------- tokens -- */
  function decodeString(hex) {
    if (!hex || hex === "0x") return null;
    var x = String(hex).replace(/^0x/, "");
    if (x.length < 128) return null;
    try {
      if (Number(BigInt("0x" + x.slice(0, 64))) !== 32) return null;
      var len = Number(BigInt("0x" + x.slice(64, 128)));
      if (!len || len > 64 || x.length < 128 + len * 2) return null;
      var out = "";
      for (var i = 0; i < len; i++) {
        var c = parseInt(x.slice(128 + i * 2, 130 + i * 2), 16);
        if (c < 32 || c > 126) return null;
        out += String.fromCharCode(c);
      }
      return out;
    } catch (e) { return null; }
  }

  function lerToken(endereco, dono) {
    var t = { endereco: endereco, simbolo: null, casas: null, permitido: null, saldo: null };
    return call(REGISTRY, sig("parameterRegistry", "isAllowedToken(address)") + pal(endereco))
      .then(function (r) { t.permitido = u(palavra(r, 0)) === 1n; })
      .catch(function () { t.permitido = null; })
      .then(function () { return call(endereco, sig("erc20Meta", "symbol()")).catch(function () { return null; }); })
      .then(function (r) { t.simbolo = decodeString(r); })
      .then(function () { return call(endereco, sig("erc20Meta", "decimals()")).catch(function () { return null; }); })
      .then(function (r) {
        try {
          if (r && r !== "0x") { var d = Number(u(palavra(r, 0))); if (d >= 0 && d <= 36) t.casas = d; }
        } catch (e) {}
      })
      .then(function () { return call(endereco, sig("erc20", "balanceOf(address)") + pal(dono)).catch(function () { return null; }); })
      .then(function (r) {
        if (r && r !== "0x") { try { t.saldo = u(palavra(r, 0)); } catch (e) {} }
        ESTADO.tokens.push(t);
      });
  }

  function desenharTokens() {
    var corpo = $("c-tokens");
    corpo.innerHTML = "";
    if (!ESTADO.tokens.length) {
      var tr0 = document.createElement("tr");
      var td0 = novo("td", "m", "No TokenAllowed event was found in the scanned range. That is a reading " +
        "about the range, not a claim that the whitelist is empty — the range is printed below.");
      td0.colSpan = 5; tr0.appendChild(td0); corpo.appendChild(tr0);
      return;
    }
    ESTADO.tokens.forEach(function (t) {
      var tr = document.createElement("tr");
      var th = novo("th", "m", t.simbolo || TRACO); th.scope = "row";
      tr.appendChild(th);
      tr.appendChild(novo("td", "m", t.endereco));
      tr.appendChild(novo("td", "m", t.casas === null ? TRACO : String(t.casas)));
      var tdP = novo("td", null);
      tdP.appendChild(novo("span", "pill " + (t.permitido === true ? "lido" : t.permitido === false ? "vazio" : ""),
        t.permitido === true ? "allowed" : t.permitido === false ? "not allowed" : "not read"));
      tr.appendChild(tdP);
      tr.appendChild(novo("td", "m",
        t.saldo === null ? TRACO : (t.casas === null ? t.saldo.toString() + " raw units" : comCasas(t.saldo, t.casas))));
      corpo.appendChild(tr);
    });
    /* Dois tokens desta lista devolvem o MESMO symbol(). Dizer isso e mais util
       que escolher um apelido: o apelido seria nosso, e o symbol e deles. */
    var contagem = {};
    ESTADO.tokens.forEach(function (t) { if (t.simbolo) contagem[t.simbolo] = (contagem[t.simbolo] || 0) + 1; });
    var repetidos = Object.keys(contagem).filter(function (s) { return contagem[s] > 1; });
    if (repetidos.length) {
      var tr2 = document.createElement("tr");
      var td2 = novo("td", null, "Read, not edited: " + repetidos.join(", ") + " is the symbol() of more " +
        "than one allowed token. They are different contracts with the same name on chain, and the " +
        "address column is the only thing that tells them apart. This page prints what the token " +
        "answers; renaming one of them here would be this page inventing a distinction the chain " +
        "does not make.");
      td2.colSpan = 5; tr2.appendChild(td2); corpo.appendChild(tr2);
    }

    /* O seletor de ativo do fluxo sai daqui, nunca de uma lista escrita a mao. */
    var sel = $("c-ativo");
    sel.innerHTML = "";
    var vazio = document.createElement("option");
    vazio.value = ""; vazio.textContent = "choose an asset";
    sel.appendChild(vazio);
    ESTADO.tokens.forEach(function (t, i) {
      if (t.permitido !== true || t.casas === null) return;
      var o = document.createElement("option");
      o.value = String(i);
      o.textContent = (t.simbolo || "token") + "  ·  " + t.endereco.slice(0, 10) + "…" + t.endereco.slice(-6);
      sel.appendChild(o);
    });
  }

  /* --------------------------------------------------------------- routers -- */
  function lerAlvo(endereco) {
    var a = { endereco: endereco, permitido: null, codigo: null };
    return call(REGISTRY, sig("parameterRegistry", "isAllowedTarget(address)") + pal(endereco))
      .then(function (r) { a.permitido = u(palavra(r, 0)) === 1n; })
      .catch(function () { a.permitido = null; })
      .then(function () { return rpc("eth_getCode", [endereco, "latest"]).catch(function () { return null; }); })
      .then(function (c) { a.codigo = c && c !== "0x" ? (c.length - 2) / 2 : 0; ESTADO.alvos.push(a); });
  }

  function desenharAlvos(faixa) {
    var corpo = $("c-alvos");
    corpo.innerHTML = "";
    var vivos = ESTADO.alvos.filter(function (a) { return a.permitido === true; });
    if (!vivos.length) {
      var tr = document.createElement("tr");
      var td = novo("td", "m", "No router is allowed in the scanned range.");
      td.colSpan = 3; tr.appendChild(td); corpo.appendChild(tr);
      txt($("c-alvos-resumo"),
        "Read this together with the range: " + faixa.descricao + " With no router allowed, " +
        "executeCycle cannot complete for anybody — it checks isAllowedTarget on the router of " +
        "every leg and reverts TargetNotAllowed at the first one. That is not a flaw in this page and " +
        "not a warning about the future: it is the state of the whitelist right now, and it is why the " +
        "second step below is encoded with an empty legs array instead of a route this page made up. " +
        "The whitelist is opened by the owner, through a pull request, and the event records the PR " +
        "URL — a parameter with no public PR cannot exist, the contract rejects it.");
      return;
    }
    vivos.forEach(function (a) {
      var tr = document.createElement("tr");
      var th = novo("th", "m", a.endereco); th.scope = "row";
      tr.appendChild(th);
      var tdP = novo("td", null);
      tdP.appendChild(novo("span", "pill lido", "allowed"));
      tr.appendChild(tdP);
      tr.appendChild(novo("td", "m", a.codigo ? a.codigo + " bytes" : "no code"));
      corpo.appendChild(tr);
    });
    txt($("c-alvos-resumo"), vivos.length + " router(s) allowed. " + faixa.descricao +
      " A leg may only swap on one of these; executeCycle reverts TargetNotAllowed on anything else.");
  }

  /* ============================================================== CALLDATA == */
  /* Aqui vive a REGRA 3, que e a espinha desta onda.

     O defeito que esta secao existe para tornar impossivel tem nome: remontar no
     clique. A tela mostra os bytes, o usuario le, confere, clica — e o codigo, no
     handler, monta tudo de novo a partir dos campos. Entre a leitura e o clique
     cabe qualquer coisa: um campo que mudou, uma resposta de RPC atrasada, um
     render que rodou no meio. O que ele assina deixa de ser o que ele leu, e nada
     na tela mente em nenhum instante: a tela mostrou a verdade de um momento que
     ja passou. E o pior defeito possivel numa pagina cuja unica razao de existir e
     que o byte na tela seja o byte assinado.

     Entao: monta UMA vez, guarda o objeto, desenha DAQUELE objeto, tira o hash
     DAQUELE objeto. No clique reconfere o hash e envia AQUELE objeto. Qualquer
     entrada que mude mata o congelamento, e a tela DIZ que matou — o botao vira
     "Void" com o motivo escrito no cartao, em vez de silenciosamente parar de
     funcionar ou, pior, continuar funcionando sobre bytes velhos. */

  var MAX_UINT256 = (1n << 256n) - 1n;
  var CONGELAMENTO = null;   /* { geracao, selo, passos } — null = nao ha o que enviar */
  var GERACAO = 0;
  var ENVIANDO = false;

  /* O selo e o retrato das entradas no instante do congelamento, e ele e
     comparado por VALOR no clique. Os listeners de `input` abaixo sao o caminho
     rapido — eles avisam na hora — mas nao sao a garantia: um evento pode nao
     disparar (autofill de gerenciador de senha, restauracao de formulario do
     proprio navegador ao voltar na historia, extensao escrevendo no campo). Valor
     nao tem como discordar de si mesmo, entao o selo e quem fecha. */
  function seloAtual() {
    /* JSON.stringify e nao join(separador): qualquer separador que eu escolhesse
       poderia ser digitado dentro de um dos campos, e ai dois conjuntos de
       entradas diferentes produziriam o MESMO selo — um congelamento que devia
       ter morrido sobreviveria. JSON escapa o conteudo, entao a serializacao e
       injetora: selos iguais significam entradas iguais, sem excecao. */
    return JSON.stringify([
      $("c-ativo").value,
      $("c-principal").value,
      $("c-lucro").value,
      ($("c-endereco").value || "").trim().toLowerCase(),
      $("c-rpc").value
    ]);
  }

  function invalidarCongelamento(motivo) {
    if (!CONGELAMENTO) return;
    var passos = CONGELAMENTO.passos;
    CONGELAMENTO = null;
    passos.forEach(function (p) {
      p.podeEnviar = false;
      if (p.elBotao && !p.enviada) {
        p.elBotao.disabled = true;
        txt(p.elBotao, "Void — encode again");
      }
      if (p.elInvalidado) txt(p.elInvalidado, motivo);
    });
    estadoFluxo(motivo);
  }

  $("c-montar").addEventListener("click", function () { montar(); });
  ["c-principal", "c-lucro"].forEach(function (id) {
    $(id).addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") { ev.preventDefault(); montar(); }
    });
  });

  /* Toda entrada que participa da calldata invalida o congelamento ao mudar.
     `c-rpc` esta na lista mesmo nao entrando em nenhum byte: e dele que sai a
     estimativa e a confirmacao de estado, e um congelamento estimado contra um
     endpoint e confirmado contra outro mede duas coisas diferentes. */
  ["c-ativo", "c-principal", "c-lucro", "c-endereco", "c-rpc"].forEach(function (id) {
    var el = $(id); if (!el) return;
    var aoMudar = function () {
      invalidarCongelamento("An input changed after these bytes were encoded, so the frozen transaction " +
        "was thrown away. What is on screen is no longer what your wallet would receive. Press Encode " +
        "again — this page will not quietly rebuild the bytes under a button you have already read.");
    };
    el.addEventListener("input", aoMudar);
    el.addEventListener("change", aoMudar);
  });

  /* ------------------------------------------- REGRA 2 · a trava do token ---
     As quatro exigencias, todas ABORTANDO, nenhuma avisando. O que isto prova
     esta dito na tela sem inflar: prova que o Registry admite este token agora.
     Nao prova que o token e bom, e a tela nao vai dizer que prova. */
  function travarTokenParaCalldata(tok) {
    return Promise.resolve().then(function () {
      var a = tok.endereco;
      if (!END.test(a)) throw new Error("that token's address is not 40 hex characters");
      if (/^0x0{40}$/.test(a)) throw new Error("that token's address is the zero address");
      var orf = ehOrfao(a);
      if (orf) {
        throw new Error("ABORTED: " + a + " is a " + orf.tipo + " from a failed deploy run (nonce " +
          orf.nonce + "), which the ledger lists as an orphan. It has code and it would answer.");
      }
      var vivos = LIVRO.VIVOS, chaves = Object.keys(vivos);
      for (var i = 0; i < chaves.length; i++) {
        if (String(vivos[chaves[i]]).toLowerCase() === String(a).toLowerCase()) {
          throw new Error("ABORTED: " + a + " is the Triviu " + chaves[i] + ", not a token. Encoding an " +
            "approve whose target is a Triviu contract is refused.");
        }
      }
      return call(REGISTRY, sig("parameterRegistry", "isAllowedToken(address)") + pal(a));
    }).then(function (r) {
      if (!r || r === "0x" || u(palavra(r, 0)) !== 1n) {
        throw new Error("the ParameterRegistry does not allow that token at this moment. It was allowed " +
          "when the list was read; it is re-read here, at the instant of encoding, precisely because a " +
          "whitelist that changed between the read and the click is what this re-check exists for");
      }
      return rpc("eth_getCode", [tok.endereco, "latest"]);
    }).then(function (c) {
      if (!c || c === "0x") {
        throw new Error("that token address has no code on chain " + CHAIN.toString() + ", so an approve " +
          "to it would do nothing and still cost gas");
      }
      return tok.endereco;
    });
  }

  /* ------------------------------------------ REGRA 7 · a permissao vigente -- */
  function lerAllowance(token, dono) {
    return call(token, sig("erc20Allowance", "allowance(address,address)") + pal(dono) + pal(EXECUTOR))
      .then(function (r) {
        if (!r || r === "0x") return null;
        return u(palavra(r, 0));
      })
      .catch(function () { return null; });
  }

  function frasePermissao(v, tok) {
    var sym = tok.simbolo || "this token";
    if (v === null) {
      return "could NOT be read. Because it could not be read, the approval below is not offered for " +
        "signature at all. Rule 7 is to show the standing allowance before asking for another one, and a " +
        "page that cannot show it has not earned the right to ask for one.";
    }
    if (v === 0n) return "none. The Executor cannot move any " + sym + " of yours right now.";
    if (v === MAX_UINT256) {
      return "UNLIMITED — 2^256-1, the all-ones value. This is a standing permission to move every " +
        sym + " this address will ever hold, granted to " + EXECUTOR + ", lasting until you revoke it. " +
        "The step below sets it back to zero, and it is offered first for that reason.";
    }
    if (v > (1n << 128n)) {
      return comCasas(v, tok.casas) + " " + sym + " — larger than the entire supply of any real token, " +
        "so it is unlimited in practice whatever the exact number says. The step below zeroes it.";
    }
    return comCasas(v, tok.casas) + " " + sym + " is already approved and still standing.";
  }

  /* ===================================== O UNICO LUGAR QUE CONSTROI CALLDATA ==
     sig(), pal() e palNum() nao aparecem em enviar() nem dentro de handler de
     clique nenhum, e scripts/check-assinatura.mjs reprova o build se aparecerem.
     Essa e a diferenca entre a regra 3 estar escrita e a regra 3 estar valendo. */
  function construirPassos(tok, alvoToken, principal, lucro, dono, permissao) {
    var spender = travarEnderecoDoLivro(EXECUTOR, "triviuExecutor");
    var gastank = travarEnderecoDoLivro(GASTANK, "gasTank");
    var sym = tok.simbolo || "";
    var passos = [];
    var temPermissaoVelha = permissao !== null && permissao > 0n;

    /* REGRA 7 · o passo de zerar so existe quando ha o que zerar, e vem PRIMEIRO.
       Nunca cavalgar em silencio uma aprovacao antiga. */
    if (temPermissaoVelha) {
      passos.push({
        n: "first — because an allowance is already standing",
        titulo: "Set the standing allowance back to zero",
        papel: "erc20",
        assinatura: "approve(address,uint256)",
        alvo: alvoToken,
        alvoNome: (sym || "the asset token") + " — the token contract, not a Triviu contract",
        assinavel: true,
        exigeAllowance: true,
        permissaoLida: permissao,
        args: [
          { nome: "spender", tipo: "address", valor: spender, nota: "the Executor, from the ledger" },
          { nome: "amount", tipo: "uint256", valor: "0", nota: "zero — this revokes, it does not grant" }
        ],
        dados: recusarAprovacaoInfinita(sig("erc20", "approve(address,uint256)") + pal(spender) + palNum(0),
          "erc20", "approve(address,uint256)"),
        valor: 0n,
        confirmacao: { tipo: "allowance", token: alvoToken, dono: dono, esperado: 0n, casas: tok.casas, simbolo: sym },
        faz: "Revokes what the Executor is currently allowed to move. After this, the standing permission " +
          "reads zero and nothing can be pulled from your address until you grant a new one.",
        naoFaz: "It moves no tokens and it is not a payment. It also does not undo anything already " +
          "moved — an allowance governs what can be taken from here on, never what was taken before."
      });
    }

    passos.push({
      n: temPermissaoVelha ? "step 1 of 2 — after the zero above" : "step 1 of 2",
      titulo: "Let the Executor move that amount, once",
      papel: "erc20",
      assinatura: "approve(address,uint256)",
      alvo: alvoToken,
      alvoNome: (sym || "the asset token") + " — the token contract, not a Triviu contract",
      assinavel: true,
      exigeAllowance: true,
      permissaoLida: permissao,
      args: [
        { nome: "spender", tipo: "address", valor: spender, nota: "the Executor, from the ledger" },
        { nome: "amount", tipo: "uint256", valor: principal.toString(),
          nota: comCasas(principal, tok.casas) + " " + sym + ", scaled by the " + tok.casas + " decimals read from the token" }
      ],
      dados: recusarAprovacaoInfinita(sig("erc20", "approve(address,uint256)") + pal(spender) + palNum(principal),
        "erc20", "approve(address,uint256)"),
      valor: 0n,
      confirmacao: { tipo: "allowance", token: alvoToken, dono: dono, esperado: principal, casas: tok.casas, simbolo: sym },
      faz: "Sets an allowance: the Executor becomes able to pull up to this amount of this token from " +
        "your address, and only this token. ERC-20 approve is the standard one; it is on the token, so " +
        "the same bytes work on any wallet screen that decodes ERC-20.",
      naoFaz: "It moves nothing by itself, and it is not a payment. It also does not expire: an " +
        "allowance survives until it is spent or set back to zero, which is why the amount here is the " +
        "principal and not an unlimited approval. An unlimited approval is a standing permission to " +
        "drain that token, and this page will not encode one — the byte check that refuses it runs on " +
        "the calldata itself, not on anyone's good intentions."
    });

    passos.push({
      n: "step 2 of 2",
      titulo: "Run the cycle in one transaction",
      papel: "triviuExecutor",
      assinatura: "executeCycle(address,uint256,uint256,(uint8,address,address,address,uint24,uint256)[])",
      alvo: spender,
      alvoNome: "TriviuExecutor, from the ledger",
      assinavel: true,
      args: [
        { nome: "asset", tipo: "address", valor: alvoToken, nota: "the cycle opens and closes here" },
        { nome: "principal", tipo: "uint256", valor: principal.toString(), nota: comCasas(principal, tok.casas) + " " + sym },
        { nome: "minProfit", tipo: "uint256", valor: lucro.toString(),
          nota: comCasas(lucro, tok.casas) + " " + sym + " — below this the whole transaction reverts" },
        { nome: "legs", tipo: "tuple[]", valor: "[] (length 0)",
          nota: "EMPTY, and stated rather than filled: " + (ESTADO.alvos.filter(function (a) { return a.permitido === true; }).length) +
            " routers are allowed, and a leg must swap on an allowed one. This page does not invent a route." }
      ],
      dados: recusarAprovacaoInfinita(
        sig("triviuExecutor", "executeCycle(address,uint256,uint256,(uint8,address,address,address,uint24,uint256)[])") +
        pal(alvoToken) + palNum(principal) + palNum(lucro) + palNum(128) + palNum(0),
        "triviuExecutor", "executeCycle(address,uint256,uint256,(uint8,address,address,address,uint24,uint256)[])"),
      valor: 0n,
      faz: "Pulls the principal, walks the legs in order, and at the end requires the asset balance to " +
        "be at least what it started with plus the principal plus minProfit. If it is not, the entire " +
        "transaction reverts and no leg is left half-done. The fee, if any, is taken from the profit " +
        "only, after that check.",
      naoFaz: "It does not hold your funds between transactions, and it cannot be pointed at a router " +
        "or a token the Registry does not allow. With an empty legs array it cannot run at all — " +
        "which is what the estimate below reports, in the contract's own words."
    });

    passos.push({
      n: "optional",
      titulo: "Fund your own gas reserve",
      papel: "gasTank",
      assinatura: "deposit()",
      alvo: gastank,
      alvoNome: "GasTank, from the ledger",
      /* Nao assinavel, e a razao NAO e tecnica: a estimativa passa, 29416 gas
         medidos. E uma decisao declarada. A autorizacao desta onda PERMITE
         assinatura; ela nao obriga esta pagina a oferecer uma onde a transacao
         nao tem efeito que valha a pena. Depositar hoje trava POL num contrato
         cujo consumidor nao existe. */
      assinavel: false,
      razaoNaoAssinavel: "Encoded and not offered for signature, on purpose. The estimate passes — this " +
        "is not a technical block. The reserve simply buys nothing today: the automated path that would " +
        "spend it is not deployed, so signing this would lock POL for a feature that does not exist yet. " +
        "The bytes are here to be read; the button is absent because pressing it would be a decision " +
        "this page has no honest reason to invite.",
      args: [],
      dados: sig("gasTank", "deposit()"),
      valor: 0n,
      faz: "Credits native POL to a balance recorded under your address. You are the only account that " +
        "can move it back out, through withdraw().",
      naoFaz: "Nothing spends it for you yet. The automated path — using your reserve to finish a " +
        "return leg that ran out of gas — is not deployed; the contract's own source says it ships " +
        "only once specified and audited. Until then this is an escrow you can fill and empty, and " +
        "filling it buys you nothing."
    });

    /* REGRA 8 · o value entra AQUI, explicito, em todo passo. Nao existe caminho
       neste arquivo em que uma transacao seja montada sem value: o campo e escrito
       na mesma linha em que o objeto nasce. `deposit()` e a unica genuinamente
       payable das quatro, e mesmo ela vai com zero — e por isso mesmo nao e
       oferecida para assinatura acima.

       REGRA 11 · e a ligacao tela<->calldata roda ANTES de existir `p.tx`. Passo
       que nao amarra nao vira transacao. Esta tela tem `legs`, que e `tuple[]` —
       tipo dinamico, cuja cabeca leva deslocamento e nao valor. A checagem
       posicional nao alcanca esse argumento, e ele NAO e pulado em silencio:
       sai impresso no cartao, pelo nome, como nao-amarrado. */
    passos.forEach(function (p) {
      p.ligacao = conferirTelaContraCalldata(p);
      p.tx = {
        chainId: Number(CHAIN),
        to: p.alvo,
        data: p.dados,
        value: "0x" + BigInt(p.valor).toString(16),
        de: dono
      };
    });
    return passos;
  }

  /* ----------------------------------------------- REGRA 11 · tela x carteira -- */
  /* Cada passo carrega DUAS expressoes independentes dos mesmos valores: `args`,
     que o cartao imprime em letra legivel, e `dados`, que a carteira recebe em
     bytes. Nada as ligava. Trocar `palNum(q)` por `palNum(q * 2n)` numa linha
     deixava o cartao dizendo `q` e a carteira levando `2q`, com impressao digital
     valida e os cinco guardioes verdes — porque todos eles conferem congelamento
     contra envio, que sao os DOIS LADOS DO ENVIO, e nunca tela contra envio.

     Medido pelo red-team do N2 do Tubarao-branco: das 8 mutacoes, 4 ficaram
     verdes, e as 4 eram desta familia.

     NOTA DE PORTE: este arquivo nao tem `palInt` — o outro tem, porque tem
     ticks int24. Copiar a tabela de tipos tal e qual daria ReferenceError na
     carga e mataria a tela inteira. A tabela aqui e a dos codificadores que
     ESTE arquivo tem; o que nao esta nela cai em `soltas`, declarado.

     O QUE ELA NAO PROVA: usa os mesmos codificadores que montaram a calldata.
     Defeito dentro de um codificador erra os dois lados igual e fica verde. Ela
     liga tela<->calldata; nao afere codificador. */




  /* Congela: a carga de cada passo nasce AQUI, congelada, a impressao digital
     sai DELA, geracao nova, selo das entradas. Depois disto nada e recalculado e
     nada e reconstruido — a tela desenha daqui, o clique confere contra isto, e
     a carteira recebe este mesmo objeto. */
  function congelar(passos, selo) {
    GERACAO += 1;
    var geracao = GERACAO;
    return emSerie(passos, function (p) {
      p.carga = cargaDaTx(p.tx);
      return hashDaCarga(p.carga, p.tx.chainId).then(function (h) { p.hash = h; p.geracao = geracao; });
    }).then(function () {
      return { geracao: geracao, selo: selo, passos: passos };
    });
  }

  function montar() {
    if (montando) {
      estadoFluxo("Still encoding the previous set. This click did nothing.");
      return;
    }
    if (ENVIANDO) {
      estadoFluxo("A transaction from this page is in your wallet right now. Accept or reject it before " +
        "encoding a new set — re-encoding under a pending signature is how the wrong bytes get signed.");
      return;
    }
    limparRecusa();
    invalidarCongelamento("Re-encoding: the previous frozen set was discarded.");
    var caixa = $("c-passos");
    caixa.innerHTML = "";
    ocupadoPassos(false);
    var iAtivo = $("c-ativo").value;
    if (iAtivo === "") {
      recusar("c-ativo", "Pick an asset first. This list is built from the tokens the Registry allows, " +
        "so it stays empty until the chain is read. Nothing was encoded.");
      return;
    }
    var tok = ESTADO.tokens[Number(iAtivo)];
    if (!tok || tok.casas === null) {
      erroFluxo("That token's decimals were not read, so no amount can be scaled. Nothing was encoded.");
      return;
    }

    var principal = paraUnidades($("c-principal").value, tok.casas);
    if (principal === null || principal === 0n) {
      recusar("c-principal", "The principal must be a positive number with at most " + tok.casas +
        " decimal places — that is how many " + (tok.simbolo || "this token") + " has. Nothing was encoded.");
      return;
    }
    var lucro = paraUnidades($("c-lucro").value, tok.casas);
    if (lucro === null) {
      recusar("c-lucro", "minProfit must be a number with at most " + tok.casas + " decimal places. Nothing was encoded.");
      return;
    }
    var dono = ESTADO.dono || ($("c-endereco").value || "").trim();
    if (!END.test(dono)) {
      erroFluxo("Read the chain first: the gas estimate needs an address to run the call from. Nothing was encoded.");
      return;
    }

    var selo = seloAtual();
    montando = true;
    $("c-montar").disabled = true;
    ocupadoPassos(true);
    estadoFluxo("Re-confirming the token against the Registry and reading the allowance the Executor " +
      "already holds. The bytes are encoded only after both answer.");

    var alvoToken = null, permissao = null;
    Promise.resolve()
      .then(function () { return travarTokenParaCalldata(tok); })
      .then(function (a) { alvoToken = a; return lerAllowance(alvoToken, dono); })
      .then(function (v) {
        permissao = v;
        txt($("c-permissao"), "Standing allowance of the Executor over your " + (tok.simbolo || "token") +
          ": " + frasePermissao(v, tok));
        var passos = construirPassos(tok, alvoToken, principal, lucro, dono, permissao);
        return congelar(passos, selo);
      })
      .then(function (cong) {
        CONGELAMENTO = cong;
        cong.passos.forEach(function (p) { caixa.appendChild(cartao(p, tok)); });
        ajustarRolagem();
        return emSerie(cong.passos, function (p) { return estimar(p, dono); }).then(function () { return cong; });
      })
      .then(function (cong) {
        var revertidos = cong.passos.filter(function (p) { return p.reverteu; }).length;
        var enviaveis = cong.passos.filter(function (p) { return p.podeEnviar; }).length;
        estadoFluxo("Encoded and frozen. " + cong.passos.length + " calls, each with a fingerprint over " +
          "{chainId, from, to, data, value} that is re-checked at the instant you click. " +
          (revertidos
            ? revertidos + " would revert against the chain as it is right now, and those cannot be " +
              "signed here — the reason the contract gave is on each card in its own words."
            : "None of them reverts in the estimate.") +
          " " + enviaveis + " can be signed. " +
          (ORIGEM.ok ? "" : "Signing is off on this origin: " + ORIGEM.motivo));
      })
      .catch(function (e) {
        erroFluxo("Nothing was encoded: " + (e && e.message ? e.message : String(e)));
      })
      .finally(function () {
        ocupadoPassos(false);
        montando = false;
        $("c-montar").disabled = false;
      });
  }

  function cartao(p, tok) {
    var el = novo("article", "passo");
    var hid = "passo-" + p.assinatura.replace(/[^a-zA-Z0-9]/g, "-") + "-" + p.hash.slice(0, 8);
    el.setAttribute("aria-labelledby", hid);

    var cab = novo("div", "cab");
    cab.appendChild(novo("span", "num", p.n));
    var h = novo("h3", null, p.titulo); h.id = hid;
    cab.appendChild(h);
    el.appendChild(cab);

    var t = novo("table", "vt");
    var tb = document.createElement("tbody");
    function linha(rot, val) {
      var tr = document.createElement("tr");
      var th = novo("th", null, rot); th.scope = "row";
      tr.appendChild(th);
      tr.appendChild(novo("td", "v", val));
      tb.appendChild(tr);
      return tr;
    }
    /* TUDO abaixo sai de `p.carga` — o objeto CONGELADO, que e literalmente o
       que `eth_sendTransaction` recebe. A versao anterior desenhava de `p.tx` e
       o comentario aqui dizia "o objeto congelado": `p.tx` NAO e congelado,
       `p.carga` e (`Object.freeze` em `cargaDaTx`). Eram dois objetos, o cartao
       lia um e a carteira recebia o outro, e o cabecalho afirmava que eram o
       mesmo. Hoje sao: nao ha o que divergir porque nao ha dois.

       `chainId` e a excecao, e fica declarada: ele nao mora na carga (a carteira
       o recebe pela sessao, nao no objeto) e por isso sai de `p.tx.chainId`. E o
       campo conferido em separado contra `eth_chainId` no instante do clique. */
    linha("Function, from the compiled artefact", p.assinatura);
    linha("Four-byte selector", p.carga.data.slice(0, 10));
    linha("Target contract", p.carga.to);
    linha("What that address is", p.alvoNome);
    linha("Chain id these bytes are frozen for", String(p.tx.chainId) + "  (0x" + p.tx.chainId.toString(16) + ")");
    linha("Native value attached", comCasas(BigInt(p.carga.value), 18) + " POL" +
      (BigInt(p.carga.value) === 0n ? "  — explicitly zero, never by omission" : ""));
    linha("Fingerprint of {chainId, from, to, data, value}, SHA-256", p.hash);
    var trGas = linha("Estimated gas, eth_estimateGas", TRACO);
    var trCusto = linha("What that costs at the current gas price", TRACO);
    t.appendChild(tb);
    el.appendChild(t);
    p._gas = trGas.lastChild;
    p._custo = trCusto.lastChild;

    if (p.args.length) {
      var dl = novo("dl", "cod args");
      p.args.forEach(function (a) {
        dl.appendChild(novo("dt", "mono", a.tipo + " " + a.nome));
        var dd = novo("dd", null);
        dd.appendChild(novo("span", "mono", a.valor));
        var n = novo("span", "notaarg", a.nota);
        n.setAttribute("translate", "yes");
        dd.appendChild(n);
        dl.appendChild(dd);
      });
      el.appendChild(dl);
    }

    var fig = novo("figure", "calldataf");
    var cap = novo("figcaption", null,
      "Calldata as the wallet would receive it — 4-byte selector" +
      (p.args.length ? " plus " + p.args.length + " argument" + (p.args.length === 1 ? "" : "s") : ", no arguments") +
      ", " + ((p.carga.data.length - 2) / 2) + " bytes in total");
    fig.appendChild(cap);
    var pre = novo("pre", "cod");
    pre.setAttribute("translate", "no");
    pre.textContent = p.carga.data;
    fig.appendChild(pre);
    el.appendChild(fig);

    /* O resultado da regra 11, impresso. Diz quantas palavras da calldata foram
       RECONSTRUIDAS a partir do que esta escrito na tela — e nomeia o que ficou
       de fora, quando fica. O passo nem chegaria ate aqui se alguma divergisse. */
    if (p.ligacao) {
      el.appendChild(novo("p", "hint",
        "Screen against bytes: " + p.ligacao.ligadas + " of " + p.ligacao.palavras +
        " calldata word(s) were re-encoded from the values printed above and matched, and the " +
        "selector was re-derived from the signature on this card." +
        (p.ligacao.soltas.length
          ? " NOT bound by this check, because the type is dynamic and its bytes are not one word: " +
            p.ligacao.soltas.join(", ") + "."
          : " Nothing in this call is left unbound.")));
    }

    el.appendChild(novo("p", "hint", "What it does: " + p.faz));
    el.appendChild(novo("p", "hint", "What it does not do: " + p.naoFaz));

    /* ------------------------------------------------------ o bloco de envio -- */
    var envio = novo("div", "envio");
    var b = novo("button", "act", "Send this to my wallet");
    b.type = "button";
    b.setAttribute("data-enviar", "1");
    b.disabled = true;
    /* O handler NAO monta nada. Ele chama enviar(p), e enviar(p) le o objeto
       congelado. O guardiao check-assinatura.mjs le o corpo deste handler e o de
       enviar() e reprova se qualquer um dos dois construir calldata. */
    b.addEventListener("click", function () { enviar(p); });
    p.elBotao = b;
    envio.appendChild(b);

    var est = novo("p", "hint");
    est.setAttribute("role", "status");
    est.setAttribute("aria-live", "polite");
    p.elEnvioEstado = est;
    envio.appendChild(est);

    var inval = novo("p", "erro");
    p.elInvalidado = inval;
    envio.appendChild(inval);

    var lh = novo("p", "hint mono");
    p.elHash = lh;
    envio.appendChild(lh);

    var lr = novo("p", "hint mono");
    p.elRecibo = lr;
    envio.appendChild(lr);

    var le = novo("p", "hint");
    p.elEfeito = le;
    envio.appendChild(le);

    el.appendChild(envio);

    if (!p.assinavel) txt(p.elInvalidado, p.razaoNaoAssinavel);
    return el;
  }

  /* Decide se o botao acende. Cada recusa escreve o motivo na tela: um botao
     desabilitado sem explicacao e a pagina culpando o usuario pelo proprio
     silencio. */
  function liberarEnvio(p) {
    var razao = null;
    if (!p.assinavel) razao = p.razaoNaoAssinavel;
    else if (!MOTOR.provedor()) razao = "No wallet is available in this browser, so there is nothing to send to.";
    else if (!ORIGEM.ok) razao = "Signing is off on this origin. " + ORIGEM.motivo;
    else if (p.exigeAllowance && p.permissaoLida === null) {
      razao = "The standing allowance could not be read from the token, and rule 7 says it must be shown " +
        "before another one is requested. Read the chain again.";
    }
    if (razao) {
      p.podeEnviar = false;
      p.elBotao.disabled = true;
      txt(p.elBotao, "Not available");
      txt(p.elInvalidado, razao);
      return;
    }
    p.podeEnviar = true;
    p.elBotao.disabled = false;
    txt(p.elInvalidado, "");
  }

  function estimar(p, dono) {
    /* O objeto estimado E o objeto enviado — pela MESMA funcao, nao por dois
       literais que hoje coincidem. A versao anterior deste comentario afirmava
       exatamente isto enquanto a linha abaixo remontava um literal a partir de
       p.tx: cabecalho prometendo o que o codigo nao dava, que e a definicao do
       M-1 desta casa — dentro do conserto do M-1. Os campos coincidiam, e o
       risco era a DERIVA, que foi exatamente como o F-1 nasceu: duas
       canonicalizacoes que se separaram sem ninguem notar.
       cargaDaTx e a unica construtora da carga. Estimar e enviar leem dela. */
    var tx = cargaDaTx(p.tx);
    return rpc("eth_estimateGas", [tx]).then(function (g) {
      var gas = BigInt(g);
      p.reverteu = false;
      txt(p._gas, gas.toString() + " gas");
      if (ESTADO.gasPrice === null) {
        txt(p._custo, TRACO + "  (the gas price was not read)");
      } else {
        var custo = gas * ESTADO.gasPrice;
        txt(p._custo, comCasas(custo, 18) + " POL   at " + comCasas(ESTADO.gasPrice, 9) +
          " gwei on chain " + CHAIN.toString());
      }
      liberarEnvio(p);
    }).catch(function (e) {
      p.reverteu = true;
      txt(p._gas, explicarRevert(e));
      txt(p._custo, "no cost, because there is no transaction to price — a call that reverts in the " +
        "estimate would revert on chain and spend gas without doing the thing");
      /* REGRA 10 · nao se assina o que ja se sabe que falha. O bloqueio e aqui, e
         e por isso que a estimativa roda ANTES de o botao existir aceso. */
      p.podeEnviar = false;
      p.elBotao.disabled = true;
      txt(p.elBotao, "Blocked — this reverts");
      txt(p.elInvalidado, "Not offered for signature: the estimate reverts against the chain as it is " +
        "right now, so signing it would spend gas to arrive at the same refusal. The contract's own " +
        "reason is in the gas row above.");
      var art = p._gas && p._gas.closest ? p._gas.closest("article") : null;
      if (art) art.className = "passo morto";
    });
  }

  /* ------------------------------------------------------------- o recibo ---- */
  function esperarRecibo(hash, aoAndar) {
    var tentativas = 0;
    var TETO = 60;   /* 60 x 3s ≈ 3 minutos */
    function passo() {
      tentativas += 1;
      return rpc("eth_getTransactionReceipt", [hash]).then(function (r) {
        if (r) return r;
        if (tentativas >= TETO) {
          throw new Error("no receipt after " + TETO + " checks (about three minutes). The transaction " +
            "WAS sent and its hash is above — it may still be pending. This page stopped watching; it " +
            "does not conclude anything about a transaction it stopped watching.");
        }
        aoAndar(tentativas);
        return new Promise(function (res) { setTimeout(res, 3000); }).then(passo);
      });
    }
    return passo();
  }

  /* Recibo com status 1 NAO e prova de efeito, e esta funcao existe por causa
     disso. Um token que devolve false em vez de reverter produz exatamente isto:
     recibo de sucesso e estado inalterado. Entao o estado e relido da chain e
     comparado com o que os bytes pediram. */
  function conferirEstadoNaChain(p) {
    CONFIRMANDO = true;
    return Promise.resolve()
      .then(function () { return conferirEstadoNaChainInterno(p); })
      .then(function (f) { CONFIRMANDO = false; return f; },
            function (e) { CONFIRMANDO = false; throw e; });
  }

  function conferirEstadoNaChainInterno(p) {
    var c = p.confirmacao;
    if (!c) {
      return Promise.resolve("No on-chain effect check is defined for this step, so nothing is claimed " +
        "about its effect beyond what the receipt says.");
    }
    if (c.tipo === "allowance") {
      return lerAllowance(c.token, c.dono).then(function (v) {
        if (v === null) {
          return "The receipt reports success, but allowance() could not be re-read, so the effect is " +
            "UNCONFIRMED. That is not the same as confirmed — a receipt with status 1 and no effect is a " +
            "real outcome on chain, and this page will not call it success on the receipt alone.";
        }
        if (v === c.esperado) {
          return "Confirmed against the chain: allowance(you, Executor) on " + c.simbolo + " now reads " +
            comCasas(v, c.casas) + ", which is exactly what these bytes asked for. Receipt and state agree.";
        }
        return "MISMATCH, and this is the case that proves why the state is re-read: the receipt reports " +
          "SUCCESS, but allowance(you, Executor) now reads " + comCasas(v, c.casas) + " " + c.simbolo +
          " and these bytes asked for " + comCasas(c.esperado, c.casas) + " " + c.simbolo + ". A token " +
          "that returns false instead of reverting produces precisely this. Do not treat this step as done.";
      });
    }
    return Promise.resolve("No on-chain effect check is defined for this step.");
  }

  /* ================================================================ ENVIO ==== */
  /* Este corpo NAO constroi calldata. Ele le p.tx, reconfere o hash, reconfere a
     chain no instante do clique, reconfere a conta, e manda AQUELE objeto. */
  function enviar(p) {
    if (ENVIANDO) {
      txt(p.elEnvioEstado, "Another transaction from this page is already waiting in your wallet.");
      return;
    }
    if (!CONGELAMENTO || p.geracao !== CONGELAMENTO.geracao) {
      invalidarCongelamento("These bytes are no longer the frozen set, so nothing was sent. Encode again.");
      txt(p.elEnvioEstado, "Nothing was sent: these bytes are no longer the frozen set.");
      return;
    }
    if (seloAtual() !== CONGELAMENTO.selo) {
      invalidarCongelamento("The form changed after these bytes were encoded. They were discarded before " +
        "your wallet was asked for anything. Encode again and read the new bytes.");
      txt(p.elEnvioEstado, "Nothing was sent: the form changed after these bytes were frozen.");
      return;
    }
    if (!p.podeEnviar) {
      txt(p.elEnvioEstado, "This step is not available for signature, and nothing was sent.");
      return;
    }
    /* Sem carga congelada nao ha o que reconferir, e o que nao pode ser
       reconferido nao e oferecido para assinatura. Este teste vem ANTES da trava
       de envio de proposito: um retorno depois de ENVIANDO = true teria de
       desfaze-la a mao, e trava liberada em dois lugares diferentes e a proxima
       trava que fica presa. */
    if (!p.carga) {
      txt(p.elEnvioEstado, "Nothing was sent: this step carries no frozen payload, so there is nothing " +
        "whose fingerprint could be re-checked. Encode again.");
      return;
    }
    if (!ORIGEM.ok) {
      txt(p.elEnvioEstado, "Nothing was sent. Signing is off on this origin. " + ORIGEM.motivo);
      return;
    }

    ENVIANDO = true;
    p.elBotao.disabled = true;
    txt(p.elEfeito, "");
    txt(p.elRecibo, "");
    txt(p.elHash, "");
    txt(p.elEnvioEstado, "Re-checking the frozen fingerprint and the wallet's chain. Nothing has been " +
      "sent and your wallet has not been asked for anything yet.");

    var tx = p.tx;
    /* ACHADO #1 DA MEDUSA, fechado aqui — e fechado de verdade so em 2026-08-13.
       Primeira versao: o congelamento imprimia `tx` e o envio montava um LITERAL
       NOVO a partir dos campos de `tx`. Entre uma coisa e outra ha tres await, e
       a impressao digital provava o que a pagina CONGELOU e nao o que ela ENVIA.
       Segunda versao (o conserto incompleto): o envio passou a construir a carga
       UMA vez e a conferi-la — mas o congelamento continuou imprimindo `tx`, com
       quatro campos, contra os cinco da carga. O envio ficou correto e o par
       ficou impossivel: 200 recusas em 200, medidas.
       Agora: a carga e construida uma unica vez em congelar(), por cargaDaTx(),
       e o que esta linha faz e LER aquela referencia. Nao ha objeto novo no
       caminho e nao ha uma segunda canonicalizacao para divergir da primeira. */
    var carga = p.carga;
    hashDaCarga(carga, tx.chainId)
      .then(function (h) {
        if (h !== p.hash) {
          throw new Error("REFUSED, and nothing was sent: the transaction object is not the one that was " +
            "hashed when it was drawn on this screen. Fingerprint at render " + p.hash.slice(0, 16) +
            "…, fingerprint now " + h.slice(0, 16) + "…. What you read is not what would have been sent.");
        }
        /* REGRA 4 · a chain e reconferida AQUI, no clique, e nao na conexao.
           Entre conectar e clicar cabe uma troca de rede inteira. */
        return pedirCarteira("eth_chainId");
      })
      .then(function (cid) {
        var n;
        try { n = BigInt(cid); } catch (e) { throw new Error("the wallet did not answer a usable chain id"); }
        if (n !== CHAIN) {
          throw new Error("REFUSED, and nothing was sent: your wallet is on chain " + n.toString() +
            " and these bytes are frozen for chain " + CHAIN.toString() + ". This page does not ask your " +
            "wallet to switch — it refuses, and you switch. A page that silently switches your chain is a " +
            "page that decides where you sign.");
        }
        if (BigInt(tx.chainId) !== CHAIN) {
          throw new Error("REFUSED: the frozen chain id is not " + CHAIN.toString() + ".");
        }
        return pedirCarteira("eth_accounts");
      })
      .then(function (contas) {
        var a = contas && contas.length ? String(contas[0]) : "";
        if (a.toLowerCase() !== String(tx.de).toLowerCase()) {
          throw new Error("REFUSED, and nothing was sent: your wallet's active account is " +
            (a || "(none)") + " and these bytes were built for " + tx.de + ". An allowance belongs to the " +
            "address that grants it, so signing this from another account would grant something else.");
        }
        txt(p.elEnvioEstado, "The transaction is in your wallet now. Nothing else happens here until you " +
          "accept it or reject it — both are fine, and rejecting costs nothing.");
        /* A MESMA referencia conferida acima. Remontar aqui reabriria a
           costura que este bloco existe para fechar. */
        return pedirCarteira("eth_sendTransaction", [carga]);
      })
      .then(function (hash) {
        p.enviada = true;
        txt(p.elHash, "Transaction hash: " + String(hash));
        txt(p.elEnvioEstado, "Sent. Waiting for the receipt — this page does not call anything done until " +
          "the chain answers.");
        return esperarRecibo(String(hash), function (n) {
          txt(p.elEnvioEstado, "Sent, waiting for the receipt (" + n + " checks so far). The hash is above.");
        });
      })
      .then(function (rec) {
        var ok = rec.status === "0x1";
        txt(p.elRecibo, "Receipt: status " + String(rec.status) + (ok ? " (success)" : " (FAILED on chain)") +
          " · block " + (rec.blockNumber ? BigInt(rec.blockNumber).toString() : TRACO) +
          " · gas used " + (rec.gasUsed ? BigInt(rec.gasUsed).toString() : TRACO));
        if (!ok) {
          txt(p.elEnvioEstado, "The transaction was mined and FAILED on chain. Gas was spent and nothing " +
            "was changed. That is the chain's answer, not this page's reading of it.");
          return null;
        }
        txt(p.elEnvioEstado, "Mined. Re-reading the state it was supposed to change — a receipt is not " +
          "proof of effect.");
        return conferirEstadoNaChain(p).then(function (frase) {
          txt(p.elEfeito, frase);
          txt(p.elEnvioEstado, "Done. The receipt and the re-read state are both above; read them " +
            "together, because only the second one is about the effect.");
        });
      })
      .catch(function (e) {
        /* Rejeicao na carteira e RESULTADO, nao falha. 4001 e o codigo do
           EIP-1193; a mensagem so entra como reserva porque texto de carteira
           varia e codigo nao. */
        var recusou = e && (e.code === 4001 || e.code === "ACTION_REJECTED");
        if (recusou) {
          txt(p.elEnvioEstado, "You declined it in your wallet. Nothing was sent, nothing was approved, " +
            "and no gas was spent. That is a result and not a failure — the bytes above are unchanged " +
            "and still frozen, and the button is live again if you would rather read them a while longer.");
        } else {
          txt(p.elEnvioEstado, "Stopped: " + (e && e.message ? e.message : String(e)));
        }
      })
      .finally(function () {
        ENVIANDO = false;
        if (p.podeEnviar && !p.enviada && CONGELAMENTO && p.geracao === CONGELAMENTO.geracao) {
          p.elBotao.disabled = false;
        } else if (p.enviada) {
          txt(p.elBotao, "Already sent — encode again to act on the new state");
        }
      });
  }

  /* A origem e conferida na carga, e o resultado aparece na tela antes de
     qualquer botao existir. Falha fechada: enquanto nao responder, ORIGEM.ok e
     false e nenhum passo libera envio. */
  conferirOrigem().then(function (o) {
    txt($("c-origem"), (o.ok ? "Signing is enabled on this origin: " : "Signing is OFF on this origin. ") + o.motivo);
  });
})();
