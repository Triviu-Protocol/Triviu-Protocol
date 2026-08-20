/* ═══════════════════════════════════════════════════════════════════════════
   TRIVIU · SELO — quatro atos, quatro lacres, e a travessia para a chain
   ═══════════════════════════════════════════════════════════════════════════

   POR QUE ESTE ARQUIVO EXISTE SEPARADO
   A CSP desta origem é `script-src 'self'` — sem `unsafe-inline`. O original
   trazia toda esta lógica num `<script>` no corpo da página, e nesta origem ela
   simplesmente não rodaria: a página apareceria parada no ato zero, com o
   documento em branco e nenhum erro visível ao visitante.

   O QR NÃO É GERADO AQUI, E ISSO É DE PROPÓSITO
   O original instanciava `new QRCode(...)` de uma biblioteca de CDN. Aqui o QR é
   um SVG estático servido de /selo/qr-contrato.svg, gerado uma vez e provado por
   decodificação. Zero biblioteca em runtime, zero terceiro, e o código que o
   visitante escaneia é o mesmo byte que passou na verificação.

   INGLÊS ÚNICO
   O original carregava um dicionário `STR` indexado por idioma com uma única
   entrada (`en`), um `.lang` no CSS sem botão no HTML, e um `#hint` que nascia em
   PORTUGUÊS e só virava inglês quando o JS rodava — um piscar na língua errada, e
   a língua errada permanente se o JS falhasse. O selo é inglês; o texto nasce
   inglês no HTML e a maquinaria de idioma saiu.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var CONTRATO = "https://polygonscan.com/address/0xEdB5Aa01fd055B3755439cE41B92b575eea1d273#code";

  var TXT = {
    hashtxt: "· Polygon 137 · compiled with v0.8.24 · verified on the explorer",
    /* A oração final era "Read the contract before signing anything: it proves what
       this page merely claims." Ela caiu em 2026-08-20 porque a Medusa mediu o que
       a prova indicada realmente cobre. O whitepaper (63 154 caracteres, 93 seções,
       19 de 19 do sumário) prova a taxa — e devolve ZERO ocorrência para Tesla,
       Bernoulli, Kelly, Ulam, Ars Conjectandi e Monte Carlo. O contrato prova menos
       ainda: bytecode não atesta atribuição histórica.
       A instrução fica; a promessa sobre o conteúdo alheio sai. Ela volta no dia em
       que o item aberto 5 do guia de marca for fechado — a nota de fontes vivendo no
       whitepaper — e não antes. */
    tag: "Logic, probability and management become the machine's code. Risk, "
       + "responsibility and return stay yours — written into the access control, "
       + "not delegated. Read the contract before signing anything.",
    pause: "Pause", play: "Resume", replay: "Play from the beginning",
    sealedBy: "sealed by", verifiedBy: "scan or click", anyone: "the verified contract"
  };

  var ACTS = [
    { label: 'act i · <b>the infrastructure</b>', d1: "Wardenclyffe · c. 1905", d2: "feewall.js",
      name: "N. Tesla", year: "c. MCMV", anoLegivel: "1905",
      rows: [
        ["He meant to deliver power to whoever needed it,", "<i>// the information is public. the execution is not.</i>"],
        ["and it was not physics that defeated him:", "<b>const</b> DEX = 0.003; <i>// the pool's toll on every swap</i>"],
        ["it was whoever already charged the toll.", "<b>const</b> wall = (1 - DEX) ** hops; <em>// 0.9910</em>"],
        ["", "<b>const</b> TRIVIU = registry.feeBps(); <em>// 3000 bps of PROFIT, never of principal</em>"],
        ["", "<b>const</b> CAP = MAX_FEE_BPS; <em>// 5000 — half the profit, clamped in bytecode</em>"],
        ["— paraphrased from Nikola Tesla", "<i>// the toll didn't change nature. it changed name.</i>"]] },

    { label: 'act ii · <b>the probability</b>', d1: "Ars Conjectandi · Basel, MDCCXIII", d2: "montecarlo.js",
      name: "J. Bernoulli", year: "MDCCXIII", anoLegivel: "1713",
      rows: [
        ["The more numerous the observations,", "<i>// law of large numbers — Bernoulli, 1713</i>"],
        ["the closer frequency comes to probability —", "<b>for</b> (<b>let</b> i = 0; i &lt; 100_000; i++)"],
        ["and that it worked once proves nothing.", "&nbsp;&nbsp;r.push(cycle(market()) - gas); <em>// Monte Carlo — Ulam, 1946. every try has a cost</em>"],
        ["— paraphrased from Jacob Bernoulli", "<i>// he couldn't know: here, converging means losing</i>"]] },

    { label: 'act iii · <b>the management</b>', d1: "Bell Telephone Laboratories · 1956", d2: "kelly.js",
      name: "J. L. Kelly Jr.", year: "MCMLVI", anoLegivel: "1956",
      rows: [
        ["Holding a real edge over the market,", "<i>// Kelly criterion, applied without mercy</i>"],
        ["there is an exact fraction to risk —", "<b>const</b> f = (b*p - q) / b;"],
        ["and risking more than it is ruin in the long run.", "<b>if</b> (f &lt;= 0) size = 0; <em>// no edge: don't bet</em>"],
        ["— paraphrased from John L. Kelly Jr.", "<i>// the formula that says stop more often than bet</i>"]] },

    { label: 'act iv · <b>you</b>', d1: "the part that stays yours", d2: "Triviu.sol",
      name: "", year: "", anoLegivel: "",
      rows: [
        ["The machine reads the logic, measures probability", "<i>// LPM — logic, probability, management: the machine's part</i>"],
        ["and sizes the position. That much it executes.", "agent.logic(feeWall).probability(mc).size(kelly);"],
        ["The risk is yours. The responsibility is yours.<br>The return follows from both.", "<i>// RRR — risk, responsibility, return: the access control</i>"],
        ["", "<b>address public immutable</b> dono; <i>// TriviuVault.sol:164 — \"dono\" is owner. fixed at construction</i>"],
        ["", "<b>function</b> sacar(<b>uint256</b>) <b>external</b> <u>soDono</u> <i>// \"sacar\" is withdraw. no ceiling, no delay, no one's approval</i>"],
        ["", "<b>return</b> profit; <i>// a consequence — last line, never the first</i>"]] }
  ];

  var $ = function (id) { return document.getElementById(id); };
  var scene = $("selo-scene"), chapEl = $("selo-chap"), ppBtn = $("selo-pp"), ppIcon = $("selo-ppIcon"),
      rpBtn = $("selo-rp"), dotsEl = $("selo-dots"), sealcap = $("selo-sealcap");
  if (!scene) return;

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var act = 0, steps = [], idx = 0, t0 = 0, elapsed = 0, playing = false, raf = null, done = false;

  var ICONS = {
    pause: '<rect x="2" y="1" width="3.4" height="12" rx="1"/><rect x="8.6" y="1" width="3.4" height="12" rx="1"/>',
    play:  '<path d="M3 1.5 L12 7 L3 12.5 Z"/>'
  };

  for (var i = 0; i < ACTS.length; i++) {
    var d = document.createElement("button");
    d.className = "dot"; d.type = "button"; d.dataset.i = String(i);
    /* "Act 1" nao diz nada. O rotulo nomeia o ato, porque o unico jeito de saber
       o que ha atras de um ponto de 8px e o rotulo dele. */
    d.setAttribute("aria-label", "Act " + (i + 1) + " of " + ACTS.length + " — "
      + ACTS[i].label.replace(/<[^>]+>/g, "").replace(/^act [iv]+ · /, ""));
    d.addEventListener("click", function () { goTo(+this.dataset.i); });
    dotsEl.appendChild(d);
  }

  /* A TROCA PAPEL<->CODIGO E FEITA POR `opacity`, E `opacity:0` NAO SAI DA ARVORE
     DE ACESSIBILIDADE. Sem esta funcao, um leitor de tela le as DUAS versoes de
     cada linha, intercaladas: o manuscrito de 1713 e o Solidity, linha a linha, na
     mesma passada. A peca inteira depende de o leitor perceber que o documento
     VIROU outra coisa; sem isto os dois estados chegam simultaneos e embaralhados.
     WCAG 1.3.2, nivel A. Uma funcao, um lugar — nao espalhar setAttribute pelos
     seis callbacks de buildSteps. */
  function espelharEstadoNaArvore() {
    var virouCodigo = scene.classList.contains("code");
    Array.prototype.forEach.call(scene.querySelectorAll(".ms"), function (el) {
      el.setAttribute("aria-hidden", virouCodigo ? "true" : "false");
    });
    Array.prototype.forEach.call(scene.querySelectorAll(".cd"), function (el) {
      el.setAttribute("aria-hidden", virouCodigo ? "false" : "true");
    });
  }

  /* A cena troca de ato sozinha a cada ~7,4s reescrevendo capitulo, data, seis
     linhas, lacre e rodape. Sem aviso, quem usa leitor de tela esta no meio do ato
     ii e o conteudo vira ato iii em silencio (WCAG 4.1.3). Marcar a cena inteira
     como regiao viva seria pior: reanunciaria as seis linhas a cada troca, quatro
     vezes, por cima de uma narrativa que ja esta sendo lida.
     Esta regiao anuncia a MUDANCA, nao o conteudo. */
  function anunciar(txt) {
    var reg = $("selo-anuncio");
    if (reg) reg.textContent = txt;
  }

  function tituloDoAto(a) {
    return ACTS[a].label.replace(/<[^>]+>/g, "").replace(/^act [iv]+ · /, "");
  }

  function setDots() {
    Array.prototype.forEach.call(dotsEl.children, function (el, i) {
      el.setAttribute("aria-current", i === act ? "true" : "false");
    });
  }

  function fill(a) {
    var A = ACTS[a];
    chapEl.innerHTML = A.label;
    $("selo-d1").textContent = A.d1;
    $("selo-d2").textContent = A.d2;
    var rows = scene.querySelectorAll(".row"), grande = 2;
    Array.prototype.forEach.call(rows, function (row, i) {
      var r = A.rows[i];
      row.style.display = r ? "" : "none";
      row.classList.toggle("rx", !!r && i === grande);
      row.classList.toggle("codeonly", !!r && !r[0]);
      if (!r) return;
      var ms = row.querySelector(".ms");
      ms.innerHTML = r[0];
      ms.className = "ms";
      row.querySelector(".cd").innerHTML = r[1];
    });
    $("selo-sealname").textContent = A.name;
    $("selo-sealyear").textContent = A.year;
    /* O nome do autor vive DENTRO de `.wax`, que e `aria-hidden="true"` — e tem de
       ser: e tipografia decorativa em duas linhas com o ano em algarismo romano,
       que leitor de tela soletra letra a letra. A legenda antes dizia "sealed by —"
       e a seta apontava para conteudo que a arvore de acessibilidade nao alcanca.
       Agora ela CARREGA o nome, com o ano em digitos. Quem enxerga le o romano no
       lacre; quem nao enxerga le o nome na legenda. Ninguem le uma seta para o
       nada. */
    sealcap.textContent = A.name ? (TXT.sealedBy + " " + A.name + ", " + A.anoLegivel) : "";
    $("selo-tag").textContent = TXT.tag;
    $("selo-hashtxt").textContent = TXT.hashtxt;
    $("selo-clink").href = CONTRATO;
    $("selo-qrlink").href = CONTRATO;
  }

  /* Os três primeiros atos LACRAM e depois viram código; o quarto inverte a ordem
     — vira código primeiro, lacra depois, e só então o lacre abre em QR. É a
     inversão que carrega o argumento: nos três primeiros o autor assina e o
     contrato responde; no quarto o contrato existe primeiro e o selo deixa de
     ser um nome para virar um endereço que qualquer um confere. */
  function buildSteps(a) {
    if (a < ACTS.length - 1) return [
      { t: 150,  fn: function () { scene.classList.add("play"); } },
      { t: 3300, fn: function () { scene.classList.add("sealed"); } },
      { t: 4600, fn: function () { scene.classList.add("code"); espelharEstadoNaArvore(); } },
      { t: 7400, fn: function () { goTo(a + 1); } }
    ];
    return [
      { t: 150,  fn: function () { scene.classList.add("play"); } },
      { t: 3900, fn: function () { scene.classList.add("code"); espelharEstadoNaArvore(); } },
      { t: 4600, fn: function () { scene.classList.add("sealed"); } },
      { t: 6500, fn: function () { scene.classList.add("chain");
                                   sealcap.textContent = TXT.verifiedBy + "\n" + TXT.anyone; } },
      { t: 7000, fn: finish }
    ];
  }

  function finish() {
    playing = false; done = true;
    ppIcon.innerHTML = ICONS.play;
    ppBtn.setAttribute("aria-label", TXT.replay);
  }

  function goTo(a) {
    if (raf) cancelAnimationFrame(raf);
    act = a; setDots(); done = false;
    scene.className = "scene" + (a === ACTS.length - 1 ? " epi" : "");
    fill(a);
    espelharEstadoNaArvore();
    anunciar("Act " + (a + 1) + " of " + ACTS.length + " — " + tituloDoAto(a));
    void scene.offsetWidth;  /* força reflow: sem isto as animações não reiniciam */

    /* Quem pediu menos movimento recebe o DESTINO, não a viagem: o ato final já
       montado, com o QR aberto. Uma peça sobre a travessia não pode terminar em
       tela em branco para quem não pode ver a travessia. */
    if (reduced) {
      scene.classList.add("play", "sealed", "code");
      espelharEstadoNaArvore();
      if (a === ACTS.length - 1) {
        scene.classList.add("chain");
        sealcap.textContent = TXT.verifiedBy + "\n" + TXT.anyone;
        /* O destino é o ato iv, e quem chega nele por movimento reduzido precisa
           SABER que existem três antes — senão "alcançável" vira "escondido". Os
           botões de ato continuam sendo o caminho; esta linha é o aviso de que há
           caminho. */
        anunciar("Act 4 of 4 shown, with the seal already open. Use the act buttons "
               + "to read acts 1 to 3.");
        finish();
      } else {
        playing = false;
        ppIcon.innerHTML = ICONS.play;
        ppBtn.setAttribute("aria-label", TXT.play);
      }
      return;
    }

    steps = buildSteps(a); idx = 0; elapsed = 0; playing = true;
    ppIcon.innerHTML = ICONS.pause;
    ppBtn.setAttribute("aria-label", TXT.pause);
    t0 = performance.now();
    raf = requestAnimationFrame(loop);
  }

  function loop(now) {
    if (!playing) return;
    var e = elapsed + (now - t0);
    while (idx < steps.length && steps[idx].t <= e) { steps[idx].fn(); idx++; }
    if (idx < steps.length && playing) raf = requestAnimationFrame(loop);
  }

  function pause() {
    playing = false; elapsed += performance.now() - t0;
    scene.classList.add("hold");
    ppIcon.innerHTML = ICONS.play;
    ppBtn.setAttribute("aria-label", TXT.play);
    if (raf) cancelAnimationFrame(raf);
  }

  function resume() {
    scene.classList.remove("hold"); playing = true; t0 = performance.now();
    ppIcon.innerHTML = ICONS.pause;
    ppBtn.setAttribute("aria-label", TXT.pause);
    raf = requestAnimationFrame(loop);
  }

  /* TRES CAUSAS DE PAUSA, E A CAUSA E SEPARADA DO ESTADO.
     A primeira versao guardava tres bandeiras e comecava com `if (!playing) return`
     — "ja parado por alguem: nao assume a pausa alheia". Parecia certo e abria um
     buraco que o N2 do Tubarao-branco encontrou, em DUAS rotas:

       foco entra na barra  -> pausa, pausadoPorFoco = true
       visitante rola a peca para fora -> pausarAuto("saida") cai no early return
                                          e NAO REGISTRA a saida
       foco sai da barra    -> retomarAuto("foco") limpa a unica bandeira,
                               nao acha outra causa, e RETOMA COM A PECA FORA DA TELA

     A segunda rota e a mesma com a aba escondida no lugar do foco. As duas
     terminam nos 22 segundos tocando para uma sala vazia — exatamente o
     "a loop running off-screen is a battery bug" que o guia do cliente proibe e
     que esta onda veio fechar.

     A CAUSA AGORA E REGISTRADA SEMPRE, TOQUE OU NAO A REPRODUCAO. E a pausa que a
     pessoa pediu ganha bandeira propria, `pausadoManual`, em vez de depender de
     nenhuma causa automatica estar marcada. Quem manda continua sendo ela. */
  var pausas = { saida: false, aba: false, foco: false };
  var pausadoManual = false;

  function algumaCausa() { return pausas.saida || pausas.aba || pausas.foco; }

  function pausarAuto(causa) {
    pausas[causa] = true;              /* registra SEMPRE */
    if (playing) pause();
  }

  function retomarAuto(causa) {
    pausas[causa] = false;
    if (pausadoManual) return;         /* a vontade dela vence a nossa */
    if (algumaCausa()) return;         /* outra causa ainda segura */
    if (done || playing) return;
    resume();
  }

  ppBtn.addEventListener("click", function () {
    if (done) { pausadoManual = false; goTo(0); return; }
    if (playing) { pause(); pausadoManual = true; }
    else {
      /* retomar a mao apaga toda causa automatica: se ela mandou tocar com a peca
         fora da tela, toca. Intencao explicita vence heuristica. */
      pausadoManual = false;
      pausas.saida = pausas.aba = pausas.foco = false;
      resume();
    }
  });
  rpBtn.addEventListener("click", function () {
    pausadoManual = false;
    pausas.saida = pausas.aba = pausas.foco = false;
    goTo(0);
  });

  /* Quem navega por teclado precisa de tempo para ler. Se o ato troca sozinho
     enquanto o foco esta nos controles, a pessoa perde o lugar. */
  var barra = ppBtn.parentNode;
  if (barra) {
    barra.addEventListener("focusin", function () { pausarAuto("foco"); });
    barra.addEventListener("focusout", function (e) {
      if (barra.contains(e.relatedTarget)) return;   /* so mudou de botao dentro da barra */
      retomarAuto("foco");
    });
  }

  /* "A loop running off-screen is a battery bug" — guia de marca do cliente,
     secao 4, Non-negotiable. O observador anterior fazia `disconnect()` depois de
     comecar: os 22 segundos dos atos ii, iii e iv tocavam para uma sala vazia. */
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) pausarAuto("aba"); else retomarAuto("aba");
  });

  fill(0); setDots(); espelharEstadoNaArvore();

  if (reduced) { goTo(ACTS.length - 1); }
  else if ("IntersectionObserver" in window) {
    var comecou = false;
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting) {
          if (!comecou) {
            comecou = true;
            /* a instrucao de rolar so faz sentido antes de rolar */
            var dica = document.getElementById("selo-hint");
            if (dica) dica.classList.add("cumprido");
            goTo(0);
          } else {
            retomarAuto("saida");
          }
        } else if (comecou) {
          pausarAuto("saida");
        }
      });
    }, { threshold: 0.4 });
    io.observe(scene);                 /* sem disconnect: ele continua sendo o vigia */
  } else { goTo(0); }
})();
