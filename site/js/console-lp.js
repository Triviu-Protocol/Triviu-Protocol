
/* =============================================================================
   /console/ — o console de LIQUIDEZ. Le a chain, monta a calldata, congela, e
   ENVIA o que congelou.

   O QUE ESTE ARQUIVO SUBSTITUI
   ============================
   Ate 2026-08-12 o /console/ era servido por /js/console-produto.js, cujo
   cabecalho se declarava uma simulacao com todas as letras: carteira, chain,
   contratos e eventos viviam em memoria e nenhuma chamada de rede era feita.
   Dois banners no alto da tela anunciavam o mesmo. Nao havia `window.ethereum` e
   nao havia `eth_sendTransaction` — havia um bloco de carteira falsa que
   resolvia uma promessa depois de um setTimeout e devolvia um endereco sorteado.

   As duas strings daqueles banners NAO sao reproduzidas aqui de proposito: o
   criterio de aceite era zero ocorrencia delas no console publicado, e um
   comentario viaja nos bytes como qualquer outra coisa. Elas moram em
   scripts/check-console-abi.mjs, que reprova o build se qualquer uma voltar a
   uma superficie que renderiza ou a codigo que executa.

   Apagar os banners teria sido a pior das saidas possiveis: a pagina passaria a
   mentir em vez de avisar. Entao a CAMADA saiu, e os banners sairam com ela.
   O que esta aqui abre a carteira de verdade, contra os contratos que estao na
   chain 137, e nao ha um caminho neste arquivo que produza um endereco, um
   recibo ou um saldo que nao tenha vindo da rede.

   ESTE ARQUIVO E UM PORTE, NAO UMA CRIACAO
   ========================================
   O motor e o de /js/console.js — mesma estrutura, mesmas travas, mesmos nomes.
   As dez regras do Tubarao-branco continuam implementadas como CODIGO e nao como
   comentario, e onde uma regra vira uma linha, a linha esta marcada:

     R1  origem unica          conferirOrigem() — knownHosts de /domain.config.json
     R2  endereco de calldata  travarEnderecoDoLivro() · travarTokenParaCalldata()
                               · travarGerenteDePosicoes()
     R3  congelamento          CONGELAMENTO · cargaDaTx() + hashDaCarga() · UMA
                               canonicalizacao dos dois lados · conferido no clique
     R4  chain no clique       eth_chainId IMEDIATAMENTE antes do request
     R5  allowlist +1          CARTEIRA_PERMITIDO — quatro, e o resto LANCA
     R6  zero aprovacao infinita  recusarAprovacaoInfinita() sobre os BYTES
     R7  allowance existente   lerAllowance() antes de pedir outra, e o passo de zerar
     R8  value explicito       toda tx congelada carrega value, nunca por omissao
     R9  nada em innerHTML     innerHTML so recebe "" · o resto e textContent
     R10 estimativa que reverte bloqueia  p.podeEnviar

   O QUE MUDA EM RELACAO AO IRMAO
   ==============================
   O irmao monta o ciclo do TriviuExecutor. Este monta o ciclo de vida de uma
   posicao no TriviuLPVault: abrir, autorizar, coletar, fechar. Sao quatro acoes
   e nao uma, entao existe um seletor de acao — mas existe UM congelamento de
   cada vez, com uma geracao e um selo, porque dois conjuntos congelados vivos ao
   mesmo tempo e a porta que a regra 3 fecha.

   E ha uma exigencia do contrato que a documentacao do fluxo nao registrava e
   que so aparece lendo o corpo: `coletar` e `fechar` passam por
   _exigeAprovacaoUnica(tokenId), que exige getApproved(tokenId) == o cofre. Sem
   essa autorizacao de UMA posicao, as duas revertem AprovacaoAusente. E ela NAO
   pode ser setApprovalForAll — o contrato recusa isso de proposito, com
   AprovacaoAmpla. Por isso "autorizar a posicao" e um passo proprio aqui.

   O elo com os contratos e a segunda invariante: nenhuma assinatura de funcao e
   nenhum seletor de 4 bytes e digitado aqui. Tudo passa por sig(papel,
   assinatura), que le a tabela gerada de contracts/out e lanca se a assinatura
   nao existir. O TriviuLPVault entrou nessa tabela em 2026-08-12, depois de o
   artefato compilado aqui reproduzir o bytecode implantado byte a byte fora das
   19 janelas de immutables — 380 bytes diferem, todos os 380 dentro delas.
   ========================================================================== */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var TRACO = "—";   /* o traco que significa "nao lido". Nunca um numero. */

  /* ------------------------------------------------------------------ tema --
     O controle de tema que faltava. O CSS ja respondia a data-theme; nao havia
     botao nem handler, entao o atributo existia e ninguem podia move-lo.

     REGRA 9 comeca aqui e nao na calldata: os dois icones sao construidos por
     DOM, e nao entregues como string de SVG a innerHTML. Sao literais, e literal
     a regra permitiria — mas um guardiao que precisa DECIDIR se a string
     atribuida e literal decide errado no dia em que ela vier de uma variavel
     montada. Entao innerHTML nesta pagina so pode receber "", e o guardiao para
     de julgar: ele compara. */
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
    if (s === "dark" || s === "light") return s;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  function aplicarTema(t) {
    document.documentElement.setAttribute("data-theme", t);
    var b = $("theme"); if (!b) return;
    limpar(b);
    b.appendChild(svgIcone(t === "dark" ? SOL : LUA));
    b.setAttribute("aria-label", t === "dark" ? "Switch to light theme" : "Switch to dark theme");
    b.setAttribute("aria-pressed", t === "dark" ? "true" : "false");
  }
  aplicarTema(temaAtual());
  /* O botao e OPCIONAL, e a guarda nao e defensiva por gosto. Sem ela, uma pagina
     que hospeda este motor sem um elemento #theme morre aqui — `$("theme")` devolve
     null, o addEventListener lanca, e o IIFE inteiro para ANTES de registrar
     qualquer passo do fluxo. O sintoma seria uma tela de assinatura inerte, sem
     erro visivel, por causa de um botao de tema. Quem quiser mandar no tema de
     fora manda: aplicarTema() ja leu a mesma chave `triviu-theme`, entao as duas
     pontas concordam sem se conhecerem. */
  var botaoTema = $("theme");
  if (botaoTema) {
    botaoTema.addEventListener("click", function () {
      var prox = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      try { localStorage.setItem("triviu-theme", prox); } catch (e) {}
      aplicarTema(prox);
    });
  }

  /* ============================================================== TRAVAS ==== */
  /* REGRA 5 — a lista tem EXATAMENTE quatro entradas, e as quatro estao aqui.
     Tres devolvem algo que o usuario ja controla; a quarta envia uma transacao
     que ele aprova na propria carteira. Nao ha uma quinta.

     O que continua RECUSADO nao esta escrito numa lista de proibidos, e isso e
     deliberado: a estrutura e uma allowlist, entao qualquer metodo que nao esteja
     nas quatro chaves abaixo LANCA — os de assinatura de mensagem inclusive, sem
     precisar ser nomeado. Lista de proibidos esquece um; allowlist nao tem como.
     A diferenca importa porque autorizacao off-chain e o vetor mais barato que
     existe: ela nao custa gas e nao aparece na chain ate ser usada contra voce. */
  var CARTEIRA_PERMITIDO = { eth_accounts: 1, eth_requestAccounts: 1, eth_chainId: 1, eth_sendTransaction: 1 };
  /* eth_getTransactionReceipt entra na lista de RPC, que e toda somente-leitura,
     e e ele que fecha o circuito: sem recibo, "enviei" seria a ultima coisa que
     esta pagina saberia dizer sobre a transacao. Ele tambem traz os LOGS, e e de
     um log que sai o tokenId de uma posicao recem-aberta — o unico lugar onde
     esse numero existe antes de qualquer leitura posterior.
     O comentario esta AQUI FORA e nao dentro do literal de proposito: os
     guardioes leem estas chaves com um parser de texto, e um comentario dentro
     das chaves vira uma chave inventada e um alarme falso. */
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
    if (!window.ethereum) throw new Error("no wallet provider in this browser");
    return window.ethereum.request(params ? { method: metodo, params: params } : { method: metodo });
  }

  var idRpc = 0;
  function rpc(metodo, params) {
    if (!RPC_PERMITIDO[metodo]) {
      throw new Error("blocked: this page may only call " +
        Object.keys(RPC_PERMITIDO).join(" / ") + " over RPC. Refused: " + metodo);
    }
    var url = $("lp-rpc").value;
    if (!/^https:\/\//i.test(url)) return Promise.reject(new Error("the endpoint must be an https URL"));
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
        /* Os bytes da reversao, guardados crus para serem decodificados pelo
           seletor e nunca adivinhados. */
        var d = j.error.data;
        if (d && typeof d === "object") d = d.data || d.originalError && d.originalError.data;
        if (typeof d === "string") e.dadosRevert = d;
        throw e;
      }
      return j.result;
    });
  }
  var call = function (to, data) { return rpc("eth_call", [{ to: to, data: data }, "latest"]); };

  /* ================================================================= ABI ==== */
  /* ------------------------------------------------------------- o motor ---
     As primitivas de assinatura NAO moram mais aqui. Elas moram em
     /js/motor.js, e este arquivo as CONSOME. Nao e organizacao: e o conserto
     estrutural do F-1. Enquanto cada tela carregava a sua propria copia de
     cargaDaTx e de hashDaCarga, duas copias do MESMO objeto podiam divergir
     sem que nada acusasse — e divergiram, e a pagina passou a recusar 100%
     dos envios com os cinco guardioes verdes por cima.

     Uma definicao. Todos os consumidores. O guardiao exige que continue
     assim, e reprova a segunda copia no dia em que ela aparecer. */
  var MOTOR = window.TRIVIU_MOTOR;
  if (!MOTOR) throw new Error("TRIVIU_MOTOR nao carregou: /js/motor.js precisa vir antes de /js/console-lp.js");
  var sig = MOTOR.sig, pal = MOTOR.pal, palNum = MOTOR.palNum, palInt = MOTOR.palInt,
      palavra = MOTOR.palavra, cargaDaTx = MOTOR.cargaDaTx, hashDaCarga = MOTOR.hashDaCarga,
      hashCanon = MOTOR.hashCanon, conferirTelaContraCalldata = MOTOR.conferirTelaContraCalldata,
      recusarAprovacaoInfinita = MOTOR.recusarAprovacaoInfinita,
      CODIFICADOR_POR_TIPO = MOTOR.CODIFICADOR_POR_TIPO;

  var ABI = window.TRIVIU_ABI;
  var LIVRO = window.TRIVIU_ENDERECOS;

  /** Seletor de 4 bytes de uma assinatura, vindo da tabela gerada de contracts/out.
      Lanca se a assinatura nao existir — que e o ponto do arquivo inteiro. */

  function topico(papel, evento) {
    var g = ABI.contratos && ABI.contratos[papel];
    var e = g && g.eventos && g.eventos[evento];
    if (!e) throw new Error("no such event in the compiled ABI: " + papel + "." + evento);
    return e.topico;
  }

  /* ---------------------------------------------------------------- codec -- */


  /* Inteiro COM SINAL em complemento de dois sobre 32 bytes. `palNum` nao serve:
     BigInt(-887220).toString(16) devolve "-d894c", com um sinal de menos no meio
     da calldata. Os ticks do Uniswap sao int24 e sao negativos metade do tempo —
     abaixo do preco de paridade todos sao. Conferido contra `cast calldata`:
     tickLower -887220 vira fff…f2764c, exatamente o que o cast produz. */


  function paraEndereco(w) { return "0x" + w.slice(24); }
  function u(w) { return BigInt("0x" + w); }
  function i256(w) { return BigInt.asIntN(256, BigInt("0x" + w)); }
  var END = /^0x[0-9a-fA-F]{40}$/;

  /* Inteiro -> decimal exato. Sem float e sem corte: um saldo arredondado
     impresso sem dizer que foi arredondado e a mesma invencao que um
     placeholder, e uma pagina que existe para mostrar o byte exato antes de uma
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
  /** Inteiro nao negativo digitado, sem casas. null se nao for um. */
  function paraInteiro(texto) {
    var s = String(texto == null ? "" : texto).trim();
    if (!/^\d+$/.test(s)) return null;
    return BigInt(s);
  }
  /** Inteiro COM SINAL digitado, dentro de uma faixa fechada. null se nao for. */
  function paraInteiroComSinal(texto, minimo, maximo) {
    var s = String(texto == null ? "" : texto).trim();
    if (!/^-?\d+$/.test(s)) return null;
    var v = BigInt(s);
    if (v < minimo || v > maximo) return null;
    return v;
  }

  /* ------------------------------------------------- REGRA 3 · o hash ------
     UMA canonicalizacao e UM objeto, e as duas coisas sao a mesma correcao.

     O DEFEITO QUE ESTAS LINHAS FECHAM, medido em 2026-08-13 executando as duas
     funcoes que viviam aqui: existiam DUAS canonicalizacoes do mesmo objeto.
     congelar() tirava a impressao digital de {chainId,to,data,value} e enviar()
     recalculava sobre {chainId,FROM,to,data,value}. Serializacoes diferentes,
     digests diferentes, sempre — a reconferencia do clique nunca podia passar.
     Medido: 200 de 200 transacoes distintas RECUSADAS, 100%. O caminho de
     assinatura inteiro estava morto, e nada na tela dizia isso: o usuario lia os
     bytes, clicava, e recebia a frase de que os bytes tinham mudado.

     E o defeito nao foi introduzido por descuido de digitacao. Ele passou porque
     as duas funcoes tinham NOMES diferentes e ambas eram plausiveis no lugar
     onde estavam. Por isso o conserto nao e "corrigir os campos de uma delas":
     e nao haver duas. Ha UMA funcao que constroi a carga e UMA que a imprime
     digitalmente, e os dois lados chamam exatamente essas.

     `from` ENTRA na canonicalizacao, e a versao com quatro campos e que estava
     errada: uma allowance pertence ao endereco que a concede e uma posicao ao
     endereco que a detem, entao trocar `from` troca o que se esta assinando. Um
     hash que ignorasse `from` nao provaria nada sobre isso.

     A serializacao e montada a mao, campo a campo, e NAO por JSON.stringify: a
     ordem das chaves de um objeto e do objeto, e um dia alguem reordena o
     literal achando que ordem de chave nao muda nada. Aqui muda — mudaria o
     hash, e um hash que muda por refatoracao e um alarme que dispara sozinho ate
     alguem desliga-lo.

     SHA-256 do WebCrypto, e nao o keccak do gerador: este hash nunca vai a chain
     nem sai desta pagina, ele so precisa detectar que dois objetos diferem.
     crypto.subtle exige contexto seguro; se nao existir, nao ha congelamento e
     portanto nao ha envio. Falha fechada, declarada em tela. */

  /** A CARGA: o objeto exato que eth_sendTransaction vai receber. Nasce UMA vez,
      no congelamento, congelado, e e esta referencia que a tela imprime, que o
      clique reconfere e que a carteira recebe. Existir num unico lugar e o que
      impede que dois literais equivalentes se separem — foi assim que o defeito
      acima entrou, com um literal de cada lado do arquivo. */






  /* ------------------------------------------- REGRA 6 · sobre os BYTES ----
     Nao "o codigo aprova o valor exato" — isso e uma afirmacao sobre intencao, e
     intencao nao e verificavel depois que alguem edita. Esta funcao le a
     calldata JA CONSTRUIDA e recusa a palavra toda-de-uns. Vale para os dois
     approve desta pagina, o de quantia e o de posicao, e para qualquer outra
     coisa que venha a ser montada aqui.

     O FALSO POSITIVO QUE ESTAS LINHAS CORRIGEM, medido em 2026-08-13 executando
     a versao anterior: `abrir()` com tickLower = -1 era RECUSADA. Um int24
     negativo em complemento de dois ocupa os 32 bytes inteiros com uns —
     BigInt.asUintN(256, -1n) E 2^256-1 — e a varredura cega nao tinha como
     distinguir "aprovacao ilimitada" de "menos um". Uma faixa de LP que comeca
     um tick abaixo do preco e legitima e comum; a pagina recusava o usuario e
     falava de aprovacao infinita numa chamada que nao aprova nada.

     A CORRECAO NAO AFROUXA A REGRA 6. Ela nao pergunta "esta funcao e um
     approve?" — pergunta o que a palavra E, e a resposta vem do ARTEFATO
     COMPILADO, nao de um literal digitado aqui nem do nome da funcao. Uma
     palavra toda-de-uns num argumento SEM SINAL continua recusada em qualquer
     chamada desta pagina, approve ou nao; so o argumento que o artefato declara
     COM SINAL pode legitimamente valer -1. Isso e mais estrito que "recusar so
     em approve", e envelhece melhor: uma funcao nova com int24 funciona sozinha,
     e um approve novo e coberto sozinho.

     E falha FECHADA: se os tipos nao puderem ser derivados, ou nao baterem
     palavra a palavra com a calldata, a varredura volta a ser cega. O modo de
     falha e recusar demais, nunca de menos. */

  /** Os tipos, palavra a palavra, como o artefato compilado os declara. Tuplas
      sao achatadas — `abrir` recebe um struct de dez campos estaticos e ocupa
      dez palavras, na ordem. Devolve null diante de qualquer tipo dinamico ou
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
       insere. Vem das assinaturas extras declaradas no gerador. E o primeiro
       delas e o que o position manager do Uniswap devolve — ele e anterior a
       custom errors e reverte com string. */
    MAPA_ERROS[sig("solidity", "Error(string)")] =
      { onde: "solidity", def: { assinatura: "Error(string)", entradas: [{ nome: "reason", tipo: "string" }] } };
    MAPA_ERROS[sig("solidity", "Panic(uint256)")] =
      { onde: "solidity", def: { assinatura: "Panic(uint256)", entradas: [{ nome: "code", tipo: "uint256" }] } };
    return MAPA_ERROS;
  }

  /** Uma frase para o erro de uma chamada, e as quatro respostas sao diferentes:
      reverteu com erro nomeado · reverteu com seletor desconhecido · reverteu
      SEM dados · nem chegou a reverter. A terceira e a mais informativa das
      quatro: um dispatcher que nao acha a funcao reverte vazio, e vazio e
      exatamente o que se ve quando a funcao nao existe naquele contrato. */
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
    /* Os argumentos comecam DEPOIS dos quatro bytes do seletor, e este corte e o
       conserto de um defeito medido, nao uma precaucao. A versao herdada indexava
       as palavras de 32 bytes sobre a string INTEIRA da reversao, que abre com o
       prefixo e com o seletor — quatro bytes de deslocamento em cada argumento.
       Conferido contra uma reversao real do cofre em 2026-08-12: um tokenId de
       seis digitos saiu como um numero de setenta e tres, e o endereco do dono
       saiu com quatro bytes de zero enfiados na frente e os quatro ultimos
       perdidos.

       O nome do erro saia certo, e e isso que torna o defeito perigoso: a tela
       dizia o erro verdadeiro e, ao lado, com a mesma tipografia de valor medido,
       tres numeros que nao eram os da chain. Numero errado com cara de lido e
       pior que traco. */
    var corpo = "0x" + dados.slice(10);
    var partes = [];
    (achado.def.entradas || []).forEach(function (ent, i) {
      var w = palavra(corpo, i);
      if (!w || w.length < 64) { partes.push(ent.nome + "=" + TRACO); return; }
      if (ent.tipo === "address") partes.push(ent.nome + "=" + paraEndereco(w));
      else if (/^uint|^int/.test(ent.tipo)) partes.push(ent.nome + "=" + u(w).toString());
      else if (ent.tipo === "string") partes.push(ent.nome + "=" + (decodeString(corpo) || "(string, not decoded here)"));
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
     detalhe de estilo. Medido em 2026-08-12 com o tradutor do Chrome ligado numa
     pagina irma: `setTreasury(address,string)` virou `definirTesouro(...)` e o
     argumento `100.5` virou `100,5` — separador decimal trocado. Numa tela cuja
     unica razao de existir e mostrar o byte exato antes de uma assinatura, o
     tradutor do proprio navegador reescrevendo valor e defeito de correcao, nao
     de aparencia. A prosa continua traduzivel de proposito. */
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
       estado()  -> role="status", polite. Comecou, andou, terminou.
       erro()    -> role="alert", assertive. A leitura PAROU e nao ha campo para
                    onde mandar o foco.
       recusar() -> nem uma nem outra. O campo recusado recebe aria-invalid, a
                    mensagem entra no span que o proprio campo referencia em
                    aria-describedby, e o foco vai para la — assim a razao e lida
                    pelo MESMO evento de foco que poe o cursor no conserto. */
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

  function estado(s) { txt($("lp-estado"), s); txt($("lp-erro"), ""); }
  function erro(s) { txt($("lp-estado"), ""); txt($("lp-erro"), s); }
  function estadoFluxo(s) { txt($("lp-fluxo-estado"), s); txt($("lp-fluxo-erro"), ""); }
  function erroFluxo(s) { txt($("lp-fluxo-estado"), ""); txt($("lp-fluxo-erro"), s); }
  function progresso(s) { txt($("lp-prog"), s); }
  function ocupadoPassos(v) { $("lp-passos").setAttribute("aria-busy", v ? "true" : "false"); }

  var CAMPOS = [
    "lp-endereco", "lp-acao", "lp-token0", "lp-token1", "lp-faixa", "lp-tickbaixo", "lp-tickalto",
    "lp-q0", "lp-q1", "lp-min0", "lp-min1", "lp-prazo", "lp-tokenid", "lp-teto"
  ];
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
    $("lp-fatal").hidden = false;
    txt($("lp-fatal-txt"), motivo);
    ["lp-ler", "lp-montar", "lp-conectar", "lp-lerpos"].forEach(function (id) {
      var b = $(id); if (b) b.disabled = true;
    });
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
    $("lp-rpc").appendChild(o);
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

  var REGISTRY = null, LPVAULT = null, NPM = null;
  try {
    REGISTRY = LIVRO.exigirVivo(LIVRO.VIVOS.parameterRegistry, "parameterRegistry");
    LPVAULT = LIVRO.exigirVivo(LIVRO.VIVOS.triviuLPVault, "triviuLPVault");
  } catch (e) {
    morrer("The address ledger rejected one of its own entries: " + e.message);
    return;
  }
  txt($("lp-a-registry"), REGISTRY);
  txt($("lp-a-lpvault"), LPVAULT);

  /* ============================================ REGRA 2 · endereco em calldata */
  /* Os contratos do Triviu saem de exigirVivo(), que NAO devolve o texto que
     recebeu: devolve a constante do livro. A comparacao explicita abaixo e
     redundante de proposito — e a regra escrita como codigo no ponto onde a
     regra vale, e nao a trinta linhas de distancia dentro de outro arquivo. */
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

  function ehContratoDoLivro(endereco) {
    var vivos = LIVRO.VIVOS, chaves = Object.keys(vivos);
    for (var i = 0; i < chaves.length; i++) {
      if (String(vivos[chaves[i]]).toLowerCase() === String(endereco).toLowerCase()) return chaves[i];
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
        if (hosts.indexOf(host) >= 0) {
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

  /* A superficie externa completa do TriviuLPVault, renderizada da tabela
     gerada. Se o contrato ganhar ou perder uma funcao, esta lista muda sozinha e
     o guardiao cobra a diferenca. */
  (function () {
    var corpo = $("lp-superficie");
    corpo.innerHTML = "";
    var n = 0;
    ["lpVault"].forEach(function (papel) {
      var c = ABI.contratos[papel];
      Object.keys(c.funcoes).sort().forEach(function (assin) {
        var f = c.funcoes[assin];
        var tr = document.createElement("tr");
        tr.appendChild(novo("td", "m", f.seletor));
        tr.appendChild(novo("td", "m", assin));
        tr.appendChild(novo("td", "m", f.mutabilidade));
        corpo.appendChild(tr);
        n += 1;
      });
    });
    var tr2 = document.createElement("tr");
    var td = novo("td", null, n + " functions in total, and that is the whole external surface of the " +
      "vault — there is no owner function, no pause, no rescue and no upgrade, because there is no " +
      "owner. Three of the seven are read-only. approve() is not in this list twice over: the ERC-20 " +
      "one lives on the token and the ERC-721 one lives on the position manager, and neither is a " +
      "Triviu contract.");
    td.colSpan = 3; tr2.appendChild(td); corpo.appendChild(tr2);
  })();

  (function () {
    var corpo = $("lp-erros");
    corpo.innerHTML = "";
    var erros = ABI.contratos.lpVault.erros || {};
    Object.keys(erros).sort(function (a, b) {
      return erros[a].assinatura < erros[b].assinatura ? -1 : 1;
    }).forEach(function (sel) {
      var tr = document.createElement("tr");
      tr.appendChild(novo("td", "m", sel));
      tr.appendChild(novo("td", "m", erros[sel].assinatura));
      corpo.appendChild(tr);
    });
  })();
  ajustarRolagem();

  if (!window.ethereum) {
    $("lp-conectar").disabled = true;
    $("lp-conectar").title = "No wallet provider in this browser. Type an address instead.";
  }

  /* ============================================================ CARTEIRA ==== */
  function verChain(idHex) {
    var n;
    try { n = BigInt(idHex); } catch (e) { txt($("lp-w-chain"), TRACO); return false; }
    txt($("lp-w-chain"), n.toString() + "  (" + idHex + ")");
    var alerta = $("lp-chain-alerta");
    if (n === CHAIN) {
      alerta.hidden = true;
      return true;
    }
    alerta.hidden = false;
    txt($("lp-chain-txt"),
      "Your wallet is on chain " + n.toString() + " (" + idHex + "). The Triviu contracts have code on " +
      "chain " + CHAIN.toString() + ", and nowhere this page can reach. Nothing was encoded against " +
      "chain " + n.toString() + ": calldata built for one chain and signed on another is how an address " +
      "that means one thing here means something else there. Switch the wallet to chain " +
      CHAIN.toString() + " and read again. This page will not ask the wallet to switch for you — it " +
      "asks the wallet for nothing but an address and a chain id.");
    return false;
  }

  $("lp-conectar").addEventListener("click", function () {
    estado("Asking the wallet for an address and a chain id. Nothing else is requested.");
    Promise.resolve()
      .then(function () { return pedirCarteira("eth_accounts"); })
      .then(function (contas) {
        if (contas && contas.length) return contas;
        return pedirCarteira("eth_requestAccounts");
      })
      .then(function (contas) {
        if (!contas || !contas.length) { erro("The wallet returned no address."); return null; }
        $("lp-endereco").value = contas[0];
        txt($("lp-w-conta"), contas[0]);
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

  /* REGRA 4 · segunda metade. Enquanto a pagina so lia, avisar bastava. Com um
     objeto congelado esperando um clique, avisar e o defeito: a chain sob os
     bytes muda, o aviso rola para fora da vista, e o botao continua armado. Os
     dois handlers INVALIDAM. */
  if (window.ethereum && typeof window.ethereum.on === "function") {
    window.ethereum.on("chainChanged", function (cid) {
      verChain(cid);
      invalidarCongelamento("The wallet changed chain while these bytes were frozen. They are void: " +
        "calldata built for one chain and signed on another is how an address that means one thing " +
        "here means something else there. Encode again.");
      estado("The wallet changed chain. Read again: everything below was read against the previous one.");
    });
    window.ethereum.on("accountsChanged", function (contas) {
      var a = contas && contas.length ? contas[0] : "";
      $("lp-endereco").value = a;
      txt($("lp-w-conta"), a || TRACO);
      invalidarCongelamento("The wallet changed account while these bytes were frozen. They are void: " +
        "they were built for the previous address, and both an allowance and a position belong to the " +
        "address that holds them. Read the chain again, then encode again.");
      estado("The wallet changed account. Read again: the balances below belong to the previous address.");
    });
  }

  /* ============================================================== LEITURA === */
  var lendo = false;
  var montando = false;
  var lendoPos = false;
  var ESTADO = { tokens: [], gasPrice: null, dono: null, feeBps: null, posicao: null };
  var avisos = [];

  $("lp-ler").addEventListener("click", function () { ler(); });
  /* Nao ha <form> nesta pagina de proposito — o submit nativo poria o endereco na
     URL, e dali no historico e no Referer. Entao cada Enter e ligado a mao. */
  $("lp-endereco").addEventListener("keydown", function (ev) {
    if (ev.key === "Enter") { ev.preventDefault(); ler(); }
  });

  function ler() {
    if (lendo) { estado("Still reading. This click did nothing."); return; }
    limparRecusa();
    var dono = ($("lp-endereco").value || "").trim();
    if (!END.test(dono)) {
      recusar("lp-endereco", "That is not a 40-hex-character address, so nothing was read. It needs 0x " +
        "followed by 40 hex characters.");
      return;
    }
    lendo = true;
    $("lp-ler").disabled = true;
    avisos = [];
    ESTADO = { tokens: [], gasPrice: null, dono: dono, feeBps: null, posicao: ESTADO.posicao };
    estado("Reading from " + $("lp-rpc").value);
    progresso("");

    var passo = 0;
    function marcar(s) { passo += 1; progresso("step " + passo + " · " + s); }

    rpc("eth_chainId", [])
      .then(function (cid) {
        txt($("lp-w-rpcchain"), BigInt(cid).toString() + "  (" + cid + ")");
        if (BigInt(cid) !== CHAIN) {
          throw new Error("that endpoint is chain " + BigInt(cid).toString() + ", and these contracts " +
            "are on " + CHAIN.toString() + ". Nothing was read rather than reading the wrong chain.");
        }
        txt($("lp-w-conta"), dono);
        marcar("code");
        return emSerie([["lp-c-registry", REGISTRY], ["lp-c-lpvault", LPVAULT]], function (par) {
          return rpc("eth_getCode", [par[1], "latest"]).then(function (c) {
            txt($(par[0]), c && c !== "0x" ? ((c.length - 2) / 2) + " bytes" : "no code");
            ajustarRolagem();
          });
        });
      })
      .then(function () {
        marcar("vault integrity");
        /* O cofre aponta para QUAL Registry? A pergunta nao e retorica: dois
           Registries orfaos de runs falhados estao vivos nesta chain com estado
           byte-identico ao verdadeiro, entao estado nao os distingue. O ponteiro
           do cofre e immutable, fixado no construtor, e e ele que resolve. */
        return call(LPVAULT, sig("lpVault", "registry()")).then(function (r) {
          var a = paraEndereco(palavra(r, 0));
          var bate = a.toLowerCase() === REGISTRY.toLowerCase();
          txt($("lp-integridade"),
            "The vault's registry() answered " + a + ", and the ledger's ParameterRegistry is " +
            REGISTRY + " — " + (bate ? "the same contract." : "A DIFFERENT CONTRACT, and nothing below " +
            "should be trusted until that is explained.") + " This is read rather than assumed because " +
            "two orphaned Registries from failed deploy runs are alive on this chain with state " +
            "identical to the real one. State alone cannot tell them apart; an immutable pointer can.");
        }).catch(function (e) {
          txt($("lp-integridade"), "The vault's registry() did not answer (" + e.message + "), so this " +
            "check reads " + TRACO + " rather than a reassuring sentence.");
        });
      })
      .then(function () {
        marcar("position manager");
        return travarGerenteDePosicoes().then(function (a) {
          NPM = a;
          txt($("lp-a-npm"), NPM);
          return rpc("eth_getCode", [NPM, "latest"]).then(function (c) {
            txt($("lp-c-npm"), c && c !== "0x" ? ((c.length - 2) / 2) + " bytes" : "no code");
          });
        }).catch(function (e) {
          NPM = null;
          txt($("lp-a-npm"), TRACO); txt($("lp-c-npm"), TRACO);
          avisos.push("the vault's positionManager() did not pass its checks (" + e.message +
            "), so no position can be read or opened from this page right now");
        });
      })
      .then(function () {
        marcar("registry state");
        var leituras = [
          ["lp-feebps", sig("parameterRegistry", "feeBps()"), "n"],
          ["lp-treasury", sig("parameterRegistry", "treasury()"), "a"],
          ["lp-owner", sig("parameterRegistry", "owner()"), "a"]
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
              ESTADO.feeBps = v;
              txt($(l[0]), v.toString() + " bps  (" + (Number(v) / 100) + "% of the collected fees)");
            }
          }).catch(function () { txt($(l[0]), TRACO); });
        });
      })
      .then(function () {
        return call(LPVAULT, sig("lpVault", "MAX_FEE_BPS()")).then(function (r) {
          var v = u(palavra(r, 0));
          txt($("lp-maxfee"), v.toString() + " bps  (" + (Number(v) / 100) + "% of the collected fees, " +
            "hardcoded in the vault's own bytecode and applied before the registry value is compared " +
            "with your cap)");
        }).catch(function () { txt($("lp-maxfee"), TRACO); });
      })
      .then(function () {
        marcar("balance and gas price");
        return rpc("eth_getBalance", [dono, "latest"]).then(function (b) {
          txt($("lp-w-saldo"), comCasas(BigInt(b), 18) + " POL");
        }).catch(function () { txt($("lp-w-saldo"), TRACO); });
      })
      .then(function () {
        return rpc("eth_gasPrice", []).then(function (g) {
          ESTADO.gasPrice = BigInt(g);
        }).catch(function () { ESTADO.gasPrice = null; });
      })
      .then(function () {
        marcar("allowed tokens");
        return varrer(topico("parameterRegistry", "TokenAllowed(address,bool,string)"));
      })
      .then(function (r) {
        txt($("lp-tokens-faixa"), r.descricao);
        return emSerie(r.enderecos, function (a, i) {
          progresso("token " + (i + 1) + " of " + r.enderecos.length);
          return lerToken(a, dono);
        }).then(function () { desenharTokens(); ajustarRolagem(); });
      })
      .then(function () {
        if (!NPM) { txt($("lp-pos-conta"), TRACO); txt($("lp-pos-vault"), TRACO); return; }
        marcar("positions held");
        var selBal = sig("erc20", "balanceOf(address)");
        return call(NPM, selBal + pal(dono))
          .then(function (b) { txt($("lp-pos-conta"), b && b !== "0x" ? u(palavra(b, 0)).toString() : TRACO); })
          .then(function () { return call(NPM, selBal + pal(LPVAULT)); })
          .then(function (b) {
            txt($("lp-pos-vault"), b && b !== "0x" ? u(palavra(b, 0)).toString() : TRACO);
          })
          .catch(function () { txt($("lp-pos-conta"), TRACO); txt($("lp-pos-vault"), TRACO); });
      })
      .then(function () {
        progresso("");
        estado("Read complete against chain " + CHAIN.toString() + ". " + ESTADO.tokens.length +
          " allowed token(s)." +
          (avisos.length ? " " + avisos.length + " thing(s) did not read: " + avisos.join("; ") + "." : "") +
          " Reading asked your wallet for nothing and sent nothing: every call above went to the " +
          "endpoint in the form, not to the wallet. The two token lists in the flow section are now " +
          "filled from what was read.");
      })
      .catch(function (e) {
        progresso("");
        erro("Stopped: " + e.message);
      })
      .finally(function () { lendo = false; $("lp-ler").disabled = false; });
  }

  /* --------------------------------------------------------------- eventos -- */
  /* Uma mapping nao se enumera: nao existe getter que devolva todos os tokens
     liberados. Entao os candidatos saem dos eventos, e a confirmacao sai de uma
     chamada ao vivo. A faixa varrida e IMPRESSA: um recorte que nao diz onde
     termina e um recorte que passa por completo. */
  function varrer(top) {
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
          address: REGISTRY, topics: [top],
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
             "scanned: these endpoints cap a log query at " + JANELA + " blocks and walking the gap " +
             "would be dozens of round trips. Everything listed below is confirmed live, so what you " +
             "see is true; what could be missing is a token allowed inside the gap.");
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
      if (!len || len > 96 || x.length < 128 + len * 2) return null;
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
    var corpo = $("lp-tokens");
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
        "address column is the only thing that tells them apart.");
      td2.colSpan = 5; tr2.appendChild(td2); corpo.appendChild(tr2);
    }

    /* Os dois seletores de token do fluxo saem daqui, nunca de uma lista escrita
       a mao. Uniswap ordena o par por endereco, e a ordem importa: token0 tem de
       ser o menor. A tela nao reordena por conta propria — ela recusa e diz. */
    [["lp-token0", "token0 — the LOWER address of the pair"], ["lp-token1", "token1 — the HIGHER address"]]
      .forEach(function (par) {
        var sel = $(par[0]);
        sel.innerHTML = "";
        var vazio = document.createElement("option");
        vazio.value = ""; vazio.textContent = "choose a token";
        sel.appendChild(vazio);
        ESTADO.tokens.forEach(function (t, i) {
          if (t.permitido !== true || t.casas === null) return;
          var o = document.createElement("option");
          o.value = String(i);
          o.textContent = (t.simbolo || "token") + "  ·  " + t.endereco.slice(0, 10) + "…" + t.endereco.slice(-6);
          sel.appendChild(o);
        });
      });

    if (ESTADO.feeBps !== null && $("lp-teto").value === "") {
      $("lp-teto").value = ESTADO.feeBps.toString();
      txt($("lp-teto-nota"), "Pre-filled with the rate the registry reports right now, " +
        ESTADO.feeBps.toString() + " bps. It is a cap, not a payment: the vault reads the registry at " +
        "execution and reverts TaxaAcimaDoLimite if what it reads is above this number. Lower it and " +
        "you refuse a raise that lands between your signature and the block.");
    }
  }

  /* ------------------------------- REGRA 2 · a trava do position manager ----
     A regra e uma so e vale para TODO endereco que entra em calldata: ou ele sai
     do livro-razao, ou ele e comparado byte-a-byte contra o livro, e divergencia
     ABORTA. O NPM e o caso dificil porque nao e nosso — entao ele e lido AO VIVO
     do cofre E conferido contra a constante, e passa por cinco exigencias, todas
     ABORTANDO:
       1. veio de positionManager() do TriviuLPVault que o livro nomeia
       2. nao e o endereco zero e tem 40 hex
       3. nao e nenhum dos orfaos do livro, nem nenhum contrato do Triviu
       4. E IGUAL a EXTERNOS.uniswapPositionManager do livro (exigirExterno)
       5. tem codigo na chain

     A exigencia 4 nasceu de uma medicao, e nao de simetria: `positionManager` e
     immutable no cofre (TriviuLPVault.sol:186), o que torna a leitura confiavel
     DEPOIS de se saber qual cofre foi lido — e o cofre ORFAO que o livro lista
     (o gemeo byte-exato, nonce 1686) responde a mesma pergunta com a mesma
     resposta, medido na chain 137 em 2026-08-13. Ler positionManager() portanto
     nao identifica nada sozinho. O que identifica e o PAR: cofre saido do livro
     e resposta igual a constante do livro. Sem a exigencia 4, as outras quatro
     aceitariam qualquer contrato de terceiro que tivesse codigo.

     O endereco do orfao NAO esta escrito acima de proposito: ele vive no livro,
     e o guardiao check-console-abi.mjs reprova o build se um endereco literal
     aparecer neste arquivo — inclusive em comentario, inclusive para explicar.
     Foi ele que pegou a primeira versao deste paragrafo.

     O que isso NAO prova continua dito na tela: que o contrato e bom. Prova que
     o cofre implantado usa ESTE, que ESTE e o que o livro nomeia, e que os dois
     fatos foram conferidos separadamente. */
  function travarGerenteDePosicoes() {
    return call(LPVAULT, sig("lpVault", "positionManager()")).then(function (r) {
      var a = paraEndereco(palavra(r, 0));
      if (!END.test(a)) throw new Error("the answer is not an address");
      if (/^0x0{40}$/.test(a)) throw new Error("the vault reports the zero address");
      var orf = ehOrfao(a);
      if (orf) {
        throw new Error("ABORTED: the vault points at " + a + ", which the ledger lists as an orphaned " +
          orf.tipo + " from a failed deploy run (nonce " + orf.nonce + ")");
      }
      var papel = ehContratoDoLivro(a);
      if (papel) throw new Error("ABORTED: the vault points at the Triviu " + papel + ", not at a position manager");
      /* A comparacao com o livro. exigirExterno() devolve a CONSTANTE, e a
         igualdade explicita logo abaixo e a regra escrita no ponto onde ela vale
         — a mesma redundancia deliberada de travarEnderecoDoLivro(). */
      var canon = LIVRO.exigirExterno(a, "uniswapPositionManager");
      if (String(canon).toLowerCase() !== a.toLowerCase()) {
        throw new Error("ABORTED: the position manager diverged from the ledger constant.");
      }
      return rpc("eth_getCode", [canon, "latest"]).then(function (c) {
        if (!c || c === "0x") throw new Error("that address has no code on chain " + CHAIN.toString());
        return canon;
      });
    });
  }

  /* ------------------------------------------- REGRA 2 · a trava do token ---
     Quatro exigencias, todas ABORTANDO, nenhuma avisando. O que isto prova esta
     dito sem inflar: prova que o Registry admite este token AGORA. Nao prova que
     o token e bom, e a tela nao vai dizer que prova. */
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
      var papel = ehContratoDoLivro(a);
      if (papel) {
        throw new Error("ABORTED: " + a + " is the Triviu " + papel + ", not a token. Encoding an " +
          "approve whose target is a Triviu contract is refused.");
      }
      return call(REGISTRY, sig("parameterRegistry", "isAllowedToken(address)") + pal(a));
    }).then(function (r) {
      if (!r || r === "0x" || u(palavra(r, 0)) !== 1n) {
        throw new Error("the ParameterRegistry does not allow " + (tok.simbolo || tok.endereco) + " at " +
          "this moment. It was allowed when the list was read; it is re-read here, at the instant of " +
          "encoding, precisely because a whitelist that changed between the read and the click is what " +
          "this re-check exists for. abrir() calls isAllowedToken on both tokens and reverts " +
          "TokenNaoPermitido on the first that fails.");
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
  function lerAllowance(token, dono, gastador) {
    return call(token, sig("erc20Allowance", "allowance(address,address)") + pal(dono) + pal(gastador))
      .then(function (r) {
        if (!r || r === "0x") return null;
        return u(palavra(r, 0));
      })
      .catch(function () { return null; });
  }

  var MAX_UINT256 = (1n << 256n) - 1n;

  function frasePermissao(v, tok) {
    var sym = tok.simbolo || "this token";
    if (v === null) {
      return "could NOT be read. Because it could not be read, the approval below is not offered for " +
        "signature at all. Rule 7 is to show the standing allowance before asking for another one, and " +
        "a page that cannot show it has not earned the right to ask for one.";
    }
    if (v === 0n) return "none. The vault cannot move any " + sym + " of yours right now.";
    if (v === MAX_UINT256) {
      return "UNLIMITED — 2^256-1, the all-ones value. This is a standing permission to move every " +
        sym + " this address will ever hold, granted to the shared router, lasting until you revoke it. " +
        "The step below sets it back to zero, and it is offered first for that reason.";
    }
    if (v > (1n << 128n)) {
      return comCasas(v, tok.casas) + " " + sym + " — larger than the entire supply of any real token, " +
        "so it is unlimited in practice whatever the exact number says. The step below zeroes it.";
    }
    return comCasas(v, tok.casas) + " " + sym + " is already approved and still standing.";
  }

  /* ========================================================= UMA POSICAO ==== */
  /* A leitura de uma posicao existente. Serve para tres coisas: mostrar o que a
     posicao acumulou, dizer se ela ja esta autorizada para o cofre, e dar a
     `coletar`/`fechar` o registro de antes, contra o qual o efeito e conferido
     depois do recibo. */
  function lerPosicaoDaChain(tokenId) {
    var p = { tokenId: tokenId, dono: null, aprovado: null, token0: null, token1: null,
              fee: null, tickBaixo: null, tickAlto: null, liquidez: null,
              devidos0: null, devidos1: null, dep0: null, dep1: null, col0: null, col1: null };
    return call(NPM, sig("npm", "ownerOf(uint256)") + palNum(tokenId))
      .then(function (r) { p.dono = paraEndereco(palavra(r, 0)); })
      .then(function () { return call(NPM, sig("npm", "getApproved(uint256)") + palNum(tokenId)); })
      .then(function (r) { p.aprovado = paraEndereco(palavra(r, 0)); })
      .then(function () { return call(NPM, sig("npm", "positions(uint256)") + palNum(tokenId)); })
      .then(function (r) {
        p.token0 = paraEndereco(palavra(r, 2));
        p.token1 = paraEndereco(palavra(r, 3));
        /* chain: `r` e a resposta de um eth_call decodificada palavra a palavra —
       a taxa vem do contrato, nao desta pagina. */
    p.fee = u(palavra(r, 4));
        p.tickBaixo = i256(palavra(r, 5));
        p.tickAlto = i256(palavra(r, 6));
        p.liquidez = u(palavra(r, 7));
        p.devidos0 = u(palavra(r, 10));
        p.devidos1 = u(palavra(r, 11));
      })
      .then(function () { return call(LPVAULT, sig("lpVault", "posicaoDe(uint256)") + palNum(tokenId)); })
      .then(function (r) {
        p.dep0 = u(palavra(r, 0)); p.dep1 = u(palavra(r, 1));
        p.col0 = u(palavra(r, 2)); p.col1 = u(palavra(r, 3));
        return p;
      });
  }

  function casasDe(endereco) {
    for (var i = 0; i < ESTADO.tokens.length; i++) {
      if (ESTADO.tokens[i].endereco.toLowerCase() === String(endereco).toLowerCase()) return ESTADO.tokens[i];
    }
    return { simbolo: null, casas: null };
  }
  function quantia(v, endereco) {
    if (v === null) return TRACO;
    var t = casasDe(endereco);
    if (t.casas === null) return v.toString() + " raw units (decimals not read)";
    return comCasas(v, t.casas) + " " + (t.simbolo || "");
  }

  $("lp-lerpos").addEventListener("click", function () { lerPosicao(); });
  $("lp-tokenid").addEventListener("keydown", function (ev) {
    if (ev.key === "Enter") { ev.preventDefault(); lerPosicao(); }
  });

  function lerPosicao() {
    if (lendoPos) { txt($("lp-pos-estado"), "Still reading. This click did nothing."); return; }
    var id = paraInteiro($("lp-tokenid").value);
    if (id === null) {
      recusar("lp-tokenid", "A token id is a whole number with no decimal point. Nothing was read.");
      return;
    }
    if (!NPM) {
      txt($("lp-pos-estado"), "The position manager has not been read yet. Press “Read the chain” first — " +
        "this page will not read a position from an address it has not verified.");
      return;
    }
    lendoPos = true;
    $("lp-lerpos").disabled = true;
    txt($("lp-pos-estado"), "Reading position " + id.toString() + " from the position manager and from the vault.");
    lerPosicaoDaChain(id)
      .then(function (p) {
        ESTADO.posicao = p;
        var dono = (ESTADO.dono || "").toLowerCase();
        txt($("lp-p-dono"), p.dono + (dono && p.dono.toLowerCase() === dono ? "  (you)" : dono ? "  (NOT the address above)" : ""));
        txt($("lp-p-aprovado"), /^0x0{40}$/.test(p.aprovado)
          ? p.aprovado + "  (nobody — coletar and fechar would revert AprovacaoAusente)"
          : p.aprovado + (p.aprovado.toLowerCase() === LPVAULT.toLowerCase()
              ? "  (the vault — coletar and fechar can run)"
              : "  (NOT the vault — coletar and fechar would revert AprovacaoAmpla)"));
        txt($("lp-p-par"), p.token0 + "  /  " + p.token1 + "   fee tier " + p.fee.toString());
        txt($("lp-p-faixa"), "ticks " + p.tickBaixo.toString() + " … " + p.tickAlto.toString());
        txt($("lp-p-liquidez"), p.liquidez.toString());
        txt($("lp-p-devidos"), quantia(p.devidos0, p.token0) + "   ·   " + quantia(p.devidos1, p.token1));
        txt($("lp-p-registro"),
          (p.dep0 === 0n && p.dep1 === 0n)
            ? "dep0 and dep1 are both zero. This position has NO record in the vault, which means it was " +
              "not opened through abrir(). _houveResultado returns false with no record, so fechar() " +
              "would charge exactly zero on it — an absent record is not a zero, and the contract treats " +
              "it as “cannot prove a result”, never as “there was none”."
            : "deposited " + quantia(p.dep0, p.token0) + " / " + quantia(p.dep1, p.token1) +
              " · already collected without charge " + quantia(p.col0, p.token0) + " / " +
              quantia(p.col1, p.token1) + ". The close charges on the fees of the whole life of the " +
              "position — these two included — and only if what came back is at least what went in, in " +
              "each token.");
        txt($("lp-pos-estado"), "Read. Nothing was signed and nothing was asked of your wallet.");
        ajustarRolagem();
      })
      .catch(function (e) {
        ESTADO.posicao = null;
        ["lp-p-dono", "lp-p-aprovado", "lp-p-par", "lp-p-faixa", "lp-p-liquidez", "lp-p-devidos", "lp-p-registro"]
          .forEach(function (i2) { txt($(i2), TRACO); });
        txt($("lp-pos-estado"), "Nothing was read: " + explicarRevert(e) + ". A token id that was burned, " +
          "or never existed, answers exactly like this.");
      })
      .finally(function () { lendoPos = false; $("lp-lerpos").disabled = false; });
  }

  /* ============================================================== CALLDATA == */
  /* Aqui vive a REGRA 3, que e a espinha desta pagina.

     O defeito que esta secao existe para tornar impossivel tem nome: remontar no
     clique. A tela mostra os bytes, o usuario le, confere, clica — e o codigo, no
     handler, monta tudo de novo a partir dos campos. Entre a leitura e o clique
     cabe qualquer coisa. O que ele assina deixa de ser o que ele leu, e nada na
     tela mente em nenhum instante: a tela mostrou a verdade de um momento que ja
     passou.

     Entao: monta UMA vez, guarda o objeto, desenha DAQUELE objeto, tira o hash
     DAQUELE objeto. No clique reconfere o hash e envia AQUELE objeto. Qualquer
     entrada que mude mata o congelamento, e a tela DIZ que matou. */
  var CONGELAMENTO = null;   /* { geracao, selo, passos } — null = nao ha o que enviar */
  var GERACAO = 0;
  var ENVIANDO = false;

  /* O selo e o retrato das entradas no instante do congelamento, comparado por
     VALOR no clique. Os listeners de `input` sao o caminho rapido; nao sao a
     garantia — um evento pode nao disparar (autofill, restauracao de formulario
     ao voltar na historia, extensao escrevendo no campo). Valor nao tem como
     discordar de si mesmo, entao o selo e quem fecha.

     JSON.stringify e nao join(separador): qualquer separador que eu escolhesse
     poderia ser digitado dentro de um dos campos, e ai dois conjuntos de entradas
     diferentes produziriam o MESMO selo. JSON escapa o conteudo, entao a
     serializacao e injetora. */
  function seloAtual() {
    var v = CAMPOS.map(function (id) {
      var c = $(id);
      return c ? String(c.value) : "";
    });
    v.push($("lp-rpc").value);
    v[0] = String(v[0]).trim().toLowerCase();
    return JSON.stringify(v);
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

  $("lp-montar").addEventListener("click", function () { montar(); });
  ["lp-q0", "lp-q1", "lp-min0", "lp-min1", "lp-tickbaixo", "lp-tickalto", "lp-prazo", "lp-teto"].forEach(function (id) {
    $(id).addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") { ev.preventDefault(); montar(); }
    });
  });

  /* Toda entrada que participa da calldata invalida o congelamento ao mudar.
     `lp-rpc` esta na lista mesmo nao entrando em nenhum byte: e dele que sai a
     estimativa e a confirmacao de estado, e um congelamento estimado contra um
     endpoint e confirmado contra outro mede duas coisas diferentes. */
  CAMPOS.concat(["lp-rpc"]).forEach(function (id) {
    var el = $(id); if (!el) return;
    var aoMudar = function () {
      invalidarCongelamento("An input changed after these bytes were encoded, so the frozen transaction " +
        "was thrown away. What is on screen is no longer what your wallet would receive. Press Encode " +
        "again — this page will not quietly rebuild the bytes under a button you have already read.");
    };
    el.addEventListener("input", aoMudar);
    el.addEventListener("change", aoMudar);
  });

  /* A acao escolhida decide quais campos importam. Esconder o resto nao e
     cosmetica: um campo visivel que nao entra em byte nenhum ensina que ele
     entra, e um usuario que preenche um campo inerte acredita ter decidido algo
     que nao decidiu. */
  var CAMPOS_DA_ACAO = {
    abrir: ["g-par", "g-faixa", "g-quantias", "g-prazo"],
    autorizar: ["g-posicao"],
    coletar: ["g-posicao", "g-prazo", "g-teto"],
    fechar: ["g-posicao", "g-minimos", "g-prazo", "g-teto"]
  };
  function aplicarAcao() {
    var acao = $("lp-acao").value;
    var mostrar = CAMPOS_DA_ACAO[acao] || [];
    ["g-par", "g-faixa", "g-quantias", "g-minimos", "g-prazo", "g-teto", "g-posicao"].forEach(function (g) {
      var el = $(g); if (el) el.hidden = mostrar.indexOf(g) < 0;
    });
    txt($("lp-acao-nota"), {
      abrir: "abrir() pulls both amounts from your address, mints the position with YOUR wallet as the " +
        "recipient, sends back whatever it did not spend, and charges nothing. There is no entry fee. " +
        "Two ERC-20 approvals come first, each for the exact amount and never unlimited.",
      autorizar: "The position manager's own approve(), for ONE token id, granted to the vault. " +
        "coletar() and fechar() both call getApproved(tokenId) and refuse anything that is not exactly " +
        "the vault — including an approve-for-all, which reverts AprovacaoAmpla on purpose. This step " +
        "goes to the position manager, not to a Triviu contract.",
      coletar: "coletar() takes the fees the position has accrued and pays them to you. Read from the " +
        "deployed bytecode, not from a promise: the rate applied here is ZERO — the body sets bps = 0 " +
        "and leaves feeBpsMax unused, because a result can only be known at the close. What comes out " +
        "here is recorded and charged later, at fechar(), together with the rest.",
      fechar: "fechar() withdraws all the liquidity, collects everything owed, charges the protocol's " +
        "share of the FEE portion only, returns the rest, and burns the NFT. If the position did not " +
        "return at least what went in, in EACH token, the rate becomes zero — no price is read to " +
        "decide that."
    }[acao] || "");
  }
  $("lp-acao").addEventListener("change", aplicarAcao);
  aplicarAcao();

  /* ===================================== O UNICO LUGAR QUE CONSTROI CALLDATA ==
     sig(), pal(), palNum() e palInt() nao aparecem em enviar() nem dentro de
     handler de clique nenhum, e scripts/check-assinatura.mjs reprova o build se
     aparecerem. Essa e a diferenca entre a regra 3 estar escrita e estar valendo. */

  function passoAprovarQuantia(tok, alvoToken, gastador, quantia0, permissao, ordem, zerar) {
    var sym = tok.simbolo || "";
    var q = zerar ? 0n : quantia0;
    return {
      n: ordem,
      titulo: zerar
        ? "Set the standing allowance on " + (sym || "this token") + " back to zero"
        : "Let the vault move exactly that much " + (sym || "of this token") + ", once",
      papel: "erc20",
      assinatura: "approve(address,uint256)",
      alvo: alvoToken,
      alvoNome: (sym || "the token") + " — the token contract, not a Triviu contract",
      assinavel: true,
      exigeAllowance: true,
      permissaoLida: permissao,
      args: [
        { nome: "spender", tipo: "address", valor: gastador, nota: "TriviuLPVault, from the ledger" },
        { nome: "amount", tipo: "uint256", valor: q.toString(),
          nota: zerar
            ? "zero — this revokes, it does not grant"
            : comCasas(q, tok.casas) + " " + sym + ", scaled by the " + tok.casas + " decimals read from the token" }
      ],
      dados: recusarAprovacaoInfinita(sig("erc20", "approve(address,uint256)") + pal(gastador) + palNum(q),
        "erc20", "approve(address,uint256)"),
      valor: 0n,
      confirmacao: { tipo: "allowance", token: alvoToken, gastador: gastador, esperado: q, casas: tok.casas, simbolo: sym },
      faz: zerar
        ? "Revokes what the vault is currently allowed to move of this token. After this the standing " +
          "permission reads zero and nothing can be pulled from your address until you grant a new one."
        : "Sets an allowance: the vault becomes able to pull up to this amount of this token from your " +
          "address, and only this token. abrir() then calls transferFrom for exactly the amount you " +
          "passed — no more, and the source is in this repository to read.",
      naoFaz: zerar
        ? "It moves no tokens and it is not a payment. It also does not undo anything already moved — an " +
          "allowance governs what can be taken from here on, never what was taken before."
        : "It moves nothing by itself and it is not a payment. It also does not expire: an allowance " +
          "survives until it is spent or set back to zero, which is why the amount here is the amount " +
          "you typed and not an unlimited approval. This page will not encode an unlimited one — the " +
          "byte check that refuses it runs on the calldata itself, not on anyone's good intentions."
    };
  }

  function construirAbrir(ctx) {
    var cofre = travarEnderecoDoLivro(LPVAULT, "triviuLPVault");
    var passos = [];
    var n = 0;
    var total = (ctx.q0 > 0n ? 1 : 0) + (ctx.q1 > 0n ? 1 : 0) +
      (ctx.perm0 !== null && ctx.perm0 > 0n && ctx.q0 > 0n ? 1 : 0) +
      (ctx.perm1 !== null && ctx.perm1 > 0n && ctx.q1 > 0n ? 1 : 0) + 1;

    [[ctx.tok0, ctx.alvo0, ctx.q0, ctx.perm0], [ctx.tok1, ctx.alvo1, ctx.q1, ctx.perm1]].forEach(function (t) {
      var tok = t[0], alvo = t[1], q = t[2], perm = t[3];
      if (q === 0n) return;   /* nada a puxar, nada a aprovar — e a tela diz isso na nota da acao */
      /* REGRA 7 · o passo de zerar so existe quando ha o que zerar, e vem
         PRIMEIRO. Nunca cavalgar em silencio uma aprovacao antiga. */
      if (perm !== null && perm > 0n) {
        n += 1;
        passos.push(passoAprovarQuantia(tok, alvo, cofre, q, perm, "step " + n + " of " + total, true));
      }
      n += 1;
      passos.push(passoAprovarQuantia(tok, alvo, cofre, q, perm, "step " + n + " of " + total, false));
    });

    n += 1;
    passos.push({
      n: "step " + n + " of " + total,
      titulo: "Open the position — the NFT is minted to your address",
      papel: "lpVault",
      assinatura: "abrir((address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,uint256))",
      alvo: cofre,
      alvoNome: "TriviuLPVault, from the ledger — a shared router, not a vault deployed for you",
      assinavel: true,
      args: [
        { nome: "p.token0", tipo: "address", valor: ctx.alvo0, nota: (ctx.tok0.simbolo || "") + ", re-confirmed against the Registry at this instant" },
        { nome: "p.token1", tipo: "address", valor: ctx.alvo1, nota: (ctx.tok1.simbolo || "") + ", re-confirmed against the Registry at this instant" },
        { nome: "p.fee", tipo: "uint24", valor: ctx.faixa.toString(), nota: "the pool's fee tier in hundredths of a bip — " + (Number(ctx.faixa) / 10000) + "% per swap" },
        { nome: "p.tickLower", tipo: "int24", valor: ctx.tickBaixo.toString(), nota: "the bottom of your band, in ticks. Yours, not this page's: the contract holds no price opinion and neither does this screen." },
        { nome: "p.tickUpper", tipo: "int24", valor: ctx.tickAlto.toString(), nota: "the top of your band, in ticks" },
        { nome: "p.amount0Desired", tipo: "uint256", valor: ctx.q0.toString(), nota: comCasas(ctx.q0, ctx.tok0.casas) + " " + (ctx.tok0.simbolo || "") },
        { nome: "p.amount1Desired", tipo: "uint256", valor: ctx.q1.toString(), nota: comCasas(ctx.q1, ctx.tok1.casas) + " " + (ctx.tok1.simbolo || "") },
        { nome: "p.amount0Min", tipo: "uint256", valor: ctx.min0.toString(),
          nota: comCasas(ctx.min0, ctx.tok0.casas) + " " + (ctx.tok0.simbolo || "") +
            (ctx.min0 === 0n ? " — ZERO, which means you accept ANY ratio the pool has at the moment the block lands. The mint uses the pool's current price, and this bound is the only defence against someone moving it first." : "") },
        { nome: "p.amount1Min", tipo: "uint256", valor: ctx.min1.toString(),
          nota: comCasas(ctx.min1, ctx.tok1.casas) + " " + (ctx.tok1.simbolo || "") +
            (ctx.min1 === 0n ? " — ZERO, same warning as the line above." : "") },
        { nome: "p.prazo", tipo: "uint256", valor: ctx.prazo.toString(), nota: ctx.prazoNota }
      ],
      dados: recusarAprovacaoInfinita(
        sig("lpVault", "abrir((address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,uint256))") +
        pal(ctx.alvo0) + pal(ctx.alvo1) + palNum(ctx.faixa) + palInt(ctx.tickBaixo) + palInt(ctx.tickAlto) +
        palNum(ctx.q0) + palNum(ctx.q1) + palNum(ctx.min0) + palNum(ctx.min1) + palNum(ctx.prazo),
        "lpVault", "abrir((address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,uint256))"),
      valor: 0n,
      confirmacao: { tipo: "abrir" },
      faz: "Checks both tokens against the Registry, pulls exactly the two amounts above, approves the " +
        "position manager for exactly those amounts, mints the position with recipient = your address, " +
        "puts the approvals back to zero, and sends you back anything it did not spend. The fee on this " +
        "step is zero: there is no entry fee.",
      naoFaz: "It does not hold the position and it never becomes its owner — that is what non-custodial " +
        "means here, and it is checkable on the explorer rather than promised. It also does not read a " +
        "price, does not rebalance, and cannot be pointed at a token the Registry does not allow."
    });
    return passos;
  }

  function construirAutorizar(ctx) {
    var cofre = travarEnderecoDoLivro(LPVAULT, "triviuLPVault");
    return [{
      n: "one step",
      titulo: "Authorise the vault for this one position",
      papel: "erc721",
      assinatura: "approve(address,uint256)",
      alvo: ctx.npm,
      alvoNome: "the Uniswap V3 position manager — read live from the vault's positionManager() AND checked " +
        "byte-for-byte against the ledger constant. Neither check is enough alone: the orphaned vault " +
        "answers the same address, so the live read identifies nothing by itself.",
      assinavel: true,
      args: [
        { nome: "to", tipo: "address", valor: cofre, nota: "TriviuLPVault, from the ledger" },
        { nome: "tokenId", tipo: "uint256", valor: ctx.tokenId.toString(),
          nota: "ONE position, this one. This is an ERC-721 approve: the second argument is a token id, not an amount." }
      ],
      dados: recusarAprovacaoInfinita(sig("erc721", "approve(address,uint256)") + pal(cofre) + palNum(ctx.tokenId),
        "erc721", "approve(address,uint256)"),
      valor: 0n,
      confirmacao: { tipo: "aprovacao721", tokenId: ctx.tokenId },
      faz: "Lets the vault act on this single position, and only while you leave the approval standing. " +
        "The vault reads getApproved(tokenId) at call time on both coletar() and fechar(), so this is " +
        "checked live and never from a stored record.",
      naoFaz: "It does not transfer the position and it does not authorise any other one. It is also NOT " +
        "an approve-for-all: the vault refuses that path with AprovacaoAmpla, so granting the broad one " +
        "would not even work here. Revoking it is an approve() to the zero address, on the same contract."
    }];
  }

  function construirColetar(ctx) {
    var cofre = travarEnderecoDoLivro(LPVAULT, "triviuLPVault");
    return [{
      n: "one step",
      titulo: "Collect the fees this position has accrued",
      papel: "lpVault",
      assinatura: "coletar(uint256,uint16,uint256)",
      alvo: cofre,
      alvoNome: "TriviuLPVault, from the ledger",
      assinavel: true,
      args: [
        { nome: "tokenId", tipo: "uint256", valor: ctx.tokenId.toString(), nota: "the position, which must be yours and must have this vault approved on it" },
        { nome: "feeBpsMax", tipo: "uint16", valor: ctx.teto.toString(),
          nota: "your ceiling on the rate. In THIS function it is read and deliberately unused — the body " +
            "sets bps = 0. It is in the signature because the same cap guards fechar(), where it bites." },
        { nome: "prazo", tipo: "uint256", valor: ctx.prazo.toString(), nota: ctx.prazoNota }
      ],
      dados: recusarAprovacaoInfinita(sig("lpVault", "coletar(uint256,uint16,uint256)") +
        palNum(ctx.tokenId) + palNum(ctx.teto) + palNum(ctx.prazo),
        "lpVault", "coletar(uint256,uint16,uint256)"),
      valor: 0n,
      confirmacao: { tipo: "coletar", tokenId: ctx.tokenId, antes: ctx.registroAntes },
      faz: "Collects everything the position currently owes in fees, records the amount inside the vault, " +
        "and pays ALL of it to you. Without a preceding decreaseLiquidity, collect returns fees only, so " +
        "no principal can be touched here even by accident.",
      naoFaz: "It charges nothing today and it does not close anything. It reverts NadaAColetar if there " +
        "is nothing owed, so a call that would move zero costs you a revert instead of a fee."
    }];
  }

  function construirFechar(ctx) {
    var cofre = travarEnderecoDoLivro(LPVAULT, "triviuLPVault");
    return [{
      n: "one step",
      titulo: "Close the position, take everything out, and burn the NFT",
      papel: "lpVault",
      assinatura: "fechar(uint256,uint256,uint256,uint256,uint16)",
      alvo: cofre,
      alvoNome: "TriviuLPVault, from the ledger",
      assinavel: true,
      args: [
        { nome: "tokenId", tipo: "uint256", valor: ctx.tokenId.toString(), nota: "the position to drain and burn — this is irreversible" },
        { nome: "amount0Min", tipo: "uint256", valor: ctx.min0.toString(),
          nota: (ctx.min0 === 0n ? "ZERO — you accept whatever the pool returns for the principal. " : "") +
            "Enforced by the position manager on the withdrawal, not by the vault." },
        { nome: "amount1Min", tipo: "uint256", valor: ctx.min1.toString(),
          nota: (ctx.min1 === 0n ? "ZERO — same as the line above. " : "") + "The bound on the other token." },
        { nome: "prazo", tipo: "uint256", valor: ctx.prazo.toString(), nota: ctx.prazoNota },
        { nome: "feeBpsMax", tipo: "uint16", valor: ctx.teto.toString(),
          nota: "your ceiling, and here it bites: the vault reads the registry rate, clamps it at " +
            "MAX_FEE_BPS in bytecode, and reverts TaxaAcimaDoLimite if what is left is above this number." }
      ],
      dados: recusarAprovacaoInfinita(sig("lpVault", "fechar(uint256,uint256,uint256,uint256,uint16)") +
        palNum(ctx.tokenId) + palNum(ctx.min0) + palNum(ctx.min1) + palNum(ctx.prazo) + palNum(ctx.teto),
        "lpVault", "fechar(uint256,uint256,uint256,uint256,uint16)"),
      valor: 0n,
      confirmacao: { tipo: "fechar", tokenId: ctx.tokenId },
      faz: "Withdraws all the liquidity, collects principal plus every fee owed, works out the fee portion " +
        "by subtraction and with no price at all, charges the protocol's share of THAT portion only, pays " +
        "you the rest, deletes the record and burns the NFT.",
      naoFaz: "It never charges on principal. If what came back is not at least what went in — measured " +
        "token by token, including what earlier collects already paid you — the rate is set to zero and " +
        "you pay nothing. Your payout is unconditional: the fee is clamped to what is being paid out, so " +
        "it can never become a reason you cannot be paid."
    }];
  }

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

  /* ----------------------------------------------- REGRA 11 · tela x carteira -- */
  /* Cada passo carrega DUAS expressoes independentes dos mesmos valores: `args`,
     que o cartao imprime em letra legivel, e `dados`, que a carteira recebe em
     bytes. Nada as ligava. Trocar `palNum(q)` por `palNum(q * 2n)` numa linha
     deixava o cartao dizendo `q` e a carteira levando `2q`, com impressao digital
     valida, congelamento intacto e os cinco guardioes verdes — porque todos eles
     conferem congelamento contra envio, que sao os DOIS LADOS DO ENVIO, e nunca
     tela contra envio.

     Quem mediu isso foi o red-team do N2 do Tubarao-branco: das 8 mutacoes dele,
     4 ficaram verdes, e as 4 eram todas desta familia (sufixo na calldata que a
     tela nao mostra · `value` diferente do impresso · o <pre> divergindo do que
     vai · `amount` menor na tela do que na calldata).

     Esta funcao re-codifica CADA valor impresso, pelo tipo que o proprio cartao
     declara, e exige que ele reproduza a palavra correspondente da calldata.
     Recusa por diferenca, recusa por sobra e recusa por falta.

     O QUE ELA NAO PROVA, dito antes que alguem presuma: ela usa os mesmos
     codificadores que montaram a calldata (`pal` · `palNum` · `palInt`). Se o
     defeito estiver DENTRO de um codificador, os dois lados erram igual e ela
     fica verde. Ela liga tela<->calldata; nao afere codificador. Os
     codificadores tem prova propria — `palInt` foi conferido contra
     `cast calldata` com tick negativo, e esta escrito na linha dele. */





  /* ------------------------------------------------------- automacao (canon) --
     O console e uma automacao: conectar tem de bastar. Ate 2026-08-13 a tela de
     LP abria com 12 campos VAZIOS — entre eles os dois ticks crus da Uniswap e
     os dois enderecos de token — e os dois unicos campos que o usuario deveria
     preencher, `lpSize` e `lpBand`, eram lidos so para desenhar um rotulo:
     apareciam ZERO vezes neste arquivo, o motor que assina. Eram decorativos.

     O que entra aqui preenche o que JA e canon, e mostra o numero escolhido ao
     lado — automacao que esconde o valor vira caixa-preta, e esta pagina existe
     para mostrar o byte antes da assinatura. */

  /** Largura de banda em TICKS, a partir de uma banda em fracao (0.05 = +-5%).

      tick = ln(P) / ln(1.0001), e a largura arredonda para FORA ate o proximo
      multiplo do espacamento. Para fora, nao para dentro: arredondar para dentro
      entrega uma banda MENOR que a pedida, e uma posicao mais estreita do que a
      pessoa escolheu sai de range antes do que ela espera. Mais larga erra a
      favor de quem assina.

      Conferido: banda 0.05 com espacamento 60 da 540 ticks, e 1.0001^540 =
      1.05548 — 5,55%, a folga do arredondamento, declarada e nao escondida. */
  function larguraDaBanda(banda, espacamento) {
    var b = Number(banda), e = Number(espacamento);
    if (!(b > 0) || !(e > 0)) return null;
    var ticks = Math.log(1 + b) / Math.log(1.0001);
    return Math.ceil(ticks / e) * e;
  }

  /** O espacamento de tick que cada faixa de taxa da Uniswap V3 impoe. Nao e
      escolha nossa: e do protocolo, e uma faixa fora desta tabela nao tem pool. */
  var ESPACAMENTO_POR_FAIXA = { 100: 1, 500: 10, 3000: 60, 10000: 200 };


  /** O pool do par nesta faixa, e o tick em que ele esta AGORA.

      `abrir()` recebe tickLower e tickUpper ABSOLUTOS. Uma banda de "±5%" nao
      vira absoluto sem saber onde o preco esta, entao nao ha automacao possivel
      sem esta leitura — e por isso ela existe, nao por completude.

      Duas chamadas, as duas somente-leitura: getPool na fabrica que sai do LIVRO
      (nunca digitada), e slot0 no pool que ELA devolver (nunca digitado tambem).
      Pool zerado significa que o par nao tem pool nesta faixa: erro alto, porque
      seguir daria uma calldata que reverte na carteira do usuario. */
  function lerPoolETick(token0, token1, faixa) {
    var fabrica = LIVRO.EXTERNOS.uniswapFactory;
    var dados = sig("uniswapFactory", "getPool(address,address,uint24)") +
      pal(token0) + pal(token1) + palNum(faixa);
    return call(fabrica, dados).then(function (r) {
      var pool = paraEndereco(palavra(r, 0));
      if (/^0x0{40}$/i.test(pool)) {
        throw new Error("this pair has no pool at fee tier " + faixa + " — pick another tier");
      }
      return call(pool, sig("uniswapPool", "slot0()")).then(function (s0) {
        return { pool: pool, tick: Number(i256(palavra(s0, 1))) };
      });
    });
  }

  /** Centra a largura no tick atual, ancorado no espacamento.

      O centro e arredondado para o multiplo mais proximo ANTES de somar a
      largura, e nao depois: a Uniswap so aceita ticks multiplos do espacamento,
      e centrar em -302525 com largura 540 daria -303065, que nao e multiplo de
      60 e o mint recusa. Com o centro ancorado em -302520 os dois lados saem
      multiplos por construcao. */
  function centrarBanda(tickAtual, largura, espacamento) {
    var centro = Math.round(tickAtual / espacamento) * espacamento;
    return { baixo: centro - largura, alto: centro + largura };
  }

  /** Preenche o que ja e canon. Nao toca no que exige leitura de pool. */
  function preencherPadroesDoCanon() {
    var faixa = $("lp-faixa") && $("lp-faixa").value;
    var esp = ESPACAMENTO_POR_FAIXA[faixa];
    var bandaEl = $("lpBand");
    var largura = bandaEl && esp ? larguraDaBanda(parseFloat(bandaEl.value), esp) : null;

    /* O teto de taxa: o canon e 3000 bps e o contrato crava 5000 como maximo no
       proprio bytecode. Preencher com o canon, nao com o maximo. */
    var teto = $("lp-teto");
    if (teto && !teto.value) teto.value = "3000";

    var eco = $("lp-banda-eco");
    if (eco) {
      txt(eco, largura
        ? "±" + (parseFloat(bandaEl.value) * 100).toFixed(2) + "% pedidos → ±" + largura +
          " ticks (espaçamento " + esp + " da faixa " + faixa + "), que são ±" +
          ((Math.pow(1.0001, largura) - 1) * 100).toFixed(2) + "% de fato. " +
          "O arredondamento vai para fora: a banda entregue nunca é menor que a pedida."
        : "");
    }
    return { largura: largura, espacamento: esp };
  }

  /* REGRA 8 · o value entra AQUI, explicito, em todo passo. Nao existe caminho
     neste arquivo em que uma transacao seja montada sem value: o campo e escrito
     na mesma linha em que o objeto nasce. Nenhuma das funcoes desta pagina e
     payable, e mesmo assim o zero e escrito.

     REGRA 11 · e a ligacao tela<->calldata roda ANTES de existir `p.tx`. Passo
     que nao amarra nao vira transacao: nao ha objeto para congelar, nao ha
     cartao para desenhar e nao ha o que clicar. O `throw` sobe ate o `.catch`
     do fluxo e a pagina diz "Nothing was encoded", com o motivo. */
  function amarrarTx(passos, dono) {
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

  /** O prazo. Sai do relogio DESTE computador, e a tela diz isso em vez de
      esconder: nao ha metodo somente-leitura na allowlist que devolva o
      timestamp do bloco, e crescer a allowlist para embelezar um campo seria
      trocar uma trava por um enfeite. O valor absoluto e impresso ao lado, em
      UTC, para o usuario conferir contra qualquer relogio que ele confie. */
  function calcularPrazo(minutos) {
    var agora = BigInt(Math.floor(Date.now() / 1000));
    var prazo = agora + minutos * 60n;
    var iso = new Date(Number(prazo) * 1000).toISOString().replace(".000Z", "Z");
    return {
      valor: prazo,
      nota: "a unix timestamp: " + iso + ". Computed from THIS computer's clock plus " +
        minutos.toString() + " minute(s) — if the clock is wrong, this number is wrong, and it is " +
        "printed in full so you can check it against one you trust. After it passes, the call reverts " +
        "PrazoExpirado and costs you a revert instead of executing at a moment you did not choose."
    };
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
    var caixa = $("lp-passos");
    caixa.innerHTML = "";
    /* A frase da permissao vigente e apagada AQUI, antes de qualquer leitura. Sem
       esta linha ela sobrevivia a troca de acao: medido — encodar uma abertura e
       depois um fechamento deixava, ao lado dos bytes do fechamento, a frase
       sobre a allowance de dois tokens ERC-20 que a abertura tinha lido. Texto
       velho com cara de leitura atual e a mesma mentira de um numero inventado,
       so que mais barata de cometer. */
    txt($("lp-permissao"), "");
    ocupadoPassos(false);

    var acao = $("lp-acao").value;
    var dono = ESTADO.dono || ($("lp-endereco").value || "").trim();
    if (!END.test(dono)) {
      erroFluxo("Read the chain first: the gas estimate needs an address to run the call from. Nothing was encoded.");
      return;
    }
    var selo = seloAtual();
    var ctx = { dono: dono, npm: NPM };

    /* ---- validacao das entradas, por acao. Recusa com o campo em foco. ---- */
    if (acao === "abrir") {
      var i0 = $("lp-token0").value, i1 = $("lp-token1").value;
      if (i0 === "" || i1 === "") {
        recusar(i0 === "" ? "lp-token0" : "lp-token1", "Pick both tokens. The list is built from what the " +
          "Registry allows, so it stays empty until the chain is read. Nothing was encoded.");
        return;
      }
      ctx.tok0 = ESTADO.tokens[Number(i0)];
      ctx.tok1 = ESTADO.tokens[Number(i1)];
      if (!ctx.tok0 || !ctx.tok1 || ctx.tok0.casas === null || ctx.tok1.casas === null) {
        erroFluxo("The decimals of one of those tokens were not read, so no amount can be scaled. Nothing was encoded.");
        return;
      }
      if (ctx.tok0.endereco.toLowerCase() === ctx.tok1.endereco.toLowerCase()) {
        recusar("lp-token1", "The two tokens are the same contract. A pool has two sides. Nothing was encoded.");
        return;
      }
      if (ctx.tok0.endereco.toLowerCase() > ctx.tok1.endereco.toLowerCase()) {
        recusar("lp-token0", "Uniswap orders a pair by address, and token0 must be the LOWER of the two. " +
          "These are the other way round. This page will not swap them for you: swapping would change " +
          "which side your amounts and your ticks refer to, and you would sign something you did not " +
          "compose. Swap them yourself and encode again. Nothing was encoded.");
        return;
      }
      ctx.faixa = paraInteiro($("lp-faixa").value);
      if (ctx.faixa === null) { recusar("lp-faixa", "Pick a fee tier. Nothing was encoded."); return; }
      ctx.tickBaixo = paraInteiroComSinal($("lp-tickbaixo").value, -887272n, 887272n);
      ctx.tickAlto = paraInteiroComSinal($("lp-tickalto").value, -887272n, 887272n);
      if (ctx.tickBaixo === null) {
        recusar("lp-tickbaixo", "A tick is a whole number between -887272 and 887272. This page does not " +
          "fill it in for you, and the reason is the contract's: it holds no price opinion, so neither " +
          "does this screen. Nothing was encoded.");
        return;
      }
      if (ctx.tickAlto === null) {
        recusar("lp-tickalto", "A tick is a whole number between -887272 and 887272. Nothing was encoded.");
        return;
      }
      if (ctx.tickBaixo >= ctx.tickAlto) {
        recusar("lp-tickalto", "The upper tick must be strictly above the lower one. Nothing was encoded.");
        return;
      }
      ctx.q0 = paraUnidades($("lp-q0").value, ctx.tok0.casas);
      ctx.q1 = paraUnidades($("lp-q1").value, ctx.tok1.casas);
      if (ctx.q0 === null) { recusar("lp-q0", "Not a number, or more decimal places than " + (ctx.tok0.simbolo || "that token") + " has (" + ctx.tok0.casas + "). Nothing was encoded."); return; }
      if (ctx.q1 === null) { recusar("lp-q1", "Not a number, or more decimal places than " + (ctx.tok1.simbolo || "that token") + " has (" + ctx.tok1.casas + "). Nothing was encoded."); return; }
      if (ctx.q0 === 0n && ctx.q1 === 0n) { recusar("lp-q0", "Both amounts are zero, so there is no position to open. Nothing was encoded."); return; }
      ctx.min0 = paraUnidades($("lp-min0").value, ctx.tok0.casas);
      ctx.min1 = paraUnidades($("lp-min1").value, ctx.tok1.casas);
      if (ctx.min0 === null) { recusar("lp-min0", "Not a number with at most " + ctx.tok0.casas + " decimal places. Type 0 if you really accept any ratio. Nothing was encoded."); return; }
      if (ctx.min1 === null) { recusar("lp-min1", "Not a number with at most " + ctx.tok1.casas + " decimal places. Type 0 if you really accept any ratio. Nothing was encoded."); return; }
      if (ctx.min0 > ctx.q0) { recusar("lp-min0", "The minimum is larger than the amount you are sending, so the mint could never satisfy it. Nothing was encoded."); return; }
      if (ctx.min1 > ctx.q1) { recusar("lp-min1", "The minimum is larger than the amount you are sending, so the mint could never satisfy it. Nothing was encoded."); return; }
    } else {
      ctx.tokenId = paraInteiro($("lp-tokenid").value);
      if (ctx.tokenId === null) {
        recusar("lp-tokenid", "A token id is a whole number. Read the position first, then encode. Nothing was encoded.");
        return;
      }
      if (acao === "autorizar" && !NPM) {
        erroFluxo("The position manager has not been verified yet. Press “Read the chain” first — this " +
          "page will not put an unverified address in calldata. Nothing was encoded.");
        return;
      }
      if (acao === "fechar") {
        ctx.min0 = paraInteiro($("lp-min0").value);
        ctx.min1 = paraInteiro($("lp-min1").value);
        if (ctx.min0 === null || ctx.min1 === null) {
          recusar(ctx.min0 === null ? "lp-min0" : "lp-min1", "On a close these two are RAW UNITS of the " +
            "position's own tokens, not a decimal amount: this page has not read which pair the position " +
            "holds until you read the position, and it will not scale a number by decimals it is " +
            "guessing. Type 0 to accept whatever the pool returns. Nothing was encoded.");
          return;
        }
      }
    }
    if (acao === "abrir" || acao === "coletar" || acao === "fechar") {
      var minutos = paraInteiro($("lp-prazo").value);
      if (minutos === null || minutos === 0n || minutos > 1440n) {
        recusar("lp-prazo", "A deadline in whole minutes, from 1 to 1440. Nothing was encoded.");
        return;
      }
      var pz = calcularPrazo(minutos);
      ctx.prazo = pz.valor; ctx.prazoNota = pz.nota;
    }
    if (acao === "coletar" || acao === "fechar") {
      ctx.teto = paraInteiro($("lp-teto").value);
      if (ctx.teto === null || ctx.teto > 10000n) {
        recusar("lp-teto", "A rate cap in basis points, from 0 to 10000. Nothing was encoded.");
        return;
      }
    }

    montando = true;
    $("lp-montar").disabled = true;
    ocupadoPassos(true);
    estadoFluxo("Re-confirming everything that goes into these bytes against the chain. Nothing is " +
      "encoded until each answer is in.");

    Promise.resolve()
      .then(function () {
        if (acao !== "abrir") return null;
        /* Os dois tokens sao reconfirmados contra o Registry AGORA, e a
           allowance vigente e lida antes de qualquer pedido de outra. */
        return travarTokenParaCalldata(ctx.tok0)
          .then(function (a) { ctx.alvo0 = a; return travarTokenParaCalldata(ctx.tok1); })
          .then(function (a) { ctx.alvo1 = a; return lerAllowance(ctx.alvo0, ctx.dono, LPVAULT); })
          .then(function (v) { ctx.perm0 = v; return lerAllowance(ctx.alvo1, ctx.dono, LPVAULT); })
          .then(function (v) {
            ctx.perm1 = v;
            txt($("lp-permissao"),
              "Standing allowance of the vault over your " + (ctx.tok0.simbolo || "token0") + ": " +
              frasePermissao(ctx.perm0, ctx.tok0) + "   ·   Over your " + (ctx.tok1.simbolo || "token1") +
              ": " + frasePermissao(ctx.perm1, ctx.tok1));
          });
      })
      .then(function () {
        if (acao === "abrir") return null;
        if (!ctx.npm) {
          txt($("lp-permissao"), "The position manager has not been verified, so the standing approval " +
            "on that position could not be read.");
          return null;
        }
        /* REGRA 7 vale aqui tambem, e nao valia ate estas linhas existirem. A
           regra e MOSTRAR a permissao vigente antes de pedir outra, e ela nasceu
           falando de allowance de ERC-20 — mas a permissao que governa `coletar`
           e `fechar` e da mesma natureza: fica de pe ate ser revogada e deixa
           outro contrato agir sobre um bem seu. Ler o painel da posicao mostra
           isso; depender de o usuario ter clicado noutro botao antes nao e
           mostrar, e esperar. */
        return call(ctx.npm, sig("npm", "getApproved(uint256)") + palNum(ctx.tokenId))
          .then(function (r) {
            var a = paraEndereco(palavra(r, 0));
            var id = ctx.tokenId.toString();
            var ehCofre = a.toLowerCase() === LPVAULT.toLowerCase();
            if (/^0x0{40}$/.test(a)) {
              txt($("lp-permissao"), "Standing approval on position " + id + ": none. " + (acao === "autorizar"
                ? "Nobody may act on it right now, which is why coletar and fechar revert AprovacaoAusente until this step is mined."
                : "That is the precondition this call fails on: it will revert AprovacaoAusente. Authorise the vault for this position first."));
            } else if (ehCofre) {
              txt($("lp-permissao"), "Standing approval on position " + id + ": the vault. " + (acao === "autorizar"
                ? "It is ALREADY granted, so this step would grant what is already granted — gas spent, nothing changed. Read that before signing it."
                : "The precondition is met, so this call will not fail on _exigeAprovacaoUnica."));
            } else {
              txt($("lp-permissao"), "Standing approval on position " + id + ": " + a + ", which is NOT " +
                "the vault. " + (acao === "autorizar"
                  ? "Signing this step replaces that approval with the vault's; whoever holds it now loses it."
                  : "This call will revert AprovacaoAmpla — the vault refuses to be driven through anything but its own single-token approval, on purpose."));
            }
          })
          .catch(function () {
            txt($("lp-permissao"), "The standing approval on that position could NOT be read, so this " +
              "page cannot show you what is already granted. Read the position above and try again.");
          });
      })
      .then(function () {
        if (acao !== "coletar") return null;
        /* O registro de ANTES, para o efeito ser conferido contra ele depois do
           recibo. Um recibo com status 1 nao prova efeito. */
        return call(LPVAULT, sig("lpVault", "posicaoDe(uint256)") + palNum(ctx.tokenId))
          .then(function (r) { ctx.registroAntes = { c0: u(palavra(r, 2)), c1: u(palavra(r, 3)) }; })
          .catch(function () { ctx.registroAntes = null; });
      })
      .then(function () {
        var passos =
          acao === "abrir" ? construirAbrir(ctx) :
          acao === "autorizar" ? construirAutorizar(ctx) :
          acao === "coletar" ? construirColetar(ctx) :
          construirFechar(ctx);
        return congelar(amarrarTx(passos, ctx.dono), selo);
      })
      .then(function (cong) {
        CONGELAMENTO = cong;
        cong.passos.forEach(function (p) { caixa.appendChild(cartao(p)); });
        ajustarRolagem();
        return emSerie(cong.passos, function (p) { return estimar(p); }).then(function () { return cong; });
      })
      .then(function (cong) {
        var revertidos = cong.passos.filter(function (p) { return p.reverteu; }).length;
        var enviaveis = cong.passos.filter(function (p) { return p.podeEnviar; }).length;
        estadoFluxo("Encoded and frozen. " + cong.passos.length + " call(s), each with a fingerprint over " +
          "{chainId, from, to, data, value} that is re-checked at the instant you click. " +
          (revertidos
            ? revertidos + " would revert against the chain as it is right now, and those cannot be " +
              "signed here — the reason the contract gave is on each card, in its own words."
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
        $("lp-montar").disabled = false;
      });
  }

  function cartao(p) {
    var el = novo("article", "passo");
    var hid = "passo-" + p.assinatura.replace(/[^a-zA-Z0-9]/g, "-").slice(0, 40) + "-" + p.hash.slice(0, 8);
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
       campo conferido em separado contra `eth_chainId` no instante do clique —
       regra 4. */
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

    /* O resultado da regra 11, impresso. Um numero que o leitor pode conferir
       contra a lista de argumentos logo acima, e que diz quantas palavras da
       calldata foram RECONSTRUIDAS a partir do que esta escrito na tela. Se
       alguma tivesse ficado de fora, ela apareceria aqui pelo nome — e o passo
       nem teria chegado ate este ponto se alguma tivesse divergido. */
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
    else if (!window.ethereum) razao = "No wallet is available in this browser, so there is nothing to send to.";
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

  function estimar(p) {
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
         e por isso que a estimativa roda ANTES de o botao existir aceso. Note que
         um approve pendente faz o passo seguinte reverter aqui: a sequencia so
         fica toda verde depois que a anterior foi minerada, e isso e correto —
         estimar contra um estado que ainda nao existe seria estimar uma ficcao. */
      p.podeEnviar = false;
      p.elBotao.disabled = true;
      txt(p.elBotao, "Blocked — this reverts");
      txt(p.elInvalidado, "Not offered for signature: the estimate reverts against the chain as it is " +
        "right now, so signing it would spend gas to arrive at the same refusal. If this is a step that " +
        "depends on the one above it, send that one, wait for its receipt, and encode again — the " +
        "estimate is run against the chain as it is, not against the chain as it would be.");
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
  function conferirEstadoNaChain(p, recibo) {
    var c = p.confirmacao;
    if (!c) {
      return Promise.resolve("No on-chain effect check is defined for this step, so nothing is claimed " +
        "about its effect beyond what the receipt says.");
    }

    if (c.tipo === "allowance") {
      return lerAllowance(c.token, p.tx.de, c.gastador).then(function (v) {
        if (v === null) {
          return "The receipt reports success, but allowance() could not be re-read, so the effect is " +
            "UNCONFIRMED. That is not the same as confirmed — a receipt with status 1 and no effect is a " +
            "real outcome on chain, and this page will not call it success on the receipt alone.";
        }
        if (v === c.esperado) {
          return "Confirmed against the chain: allowance(you, vault) on " + c.simbolo + " now reads " +
            comCasas(v, c.casas) + ", which is exactly what these bytes asked for. Receipt and state agree.";
        }
        return "MISMATCH, and this is the case that proves why the state is re-read: the receipt reports " +
          "SUCCESS, but allowance(you, vault) now reads " + comCasas(v, c.casas) + " " + c.simbolo +
          " and these bytes asked for " + comCasas(c.esperado, c.casas) + " " + c.simbolo + ". A token " +
          "that returns false instead of reverting produces precisely this. Do not treat this step as done.";
      });
    }

    if (c.tipo === "aprovacao721") {
      return call(NPM, sig("npm", "getApproved(uint256)") + palNum(c.tokenId)).then(function (r) {
        var a = paraEndereco(palavra(r, 0));
        if (a.toLowerCase() === LPVAULT.toLowerCase()) {
          return "Confirmed against the chain: getApproved(" + c.tokenId.toString() + ") now answers the " +
            "vault. coletar() and fechar() will pass _exigeAprovacaoUnica on this position.";
        }
        return "MISMATCH: the receipt reports success, but getApproved(" + c.tokenId.toString() +
          ") answers " + a + " and not the vault. Do not treat this step as done.";
      }).catch(function () {
        return "The receipt reports success, but getApproved() could not be re-read, so the effect is " +
          "UNCONFIRMED rather than confirmed.";
      });
    }

    if (c.tipo === "abrir") {
      /* O tokenId nao existe em lugar nenhum antes desta transacao. Ele sai do
         LOG que o proprio cofre emitiu, pelo topico que a tabela gerada nomeia —
         e nao de um contador, de um palpite ou de um balanceOf que outra
         transacao poderia ter mexido no meio. */
      var top = topico("lpVault", "PosicaoAberta(uint256,address,address,address,uint24,uint128,uint256,uint256)");
      var meu = null;
      (recibo.logs || []).forEach(function (lg) {
        if (String(lg.address).toLowerCase() !== LPVAULT.toLowerCase()) return;
        if (!lg.topics || String(lg.topics[0]).toLowerCase() !== top.toLowerCase()) return;
        meu = u(String(lg.topics[1]).replace(/^0x/, ""));
      });
      if (meu === null) {
        return Promise.resolve("The receipt reports success, but no PosicaoAberta log from the vault is " +
          "in it, so this page cannot name the position that was created. UNCONFIRMED — read the " +
          "transaction on the explorer.");
      }
      return call(NPM, sig("npm", "ownerOf(uint256)") + palNum(meu)).then(function (r) {
        var dono = paraEndereco(palavra(r, 0));
        var seu = dono.toLowerCase() === String(p.tx.de).toLowerCase();
        $("lp-tokenid").value = meu.toString();
        return "Position " + meu.toString() + " was created, and the vault's own log says so. " +
          "ownerOf(" + meu.toString() + ") answers " + dono +
          (seu ? " — your address, not the vault's. The contract is never ownerOf, and that is checkable " +
                 "here rather than promised. The token id has been filled into the position field above."
               : " — which is NOT the address that signed this. Read the transaction on the explorer " +
                 "before doing anything else.");
      }).catch(function () {
        return "Position " + meu.toString() + " was created according to the vault's log, but ownerOf() " +
          "could not be re-read, so ownership is UNCONFIRMED here.";
      });
    }

    if (c.tipo === "coletar") {
      return call(LPVAULT, sig("lpVault", "posicaoDe(uint256)") + palNum(c.tokenId)).then(function (r) {
        var c0 = u(palavra(r, 2)), c1 = u(palavra(r, 3));
        if (!c.antes) {
          return "Collected. The vault's record now reads coletado0 = " + c0.toString() + " and " +
            "coletado1 = " + c1.toString() + " in raw units. The value before the call was not read, so " +
            "the difference is not claimed here.";
        }
        var d0 = c0 - c.antes.c0, d1 = c1 - c.antes.c1;
        if (d0 === 0n && d1 === 0n) {
          return "MISMATCH: the receipt reports success but the vault's record did not move — " +
            "coletado0 and coletado1 are what they were before. Do not treat this step as done.";
        }
        return "Confirmed against the chain: the vault's record grew by " + d0.toString() + " and " +
          d1.toString() + " raw units, which is what it collected and paid to you. That amount is now " +
          "part of the base fechar() will charge on, and only if the position ends up returning at " +
          "least what went into it.";
      }).catch(function () {
        return "The receipt reports success, but posicaoDe() could not be re-read, so the effect is UNCONFIRMED.";
      });
    }

    if (c.tipo === "fechar") {
      return call(LPVAULT, sig("lpVault", "posicaoDe(uint256)") + palNum(c.tokenId)).then(function (r) {
        var z = u(palavra(r, 0)) === 0n && u(palavra(r, 1)) === 0n &&
                u(palavra(r, 2)) === 0n && u(palavra(r, 3)) === 0n;
        return call(NPM, sig("npm", "ownerOf(uint256)") + palNum(c.tokenId))
          .then(function (r2) {
            var dono = paraEndereco(palavra(r2, 0));
            return "The vault's record for " + c.tokenId.toString() + " is " + (z ? "cleared" : "NOT cleared") +
              ", and ownerOf() still answers " + dono + ". The close burns the NFT, so an owner still " +
              "answering here is worth reading on the explorer before you conclude anything.";
          })
          .catch(function () {
            return "Confirmed against the chain: the vault's record for " + c.tokenId.toString() + " is " +
              (z ? "cleared" : "NOT cleared, which contradicts a successful close") + ", and ownerOf(" +
              c.tokenId.toString() + ") no longer answers — which is what a burned position does. " +
              "Everything the position held was paid out in this transaction.";
          });
      }).catch(function () {
        return "The receipt reports success, but the vault's record could not be re-read, so the effect is UNCONFIRMED.";
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
    /* A carga NAO e construida aqui. Ela foi construida uma unica vez no
       congelamento, por cargaDaTx(), e e ESTA REFERENCIA que foi impressa
       digitalmente, que a tela desenhou e que vai para a carteira. Um literal
       montado no envio — ainda que com os mesmos campos — faria a impressao
       digital provar o que a pagina CONGELOU e nao o que ela ENVIA, e provar
       isso e a unica razao de ela existir. Foi o achado #1 da Medusa. */
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
            "address that grants it and a position belongs to the address that holds it, so signing this " +
            "from another account would act on something else.");
        }
        txt(p.elEnvioEstado, "The transaction is in your wallet now. Nothing else happens here until you " +
          "accept it or reject it — both are fine, and rejecting costs nothing.");
        /* A MESMA referencia conferida acima. Remontar aqui reabriria a costura
           que este bloco existe para fechar. */
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
          " · gas used " + (rec.gasUsed ? BigInt(rec.gasUsed).toString() : TRACO) +
          " · logs " + ((rec.logs && rec.logs.length) || 0));
        if (!ok) {
          txt(p.elEnvioEstado, "The transaction was mined and FAILED on chain. Gas was spent and nothing " +
            "was changed. That is the chain's answer, not this page's reading of it.");
          return null;
        }
        txt(p.elEnvioEstado, "Mined. Re-reading the state it was supposed to change — a receipt is not " +
          "proof of effect.");
        return conferirEstadoNaChain(p, rec).then(function (frase) {
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
    txt($("lp-origem"), (o.ok ? "Signing is enabled on this origin: " : "Signing is OFF on this origin. ") + o.motivo);
  });

  /* A automacao liga aqui. `lpSize` e `lpBand` deixavam de existir depois de
     desenhar um rotulo — eram lidos pelo console-app.js e nunca chegavam neste
     arquivo, que e o que assina. Agora a banda vira largura de tick e o eco
     imprime o numero derivado, com a folga do arredondamento dita em voz alta.

     Roda na carga E a cada mudanca de banda ou de faixa, porque o espacamento
     de tick MUDA com a faixa: a mesma banda de 5% vale 540 ticks na faixa 3000
     e 490 na faixa 500. Ligar so na carga deixaria o numero mentindo no instante
     em que alguem trocasse a faixa. */
  preencherPadroesDoCanon();
  ["lpBand", "lp-faixa"].forEach(function (id) {
    var el = $(id);
    if (el) el.addEventListener("change", preencherPadroesDoCanon);
  });
})();
