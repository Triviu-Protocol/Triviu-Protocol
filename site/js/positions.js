
(function(){
  "use strict";

  /* ---- theme, identical behaviour to /dashboard so the two feel like one site -- */
  var SUN='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  var MOON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
  function curTheme(){var s=null;try{s=localStorage.getItem("triviu-theme");}catch(e){}
    if(s)return s;return window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}
  function applyTheme(t){document.documentElement.setAttribute("data-theme",t);
    var b=document.getElementById("theme");if(!b)return;
    b.innerHTML=t==="dark"?SUN:MOON;
    /* The icon shows the state to the eye; the accessible name has to show it
       too, and it has to name the ACTION, because the icon is the only other
       clue and a screen reader user never sees it. */
    b.setAttribute("aria-label", t==="dark" ? "Switch to light theme" : "Switch to dark theme");}
  applyTheme(curTheme());
  document.getElementById("theme").addEventListener("click",function(){
    var next=document.documentElement.getAttribute("data-theme")==="dark"?"light":"dark";
    try{localStorage.setItem("triviu-theme",next);}catch(e){}
    applyTheme(next);});

  var $ = function(id){ return document.getElementById(id); };
  var TRACO = "—";  /* the dash that means "not read". Never a number. */

  /* ==================================================================== GATE ==
     The read-only contract as a mechanism. Two allowlists, both of which throw.
     A promise in prose can be edited by anyone; a throw has to be deleted, and
     deleting it shows up in a diff.
     ------------------------------------------------------------------------ */
  var CARTEIRA_PERMITIDO = { eth_accounts:1, eth_requestAccounts:1 };
  var RPC_PERMITIDO      = { eth_call:1, eth_getCode:1, eth_chainId:1 };

  function pedirCarteira(metodo){
    if (!CARTEIRA_PERMITIDO[metodo]) {
      throw new Error("blocked: this page may only call " +
        Object.keys(CARTEIRA_PERMITIDO).join(" / ") + " on a wallet. Refused: " + metodo);
    }
    if (!window.ethereum) throw new Error("no wallet provider in this browser");
    return window.ethereum.request({ method: metodo });
  }

  var idRpc = 0;
  function rpc(metodo, params){
    if (!RPC_PERMITIDO[metodo]) {
      throw new Error("blocked: this page may only call " +
        Object.keys(RPC_PERMITIDO).join(" / ") + " over RPC. Refused: " + metodo);
    }
    var url = ($("p-rpc").value || "").trim();
    if (!/^https:\/\//i.test(url)) return Promise.reject(new Error("the endpoint must be an https URL"));
    idRpc += 1;
    return fetch(url, { method:"POST", headers:{"content-type":"application/json"},
      body: JSON.stringify({ jsonrpc:"2.0", id:idRpc, method:metodo, params:params }) })
      .then(function(r){
        if (!r.ok) throw new Error("the endpoint answered HTTP " + r.status);
        return r.json(); })
      .then(function(j){
        if (j && j.error) throw new Error(j.error.message || "RPC error");
        return j.result; });
  }
  var call = function(to, data){ return rpc("eth_call", [{ to:to, data:data }, "latest"]); };

  /* ------------------------------------------------------------- ABI helpers --
     Selectors are keccak-256 of the signature, first 4 bytes, computed before
     this file was written and cross-checked against the chain. */
  var SEL = {
    positionManager:     "0x791b98bc",
    balanceOf:           "0x70a08231",
    tokenOfOwnerByIndex: "0x2f745c59",
    positions:           "0x99fbab88",
    symbol:              "0x95d89b41",
    decimals:            "0x313ce567"
  };
  var END = /^0x[0-9a-fA-F]{40}$/;
  function padEnd(a){ return "000000000000000000000000" + a.replace(/^0x/,"").toLowerCase(); }
  function padNum(v){ return BigInt(v).toString(16).padStart(64,"0"); }
  function palavra(hex, i){ var x = hex.replace(/^0x/,""); return x.slice(i*64, (i+1)*64); }
  function paraEndereco(w){ return "0x" + w.slice(24); }
  function u(w){ return BigInt("0x" + w); }
  /* int24 lives right-aligned in a 32-byte word: take the last 6 nibbles and
     sign-extend. Reading the whole word and sign-extending at 256 bits also
     works, but only by accident of two's complement, and an accident is not a
     reason. */
  function i24(w){ var v = BigInt("0x" + w.slice(58)); return v >= (1n << 23n) ? v - (1n << 24n) : v; }

  /* An ABI-encoded string: offset, length, bytes. Some very old tokens return a
     raw bytes32 instead; that case is detected and shown as-is rather than
     decoded into something confident and wrong. */
  function decodeString(hex){
    if (!hex || hex === "0x") return null;
    var x = hex.replace(/^0x/,"");
    if (x.length < 128) return null;
    try {
      var off = Number(BigInt("0x" + x.slice(0,64)));
      if (off !== 32) return null;
      var len = Number(BigInt("0x" + x.slice(64,128)));
      if (!len || len > 64 || x.length < 128 + len*2) return null;
      var out = "";
      for (var i = 0; i < len; i++) {
        var c = parseInt(x.slice(128 + i*2, 130 + i*2), 16);
        if (c < 32 || c > 126) return null;   /* not printable ASCII: refuse */
        out += String.fromCharCode(c);
      }
      return out;
    } catch (e) { return null; }
  }

  /* Integer -> decimal string, exact, no floats. A float here would round a
     token balance, and a rounded balance printed without saying so is the same
     invention as a placeholder. */
  function comCasas(valor, casas){
    var s = valor.toString();
    if (casas === 0) return s;
    while (s.length <= casas) s = "0" + s;
    var inteiro = s.slice(0, s.length - casas);
    var frac = s.slice(s.length - casas).replace(/0+$/, "");
    return frac ? inteiro + "." + frac.slice(0, 8) : inteiro;
  }

  /* Price from a tick. Labelled as computed everywhere it is shown, because it
     is arithmetic on a number that was read, not a number that was read. */
  function precoDoTick(tick, d0, d1){
    var p = Math.pow(1.0001, Number(tick)) * Math.pow(10, d0 - d1);
    if (!isFinite(p) || p <= 0) return null;
    if (p >= 1000) return p.toFixed(2);
    if (p >= 1) return p.toFixed(4);
    return p.toPrecision(4);
  }

  /* ------------------------------------------------------------------- DOM ---
     Everything below writes with textContent. Chain data and typed input never
     reach innerHTML: a token can name itself anything, and a token that names
     itself a script tag must land on screen as text. */
  function txt(el, s){ el.textContent = s; }
  function novo(tag, cls, conteudo){
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (conteudo !== undefined) e.textContent = conteudo;
    return e;
  }
  /* dt/dd inside a <dl>, not three stacked divs. The tie between "liquidity" and
     the number under it was carried by nothing but position on the screen, which
     is 1.3.1 Info and Relationships: a relationship shown visually has to be in
     the markup too. The note moves inside the <dd> because a div wrapper in a
     <dl> may hold dt/dd and nothing else; the CSS below un-inherits the three
     properties <dd> would otherwise have pushed onto it. */
  function cela(rotulo, valor, nota, selo){
    var c = novo("div","cela");
    c.appendChild(novo("dt","k",rotulo));
    var v = novo("dd","v", valor === null || valor === undefined ? TRACO : String(valor));
    c.appendChild(v);
    if (selo) { var p = novo("span","pill " + selo.cls, selo.txt); p.style.marginLeft="8px"; v.appendChild(p); }
    if (nota) v.appendChild(novo("div","n",nota));
    return c;
  }
  /* ------------------------------------------------------- the three voices --
     estado()  -> role="status", polite. Started, progressed, finished.
     erro()    -> role="alert", assertive. The read stopped and there is no field
                  to send focus to. It interrupts, because what follows is void.
     recusar() -> neither. The refused field gets aria-invalid, the sentence goes
                  into the span that field already names in aria-describedby, and
                  focus moves there. The reason is then read out by the SAME focus
                  event that puts the caret where the fix has to be typed.

     Why the refusal is not assertive: it was, in effect, before — it went to
     #p-estado while focus jumped to the field, and an announcement fired at the
     instant of a focus change is the announcement the screen reader drops. The
     user was placed in a field marked invalid with no way to hear why.

     progresso() is aria-hidden: "position 7 of 15", announced fifteen times,
     buries the one sentence that mattered. */
  /* ---------------------------------------------------- keyboard on the block --
     WCAG 2.1.1: a region that scrolls sideways has to be reachable by keyboard,
     or a reader with no mouse never sees its right-hand end. But scrolling is a
     condition of width, not a property of the element — measured on this page
     with the block as a <pre>:

         container 1000px : scrollWidth 906 == clientWidth 906  -> does not scroll
         container  360px : scrollWidth  >  clientWidth         -> scrolls

     So a tabindex written into the HTML would be a dead tab stop on a desktop and
     the right thing on a phone. It is put on and taken off here instead, against
     the measurement, on load and on resize. The name and the role travel with it;
     without the role, aria-label on a plain <pre> is exposed to nobody anyway. */
  var NOME_BLOCO = "The calls this page makes, with their four-byte selectors";
  function ajustarBloco(){
    var e = document.querySelector("pre.cod");
    if (!e) return;
    if (e.scrollWidth > e.clientWidth) {
      e.setAttribute("tabindex","0");
      e.setAttribute("role","region");
      e.setAttribute("aria-label", NOME_BLOCO);
    } else {
      e.removeAttribute("tabindex");
      e.removeAttribute("role");
      e.removeAttribute("aria-label");
    }
  }
  ajustarBloco();
  var tBloco = null;
  window.addEventListener("resize", function(){
    if (tBloco) clearTimeout(tBloco);
    tBloco = setTimeout(ajustarBloco, 150);
  });

  function estado(s){ txt($("p-estado"), s); txt($("p-erro"), ""); }
  function erro(s){ txt($("p-estado"), ""); txt($("p-erro"), s); }
  function progresso(s){ txt($("p-prog"), s); }
  function ocupado(v){ $("p-lista").setAttribute("aria-busy", v ? "true" : "false"); }
  function recusar(campoId, msg){
    var c = $(campoId), e = $(campoId + "-erro");
    if (e) txt(e, msg);
    c.setAttribute("aria-invalid","true");
    c.focus();
  }
  function limparRecusa(){
    ["p-owner","p-rpc"].forEach(function(id){
      $(id).removeAttribute("aria-invalid");
      txt($(id + "-erro"), "");
    });
  }
  function morrer(motivo){
    $("p-fatal").hidden = false;
    txt($("p-fatal-txt"), motivo);
    $("p-read").disabled = true;
    /* The fields go too: an enabled input under a dead page invites typing into a
       form that will not answer. */
    ["p-owner","p-rpc","p-connect"].forEach(function(id){ $(id).disabled = true; });
    estado("Nothing can be read: the address ledger did not load. The reason is at the top of the page.");
  }

  /* ================================================================== BOOT ===
     Default endpoint: measured 2026-08-12, answered eth_chainId 0x89. It is a
     default, not a dependency; the field is editable and the page says why. */
  $("p-rpc").value = "https://polygon-bor-rpc.publicnode.com";

  var LEDGER = window.TRIVIU_ENDERECOS;
  var VAULT = null;
  if (!LEDGER || typeof LEDGER.exigirVivo !== "function") {
    morrer("The address ledger (/enderecos.js) did not load, so this page has no " +
           "address it is allowed to use. It does not keep a spare copy: a second copy of the ledger " +
           "is exactly the failure the ledger exists to prevent. Nothing below will be read until the " +
           "ledger is served next to this page.");
  } else {
    try {
      VAULT = LEDGER.exigirVivo(LEDGER.VIVOS.triviuLPVault, "triviuLPVault");
      txt($("p-addr-vault"), VAULT);
    } catch (e) {
      morrer("The address ledger rejected its own vault entry: " + e.message);
    }
  }

  if (!window.ethereum) {
    $("p-connect").disabled = true;
    $("p-connect").title = "No wallet provider in this browser. Paste an address instead.";
  }

  $("p-connect").addEventListener("click", function(){
    estado("Asking the wallet for an address. Nothing else is requested.");
    Promise.resolve()
      .then(function(){ return pedirCarteira("eth_accounts"); })
      .then(function(contas){
        if (contas && contas.length) return contas;
        return pedirCarteira("eth_requestAccounts");
      })
      .then(function(contas){
        if (!contas || !contas.length) { erro("The wallet returned no address."); return; }
        $("p-owner").value = contas[0];
        estado("Address taken from the wallet. Nothing was signed and nothing was approved.");
      })
      .catch(function(e){ erro("Wallet: " + e.message); });
  });

  $("p-read").addEventListener("click", function(){ ler(); });
  /* Enter reads, from EITHER field. It used to work only in the address box, so
     a keyboard user who corrected the endpoint and pressed Enter got silence —
     WCAG 3.2.4, the same control behaving two ways in the same group. */
  $("p-owner").addEventListener("keydown", function(ev){ if (ev.key === "Enter") { ev.preventDefault(); ler(); } });
  $("p-rpc").addEventListener("keydown", function(ev){ if (ev.key === "Enter") { ev.preventDefault(); ler(); } });

  /* ---------------------------------------------------------------- LEITURA --*/
  var lendo = false;
  var TETO = 40;   /* positions read per run; stated on screen when it bites */

  function ler(){
    /* A silent early return here would be a button that looks like it worked and
       did nothing — the same lie as a placeholder number, told with a click
       instead of a digit. So the refusal is announced. */
    if (lendo) { estado("Still reading the previous address. This click did nothing."); return; }
    limparRecusa();
    var dono = ($("p-owner").value || "").trim();
    if (!END.test(dono)) {
      recusar("p-owner", "That is not a 40-hex-character address, so nothing was read. " +
        "It needs 0x followed by 40 hex characters.");
      return;
    }
    if (!/^https:\/\//i.test(($("p-rpc").value || "").trim())) {
      recusar("p-rpc", "The endpoint must be an https URL, so nothing was read.");
      return;
    }
    if (!VAULT) { erro("No ledger, no read."); return; }

    lendo = true;
    $("p-read").disabled = true;
    $("p-lista").innerHTML = "";
    ocupado(true);
    txt($("p-resumo"), "Reading...");
    progresso("");
    estado("Reading from " + $("p-rpc").value);

    var NPM = null;

    rpc("eth_chainId", [])
      .then(function(cid){
        if (BigInt(cid) !== 137n) {
          throw new Error("that endpoint is chain " + BigInt(cid).toString() +
            ", and these contracts are on 137. Nothing was read rather than reading the wrong chain.");
        }
        return call(VAULT, SEL.positionManager);
      })
      .then(function(res){
        if (!res || res === "0x") throw new Error("the vault did not answer positionManager()");
        var addr = paraEndereco(palavra(res, 0));
        if (!END.test(addr) || /^0x0{40}$/.test(addr)) throw new Error("the vault returned an empty position manager");
        /* Defence in depth: the ledger's own orphan list also applies to an
           address that arrived from the chain, not only to one typed by hand. */
        var baixo = addr.toLowerCase();
        var orfaos = (LEDGER.ORFAOS || []);
        for (var i = 0; i < orfaos.length; i++) {
          if (String(orfaos[i].endereco).toLowerCase() === baixo) {
            throw new Error("the vault pointed at " + addr + ", which the ledger lists as an orphan");
          }
        }
        NPM = addr;
        txt($("p-addr-npm"), NPM);
        return rpc("eth_getCode", [NPM, "latest"]);
      })
      .then(function(code){
        if (!code || code === "0x") throw new Error("there is no contract code at " + NPM);
        return call(NPM, SEL.balanceOf + padEnd(VAULT));
      })
      .then(function(bal){
        txt($("p-vault-bal"), bal && bal !== "0x" ? u(palavra(bal,0)).toString() : TRACO);
        return call(NPM, SEL.balanceOf + padEnd(dono));
      })
      .then(function(bal){
        if (!bal || bal === "0x") throw new Error("balanceOf returned nothing for that address");
        var n = Number(u(palavra(bal, 0)));
        if (n === 0) {
          txt($("p-resumo"), "That address owns no Uniswap V3 position on chain 137. " +
            "This is a read result, not a failure to read: balanceOf answered, and it answered zero.");
          /* The live region carries the OUTCOME, not just "done". #p-resumo is
             not a live region — one region announces, so it has to announce the
             thing worth hearing. */
          estado("Read complete. That address owns no Uniswap V3 position on chain 137: balanceOf answered zero.");
          return null;
        }
        var quantos = Math.min(n, TETO);
        txt($("p-resumo"), quantos < n
          ? ("That address owns " + n + " positions. Reading the first " + quantos +
             " — the rest are not shown, and not shown is not the same as not there.")
          : ("That address owns " + n + (n === 1 ? " position." : " positions.")));
        return emSerie(quantos, function(i){
          progresso("position " + (i+1) + " of " + quantos);
          return call(NPM, SEL.tokenOfOwnerByIndex + padEnd(dono) + padNum(i))
            .then(function(r){ return u(palavra(r, 0)); })
            .then(function(id){ return lerPosicao(NPM, id); })
            .then(function(p){ $("p-lista").appendChild(cartao(p)); });
        }).then(function(){
          progresso("");
          estado("Read complete. " + quantos + (quantos === 1 ? " position is" : " positions are") +
            " listed below" + (quantos < n ? ", out of " + n + " that address owns" : "") +
            ", each one a heading you can jump to.");
        });
      })
      .catch(function(e){
        txt($("p-resumo"), "Nothing was read.");
        progresso("");
        erro("Stopped: " + e.message);
      })
      .then(function(){ lendo = false; $("p-read").disabled = false; ocupado(false); });
  }

  /* Serial, not parallel. Public endpoints collapse under a burst and answer a
     partial set, and a partial set that looks complete is worse than a slow one. */
  function emSerie(n, fn){
    var p = Promise.resolve();
    for (var i = 0; i < n; i++) (function(k){ p = p.then(function(){ return fn(k); }); })(i);
    return p;
  }

  var cacheToken = {};
  function lerToken(addr){
    var baixo = addr.toLowerCase();
    if (cacheToken[baixo]) return cacheToken[baixo];
    cacheToken[baixo] = Promise.all([
      call(addr, SEL.symbol).catch(function(){ return null; }),
      call(addr, SEL.decimals).catch(function(){ return null; })
    ]).then(function(r){
      var sim = decodeString(r[0]);
      var dec = null;
      try { if (r[1] && r[1] !== "0x") { var d = Number(u(palavra(r[1],0))); if (d >= 0 && d <= 36) dec = d; } } catch(e){}
      return { endereco: addr, simbolo: sim, casas: dec };
    });
    return cacheToken[baixo];
  }

  function lerPosicao(npm, id){
    return call(npm, SEL.positions + padNum(id)).then(function(hex){
      if (!hex || hex === "0x") return { id:id, erro:"positions() returned nothing" };
      var x = hex.replace(/^0x/,"");
      if (x.length < 12*64) return { id:id, erro:"positions() returned " + (x.length/64|0) + " words, expected 12" };
      var p = {
        id: id,
        token0: paraEndereco(palavra(hex,2)),
        token1: paraEndereco(palavra(hex,3)),
        fee: Number(u(palavra(hex,4))),
        tickLower: i24(palavra(hex,5)),
        tickUpper: i24(palavra(hex,6)),
        liquidez: u(palavra(hex,7)),
        owed0: u(palavra(hex,10)),
        owed1: u(palavra(hex,11))
      };
      return Promise.all([lerToken(p.token0), lerToken(p.token1)]).then(function(t){
        p.t0 = t[0]; p.t1 = t[1]; return p;
      });
    }).catch(function(e){ return { id:id, erro:e.message }; });
  }

  function quantia(valor, tok){
    if (tok && tok.casas !== null) return comCasas(valor, tok.casas);
    return valor.toString();
  }
  function nomeToken(tok){
    if (tok && tok.simbolo) return tok.simbolo;
    return tok && tok.endereco ? tok.endereco.slice(0,6) + "..." + tok.endereco.slice(-4) : TRACO;
  }

  function cartao(p){
    /* <article> with its own <h3>: the pairs become a heading list, which is how
       a screen reader user moves through fifteen cards without tabbing past
       every cell in each of them. The id is the tokenId, unique by definition. */
    var el = novo("article","pos");
    var hid = "pos-h-" + p.id.toString();
    el.setAttribute("aria-labelledby", hid);
    var cab = novo("div","cab");

    if (p.erro) {
      var hErr = novo("h3","par","Position #" + p.id.toString() + " — not read");
      hErr.id = hid;
      cab.appendChild(hErr);
      var badErr = novo("span","pill vazio","not read");
      cab.appendChild(badErr);
      el.appendChild(cab);
      el.appendChild(novo("p","hint","This position was not read: " + p.erro +
        ". Nothing is shown for it, because a field this page could not read is a dash, not a zero."));
      return el;
    }

    var h = novo("h3","par", nomeToken(p.t0) + " / " + nomeToken(p.t1));
    h.id = hid;
    cab.appendChild(h);
    cab.appendChild(novo("span","pill","#" + p.id.toString()));
    cab.appendChild(novo("span","pill", (p.fee/10000).toString() + "% fee tier"));
    if (p.liquidez === 0n) cab.appendChild(novo("span","pill vazio","no liquidity"));
    el.appendChild(cab);

    var g = novo("dl","celas");

    g.appendChild(cela("liquidity", p.liquidez.toString(),
      "Raw L from positions(). It is not a token amount and does not convert to one without the pool price, which this page does not read.",
      { cls:"lido", txt:"read" }));

    var faixa = p.tickLower.toString() + " → " + p.tickUpper.toString();
    var nota = "Ticks, exactly as stored.";
    if (p.t0 && p.t1 && p.t0.casas !== null && p.t1.casas !== null) {
      var a = precoDoTick(p.tickLower, p.t0.casas, p.t1.casas);
      var b = precoDoTick(p.tickUpper, p.t0.casas, p.t1.casas);
      if (a && b) nota = "Ticks as stored. Computed, not read: " + a + " → " + b + " " +
        nomeToken(p.t1) + " per " + nomeToken(p.t0) + " (1.0001^tick x 10^(d0−d1)).";
    }
    g.appendChild(cela("range", faixa, nota, { cls:"lido", txt:"read" }));

    g.appendChild(cela("fee tier", (p.fee/10000).toString() + "%", "The pool's fee, in the position record.",
      { cls:"lido", txt:"read" }));

    g.appendChild(cela("tokensOwed0 · " + nomeToken(p.t0), quantia(p.owed0, p.t0),
      p.t0 && p.t0.casas !== null ? "Scaled by decimals() read from the token." : "Raw units: decimals() was not read.",
      { cls:"lido", txt:"read" }));

    g.appendChild(cela("tokensOwed1 · " + nomeToken(p.t1), quantia(p.owed1, p.t1),
      p.t1 && p.t1.casas !== null ? "Scaled by decimals() read from the token." : "Raw units: decimals() was not read.",
      { cls:"lido", txt:"read" }));

    g.appendChild(cela("pool", nomeToken(p.t0) + " / " + nomeToken(p.t1),
      p.token0 + "  ·  " + p.token1, { cls:"lido", txt:"read" }));

    el.appendChild(g);

    /* The caveat that keeps tokensOwed from being read as something it is not.
       It is stated on every position, not once at the top, because the number it
       qualifies is on every position. */
    el.appendChild(novo("p","hint",
      "tokensOwed is what the position manager checkpointed at the last mint, burn or collect — " +
      "it is not everything this position has earned. Fees accrued since that moment sit in the pool's " +
      "fee growth and are not in this number. This page does not simulate a collect, so it does not " +
      "claim the total; it shows the field it read and names it."));
    return el;
  }
})();
