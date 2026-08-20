/* ═══════════════════════════════════════════════════════════════════════════
   ALVOS · o leitor da ponte
   ═══════════════════════════════════════════════════════════════════════════

   O oráculo mede e decide. `oracle/ponte.mjs` traduz a decisão para
   `/alvos.json`. Este arquivo é quem finalmente lê — e até ele existir, a
   decisão era escrita por um lado e lida por ninguém.

   TRÊS COISAS QUE ESTE ARQUIVO NÃO FAZ, E CADA UMA TEM DONO

   1. NÃO escreve em `lp-*`. A subárvore que assina é namespaced com esse
      prefixo, e `check-alcance-dom` recusa qualquer script fora do motor que
      escreva nela. Este arquivo pinta em `orac-*` e lê nada da carteira.

   2. NÃO mostra tickLower, tickUpper, amount0Min nem amount1Min. O contrato
      recusa carregar padrão para os dois últimos porque "seria uma opinião de
      preço, e este contrato não tem nenhuma"; a tela repete a recusa; a ponte
      é a terceira a recusar. Mostrá-los aqui, ainda que como sugestão, faria
      esta linha ser a primeira a opinar — e num lugar onde o leitor confundiria
      sugestão com medição.

   3. NÃO preenche formulário sozinho. Ele mostra o que foi medido; quem
      transporta para os campos é a pessoa que vai assinar. Um botão que
      preenchesse seria conveniência comprada com a única coisa que separa
      "a máquina mediu" de "a máquina decidiu por mim".

   E QUANDO NÃO HÁ ALVO, ELE DIZ POR QUÊ. Um bloco vazio faria o visitante
   concluir que não há oportunidade. O que a ponte devolve é o motivo — oráculo
   cego, portão de rede barrado, N candidatos reprovados — e o motivo é a
   informação, não a ausência dela. */
(function () {
  "use strict";

  var bloco = document.getElementById("orac-bloco");
  var corpo = document.getElementById("orac-corpo");
  var selo = document.getElementById("orac-selo");
  if (!bloco || !corpo || !selo) return;

  /* Escape para contexto de ATRIBUTO e de texto. O conteúdo vem de um arquivo
     desta origem, mas "vem de casa" não é motivo para não escapar: o dia em que
     a ponte passar a copiar um símbolo de token vindo da chain, este é o único
     lugar que impede o símbolo de virar markup. */
  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function num(v, casas) {
    var n = Number(v);
    return Number.isFinite(n) ? n.toLocaleString("en-US", {
      minimumFractionDigits: casas || 0, maximumFractionDigits: casas || 0
    }) : "—";
  }

  function semAlvo(motivo, quando) {
    selo.textContent = "no target";
    selo.className = "pill warn";
    corpo.innerHTML =
      '<p class="small"><b>The oracle is not offering a target right now, and this is why:</b></p>' +
      '<p class="mono small orac-espaco">' + esc(motivo || "no reason recorded") + "</p>" +
      (quando ? '<p class="small faint orac-espaco">bridge ran at ' + esc(quando) + "</p>" : "");
  }

  function comAlvos(dados) {
    selo.textContent = dados.alvos.length + " target" + (dados.alvos.length === 1 ? "" : "s");
    selo.className = "pill ok";

    var linhas = dados.alvos.map(function (a) {
      var m = a.medicao || {};
      return "<tr>" +
        "<td translate=\"no\">" + esc(a.token0Simbolo) + "/" + esc(a.token1Simbolo) + "</td>" +
        '<td class="num mono">' + esc(a.tier / 100) + "bps</td>" +
        '<td class="num mono">&plusmn;' + esc(a.faixa * 100) + "%</td>" +
        '<td class="num mono">$' + num(a.tamanhoUsd) + "</td>" +
        '<td class="num mono">' + esc(m.janelaDias) + "d</td>" +
        '<td class="num mono">' + esc(m.leiturasIndependentes) + "</td>" +
        '<td class="num mono"><b>' + esc(m.escolhidoEntre) + "</b></td>" +
        '<td class="mono faint orac-quebra">' + esc(a.pool) + "</td>" +
        "</tr>";
    }).join("");

    corpo.innerHTML =
      '<div class="tscroll"><table translate="no"><thead><tr>' +
        "<th>pair</th><th>fee tier</th><th>band</th><th>size</th>" +
        "<th>window</th><th>readings</th><th>beat</th><th>pool</th>" +
      "</tr></thead><tbody>" + linhas + "</tbody></table></div>" +
      '<p class="hint"><b>“beat”</b> is how many candidates the oracle evaluated in the same run. ' +
      "A target that beat 253 and a target that beat 2 are different claims, and the number is here " +
      "so you never have to take the first on faith.</p>" +
      '<p class="hint"><b>What is deliberately absent:</b> the tick bounds and the slippage minimums. ' +
      "The contract refuses to carry a default for them — <i>“a default here would be a price opinion, " +
      "and this contract holds none”</i> — this screen repeats the refusal, and the bridge that produced " +
      "this table is the third to refuse. They are yours to set, below.</p>" +
      '<p class="hint faint">bridge ran at ' + esc(dados.geradoEm) +
      " · signs: " + esc(dados.assina) + " · builds a transaction: " + esc(dados.monta_transacao) + "</p>";
  }

  /* Mesma origem. A CSP desta origem e `connect-src 'self'`, entao qualquer
     destino externo seria recusado pelo navegador — e recusado certo. */
  fetch("/alvos.json", { cache: "no-store" })
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(function (d) {
      bloco.hidden = false;
      if (!d || !Array.isArray(d.alvos) || d.alvos.length === 0) {
        semAlvo(d && d.motivo, d && d.geradoEm);
      } else {
        comAlvos(d);
      }
    })
    .catch(function (e) {
      /* O bloco aparece MESMO assim. Sumir em silêncio faria a tela mentir por
         omissão: quem não vê o bloco conclui que ele não existe, e não que ele
         falhou. */
      bloco.hidden = false;
      selo.textContent = "unavailable";
      selo.className = "pill bad";
      corpo.innerHTML =
        '<p class="small">The oracle feed could not be read (<span class="mono">' +
        esc(e && e.message) + "</span>). Nothing below depends on it — the fixed " +
        "seven-day study and the signing path work without this block.</p>";
    });
})();
