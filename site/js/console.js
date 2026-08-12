
/* =============================================================================
   /console/ — le a chain, monta a calldata, nao envia nada.

   Duas travas governam este arquivo, e as duas LANCAM excecao em vez de avisar.
   Uma promessa em prosa qualquer um edita; um throw tem de ser apagado, e apagar
   aparece no diff. A trava de carteira e conferida tambem por
   scripts/check-console-abi.mjs, que reprova o build se um metodo de escrita
   sequer for citado neste arquivo.

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
  var SOL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  var LUA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
  function temaAtual() {
    var s = null;
    try { s = localStorage.getItem("triviu-theme"); } catch (e) {}
    if (s) return s;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  function aplicarTema(t) {
    document.documentElement.setAttribute("data-theme", t);
    var b = $("theme"); if (!b) return;
    b.innerHTML = t === "dark" ? SOL : LUA;
    b.setAttribute("aria-label", t === "dark" ? "Switch to light theme" : "Switch to dark theme");
  }
  aplicarTema(temaAtual());
  $("theme").addEventListener("click", function () {
    var prox = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    try { localStorage.setItem("triviu-theme", prox); } catch (e) {}
    aplicarTema(prox);
  });

  /* ============================================================== TRAVAS ==== */
  /* Somente-leitura, e cada metodo aqui devolve algo que o usuario ja controla.
     Nao ha um quarto. O passo que assina abre noutra onda, depois dos gates
     auditados na URL publica, e vai ser outro arquivo — nao uma linha a mais
     neste. */
  var CARTEIRA_PERMITIDO = { eth_accounts: 1, eth_requestAccounts: 1, eth_chainId: 1 };
  var RPC_PERMITIDO = {
    eth_call: 1, eth_chainId: 1, eth_getCode: 1, eth_getLogs: 1,
    eth_blockNumber: 1, eth_gasPrice: 1, eth_estimateGas: 1, eth_getBalance: 1
  };

  function pedirCarteira(metodo) {
    if (!CARTEIRA_PERMITIDO[metodo]) {
      throw new Error("blocked: this page may only call " +
        Object.keys(CARTEIRA_PERMITIDO).join(" / ") + " on a wallet. Refused: " + metodo);
    }
    if (!window.ethereum) throw new Error("no wallet provider in this browser");
    return window.ethereum.request({ method: metodo });
  }

  var idRpc = 0;
  function rpc(metodo, params) {
    if (!RPC_PERMITIDO[metodo]) {
      throw new Error("blocked: this page may only call " +
        Object.keys(RPC_PERMITIDO).join(" / ") + " over RPC. Refused: " + metodo);
    }
    var url = $("c-rpc").value;
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
  var call = function (to, data) { return rpc("eth_call", [{ to: to, data: data }, "latest"]); };

  /* ================================================================= ABI ==== */
  var ABI = window.TRIVIU_ABI;
  var LIVRO = window.TRIVIU_ENDERECOS;

  /** Seletor de 4 bytes de uma assinatura, vindo da tabela gerada de contracts/out.
      Lanca se a assinatura nao existir — que e o ponto do arquivo inteiro. */
  function sig(papel, assinatura) {
    var g = (ABI.contratos && ABI.contratos[papel]) || (ABI.extras && ABI.extras[papel]);
    var f = g && g.funcoes && g.funcoes[assinatura];
    if (!f) throw new Error("no such signature in the compiled ABI: " + papel + "." + assinatura);
    return f.seletor;
  }

  /* ---------------------------------------------------------------- codec -- */
  function pal(hex) { return String(hex).replace(/^0x/, "").toLowerCase().padStart(64, "0"); }
  function palNum(v) { return BigInt(v).toString(16).padStart(64, "0"); }
  function palavra(hex, i) { var x = String(hex).replace(/^0x/, ""); return x.slice(i * 64, (i + 1) * 64); }
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
    var partes = [];
    (achado.def.entradas || []).forEach(function (ent, i) {
      var w = palavra(dados, i + 1);
      if (!w) { partes.push(ent.nome + "=" + TRACO); return; }
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

  /* A superficie externa completa dos tres contratos cujo codigo-fonte esta neste
     repositorio. Renderizada da tabela gerada — se o contrato ganhar ou perder uma
     funcao, esta lista muda sozinha e o guardiao cobra a diferenca. */
  (function () {
    var corpo = $("c-superficie");
    corpo.innerHTML = "";
    var n = 0;
    ["parameterRegistry", "triviuExecutor", "gasTank"].forEach(function (papel) {
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
      "three contracts whose source is here. approve() is not in this list because it lives on the " +
      "token, not on a Triviu contract; TriviuLPVault is not either, because its source is not in " +
      "this repository.");
    td.colSpan = 4; tr2.appendChild(td); corpo.appendChild(tr2);
  })();
  ajustarRolagem();

  if (!window.ethereum) {
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

  if (window.ethereum && typeof window.ethereum.on === "function") {
    window.ethereum.on("chainChanged", function (cid) {
      verChain(cid);
      estado("The wallet changed chain. Read again: everything below was read against the previous one.");
    });
    window.ethereum.on("accountsChanged", function (contas) {
      var a = contas && contas.length ? contas[0] : "";
      $("c-endereco").value = a;
      txt($("c-w-conta"), a || TRACO);
      estado("The wallet changed account. Read again: the balances below belong to the previous address.");
    });
  }

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
          " Nothing was signed and nothing was sent — this page has no method that could." +
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
  $("c-montar").addEventListener("click", function () { montar(); });
  ["c-principal", "c-lucro"].forEach(function (id) {
    $(id).addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") { ev.preventDefault(); montar(); }
    });
  });

  function montar() {
    if (montando) {
      estadoFluxo("Still encoding the previous set. This click did nothing.");
      return;
    }
    limparRecusa();
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

    estadoFluxo("Encoding. Every byte below is built from the signature in the compiled ABI; nothing is sent.");

    var passos = [
      {
        n: "step 1 of 2",
        titulo: "Let the Executor move that amount, once",
        papel: "erc20",
        assinatura: "approve(address,uint256)",
        alvo: tok.endereco,
        alvoNome: (tok.simbolo || "the asset token") + " — the token contract, not a Triviu contract",
        args: [
          { nome: "spender", tipo: "address", valor: EXECUTOR, nota: "the Executor, from the ledger" },
          { nome: "amount", tipo: "uint256", valor: principal.toString(),
            nota: comCasas(principal, tok.casas) + " " + (tok.simbolo || "") + ", scaled by the " + tok.casas + " decimals read from the token" }
        ],
        dados: sig("erc20", "approve(address,uint256)") + pal(EXECUTOR) + palNum(principal),
        faz: "Sets an allowance: the Executor becomes able to pull up to this amount of this token from " +
          "your address, and only this token. ERC-20 approve is the standard one; it is on the token, so " +
          "the same bytes work on any wallet screen that decodes ERC-20.",
        naoFaz: "It moves nothing by itself, and it is not a payment. It also does not expire: an " +
          "allowance survives until it is spent or set back to zero, which is why the amount here is the " +
          "principal and not an unlimited approval. An unlimited approval is a standing permission to " +
          "drain that token, and this page will not encode one."
      },
      {
        n: "step 2 of 2",
        titulo: "Run the cycle in one transaction",
        papel: "triviuExecutor",
        assinatura: "executeCycle(address,uint256,uint256,(uint8,address,address,address,uint24,uint256)[])",
        alvo: EXECUTOR,
        alvoNome: "TriviuExecutor, from the ledger",
        args: [
          { nome: "asset", tipo: "address", valor: tok.endereco, nota: "the cycle opens and closes here" },
          { nome: "principal", tipo: "uint256", valor: principal.toString(), nota: comCasas(principal, tok.casas) + " " + (tok.simbolo || "") },
          { nome: "minProfit", tipo: "uint256", valor: lucro.toString(),
            nota: comCasas(lucro, tok.casas) + " " + (tok.simbolo || "") + " — below this the whole transaction reverts" },
          { nome: "legs", tipo: "tuple[]", valor: "[] (length 0)",
            nota: "EMPTY, and stated rather than filled: " + (ESTADO.alvos.filter(function (a) { return a.permitido === true; }).length) +
              " routers are allowed, and a leg must swap on an allowed one. This page does not invent a route." }
        ],
        dados: sig("triviuExecutor", "executeCycle(address,uint256,uint256,(uint8,address,address,address,uint24,uint256)[])") +
          pal(tok.endereco) + palNum(principal) + palNum(lucro) + palNum(128) + palNum(0),
        faz: "Pulls the principal, walks the legs in order, and at the end requires the asset balance to " +
          "be at least what it started with plus the principal plus minProfit. If it is not, the entire " +
          "transaction reverts and no leg is left half-done. The fee, if any, is taken from the profit " +
          "only, after that check.",
        naoFaz: "It does not hold your funds between transactions, and it cannot be pointed at a router " +
          "or a token the Registry does not allow. With an empty legs array it cannot run at all — " +
          "which is what the estimate below reports, in the contract's own words."
      },
      {
        n: "optional",
        titulo: "Fund your own gas reserve",
        papel: "gasTank",
        assinatura: "deposit()",
        alvo: GASTANK,
        alvoNome: "GasTank, from the ledger",
        args: [],
        dados: sig("gasTank", "deposit()"),
        valor: 0n,
        faz: "Credits native POL to a balance recorded under your address. You are the only account that " +
          "can move it back out, through withdraw().",
        naoFaz: "Nothing spends it for you yet. The automated path — using your reserve to finish a " +
          "return leg that ran out of gas — is not deployed; the contract's own source says it ships " +
          "only once specified and audited. Until then this is an escrow you can fill and empty, and " +
          "filling it buys you nothing. Depositing today is a decision to lock up POL for a feature that " +
          "does not exist yet."
      }
    ];

    passos.forEach(function (p) { caixa.appendChild(cartao(p, tok)); });

    /* Estimativa em serie, depois de tudo desenhado: a tela ja e util antes de o
       primeiro endpoint responder.

       aria-busy enquanto isso, e por um motivo mensuravel: as celulas "Estimated
       gas" e "What that costs" ja estao na tela com um traco e mudam sozinhas
       segundos depois, fora de qualquer regiao viva. Quem leu o cartao antes da
       resposta nao saberia que ele mudou. aria-busy diz "ainda estou montando
       isto", e a mensagem de conclusao diz o que aconteceu — inclusive quantos
       passos a estimativa RECUSOU, que e informacao e nao falha. */
    ocupadoPassos(true);
    montando = true;
    $("c-montar").disabled = true;
    emSerie(passos, function (p) { return estimar(p, dono); })
      .then(function () {
      ocupadoPassos(false);
      var revertidos = passos.filter(function (p) { return p._reverteu; }).length;
      estadoFluxo("Encoded. " + passos.length + " calls, none of them sent. " +
        (revertidos
          ? revertidos + " of them would revert against the chain as it is right now, and the reason " +
            "the contract gave is on each card in its own words."
          : "All of them estimated without reverting.") +
        " The bytes above are what a wallet would receive — comparing them with what a wallet actually " +
        "shows you, one day, is the whole point of reading them here first.");
    })
    // `catch` ANTES de `finally`, e nao depois. Medido rodando: com
    // `.finally().then()` e sem `catch`, uma estimativa que rejeita libera a trava
    // e some — o usuario nao recebe erro nenhum e sobra uma promessa rejeitada sem
    // tratamento. A trava sozinha nao basta: ela devolve o botao e deixa a pessoa
    // sem saber por que a tela nao mudou.
    .catch(function (e) {
      estadoFluxo("Stopped while estimating: " + e.message + ". Nothing was sent — this page " +
        "cannot send. The calldata above is unchanged; only the gas estimate is missing.");
    })
    // `ocupadoPassos(false)` vive aqui e nao no `then`: numa falha ele nao rodaria,
    // e o aria-busy ficaria preso em true para quem usa leitor de tela.
    .finally(function () {
      ocupadoPassos(false);
      montando = false;
      $("c-montar").disabled = false;
    });
  }

  function cartao(p, tok) {
    var el = novo("article", "passo");
    var hid = "passo-" + p.assinatura.replace(/[^a-zA-Z0-9]/g, "-");
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
    linha("Function, from the compiled artefact", p.assinatura);
    linha("Four-byte selector", p.dados.slice(0, 10));
    linha("Target contract", p.alvo);
    linha("What that address is", p.alvoNome);
    if (p.valor !== undefined) linha("Native value attached", comCasas(p.valor, 18) + " POL (the estimate below is for this value)");
    var trGas = linha("Estimated gas, eth_estimateGas", TRACO);
    var trCusto = linha("What that costs at the current gas price", TRACO);
    t.appendChild(tb);
    el.appendChild(t);
    p._gas = trGas.lastChild;
    p._custo = trCusto.lastChild;

    /* Os argumentos eram um <div> de texto corrido com \n e quatro espacos de
       recuo. Um leitor de tela despejava isso como uma frase unica de trezentos
       caracteres, sem dizer onde acaba um argumento e comeca o proximo.
       "nome = valor, e aqui esta o que ele significa" e literalmente uma lista de
       descricao: <dt> o termo, <dd> a definicao. HTML semantico resolvendo o que
       nao precisava de ARIA nenhuma — NVDA anuncia "lista, 2 itens" e le os pares.
       Nenhuma cor nova: termo e nota se separam por peso e recuo. */
    if (p.args.length) {
      var dl = novo("dl", "cod args");
      p.args.forEach(function (a) {
        /* Tipo e nome do parametro sao identificadores da ABI — `address spender`
           nao vira `endereço gastador`. A classe mono ja carrega translate="no"
           pela regra deste arquivo, e o valor idem. */
        dl.appendChild(novo("dt", "mono", a.tipo + " " + a.nome));
        var dd = novo("dd", null);
        dd.appendChild(novo("span", "mono", a.valor));
        var n = novo("span", "notaarg", a.nota);
        /* A nota e prosa, e prosa se traduz. O translate="no" que a <dl> herdou
           por ser .cod e devolvido aqui, explicitamente, para o unico pedaco do
           bloco que existe para ser entendido em vez de conferido. */
        n.setAttribute("translate", "yes");
        dd.appendChild(n);
        dl.appendChild(dd);
      });
      el.appendChild(dl);
    }

    /* A calldata. Tres decisoes, e cada uma tem uma medida atras:

       1. <figure> + <figcaption>, e nao role="region" + aria-label. A legenda
          nomeia o bloco pelo HTML, sem ARIA, e e VISIVEL — quem enxerga tambem
          ganha o rotulo, que antes so existia para o leitor de tela. E figure nao
          e landmark: tres blocos de calldata viravam tres landmarks na lista de
          regioes da pagina, e nenhum deles e uma secao da pagina.

       2. Sem tabindex. O tabindex="0" anterior existia para dar alcance de
          teclado a um contentor que rola (WCAG 2.1.1) — so que este nao rola:
          .cod declara white-space:pre-wrap e word-break:break-all, entao o hex
          quebra de linha e nunca transborda na horizontal. Foco num contentor que
          nao rola e uma parada de tabulacao que nao faz nada, tres vezes por
          codificacao.

       3. Os bytes continuam sendo TEXTO, exatos, numa unica linha logica. Nao
          levam aria-label: um aria-label num elemento com texto SUBSTITUI o texto
          para a tecnologia assistiva, e nesta pagina isso significaria um usuario
          cego nao conseguir ler os bytes de jeito nenhum — exatamente o contrario
          do que a pagina existe para fazer. Tambem nao levam quebra a cada
          palavra de 32 bytes, porque a quebra entraria no copiar-e-colar e o que
          se colaria deixaria de ser a calldata exata. Quem le com leitor de tela
          ouve primeiro a legenda — o que e, quantos argumentos, quantos bytes —
          e decide dali se entra no hex. Os argumentos ja estao decodificados
          acima, na <dl>: o significado esta la, o hex e o artefato de conferencia.

       Contagem de bytes: (comprimento do hex - 2) / 2, calculada, nao estimada. */
    var fig = novo("figure", "calldataf");
    var cap = novo("figcaption", null,
      "Calldata as the wallet would receive it — 4-byte selector" +
      (p.args.length ? " plus " + p.args.length + " argument" + (p.args.length === 1 ? "" : "s") : ", no arguments") +
      ", " + ((p.dados.length - 2) / 2) + " bytes in total");
    fig.appendChild(cap);
    var pre = novo("pre", "cod");
    pre.setAttribute("translate", "no");
    pre.textContent = p.dados;
    fig.appendChild(pre);
    el.appendChild(fig);

    el.appendChild(novo("p", "hint", "What it does: " + p.faz));
    el.appendChild(novo("p", "hint", "What it does not do: " + p.naoFaz));
    el.appendChild(novo("p", "hint",
      "This page stops here. It has encoded the bytes and estimated the gas; putting them in front of " +
      "your wallet is the next wave's job, and it opens only after the three security gates are audited " +
      "on the public URL."));
    return el;
  }

  function estimar(p, dono) {
    var tx = { from: dono, to: p.alvo, data: p.dados };
    if (p.valor !== undefined) tx.value = "0x" + p.valor.toString(16);
    return rpc("eth_estimateGas", [tx]).then(function (g) {
      var gas = BigInt(g);
      p._reverteu = false;
      txt(p._gas, gas.toString() + " gas");
      if (ESTADO.gasPrice === null) {
        txt(p._custo, TRACO + "  (the gas price was not read)");
      } else {
        var custo = gas * ESTADO.gasPrice;
        txt(p._custo, comCasas(custo, 18) + " POL   at " + comCasas(ESTADO.gasPrice, 9) +
          " gwei on chain " + CHAIN.toString());
      }
    }).catch(function (e) {
      p._reverteu = true;
      txt(p._gas, explicarRevert(e));
      txt(p._custo, "no cost, because there is no transaction to price — a call that reverts in the " +
        "estimate would revert on chain and spend gas without doing the thing");
      /* A borda vermelha do cartao NAO e o unico sinal de que este passo nao
         passaria: a razao esta escrita na celula acima, em palavras, e a
         conclusao conta quantos foram. Cor sozinha nunca carrega o fato
         (WCAG 1.4.1). */
      var art = p._gas && p._gas.closest ? p._gas.closest("article") : null;
      if (art) art.className = "passo morto";
    });
  }
})();
