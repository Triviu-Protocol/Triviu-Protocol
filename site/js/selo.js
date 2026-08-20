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
    tag: "Logic, probability and management become the machine's code. Risk, "
       + "responsibility and return stay yours — written into the access control, "
       + "not delegated. Read the contract before signing anything: it proves what "
       + "this page merely claims.",
    pause: "Pause", play: "Resume", replay: "Play from the beginning",
    sealedBy: "sealed by", verifiedBy: "scan or click", anyone: "the verified contract"
  };

  var ACTS = [
    { label: 'act i · <b>the infrastructure</b>', d1: "Wardenclyffe · c. 1905", d2: "feewall.js",
      name: "N. Tesla", year: "c. MCMV",
      rows: [
        ["He meant to deliver power to whoever needed it,", "<i>// the information is public. the execution is not.</i>"],
        ["and it was not physics that defeated him:", "<b>const</b> FEE = 0.003; <i>// the toll on every swap</i>"],
        ["it was whoever already charged the toll.", "<b>const</b> wall = (1 - FEE) ** hops; <em>// 0.9910</em>"],
        ["— paraphrased from Nikola Tesla", "<i>// the toll didn't change nature. it changed name.</i>"]] },

    { label: 'act ii · <b>the probability</b>', d1: "Ars Conjectandi · Basel, MDCCXIII", d2: "montecarlo.js",
      name: "J. Bernoulli", year: "MDCCXIII",
      rows: [
        ["The more numerous the observations,", "<i>// law of large numbers, obeyed to the letter</i>"],
        ["the closer frequency comes to probability —", "<b>for</b> (<b>let</b> i = 0; i &lt; 100_000; i++)"],
        ["and that it worked once proves nothing.", "&nbsp;&nbsp;r.push(cycle(market()) - gas); <em>// every try has a cost</em>"],
        ["— paraphrased from Jacob Bernoulli", "<i>// he couldn't know: here, converging means losing</i>"]] },

    { label: 'act iii · <b>the management</b>', d1: "Bell Telephone Laboratories · 1956", d2: "kelly.js",
      name: "J. L. Kelly Jr.", year: "MCMLVI",
      rows: [
        ["Holding a real edge over the market,", "<i>// Kelly criterion, applied without mercy</i>"],
        ["there is an exact fraction to risk —", "<b>const</b> f = (b*p - q) / b;"],
        ["and risking more than it is ruin in the long run.", "<b>if</b> (f &lt;= 0) size = 0; <em>// no edge: don't bet</em>"],
        ["— paraphrased from John L. Kelly Jr.", "<i>// the formula that says stop more often than bet</i>"]] },

    { label: 'act iv · <b>you</b>', d1: "the part that stays yours", d2: "Triviu.sol",
      name: "", year: "",
      rows: [
        ["The machine reads the logic, measures probability", "<i>// LPM — logic, probability, management: the machine's part</i>"],
        ["and sizes the position. That much it executes.", "agent.logic(feeWall).probability(mc).size(kelly);"],
        ["The risk is yours. The responsibility is yours.<br>The return follows from both.", "<i>// RRR — risk, responsibility, return: the access control</i>"],
        ["", "<b>address</b> <u>immutable</u> owner; <i>// fixed at construction — the risk is yours</i>"],
        ["", "<b>function</b> withdraw() <b>external</b> <u>onlyOwner</u> <i>// the responsibility is yours</i>"],
        ["", "<b>return</b> profit; <i>// a consequence — last line, never the first</i>"]] }
  ];

  var $ = function (id) { return document.getElementById(id); };
  var scene = $("scene"), chapEl = $("chap"), ppBtn = $("pp"), ppIcon = $("ppIcon"),
      rpBtn = $("rp"), dotsEl = $("dots"), sealcap = $("sealcap");
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
    d.setAttribute("aria-label", "Act " + (i + 1));
    d.addEventListener("click", function () { goTo(+this.dataset.i); });
    dotsEl.appendChild(d);
  }

  function setDots() {
    Array.prototype.forEach.call(dotsEl.children, function (el, i) {
      el.setAttribute("aria-current", i === act ? "true" : "false");
    });
  }

  function fill(a) {
    var A = ACTS[a];
    chapEl.innerHTML = A.label;
    $("d1").textContent = A.d1;
    $("d2").textContent = A.d2;
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
    $("sealname").textContent = A.name;
    $("sealyear").textContent = A.year;
    sealcap.textContent = a === ACTS.length - 1 ? "" : TXT.sealedBy + " —";
    $("tag").textContent = TXT.tag;
    $("hashtxt").textContent = TXT.hashtxt;
    $("clink").href = CONTRATO;
    $("qrlink").href = CONTRATO;
  }

  /* Os três primeiros atos LACRAM e depois viram código; o quarto inverte a ordem
     — vira código primeiro, lacra depois, e só então o lacre abre em QR. É a
     inversão que carrega o argumento: nos três primeiros o autor assina e o
     contrato responde; no quarto o contrato existe primeiro e o selo deixa de
     ser um nome para virar um endereço que qualquer um confere. */
  function buildSteps(a) {
    if (a < ACTS.length - 1) return [
      { t: 150,  fn: function () { scene.classList.add("play"); } },
      { t: 3300, fn: function () { scene.classList.add("sealed"); sealcap.textContent = TXT.sealedBy + " —"; } },
      { t: 4600, fn: function () { scene.classList.add("code"); } },
      { t: 7400, fn: function () { goTo(a + 1); } }
    ];
    return [
      { t: 150,  fn: function () { scene.classList.add("play"); } },
      { t: 3900, fn: function () { scene.classList.add("code"); } },
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
    void scene.offsetWidth;  /* força reflow: sem isto as animações não reiniciam */

    /* Quem pediu menos movimento recebe o DESTINO, não a viagem: o ato final já
       montado, com o QR aberto. Uma peça sobre a travessia não pode terminar em
       tela em branco para quem não pode ver a travessia. */
    if (reduced) {
      scene.classList.add("play", "sealed", "code");
      if (a === ACTS.length - 1) {
        scene.classList.add("chain");
        sealcap.textContent = TXT.verifiedBy + "\n" + TXT.anyone;
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

  ppBtn.addEventListener("click", function () {
    if (done) { goTo(0); return; }
    if (playing) pause(); else resume();
  });
  rpBtn.addEventListener("click", function () { goTo(0); });

  fill(0); setDots();

  if (reduced) { goTo(ACTS.length - 1); }
  else if ("IntersectionObserver" in window) {
    var visto = false;
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting && !visto) {
          visto = true;
          /* a instrucao de rolar so faz sentido antes de rolar */
          var dica = document.getElementById("hint");
          if (dica) dica.classList.add("cumprido");
          goTo(0); io.disconnect();
        }
      });
    }, { threshold: 0.4 });
    io.observe(scene);
  } else { goTo(0); }
})();
