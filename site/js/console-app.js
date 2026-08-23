
/* =============================================================================
   /console/ — A CASCA. Navegacao, tema, e as telas que NAO assinam.

   O QUE ESTE ARQUIVO NAO E
   ========================
   Ele nao fala com carteira. Nao alcanca o provedor que o navegador injeta, nao
   chama metodo de envio, e nao monta calldata em uma unica linha. Quem assina e
   /js/console-lp.js, que chegou inteiro, e a fronteira e deliberada: o arquivo
   que desenha catorze telas e o que tem mais motivo para mudar toda semana, e um
   caminho de assinatura nao pode morar no arquivo que mais muda.

   O paragrafo acima nomeava a API do provedor por extenso, e scripts/check-assinatura.mjs
   REPROVOU o arquivo por causa disso — ele conta bytes no fonte todo, comentario
   incluido. O alarme era falso e a correcao foi aqui, nao no guardiao: afrouxar
   uma trava da Lei do Sangue para caber uma frase minha seria trocar a trava pela
   frase. A aspereza fica registrada no relatorio da onda para quem tem alcada
   sobre o guardiao decidir; ate la, escreve-se em volta dela.

   A separacao tambem e o que mantem o guardiao honesto. scripts/check-assinatura.mjs
   varre todo /js/*.js que o site carrega e cobra as quatro checagens de quem
   toca em carteira. Este aqui cai no grupo "nao toca", e isso e uma afirmacao
   verificavel de fora, nao uma promessa deste cabecalho.

   O QUE ELE FAZ
   =============
     1. tema        — o controle que faltava, com as tres opcoes, na chave que os
                      motores ja liam (`triviu-theme`)
     2. navegacao   — catorze paineis, um visivel, endereco sincronizado
     3. p-lp        — as oito piscinas MEDIDAS (a pesquisa; o fluxo e do motor)
     4. p-contracts — o livro-razao renderizado, vivos e ORFAOS lado a lado
     5. p-layers    — L1/L2 com o Registry real da 137
     6. p-instances — a superficie L2: marca local, nenhum contrato novo

   AS DUAS DISCIPLINAS QUE ELE HERDA DOS MOTORES
   =============================================
   REGRA 9 — `innerHTML` so recebe "". Todo texto entra por textContent e todo
   elemento por createElement. As tabelas desta tela sao dados literais, e literal
   a regra permitiria — mas um guardiao que precisa DECIDIR se a string era
   literal decide errado no dia em que ela vier de uma variavel montada, e esse
   dia chega sem aviso.

   NENHUM ENDERECO A MAO — os enderecos vem de window.TRIVIU_ENDERECOS. Nem os
   vivos, nem os orfaos. Um endereco digitado aqui envelheceria em silencio, e
   quatro orfaos com codigo vivo nesta chain sao a razao de a regra existir.
   ========================================================================== */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var TRACO = "—";   /* o traco que significa "nao lido". Nunca um zero. */

  function limpar(el) { while (el && el.firstChild) el.removeChild(el.firstChild); }
  function txt(el, s) { if (el) el.textContent = s; }

  /* novo(tag, classe, texto) — o unico construtor de elemento deste arquivo.
     Texto entra por textContent, sempre, sem excecao e sem ramo alternativo. */
  function novo(tag, cls, conteudo) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (conteudo !== undefined && conteudo !== null) e.textContent = String(conteudo);
    return e;
  }
  function celula(linha, cls, conteudo) { var td = novo("td", cls, conteudo); linha.appendChild(td); return td; }

  function num(n, casas) {
    if (n === null || n === undefined || !isFinite(n)) return TRACO;
    return Number(n).toLocaleString("en-US", { minimumFractionDigits: casas, maximumFractionDigits: casas });
  }
  function usd(n, casas) {
    if (n === null || n === undefined || !isFinite(n)) return TRACO;
    var c = casas === undefined ? 2 : casas;
    return (n < 0 ? "-$" : "$") + num(Math.abs(n), c);
  }

  /* ==================================================================== TEMA ==
     O pedido do fundador foi literal: "falta o modal para trocar de claro e
     escuro". O CSS ja respondia a data-theme em cinco pontos e existia um botao
     com o icone; nao existia controle nem handler, entao o atributo existia e
     ninguem podia move-lo.

     Sao TRES estados e nao dois, e o terceiro nao e enfeite: "seguir o sistema" e
     a ausencia de escolha gravada. Um par claro/escuro obriga a gravar uma
     preferencia so para usar a pagina, e a partir dai o computador pode virar
     noite sem que a pagina acompanhe. Seguir o sistema e representado por
     APAGAR a chave, nao por gravar a palavra "system" — assim os motores, que
     leem a mesma chave e caem em prefers-color-scheme quando ela falta, chegam
     na mesma conclusao sem conhecerem este arquivo.

     A chave e `triviu-theme`, a mesma de /js/console-lp.js e /js/console.js.
     Duas chaves seriam dois temas discordando na mesma tela. */
  var CHAVE_TEMA = "triviu-theme";

  function temaGravado() {
    try {
      var s = localStorage.getItem(CHAVE_TEMA);
      return (s === "dark" || s === "light") ? s : null;
    } catch (e) { return null; }
  }
  function temaDoSistema() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  function temaEfetivo() { return temaGravado() || temaDoSistema(); }

  function pintarTema() {
    var t = temaEfetivo();
    document.documentElement.setAttribute("data-theme", t);

    var icone = $("themeIcon");
    if (icone) icone.setAttribute("href", t === "dark" ? "#i-sun" : "#i-moon");

    var botao = $("btnTheme");
    if (botao) botao.setAttribute("aria-label", "Theme — currently " + t + ". Choose light, dark or follow the system.");

    /* O rotulo do escolhido, e o do sistema, que muda sozinho. */
    var escolhido = temaGravado() || "system";
    var grupo = document.querySelectorAll("[data-tema]");
    for (var i = 0; i < grupo.length; i++) {
      var marcado = grupo[i].getAttribute("data-tema") === escolhido;
      grupo[i].setAttribute("aria-checked", marcado ? "true" : "false");
      /* TABINDEX ROTATIVO. Um radiogroup tem UMA parada de Tab, nao tres: o
         Tab entra no grupo, as setas andam dentro dele, o Tab sai. Sem isto o
         teclado tratava tres radios como tres botoes independentes — que e
         justamente o que o role="radio" prometia ao leitor de tela que eles
         nao eram. A promessa estava na marcacao e o comportamento nao existia. */
      grupo[i].setAttribute("tabindex", marcado ? "0" : "-1");
    }
    txt($("temaSistemaAgora"), temaDoSistema());
    txt($("temaAtivo"), t + (temaGravado() ? "" : " · following the system"));
  }

  function escolherTema(valor) {
    try {
      if (valor === "system") localStorage.removeItem(CHAVE_TEMA);
      else localStorage.setItem(CHAVE_TEMA, valor);
    } catch (e) {}
    pintarTema();
  }

  /* ======================================================= FOCO NO MODAL ==
     `aria-modal="true"` diz ao leitor de tela que o resto da pagina nao existe
     enquanto o dialogo estiver aberto. O teclado nao lia esse atributo: o Tab
     saia do dialogo e ia passear pelo cabecalho e pelo trilho atras do veu,
     visitando controles que a pessoa nao consegue ver. A marcacao afirmava uma
     garantia que o codigo nao dava — a cicatriz M-1 desta casa, na mesma forma.
     Tres pecas resolvem, e as tres sao necessarias: prender o Tab, lembrar de
     onde o foco veio, e devolve-lo ao fechar. */
  var focoAnterior = null;

  /* `a[href]` e nao `[href]`, e a diferenca custou um teste.
     `[href]` tambem casa com <use href="#i-sun"> — os icones SVG do proprio
     dialogo. A lista voltava com quatro nos de SVG na frente, `primeiro` era um
     <use>, e `.focus()` num <use> nao faz nada e nao reclama. O Tab ficava
     PRESO no botao "Done" em vez de circular: preventDefault ja tinha comido a
     tecla e o foco nao ia a lugar nenhum. A cerca parecia funcionar porque o
     foco nao escapava — pelo motivo errado.
     O `instanceof HTMLElement` fecha a mesma porta pelo outro lado: [tabindex]
     tambem alcanca SVG. Um seletor que presume o formato do ambiente e a
     cicatriz desta casa, e ela veio em CSS aqui do mesmo jeito. */
  function focaveis(raiz) {
    var todos = raiz.querySelectorAll('a[href],button,input,select,textarea,[tabindex]');
    var vivos = [];
    for (var i = 0; i < todos.length; i++) {
      var e = todos[i];
      if (!(e instanceof HTMLElement)) continue;           /* <use>, <svg>, e afins */
      if (e.disabled) continue;
      if (e.getAttribute("tabindex") === "-1") continue;   /* o radio nao-marcado */
      if (!e.getClientRects().length) continue;            /* escondido de fato */
      vivos.push(e);
    }
    return vivos;
  }

  function abrirModal(id) {
    var o = $(id); if (!o) return;
    focoAnterior = document.activeElement;
    o.classList.add("show");
    /* O foco entra no que ESTA escolhido, nao no primeiro da lista: num
       radiogroup o primeiro Tab pousa na escolha vigente. */
    var alvo = o.querySelector('[role="radio"][aria-checked="true"]') || focaveis(o)[0];
    if (alvo) alvo.focus();
  }

  function fecharModais() {
    var abertos = document.querySelectorAll(".ov.show");
    if (!abertos.length) return;
    for (var i = 0; i < abertos.length; i++) abertos[i].classList.remove("show");
    /* Devolver o foco nao e cortesia. Sem isso ele cai no <body> e o proximo
       Tab recomeca a pagina do zero — quem fechou o dialogo no meio da tela de
       assinatura teria de reatravessar o console inteiro para voltar. */
    if (focoAnterior && document.contains(focoAnterior) && focoAnterior.getClientRects().length) {
      focoAnterior.focus();
    }
    focoAnterior = null;
  }

  pintarTema();

  /* O sistema pode mudar embaixo da pagina. Se o usuario escolheu, respeita a
     escolha; se esta seguindo o sistema, seguir de verdade — inclusive depois. */
  if (window.matchMedia) {
    var mq = window.matchMedia("(prefers-color-scheme: dark)");
    var aoMudar = function () { if (!temaGravado()) pintarTema(); };
    if (mq.addEventListener) mq.addEventListener("change", aoMudar);
    else if (mq.addListener) mq.addListener(aoMudar);
  }

  /* ============================================================== NAVEGACAO ==
     Catorze paineis, um visivel. O endereco carrega a tela para que um link
     para uma tela funcione e o botao de voltar do navegador tambem — sem isso
     "abra a aba Contracts" nao e uma frase que se possa escrever num link. */
  var TELAS = ["over", "vaults", "liquidity", "fence", "strategy", "lp", "ops",
               "analytics", "layers", "refs", "contracts", "instances", "profile", "help"];
  var telaAtual = "over";

  function irPara(p, comHash, mover) {
    if (TELAS.indexOf(p) < 0) p = "over";
    telaAtual = p;
    var botoes = document.querySelectorAll(".navb");
    for (var i = 0; i < botoes.length; i++) {
      if (botoes[i].getAttribute("data-p") === p) botoes[i].setAttribute("aria-current", "page");
      else botoes[i].removeAttribute("aria-current");
    }
    var paineis = document.querySelectorAll(".pane");
    for (var j = 0; j < paineis.length; j++) {
      if (paineis[j].id === "p-" + p) paineis[j].classList.add("on");
      else paineis[j].classList.remove("on");
    }
    if (comHash !== false && window.location.hash !== "#" + p) {
      try { history.replaceState(null, "", "#" + p); } catch (e) {}
    }
    if (p === "lp") desenharPesquisaLP();

    /* As tabelas do motor ganham tabindex quando transbordam, e quem decide isso
       e ajustarRolagem(), la dentro de /js/console-lp.js, medindo scrollWidth. Num
       painel escondido a medida da ZERO e a tabela fica sem a parada de teclado
       que ela precisa quando aparecer. O motor ja recalcula no resize, entao a
       troca de painel emite um resize em vez de este arquivo alcancar a funcao —
       alcanca-la exigiria expo-la, e expor uma interna para uso externo e como se
       perde a fronteira que mantem o caminho de assinatura pequeno. */
    window.dispatchEvent(new Event("resize"));
    window.scrollTo({ top: 0, behavior: "instant" });

    /* ── o foco acompanha a tela ──
       Sem isto o foco fica no botao do trilho enquanto quatorze telas trocam
       atras dele: o proximo Tab reinicia o menu em vez de entrar no que acabou
       de abrir, e quem usa leitor de tela nao recebe nada — a tela nova esta
       ali, mas nada disse que chegou.
       O foco vai para o painel, que e uma <section role="region"> com nome, e
       ai o proprio evento de foco anuncia o nome da tela. E por isso que NAO ha
       tambem uma mensagem na regiao viva: seriam dois anuncios para um evento.
       Nao move na CARGA — na carga o foco pertence ao topo do documento. */
    if (mover !== false) {
      var painel = $("p-" + p);
      if (painel) painel.focus();
    }
    ajustarTabelasRolantes();
  }

  /* ================================== TABELAS QUE ROLAM DE LADO (WCAG 2.1.1) ==
     Medido a 500px de largura, na tela que assina: TRES caixas `.tscroll` de
     p-lp transbordam (675>419, 580>419, 566>419) e NENHUMA e alcancavel por
     teclado. `.tscroll` e so `overflow-x:auto`: quem usa mouse arrasta, quem usa
     toque desliza, e quem so tem teclado nao chega — o Tab passa por cima da
     div, e dentro de uma tabela de dados nao ha nada focavel para segurar o
     foco. As colunas escondidas de p-lp incluem "exits" e "time in band", que
     sao as que contam o que deu errado. Nivel A.
     A regra nao e minha invencao: o motor ja resolve isto para as caixas dele
     em ajustarRolagem() — tabindex e role quando scrollWidth passa clientWidth,
     e os dois removidos quando nao passa. Aqui e a mesma regra aplicada a
     marcacao desta casca, com uma peca a mais: NOME. Um role="region" sem nome
     acessivel nao vira marco nenhum e anuncia "regiao" e mais nada; o nome sai
     do titulo que ja esta na tela, por referencia, para nao existir duas vezes.
     O anel de foco vem de graca: a regra global de :focus-visible ja alcanca
     [tabindex]. */
  var contadorTitulo = 0;
  function ajustarTabelasRolantes() {
    var caixas = document.querySelectorAll(".tscroll");
    for (var i = 0; i < caixas.length; i++) {
      var c = caixas[i];
      if (!c.getClientRects().length) continue;          /* painel escondido mede zero */
      if (c.scrollWidth > c.clientWidth + 1) {
        c.setAttribute("tabindex", "0");
        c.setAttribute("role", "region");
        if (!c.getAttribute("aria-labelledby")) {
          var dono = (c.closest && (c.closest(".panel") || c.closest(".pane"))) || null;
          var titulo = dono ? dono.querySelector("h1,h2,h3") : null;
          if (titulo) {
            if (!titulo.id) titulo.id = "tab-" + (++contadorTitulo);
            c.setAttribute("aria-labelledby", titulo.id);
          }
        }
      } else {
        c.removeAttribute("tabindex");
        c.removeAttribute("role");
      }
    }
  }
  var tTabelas = null;
  window.addEventListener("resize", function () {
    if (tTabelas) clearTimeout(tTabelas);
    tTabelas = setTimeout(ajustarTabelasRolantes, 160);   /* atras do debounce do motor */
  });

  document.addEventListener("click", function (e) {
    var nb = e.target.closest ? e.target.closest(".navb") : null;
    if (nb && nb.getAttribute("data-p")) { irPara(nb.getAttribute("data-p")); return; }
    var g = e.target.closest ? e.target.closest("[data-ir]") : null;
    if (g) { irPara(g.getAttribute("data-ir")); return; }
    var t = e.target.closest ? e.target.closest("[data-tema]") : null;
    if (t) { escolherTema(t.getAttribute("data-tema")); return; }
    var fecha = e.target.closest ? e.target.closest("[data-fechar]") : null;
    if (fecha) { fecharModais(); return; }
    if (e.target.classList && e.target.classList.contains("ov")) { fecharModais(); return; }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { fecharModais(); return; }

    var aberto = document.querySelector(".ov.show");

    /* ── a cerca do Tab, so enquanto ha dialogo aberto ── */
    if (aberto && e.key === "Tab") {
      var lista = focaveis(aberto);
      if (!lista.length) { e.preventDefault(); return; }
      var primeiro = lista[0], ultimo = lista[lista.length - 1], onde = document.activeElement;
      if (!aberto.contains(onde)) { e.preventDefault(); primeiro.focus(); return; }
      if (e.shiftKey && onde === primeiro) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && onde === ultimo) { e.preventDefault(); primeiro.focus(); }
      return;
    }

    /* ── as setas dentro do radiogroup (W3C ARIA APG, padrao radio) ──
       Mover o foco TAMBEM escolhe: e o que um grupo de radio faz desde sempre,
       e um grupo que so move sem escolher obriga a pessoa a apertar espaco
       depois, sem nada na tela dizendo que falta apertar. */
    var r = document.activeElement;
    if (!r || !r.getAttribute || r.getAttribute("role") !== "radio" || !r.closest) return;
    var grupo = r.closest('[role="radiogroup"]');
    if (!grupo) return;
    var radios = [].slice.call(grupo.querySelectorAll('[role="radio"]'));
    var i = radios.indexOf(r), passo = 0, absoluto = -1;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") passo = 1;
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") passo = -1;
    else if (e.key === "Home") absoluto = 0;
    else if (e.key === "End") absoluto = radios.length - 1;
    else return;
    e.preventDefault();
    var alvo = absoluto >= 0 ? radios[absoluto] : radios[(i + passo + radios.length) % radios.length];
    if (!alvo) return;
    escolherTema(alvo.getAttribute("data-tema"));   /* pintarTema() move o tabindex */
    alvo.focus();
  });

  ["btnTheme", "btnThemeProfile"].forEach(function (id) {
    var b = $(id);
    if (b) b.addEventListener("click", function () { abrirModal("temaOv"); });
  });

  /* O botao de leitura de p-contracts nao le nada por conta propria: ele aciona
     o do motor. Um segundo leitor de chain neste arquivo seria um segundo lugar
     onde um seletor pode ser digitado a mao, e o guardiao de ABI so vigia o
     motor — a duplicata passaria por baixo dele. Entao nao ha duplicata. */
  if ($("ct-ler") && $("lp-ler")) {
    $("ct-ler").addEventListener("click", function () {
      $("lp-ler").click();

      /* ── o beco sem saida ──
         O motor tem TRES vozes e a terceira e a recusa de campo: marca
         aria-invalid, escreve a razao no span que o campo referencia em
         aria-describedby, e manda o foco para o campo. Esse desenho e o certo —
         a razao e lida pelo mesmo evento de foco que poe o cursor no conserto —
         e ele pressupoe uma coisa que aqui nao vale: que o campo esteja VISIVEL.
         Vindo deste botao, o campo esta dentro de p-lp, que esta escondida.
         Medido: a razao nao aparece, o `.focus()` num elemento em display:none
         nao acontece e nao reclama, e nada entra em regiao viva porque a recusa
         de campo deliberadamente nao usa uma. Apertar "Read the chain" sem
         endereco era, desta tela, silencio absoluto — nada na tela, nada no
         leitor de tela, e o foco onde estava. WCAG 3.3.1, nivel A.
         A recusa e SINCRONA (recusar() e depois return, antes de qualquer
         promessa), entao o veredito ja esta no DOM nesta linha. A correcao nao
         revalida nada: le o julgamento do motor e repete as PALAVRAS do motor,
         e leva a pessoa ate o unico campo onde da para consertar. */
      var campo = $("lp-endereco");
      if (!campo || campo.getAttribute("aria-invalid") !== "true") return;
      var razao = ($("lp-endereco-erro").textContent || "").trim();
      txt($("vozAlerta"), razao + " The address field is on the Provide liquidity screen, and you are being taken to it.");
      irPara("lp");
      campo.focus();
    });
  }

  /* ================================================ AS DUAS VOZES DA CASCA ==
     O motor ja tem as suas tres vozes e elas estao certas: #lp-estado e
     role="status", #lp-erro e role="alert", e cada passo do fluxo carrega o seu
     proprio status. Nada disso foi reescrito.
     O buraco nao estava no motor, estava na moldura. Essas regioes moram DENTRO
     de p-lp, e um painel em display:none sai da arvore de acessibilidade — uma
     regiao viva escondida e uma regiao viva muda. Em p-contracts o botao "Read
     the chain" aciona exatamente esse motor, e quem usa leitor de tela apertava
     o botao e nao ouvia nem que comecou, nem que chegou, nem que falhou.
     A correcao ESPELHA, nao duplica: o texto sai de onde o motor escreveu, esta
     casca nao inventa uma frase nem le chain nenhuma, e o espelho fica calado
     quando p-lp esta aberta — la o original ja fala, e dois anuncios da mesma
     frase sao pior que nenhum. */
  function espelhar(idOrigem, idDestino) {
    var origem = $(idOrigem), destino = $(idDestino);
    if (!origem || !destino || !window.MutationObserver) return;
    var obs = new MutationObserver(function () {
      var t = (origem.textContent || "").trim();
      if (telaAtual === "lp" || !t) { destino.textContent = ""; return; }
      if (t !== destino.textContent) destino.textContent = t;
    });
    obs.observe(origem, { childList: true, characterData: true, subtree: true });
  }
  espelhar("lp-estado", "vozEstado");   /* comecou / andou / chegou */
  espelhar("lp-erro", "vozAlerta");     /* parou, e por que */

  /* ====================================================== PESQUISA DAS LPs ==
     As oito piscinas medidas. Nao ha nada de chain aqui: e leitura de 7 dias de
     eventos Swap feita em 2026-08-10, transcrita byte a byte do console anterior
     e nao remedida — e por isso a data aparece na tela em vez de ficar so aqui.

     Uma tabela que nao diz QUANDO foi medida envelhece sem avisar, e uma que nao
     diz quantos blocos leu passa uma amostra por censo. As duas coisas estao
     impressas na propria tela, na secao 4. */
  var LP_MEDIDO = {
    meta: {
      medidoEm: "2026-08-10",
      janelaDias: 7,
      arbitrum: { bloco: 493140000, blocos: 2419200, janelas: 242, falhas: 0,
                  gwei: 0.020024, nativo: "ETH", precoNativo: 1876.53,
                  abrirFechar: 0.0708, rpc: "arb1.arbitrum.io/rpc" },
      polygon:  { bloco: 91777163, blocos: 403200, janelas: 4033, falhas: 0,
                  gwei: 277.26, nativo: "POL", precoNativo: 0.076812,
                  abrirFechar: 0.0401, rpc: "private endpoint" }
    },
    pools: [
      { rede: "arbitrum", par: "USDC/WETH", tier: 500, swaps: 97786, linhas: [
        [0.05,500,51.06,4.90,6999886,0],[0.05,2000,51.61,19.79,6999886,0],
        [0.05,5000,51.70,49.57,6999886,0],[0.05,20000,51.66,198.15,6999886,0],
        [0.05,50000,51.48,493.69,6999886,0],[0.05,200000,50.58,1939.94,6999886,0],
        [0.10,500,25.42,2.44,13860471,0],[0.10,2000,25.98,9.96,13860471,0],
        [0.10,5000,26.08,25.01,13860471,0],[0.10,20000,26.11,100.16,13860471,0],
        [0.10,50000,26.08,250.04,13860471,0],[0.10,200000,25.85,991.32,13860471,0],
        [0.20,500,12.55,1.20,27292341,0],[0.20,2000,13.10,5.02,27292341,0],
        [0.20,5000,13.21,12.67,27292341,0],[0.20,20000,13.26,50.86,27292341,0],
        [0.20,50000,13.26,127.13,27292341,0],[0.20,200000,13.20,506.37,27292341,0]] },
      { rede: "arbitrum", par: "USDC/WETH", tier: 3000, swaps: 7356, linhas: [
        [0.05,500,45.78,4.39,1171875,0],[0.05,2000,46.27,17.75,1171875,0],
        [0.05,5000,46.20,44.29,1171875,0],[0.05,20000,45.62,174.98,1171875,0],
        [0.05,50000,44.29,424.60,1171875,0],[0.05,200000,38.93,1493.02,1171875,0],
        [0.10,500,22.75,2.18,2320767,0],[0.10,2000,23.24,8.92,2320767,0],
        [0.10,5000,23.29,22.33,2320767,0],[0.10,20000,23.11,88.66,2320767,0],
        [0.10,50000,22.71,217.72,2320767,0],[0.10,200000,20.91,801.98,2320767,0],
        [0.20,500,11.19,1.07,4569044,0],[0.20,2000,11.68,4.48,4569044,0],
        [0.20,5000,11.73,11.24,4569044,0],[0.20,20000,11.67,44.76,4569044,0],
        [0.20,50000,11.56,110.86,4569044,0],[0.20,200000,11.06,424.19,4569044,0]] },
      { rede: "arbitrum", par: "USDC/WBTC", tier: 500, swaps: 31059, linhas: [
        [0.05,500,39.72,3.81,2265668,0],[0.05,2000,40.21,15.42,2265668,0],
        [0.05,5000,40.20,38.54,2265668,0],[0.05,20000,39.79,152.62,2265668,0],
        [0.05,50000,38.86,372.55,2265668,0],[0.05,200000,35.03,1343.29,2265668,0],
        [0.10,500,19.75,1.89,4486791,0],[0.10,2000,20.24,7.76,4486791,0],
        [0.10,5000,20.28,19.44,4486791,0],[0.10,20000,20.14,77.26,4486791,0],
        [0.10,50000,19.83,190.10,4486791,0],[0.10,200000,18.44,707.20,4486791,0],
        [0.20,500,9.72,0.93,8834066,0],[0.20,2000,10.21,3.91,8834066,0],
        [0.20,5000,10.26,9.83,8834066,0],[0.20,20000,10.21,39.16,8834066,0],
        [0.20,50000,10.12,97.03,8834066,0],[0.20,200000,9.74,373.53,8834066,0]] },
      { rede: "arbitrum", par: "USDC.e/WETH", tier: 500, swaps: 10171, linhas: [
        [0.05,500,29.94,2.87,741612,0],[0.05,2000,30.43,11.67,741612,0],
        [0.05,5000,30.42,29.16,741612,0],[0.05,20000,30.02,115.14,741612,0],
        [0.05,50000,29.12,279.16,741612,0],[0.05,200000,25.45,976.11,741612,0],
        [0.10,500,14.86,1.42,1468608,0],[0.10,2000,15.35,5.89,1468608,0],
        [0.10,5000,15.39,14.75,1468608,0],[0.10,20000,15.25,58.50,1468608,0],
        [0.10,50000,14.95,143.28,1468608,0],[0.10,200000,13.61,522.02,1468608,0],
        [0.20,500,7.31,0.70,2891576,0],[0.20,2000,7.80,2.99,2891576,0],
        [0.20,5000,7.85,7.52,2891576,0],[0.20,20000,7.80,29.92,2891576,0],
        [0.20,50000,7.71,73.94,2891576,0],[0.20,200000,7.34,281.51,2891576,0]] },
      { rede: "arbitrum", par: "USDC/ARB", tier: 500, swaps: 1562, linhas: [
        [0.05,500,10.36,0.99,113883,0],[0.05,2000,10.85,4.16,113883,0],
        [0.05,5000,10.83,10.38,113883,0],[0.05,20000,10.44,40.03,113883,0],
        [0.05,50000,9.56,91.63,113883,0],[0.05,200000,6.09,233.55,113883,0],
        [0.10,500,5.13,0.49,225530,0],[0.10,2000,5.62,2.15,225530,0],
        [0.10,5000,5.66,5.42,225530,0],[0.10,20000,5.52,21.16,225530,0],
        [0.10,50000,5.22,50.05,225530,0],[0.10,200000,3.93,150.66,225530,0],
        [0.20,500,2.52,0.24,443967,0],[0.20,2000,3.00,1.15,443967,0],
        [0.20,5000,3.05,2.92,443967,0],[0.20,20000,3.00,11.51,443967,0],
        [0.20,50000,2.91,27.90,443967,0],[0.20,200000,2.55,97.75,443967,0]] },
      { rede: "polygon", par: "USDC.e/LINK", tier: 3000, swaps: 1876, linhas: [
        [0.05,500,26.63,2.55,45483,0],[0.05,2000,26.60,10.20,45483,0],
        [0.05,5000,25.94,24.87,45483,0],[0.05,20000,22.32,85.61,45483,0],
        [0.05,50000,17.62,168.94,45483,0],[0.05,200000,8.16,313.02,45483,0]] },
      { rede: "polygon", par: "USDC.e/WETH", tier: 500, swaps: 11104, linhas: [
        [0.05,500,38.98,3.74,269186,0],[0.05,2000,39.03,14.97,269186,0],
        [0.05,5000,38.60,37.01,269186,0],[0.05,20000,36.32,139.30,269186,0],
        [0.05,50000,32.44,311.05,269186,0],[0.05,200000,20.44,784.14,269186,0]] },
      { rede: "polygon", par: "USDC.e/WBTC", tier: 500, swaps: 9851, linhas: [
        [0.05,500,33.54,3.22,238762,0],[0.05,2000,33.59,12.88,238762,0],
        [0.05,5000,33.15,31.79,238762,0],[0.05,20000,30.88,118.45,238762,0],
        [0.05,50000,27.06,259.49,238762,0],[0.05,200000,16.24,622.98,238762,0]] }
    ]
  };
  var LP_TAMANHOS = [500, 2000, 5000, 20000, 50000, 200000];

  /* O ROTEADOR. Nao recomenda e nao ordena por opiniao: filtra a medicao pelo que
     o operador trouxe, e ordena pelo que saiu. O que nao pode mostrar, diz que
     nao pode mostrar. */
  function lpRotear(capital, faixa, rede) {
    var linhas = [];
    LP_MEDIDO.pools.forEach(function (p) {
      if (rede && p.rede !== rede) return;
      p.linhas.forEach(function (l) {
        if (l[0] !== faixa || l[1] !== capital) return;
        linhas.push({ rede: p.rede, par: p.par, tier: p.tier, swaps: p.swaps,
                      faixa: l[0], tamanho: l[1], apr: l[2], liq: l[3], tvl: l[4], saidas: l[5] });
      });
    });
    return linhas.sort(function (a, b) { return b.apr - a.apr; });
  }

  /* O preco de preferir uma rede. Nem escondido, nem editorializado: a melhor
     opcao medida dentro da escolha, contra a melhor medida no geral, na mesma
     faixa e no mesmo tamanho. */
  function lpCustoDaEscolha(capital, faixa, rede) {
    if (!rede) return null;
    var dentro = lpRotear(capital, faixa, rede)[0];
    var geral = lpRotear(capital, faixa, null)[0];
    if (!dentro || !geral || dentro.rede === geral.rede) return null;
    return { dentro: dentro, geral: geral,
             pontos: geral.apr - dentro.apr,
             dolares: geral.liq - dentro.liq,
             ano: (geral.liq - dentro.liq) * (365 / 7) };
  }

  function nomeRede(r) { return r === "arbitrum" ? "Arbitrum" : "Polygon"; }

  function linhaVazia(corpo, colunas, texto) {
    var tr = document.createElement("tr");
    var td = novo("td", "faint", texto);
    td.colSpan = colunas;
    tr.appendChild(td); corpo.appendChild(tr);
  }

  function desenharPesquisaLP() {
    if (!$("lpRows")) return;
    var cap = parseInt($("lpSize").value, 10);
    var faixa = parseFloat($("lpBand").value);
    var rede = $("lpChain").value;
    var linhas = lpRotear(cap, faixa, rede);

    txt($("lpSizeState"), usd(cap, 0) + " · ±" + (faixa * 100) + "%");
    txt($("lpWindow"), "7 days · measured " + LP_MEDIDO.meta.medidoEm);

    /* ── a tabela ── */
    var corpo = $("lpRows"); limpar(corpo);
    if (!linhas.length) {
      linhaVazia(corpo, 11, "Nothing was measured for " + usd(cap, 0) + " at ±" + (faixa * 100) + "%" +
        (rede ? " on " + nomeRede(rede) : "") + ". That is an absence of measurement, not an absence of " +
        "opportunity — and the console will not fill it with a guess.");
    } else {
      linhas.forEach(function (r, i) {
        var tr = document.createElement("tr");
        celula(tr, "num mono faint", i + 1);
        celula(tr, null, nomeRede(r.rede));
        var tdPar = celula(tr, null, r.par + " ");
        tdPar.setAttribute("translate", "no");
        tdPar.appendChild(novo("span", "faint", (r.tier / 100) + "bps"));
        celula(tr, "num mono", (r.tier / 100) + "bps");
        celula(tr, "num mono", "±" + (r.faixa * 100) + "%");
        var tdLiq = celula(tr, "num mono " + (r.liq > 0 ? "win" : "lose"));
        tdLiq.appendChild(novo("b", null, (r.liq > 0 ? "+" : "") + usd(r.liq)));
        var tdApr = celula(tr, "num mono " + (r.apr > 0 ? "win" : "lose"));
        tdApr.appendChild(novo("b", null, num(r.apr, 2) + "%"));
        celula(tr, "num mono", usd(r.tvl, 0));
        celula(tr, "num mono " + (r.saidas ? "lose" : "faint"), r.saidas);
        celula(tr, "num mono faint", r.saidas ? TRACO : "100%");
        celula(tr, "num mono faint", num(r.swaps, 0));
        corpo.appendChild(tr);
      });
    }

    /* ── o custo da escolha de rede ── */
    var custo = lpCustoDaEscolha(cap, faixa, rede);
    $("lpCostPanel").hidden = !custo;
    var alvo = $("lpCostBody"); limpar(alvo);
    if (custo) {
      var pior = custo.pontos > 0;
      alvo.appendChild(novo("p", "small", "You chose " + nomeRede(rede) + ". That is a legitimate choice — " +
        "familiarity with a network is worth something real, and this console will not override it. It will, " +
        "however, tell you the price."));

      var env = novo("div", "tscroll"); env.style.marginTop = "12px";
      var tab = document.createElement("table"); tab.setAttribute("translate", "no");
      var thead = document.createElement("thead"); var trh = document.createElement("tr");
      ["choice", "best measured pool", "net over 7 days", "annualised"].forEach(function (h) {
        trh.appendChild(novo("th", null, h));
      });
      thead.appendChild(trh); tab.appendChild(thead);
      var tb = document.createElement("tbody");
      [[custo.dentro, "— yours"], [custo.geral, "— best measured"]].forEach(function (par) {
        var r = par[0];
        var tr = document.createElement("tr");
        var td0 = celula(tr, null, nomeRede(r.rede) + " ");
        td0.appendChild(novo("span", "faint", par[1]));
        celula(tr, null, r.par + " " + (r.tier / 100) + "bps").setAttribute("translate", "no");
        celula(tr, "num mono", usd(r.liq));
        celula(tr, "num mono").appendChild(novo("b", null, num(r.apr, 2) + "%"));
        tb.appendChild(tr);
      });
      tab.appendChild(tb); env.appendChild(tab); alvo.appendChild(env);

      var p2 = novo("p", "small");
      p2.style.marginTop = "12px";
      p2.appendChild(document.createTextNode("At " + usd(cap, 0) + ", staying on " + nomeRede(rede) + " " +
        (pior ? "costs " : "gains ")));
      p2.appendChild(novo("b", pior ? "lose" : "win", num(Math.abs(custo.pontos), 2) + " percentage points"));
      p2.appendChild(document.createTextNode(" — " + usd(Math.abs(custo.dolares)) + " over the seven days " +
        "measured, " + usd(Math.abs(custo.ano), 0) + " if a year looked like that week. It will not, but the " +
        "comparison between two numbers measured the same way still holds."));
      alvo.appendChild(p2);
    }

    /* ── a inversao do ranking ── */
    var cab = $("lpFlipHead"); limpar(cab);
    cab.appendChild(novo("th", null, "rank"));
    LP_TAMANHOS.forEach(function (t) { cab.appendChild(novo("th", "num mono", usd(t, 0))); });

    var porTam = LP_TAMANHOS.map(function (t) { return lpRotear(t, faixa, rede); });
    var fundo = 0;
    porTam.forEach(function (c) { if (c.length > fundo) fundo = c.length; });
    var corpoFlip = $("lpFlipRows"); limpar(corpoFlip);
    if (!fundo) {
      linhaVazia(corpoFlip, LP_TAMANHOS.length + 1, "Nothing measured in this band.");
    } else {
      var quantas = Math.min(fundo, 6);
      for (var i = 0; i < quantas; i++) {
        var tr = document.createElement("tr");
        celula(tr, "num mono faint", i + 1);
        for (var k = 0; k < porTam.length; k++) {
          var r = porTam[k][i];
          if (!r) { celula(tr, "faint", TRACO); continue; }
          var td = celula(tr, null); td.setAttribute("translate", "no");
          td.appendChild(novo("span", "num mono " + (r.apr > 0 ? "win" : "lose"), num(r.apr, 1) + "%"));
          td.appendChild(document.createElement("br"));
          var sub = novo("span", "faint", r.par + " " + (r.tier / 100) + " · " + (r.rede === "arbitrum" ? "ARB" : "POL"));
          sub.style.fontSize = "11px";
          td.appendChild(sub);
        }
        corpoFlip.appendChild(tr);
      }
    }

    /* ── e o que acabou de acontecer, dito em voz alta ──
       A tabela se reordena inteira a cada troca de select. Quem enxerga ve;
       quem usa leitor de tela fica com o foco no <select> e nada avisa que onze
       colunas mudaram atras. A frase e a MESMA informacao da tela — quantas
       piscinas, para que tamanho, e qual lidera — e nao acrescenta conselho. */
    var voz = linhas.length
      ? linhas.length + " pool" + (linhas.length === 1 ? "" : "s") + " measured for " + usd(cap, 0) +
        " at ±" + (faixa * 100) + "%" + (rede ? " on " + nomeRede(rede) : ", all networks") +
        ". Leading: " + linhas[0].par + " " + (linhas[0].tier / 100) + "bps on " + nomeRede(linhas[0].rede) +
        ", " + num(linhas[0].apr, 2) + "% annualised."
      : "Nothing was measured for " + usd(cap, 0) + " at ±" + (faixa * 100) + "%" +
        (rede ? " on " + nomeRede(rede) : "") + ".";
    txt($("lpVoz"), voz);

    ajustarTabelasRolantes();

    /* ── a procedencia ── */
    var prov = $("lpProv"); limpar(prov);
    ["arbitrum", "polygon"].forEach(function (r) {
      var m = LP_MEDIDO.meta[r];
      var tr = document.createElement("tr");
      celula(tr, null, nomeRede(r));
      celula(tr, "num mono", LP_MEDIDO.meta.janelaDias + " days");
      celula(tr, "num mono", num(m.blocos, 0));
      celula(tr, "num mono", num(m.janelas, 0));
      celula(tr, "num mono " + (m.falhas ? "lose" : "win"), m.falhas);
      celula(tr, "num mono", m.gwei + " gwei");
      celula(tr, "num mono", m.nativo + " at " + usd(m.precoNativo, 4));
      celula(tr, "num mono", usd(m.abrirFechar, 4));
      prov.appendChild(tr);
    });
  }

  ["lpSize", "lpBand", "lpChain"].forEach(function (id) {
    var el = $(id); if (el) el.addEventListener("change", desenharPesquisaLP);
  });

  /* ================================================== O LIVRO-RAZAO NA TELA ==
     Vivos e ORFAOS na mesma tabela, e de proposito. Separa-los em duas telas
     deixaria a segunda sem leitor, e a lista de orfaos e justamente a que
     precisa ser vista: quatro contratos com codigo vivo nesta chain, um deles
     gemeo byte-exato do cofre oficial, todos respondendo a chamada como se
     fossem o certo. So o endereco os distingue.

     Nada disto e digitado aqui. Vem de window.TRIVIU_ENDERECOS. */
  function desenharLivro() {
    var L = window.TRIVIU_ENDERECOS;
    var corpo = $("ct-vivos");
    if (!corpo) return;
    if (!L) { limpar(corpo); linhaVazia(corpo, 3, "The address ledger did not load."); return; }

    var PAPEIS = {
      parameterRegistry: "ParameterRegistry — the whitelist, the rate and the treasury",
      triviuExecutor: "TriviuExecutor — the atomic arbitrage cycle",
      gasTank: "GasTank — a native-currency escrow, yours to withdraw",
      triviuLPVault: "TriviuLPVault — the shared LP router this console signs against"
    };
    limpar(corpo);
    Object.keys(L.VIVOS).forEach(function (k) {
      var tr = document.createElement("tr");
      var th = novo("th", null, PAPEIS[k] || k); th.scope = "row";
      tr.appendChild(th);
      celula(tr, "m", L.VIVOS[k]).setAttribute("translate", "no");
      var td = celula(tr, null);
      td.appendChild(novo("span", "pill ok", "live"));
      corpo.appendChild(tr);
    });

    var orf = $("ct-orfaos"); limpar(orf);
    L.ORFAOS.forEach(function (o) {
      var tr = document.createElement("tr");
      var th = novo("th", "m", o.endereco); th.scope = "row"; th.setAttribute("translate", "no");
      tr.appendChild(th);
      celula(tr, null, o.tipo).setAttribute("translate", "no");
      celula(tr, "num mono", o.nonce);
      celula(tr, "num mono", o.codigo + " bytes");
      var td = celula(tr, null);
      td.appendChild(novo("span", "pill bad", o.gemeoByteExato ? "byte-exact twin" : "orphan"));
      orf.appendChild(tr);
    });

    txt($("ct-medicao"), "Measured at block " + L.MEDICAO.bloco + " on chain " + L.MEDICAO.chainId +
      " · wave " + L.MEDICAO.onda);
    txt($("ct-safe"), L.CUSTODIA.safe);
    /* Ate 2026-08-22 esta linha imprimia "threshold 1 ... its only owner is ...
       Key separation today: NO", tudo saido de constante. A chain respondia 2 de
       3 no mesmo momento. A tela nao voltou a afirmar nenhum dos tres: quem quer
       o numero le getThreshold() e getOwners() no endereco acima, que esta na
       tela justamente para isso. Uma tela que nao sabe e diz que nao sabe vale
       mais que uma que sabia. */
    txt($("ct-safe-nota"), "Gnosis Safe. Owner of the registries, and the treasury the success fee is " +
      "routed to. Threshold, owner set and timelock are chain state and are not restated here — read " +
      "getThreshold() and getOwners() on the address above.");

    /* p-layers le o mesmo livro. Um segundo lugar com o mesmo endereco e a
       duplicata que o criterio 3 do aceite reprova. */
    txt($("l1Registry"), L.VIVOS.parameterRegistry);
    txt($("l1Chain"), "Polygon PoS · " + L.CHAIN_ID + " · live");
    txt($("lyVault"), L.VIVOS.triviuLPVault);
  }

  /* ================================================== INSTANCIAS — A CAMADA 2 ==
     Marca local. Nenhum contrato novo, e e esse o ponto da tela: a L2 e a
     superficie, e trocar a superficie nao pode tocar a camada de baixo. O que
     se guarda aqui e nome, sufixo e cor — e nada disso viaja para chain nenhuma.

     O logotipo aceita raster e RECUSA SVG. Um SVG carrega <script>, e este
     logotipo seria impresso no cabecalho de todas as telas. */
  var CHAVE_INST = "triviu-console-instancias";
  var COR_OK = /^#[0-9a-fA-F]{6}$/;
  var NOME_MAX = 60, SUFIXO_MAX = 40;

  function lerInstancias() {
    var brutas = [];
    try { brutas = JSON.parse(localStorage.getItem(CHAVE_INST) || "[]"); } catch (e) { brutas = []; }
    if (!Array.isArray(brutas)) brutas = [];
    /* Saneia na LEITURA e nao so na escrita: um localStorage adulterado a mao e
       a entrada mais barata que existe nesta pagina. */
    return brutas.filter(function (i) { return i && typeof i === "object"; }).map(function (i) {
      return {
        nome: String(i.nome || "Instance").slice(0, NOME_MAX),
        sufixo: String(i.sufixo || "").slice(0, SUFIXO_MAX),
        cor: COR_OK.test(String(i.cor || "")) ? i.cor : "#2743C7"
      };
    });
  }
  function gravarInstancias(lista) {
    try { localStorage.setItem(CHAVE_INST, JSON.stringify(lista)); } catch (e) {}
  }

  /* `aviso` so vem preenchido quando quem redesenhou foi uma ACAO da pessoa.
     Na carga a grade tambem e desenhada, e uma pagina que anuncia sozinha o seu
     proprio estado inicial ensina o usuario a ignorar a regiao viva. */
  function desenharInstancias(aviso) {
    var grade = $("instGrid");
    if (!grade) return;
    var lista = lerInstancias();
    limpar(grade);
    if (!lista.length) {
      grade.appendChild(novo("p", "small faint", "No label created yet. The console runs under the " +
        "protocol's own name until you make one."));
    } else {
      lista.forEach(function (i, idx) {
        var cartao = novo("div", "inst");
        var ponto = novo("span", "vdot");
        ponto.style.background = i.cor;   /* cor validada por COR_OK, seis hex e nada mais */
        cartao.appendChild(ponto);
        cartao.appendChild(novo("b", null, i.nome));
        if (i.sufixo) cartao.appendChild(novo("span", "faint", " " + i.sufixo));
        var apagar = novo("button", "mini ghost", "Remove");
        apagar.type = "button";
        apagar.addEventListener("click", function () {
          var atual = lerInstancias(); atual.splice(idx, 1); gravarInstancias(atual);
          desenharInstancias("Label " + i.nome + " removed. " + atual.length +
            " remaining. Nothing left this browser, and no chain was touched.");
        });
        cartao.appendChild(apagar);
        grade.appendChild(cartao);
      });
    }
    txt($("lyInst"), String(lista.length));
    if (aviso) txt($("instVoz"), aviso);
  }

  if ($("btnNewInst")) {
    $("btnNewInst").addEventListener("click", function () {
      var nome = ($("niName").value || "").trim();
      var sufixo = ($("niSub").value || "").trim();
      var cor = ($("niAccent").value || "").trim();
      if (!nome) { txt($("niErro"), "A label needs a name."); $("niName").focus(); return; }
      if (!COR_OK.test(cor)) { txt($("niErro"), "The accent must be six hex digits, like #2743C7."); return; }
      txt($("niErro"), "");
      var lista = lerInstancias();
      lista.push({ nome: nome.slice(0, NOME_MAX), sufixo: sufixo.slice(0, SUFIXO_MAX), cor: cor });
      gravarInstancias(lista);
      $("niName").value = ""; $("niSub").value = "";
      desenharInstancias("Label " + nome + " created, accent " + cor + ". " + lista.length +
        " in total. This is an L2 surface: it lives in this browser and reaches no chain.");
      $("niName").focus();
    });
  }

  /* ========================================================= CARGA ========== */
  desenharLivro();
  desenharInstancias();
  desenharPesquisaLP();

  ajustarTabelasRolantes();

  /* A tela de abertura e a que OPERA, nao a que resume.

     Ate 2026-08-13 o console abria em "over". O fundador testou e reportou que
     "nao se conecta com a carteira e nem chama para fazer as assinaturas" — e
     estava certo pelo motivo que ninguem tinha medido: nada estava quebrado.
     Ele caia no resumo, e das 14 telas do trilho 13 dizem "waiting". A unica
     que abre carteira, `lp`, e a SEXTA da lista, cercada de telas que anunciam
     que nao fazem nada. Uma pessoa que abre isso conclui que o produto nao
     funciona, e conclui certo a partir do que lhe foi mostrado.

     Medido no navegador antes de mexer aqui: com `p-lp` escondida o botao
     `lp-conectar` existia, nao estava desabilitado e tinha largura ZERO
     (offsetParent null). Clicar em "Provide liquidity" no trilho punha a tela
     em `block` e o botao em 136px. O caminho existia; ninguem era levado nele.

     O `#hash` continua mandando quando vem escrito, entao link para qualquer
     tela segue valendo. O que muda e o default: quem chega sem pedir tela
     nenhuma cai onde da para agir. */
  var inicial = (window.location.hash || "").replace(/^#/, "");
  irPara(TELAS.indexOf(inicial) >= 0 ? inicial : "lp", false, false);

  window.addEventListener("hashchange", function () {
    var h = (window.location.hash || "").replace(/^#/, "");
    if (TELAS.indexOf(h) >= 0) irPara(h, false, true);
  });
})();
