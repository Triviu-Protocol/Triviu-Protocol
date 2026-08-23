/* =============================================================================
   /cofre/ — a tela que cria o seu cofre na linha V0 e move dinheiro para dentro
   e para fora dele.

   POR QUE ELA E PEQUENA, E POR QUE ISSO E O PONTO
   ==============================================
   O console grande (site/v0/) tem analytics, graficos, LP, marca, tour e 3D. Ele
   foi portado para a arquitetura do site em 2026-08-22, e o check-assinatura
   mostrou que 74 atribuicoes a innerHTML separam aquele arquivo de poder assinar
   — espalhadas por 45 funcoes, quase nenhuma no caminho que assina.

   Converter 45 funcoes de apresentacao para uma tela poder assinar e pagar o
   preco da parte que nao assina. Esta tela faz os quatro atos que ja foram
   provados em mainnet pelo contracts/script/usuario.sh, e nada alem:

       1. criar o cofre       VaultFactory.createVault(voce, index)
       2. autorizar a base    USDC.approve(cofre, quantia exata)
       3. depositar           cofre.deposit(base, quantia)
       4. sacar               cofre.withdraw(base, quantia, voce)

   AS PRIMITIVAS NAO SAO DAQUI
   ===========================
   Congelamento, hash canonico, seletor e recusa de aprovacao ilimitada vem de
   /js/motor.js — uma definicao, varios consumidores. O seletor sai de
   sig(papel, assinatura), que le o ARTEFATO em /js/abi-v0-console.js: seletor
   lido do artefato do forge nao pode divergir do contrato, e seletor calculado
   aqui poderia. Enderecos saem de /enderecos-v0.js, gerado de
   contracts/deployments/137.json — a mesma fonte que o Solidity le.
   ============================================================================= */
(function () {
  "use strict";

  /* ---------------------------------------------------------------- travas -- */
  /* ALLOWLIST de carteira, quatro metodos e mais nenhum. O que nao esta aqui nao
     e chamado, e somar uma linha exige passar pelo guardiao. Nenhum metodo de
     assinatura de mensagem entra: eles produzem autorizacao off-chain, que nao
     custa gas, nao aparece na chain, e so se manifesta quando ja foi usada.
     A familia que pede troca de rede tambem nao entra — esta tela nao pede
     troca, ela RECUSA operar fora da 137, e recusar e mais forte que pedir. */
  var CARTEIRA_PERMITIDO = {
    eth_accounts: 1, eth_requestAccounts: 1, eth_chainId: 1, eth_sendTransaction: 1
  };
  var RPC_PERMITIDO = {
    eth_call: 1, eth_chainId: 1, eth_getCode: 1, eth_blockNumber: 1,
    eth_estimateGas: 1, eth_getBalance: 1, eth_getTransactionReceipt: 1
  };

  /* Os dois endpoints estao no connect-src do vercel.json. Um terceiro exigiria
     mexer no CSP, e o CSP e o que impede a origem que assina de falar com
     qualquer host. */
  var RPCS = ["https://polygon-bor-rpc.publicnode.com", "https://polygon.drpc.org"];

  /* A PONTE, e ela e explicita de proposito.
     motor.js resolve o ABI em raiz.TRIVIU_ABI no PRIMEIRO uso, e o gerador da V0
     publica em TRIVIU_ABI_V0 — nomes diferentes porque sao LINHAS diferentes, e
     `TriviuVault` existe nas duas com o mesmo nome e codigo diferente. Deixar o
     gerador publicar direto em TRIVIU_ABI faria as duas competirem pelo mesmo
     nome global, e a ordem das tags decidiria qual linha a tela assina.
     Aqui a escolha esta escrita: esta pagina e da V0, e diz isso antes de o
     motor perguntar. */
  if (!window.TRIVIU_ABI_V0) {
    throw new Error("/js/abi-v0-console.js nao carregou — sem ele nao ha seletor, e seletor nao se digita");
  }
  window.TRIVIU_ABI = window.TRIVIU_ABI_V0;

  var L = window.TRIVIU_V0;
  /* As primitivas entram como NOMES LOCAIS, e nao atras de um alias M..
     O check-assinatura extrai as expressoes dos dois lados do congelamento e as
     EXECUTA sobre uma transacao sintetica, exigindo digests iguais — e uma
     expressao que referencia um alias do escopo do IIFE nao sobrevive a essa
     extracao. Um guardiao que nao consegue medir tem de reprovar, e reprovava. */
  var M = window.TRIVIU_MOTOR;
  var sig = M.sig;
  var cargaDaTx = M.cargaDaTx;
  var hashDaCarga = M.hashDaCarga;
  var recusarAprovacaoInfinita = M.recusarAprovacaoInfinita;
  var conferirTelaContraCalldata = M.conferirTelaContraCalldata;
  var CODIFICADOR_POR_TIPO = M.CODIFICADOR_POR_TIPO;
  var $ = function (id) { return document.getElementById(id); };

  var S = { conta: null, chainId: null, cofre: null, indice: 0, congelado: null };

  /* Cada montagem nasce numa geracao nova, e a anterior morre. Sem isto um
     passo montado ha dois cliques ainda pareceria congelado, e o selo dele
     bateria — porque o selo prova que o OBJETO nao mudou, nao que ele ainda
     e o atual. */
  var GERACAO = 0;

  /* O SELO e o retrato das ENTRADAS no instante do congelamento, comparado por
     VALOR no clique. Ele responde a uma pergunta que a impressao digital NAO
     responde: a digital prova que o objeto nao mudou, e o selo prova que o
     formulario que o gerou nao mudou. Trocar a quantia depois de congelar deixa
     a digital intacta e o passo obsoleto.
     Ouvir o evento `input` seria o caminho rapido, e nao e garantia — um evento
     pode nao disparar (autofill, restauracao de formulario ao voltar na
     historia, extensao escrevendo no campo). Valor nao tem como discordar de si
     mesmo, entao quem fecha e o selo.
     JSON.stringify e nao join(separador): qualquer separador que eu escolhesse
     poderia ser digitado dentro de um campo, e dois formularios diferentes
     produziriam o MESMO selo. JSON escapa o conteudo, entao e injetor. */
  var CAMPOS = ["quantia"];

  function seloAtual() {
    var v = CAMPOS.map(function (id) {
      var c = $(id);
      return c ? String(c.value) : "";
    });
    v.push(String(S.conta || ""), String(S.cofre || ""), String(S.indice));
    return JSON.stringify(v);
  }

  /* ------------------------------------------------------------------ DOM --- */
  /* innerHTML nao aparece neste arquivo, e a razao esta no guardiao: numa pagina
     que mostra o que voce vai assinar, HTML injetado reescreve a propria frase
     que voce esta conferindo. */
  function limpar(el) { while (el && el.firstChild) el.removeChild(el.firstChild); }
  function txt(el, s) { if (el) el.textContent = s; }
  function novo(tag, cls, conteudo) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (conteudo !== undefined && conteudo !== null) el.textContent = conteudo;
    return el;
  }
  function linha(pai, rotulo, valor, cls) {
    var d = novo("div", "kv");
    d.appendChild(novo("span", "k", rotulo));
    d.appendChild(novo("span", "v " + (cls || ""), valor));
    pai.appendChild(d);
    return d;
  }
  function diga(msg, cls) {
    var b = $("saida");
    if (!b) return;
    b.appendChild(novo("p", "ln " + (cls || ""), msg));
    b.scrollTop = b.scrollHeight;
  }

  /* O PONTO UNICO por onde esta pagina fala com uma carteira. A allowlist
     acima nao vale nada declarada: ela vale quando existe UM lugar que a
     consulta e LANCA. Cinco chamadas espalhadas para window.ethereum.request
     deixariam a lista sendo um comentario — e a sexta seria somada sem que nada
     reprovasse, que e exatamente o modo como uma trava desaparece.
     E e este ponto unico que o guardiao cobra ao exigir que eth_sendTransaction
     receba uma referencia ja conferida: um objeto montado na chamada nao pode
     ser o que foi congelado. */
  function pedirCarteira(metodo, params) {
    if (!CARTEIRA_PERMITIDO[metodo]) {
      throw new Error("bloqueado: esta pagina so pode chamar " +
        Object.keys(CARTEIRA_PERMITIDO).join(" / ") + " numa carteira. Recusado: " + metodo);
    }
    if (!window.ethereum) throw new Error("nenhuma carteira encontrada nesta pagina");
    return window.ethereum.request(params ? { method: metodo, params: params } : { method: metodo });
  }

  /* ------------------------------------------------------------- leituras --- */
  function lerChain(metodo, params) {
    if (!RPC_PERMITIDO[metodo]) {
      return Promise.reject(new Error("metodo fora da allowlist de leitura: " + metodo));
    }
    var i = 0;
    function tentar() {
      return fetch(RPCS[i], {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: metodo, params: params })
      }).then(function (r) { return r.json(); }).then(function (j) {
        if (j.error) throw new Error(j.error.message || "erro de RPC");
        return j.result;
      }).catch(function (e) {
        i += 1;
        if (i < RPCS.length) return tentar();
        throw e;
      });
    }
    return tentar();
  }

  /* Um `eth_call` que devolve uma palavra de 32 bytes. */
  function chamar(para, dados) {
    return lerChain("eth_call", [{ to: para, data: dados }, "latest"]);
  }

  /* --------------------------------------------------- decodificar reversao - */
  /* Cicatriz de 2026-08-12, medida contra uma reversao real: o decodificador
     herdado indexava palavras de 32 bytes sobre a string CRUA da reversao, que
     comeca com "0x" e os quatro bytes do seletor — todo argumento saia deslocado
     em quatro bytes, e o NOME do erro saia certo. A tela imprimia a verdade e a
     mentira lado a lado, com a mesma tipografia. Corta o seletor primeiro. */
  function decodificarRevert(dados) {
    if (typeof dados !== "string" || !/^0x[0-9a-fA-F]*$/.test(dados) || dados.length < 10) return null;
    var sel = dados.slice(0, 10).toLowerCase();
    var corpo = dados.slice(10);
    var ABI = window.TRIVIU_ABI_V0;
    var achado = null;
    if (ABI && ABI.contratos) {
      Object.keys(ABI.contratos).forEach(function (p) {
        var e = ABI.contratos[p].erros && ABI.contratos[p].erros[sel];
        if (e && !achado) achado = e;
      });
    }
    if (!achado) return { seletor: sel, nome: null, args: [] };
    var args = (achado.entradas || []).map(function (ent, i) {
      return { nome: ent.nome, tipo: ent.tipo, palavra: corpo.slice(i * 64, (i + 1) * 64) };
    });
    return { seletor: sel, nome: achado.assinatura, args: args };
  }

  /* ------------------------------------------------------------ os 4 atos --- */
  /* Cada passo devolve o cartao E a calldata da MESMA fonte. O motor confere um
     contra o outro em conferirTelaContraCalldata: cartao dizendo uma funcao e
     bytes chamando outra e exatamente o ataque que aquilo fecha. */
  function passoCriar() {
    var args = [
      { nome: "owner", tipo: "address", valor: S.conta },
      { nome: "index", tipo: "uint256", valor: String(S.indice) }
    ];
    return montar("factory", "createVault(address,uint256)", L.V0.factory, args,
      "Cria o seu cofre. Um contrato, e so o seu endereco o comanda.");
  }

  function passoAprovar(quantia) {
    var args = [
      { nome: "spender", tipo: "address", valor: S.cofre },
      { nome: "value", tipo: "uint256", valor: String(quantia) }
    ];
    var p = montar("erc20", "approve(address,uint256)", L.V0.baseCurrency, args,
      "Autoriza o cofre a puxar EXATAMENTE esta quantia. Nunca ilimitado.");
    /* O elo com o ABI fica EXPLICITO aqui, e nao escondido dentro de montar():
       o guardiao procura um approve construido por sig("erc20", …) com a recusa
       por fora, e procura assim porque um seletor que chega por variavel e um
       seletor que ninguem consegue cobrar. A recusa e sobre os BYTES — uma
       palavra de 32 bytes toda de uns e a aprovacao ilimitada, independente do
       que a tela escreveu ao lado dela. */
    p.dados = recusarAprovacaoInfinita(
      sig("erc20", "approve(address,uint256)") +
      CODIFICADOR_POR_TIPO.address(args[0].valor) +
      CODIFICADOR_POR_TIPO.uint256(args[1].valor),
      "erc20", "approve(address,uint256)");
    return p;
  }

  function passoDepositar(quantia) {
    var args = [
      { nome: "token", tipo: "address", valor: L.V0.baseCurrency },
      { nome: "amount", tipo: "uint256", valor: String(quantia) }
    ];
    return montar("vault", "deposit(address,uint256)", S.cofre, args,
      "Move a quantia para dentro do seu cofre.");
  }

  function passoSacar(quantia) {
    var args = [
      { nome: "token", tipo: "address", valor: L.V0.baseCurrency },
      { nome: "amount", tipo: "uint256", valor: String(quantia) },
      { nome: "to", tipo: "address", valor: S.conta }
    ];
    return montar("vault", "withdraw(address,uint256,address)", S.cofre, args,
      "Tira a quantia do cofre e devolve para a sua carteira. Sempre disponivel.");
  }

  function montar(papel, assinatura, para, args, explicacao) {
    var dados = sig(papel, assinatura);
    for (var i = 0; i < args.length; i++) {
      var cod = CODIFICADOR_POR_TIPO[args[i].tipo];
      if (!cod) throw new Error("tipo sem codificador nesta tela: " + args[i].tipo);
      dados += cod(args[i].valor);
    }
    /* `alvo`/`valor`, e nao `to`: sao os campos que amarrarTx() consome para
       fazer nascer p.tx. Um passo antes de amarrado nao tem `to` — ter dois
       nomes para a mesma coisa e como duas canonicalizacoes entraram. */
    return { papel: papel, assinatura: assinatura, alvo: para, dados: dados, valor: 0,
             args: args, explicacao: explicacao };
  }

  /* --------------------------------------------------- amarrar e congelar --- */
  /* REGRA 11 · a ligacao tela<->calldata roda ANTES de existir `p.tx`. Passo que
     nao amarra nao vira transacao: nao ha objeto para congelar, nao ha cartao
     para desenhar, nao ha o que clicar. O throw sobe e a tela diz que nada foi
     codificado, com o motivo — recusar depois de existir tx, digital e cartao ja
     e tarde, porque a essa altura o usuario ja leu algo.
     `value` e escrito na mesma linha em que o objeto nasce, e escrito mesmo
     sendo sempre zero: nenhum dos quatro atos e payable, e campo ausente no
     congelamento e campo que a carteira preenche sozinha depois. */
  function amarrarTx(p, dono) {
    p.ligacao = conferirTelaContraCalldata(p);
    p.tx = {
      chainId: Number(L.CHAIN_ID),
      to: p.alvo,
      data: p.dados,
      value: "0x" + BigInt(p.valor).toString(16),
      de: dono
    };
    return p;
  }

  /* A carga nasce AQUI, congelada por cargaDaTx(), e a impressao digital sai
     DELA. Depois disto nada e recalculado e nada e reconstruido: o cartao
     desenha daqui, o clique reconfere contra isto, e a carteira recebe esta
     mesma referencia. A geracao e nova a cada montagem, e a anterior morre. */
  async function congelar(p) {
    GERACAO += 1;
    var geracao = GERACAO;
    p.carga = cargaDaTx(p.tx);
    p.hash = await hashDaCarga(p.carga, p.tx.chainId);
    p.geracao = geracao;
    return p;
  }

  /* ------------------------------------------------------------- o cartao --- */
  function desenharCartao(p) {
    var c = $("cartao");
    limpar(c);
    c.appendChild(novo("h3", null, p.assinatura));
    c.appendChild(novo("p", "explica", p.explicacao));
    /* TUDO nesta funcao sai de `p.carga` — o objeto congelado, o mesmo que a
       carteira recebe. Nao de `p.dados`, nao de `p.alvo`, nao de `p.tx`: p.tx
       NAO e congelado, p.carga e. Desenhar de um e enviar o outro e a familia
       inteira das quatro cegueiras que o red-team do N2 mediu — nenhuma delas
       faz a tela mentir linha a linha, e por isso nao aparecem numa revisao.
       `chainId` e a unica excecao, e fica declarada: ele nao mora na carga (a
       carteira o recebe pela sessao, nao no objeto) e por isso vem de p.tx. E o
       campo reconferido em separado contra eth_chainId no clique — regra 4. */
    linha(c, "contrato", p.carga.to, "mono");
    linha(c, "chain destes bytes", String(p.tx.chainId), "mono");
    p.args.forEach(function (a) { linha(c, a.nome + " (" + a.tipo + ")", String(a.valor), "mono"); });
    linha(c, "valor nativo", BigInt(p.carga.value) === 0n
      ? "0 POL — zero explicito, nunca por omissao" : p.carga.value, "mono");
    linha(c, "calldata", String((p.carga.data.length - 2) / 2) + " bytes", null);
    var pre = novo("pre", "mono quebra");
    pre.setAttribute("translate", "no");
    pre.textContent = p.carga.data;
    c.appendChild(pre);
    /* O resultado da regra 11, impresso: quantas palavras da calldata foram
       RECONSTRUIDAS a partir do que esta escrito acima. E um numero que o leitor
       confere contra a lista de argumentos — e o passo nem teria chegado aqui se
       alguma tivesse divergido. */
    if (p.ligacao) {
      linha(c, "palavras ligadas a tela",
        String(p.ligacao.ligadas) + " de " + String(p.ligacao.palavras), "mono");
    }
    return c;
  }

  /* -------------------------------------------------------------- enviar ---- */
  /* O contrato desta funcao NAO foi inventado aqui: e o de js/console-lp.js, a
     tela que o Tubarao-branco auditou. Treze guardas, e cada uma existe porque
     algo passou por ela uma vez.

     A que eu NAO tinha e a mais sutil: entre montar o passo e clicar cabe uma
     troca de CONTA na carteira, nao so de rede. Uma aprovacao pertence ao
     endereco que a concede e um cofre ao endereco que o comanda — assinar de
     outra conta agiria sobre outra coisa. */
  var ENVIANDO = false;

  async function enviar(p) {
    if (ENVIANDO) {
      diga("ja ha uma transacao desta pagina esperando na sua carteira", "bad");
      return null;
    }
    if (!p) { diga("nada congelado: monte um passo antes de assinar", "bad"); return null; }
    /* Sem carga congelada nao ha o que reconferir, e o que nao pode ser
       reconferido nao e oferecido para assinatura. Este teste vem ANTES da trava
       de proposito: um retorno depois de ENVIANDO = true teria de desfaze-la a
       mao, e trava liberada em dois lugares e a proxima trava que fica presa. */
    if (!p.carga || !p.hash) {
      diga("este passo nao carrega carga congelada — monte de novo", "bad");
      return null;
    }
    if (p.geracao !== GERACAO) {
      diga("estes bytes nao sao mais o conjunto congelado — monte de novo", "bad");
      return null;
    }
    /* O formulario mudou depois do congelamento. A digital ainda bate — ela prova
       que o OBJETO nao mudou — e o passo ja e outro. Quem pega isto e o selo. */
    if (seloAtual() !== p.selo) {
      diga("o formulario mudou depois que estes bytes foram congelados. Nada foi enviado " +
        "e sua carteira nao foi consultada — monte de novo e leia os bytes novos.", "bad");
      S.congelado = null;
      return null;
    }
    /* A ligacao tela<->calldata rodou na AMARRACAO, antes de p.tx nascer, e o
       resultado dela viajou no passo. Conferi-la de novo aqui seria repetir o que
       ja passou; o que este teste pega e o passo que nunca amarrou. */
    if (!p.ligacao) {
      diga("este passo nao amarrou a tela a calldata, e passo que nao amarra nao vira " +
        "transacao. Nada foi enviado.", "bad");
      return null;
    }

    ENVIANDO = true;
    $("btnEnviar").disabled = true;
    try {
      /* A carga NAO e construida aqui. Foi construida uma unica vez no
         congelamento, por cargaDaTx(), e e ESTA REFERENCIA que foi impressa
         digitalmente, que a tela desenhou e que vai para a carteira. Um literal
         montado no envio — ainda que com os mesmos campos — faria a impressao
         digital provar o que a pagina CONGELOU e nao o que ela ENVIA. */
      var carga = p.carga;

      var tx = p.tx;
      var h = await hashDaCarga(carga, tx.chainId);
      if (h !== p.hash) {
        throw new Error("RECUSADO, nada foi enviado: o objeto nao e o que foi impresso na tela. " +
          "Selo ao desenhar " + p.hash.slice(0, 16) + "…, selo agora " + h.slice(0, 16) + "…");
      }

      /* A chain e reconferida no CLIQUE, e nao na conexao: entre conectar e
         clicar cabe uma troca de rede inteira. Esta pagina nao pede troca — ela
         recusa, e voce troca. Pagina que troca a sua rede em silencio e pagina
         que decide onde voce assina. */
      var cid = await pedirCarteira("eth_chainId");
      if (cid !== L.CHAIN_HEX) {
        throw new Error("RECUSADO, nada foi enviado: a carteira esta na rede " + cid +
          " e estes bytes foram congelados para a " + L.CHAIN_HEX + ".");
      }

      /* E a CONTA tambem. Uma aprovacao pertence ao endereco que a concede. */
      var contas = await pedirCarteira("eth_accounts");
      var ativa = contas && contas.length ? String(contas[0]) : "";
      if (ativa.toLowerCase() !== String(carga.from).toLowerCase()) {
        throw new Error("RECUSADO, nada foi enviado: a conta ativa da carteira e " + (ativa || "(nenhuma)") +
          " e estes bytes foram montados para " + carga.from + ". Assinar de outra conta agiria sobre outra coisa.");
      }

      /* Simula antes de expor o envio: uma transacao que reverteria nao chega a
         pedir assinatura. */
      try {
        await lerChain("eth_call", [{ from: carga.from, to: carga.to, data: carga.data }, "latest"]);
      } catch (sim) {
        var r = decodificarRevert(sim && sim.data ? sim.data : "");
        throw new Error("reverteria" + (r && r.nome ? " com " + r.nome : "") + " — nada foi enviado");
      }

      diga("a transacao esta na sua carteira agora. Nada mais acontece aqui ate voce aceitar ou recusar.", "ok");
      /* A MESMA referencia conferida acima. */
      var hash = await pedirCarteira("eth_sendTransaction", [carga]);
      diga("enviada: " + hash, "tx");

      var rec = await esperarRecibo(hash);
      if (!rec) { diga("enviada, mas o recibo nao chegou a tempo. O hash acima e a fonte.", "bad"); return hash; }
      var ok = rec.status === "0x1";
      diga("recibo: status " + rec.status + (ok ? " (sucesso)" : " (FALHOU na chain)") +
        " · bloco " + (rec.blockNumber ? parseInt(rec.blockNumber, 16) : "—") +
        " · gas " + (rec.gasUsed ? parseInt(rec.gasUsed, 16) : "—"), ok ? "ok" : "bad");
      if (!ok) {
        diga("minerada e FALHOU. Gas foi gasto e nada mudou. Isso e a resposta da chain, " +
          "nao a leitura desta pagina.", "bad");
      }
      return hash;
    } finally {
      ENVIANDO = false;
    }
  }

  /* O recibo e esperado, nao presumido: nada e chamado de feito ate a chain
     responder. */
  async function esperarRecibo(hash) {
    for (var i = 0; i < 60; i++) {
      await new Promise(function (r) { setTimeout(r, 2000); });
      try {
        var rec = await lerChain("eth_getTransactionReceipt", [hash]);
        if (rec) return rec;
      } catch (e) { /* o no pode nao ter a tx ainda; tentar de novo e o esperado */ }
      diga("esperando o recibo (" + (i + 1) + ")", null);
    }
    return null;
  }

  /* ------------------------------------------------------------- conectar --- */
  async function conectar() {
    var contas = await pedirCarteira("eth_requestAccounts");
    if (!contas || !contas.length) throw new Error("nenhuma conta autorizada");
    var cid = await pedirCarteira("eth_chainId");
    if (cid !== L.CHAIN_HEX) {
      throw new Error("a carteira esta na rede " + cid + " e esta tela so opera na " +
        L.CHAIN_HEX + " (Polygon PoS 137). Troque na carteira e conecte de novo.");
    }
    S.conta = contas[0];
    S.chainId = cid;
    txt($("conta"), S.conta);
    var previsto = await chamar(L.V0.factory,
      sig("factory", "vaultAddress(address,uint256)") +
      M.CODIFICADOR_POR_TIPO.address(S.conta) + M.CODIFICADOR_POR_TIPO.uint256(S.indice));
    S.cofre = "0x" + previsto.slice(-40);
    txt($("cofre"), S.cofre);
    var codigo = await lerChain("eth_getCode", [S.cofre, "latest"]);
    txt($("existe"), codigo && codigo !== "0x" ? "ja existe" : "ainda nao existe");
    diga("conectado em " + S.conta + " na chain " + parseInt(cid, 16), "ok");
  }

  /* --------------------------------------------------------- os handlers ---- */
  function quantiaDigitada() {
    var v = ($("quantia") && $("quantia").value || "").trim();
    if (!/^\d+(\.\d{1,6})?$/.test(v)) throw new Error("quantia invalida: use ate 6 casas, como 1.5");
    var partes = v.split(".");
    var frac = (partes[1] || "").padEnd(6, "0");
    return BigInt(partes[0]) * 1000000n + BigInt(frac);
  }

  async function preparar(qual) {
    try {
      if (!S.conta) await conectar();
      var p;
      if (qual === "criar") p = passoCriar();
      else if (qual === "aprovar") p = passoAprovar(quantiaDigitada());
      else if (qual === "depositar") p = passoDepositar(quantiaDigitada());
      else p = passoSacar(quantiaDigitada());

      /* Duas etapas, e a ordem e a regra: amarrar (a ligacao roda, p.tx nasce)
         e so entao congelar (a carga nasce de p.tx INTEIRO, a digital sai dela).
         O selo do formulario e tirado DEPOIS do congelamento, para retratar o
         mesmo instante que os bytes retratam. */
      amarrarTx(p, S.conta);
      await congelar(p);
      p.selo = seloAtual();
      S.congelado = p;
      desenharCartao(p);
      txt($("selo"), p.hash);
      $("btnEnviar").disabled = false;
      diga("passo montado e congelado. Confira o cartao antes de assinar.", "ok");
    } catch (e) {
      S.congelado = null;
      if ($("btnEnviar")) $("btnEnviar").disabled = true;
      diga(String(e && e.message ? e.message : e), "bad");
    }
  }

  /* O QUE CHEGA DE /v0/ — e o que NAO chega.
     Chega INTENCAO: qual ato, qual quantia, qual indice de cofre. NAO chega
     calldata. Os bytes sao montados AQUI, do mesmo artefato compilado, e a
     impressao digital sai deles. Uma tela que aceitasse bytes prontos de outra
     assinaria o que a outra mandasse, e a digital passaria a provar a ORIGEM em
     vez do CONTEUDO — que e exatamente a prova que ela existe para dar.

     Query string e entrada de TERCEIRO: quem monta o link pode ser qualquer um,
     e um link e a coisa mais facil de mandar para alguem. Entao:

       · `ato` casa contra quatro valores conhecidos e vira o nome de uma funcao
         desta tela. Nao ha caminho da string para o DOM.
       · `quantia` passa pelo MESMO regex do campo, e o que aparece na tela e o
         valor do CAMPO depois de preenchido — nunca a string crua da URL.
       · `indice` e no maximo tres digitos.

     Nada e preparado sozinho. A intencao PREENCHE e destaca; quem clica e a
     pessoa, depois de ler. Um link que monta e congela um passo por conta
     propria e um link que decide o que voce vai assinar. */
  var ATOS_VALIDOS = { criar: 1, aprovar: 1, depositar: 1, sacar: 1 };

  function intencaoDaURL() {
    var q = new URLSearchParams(window.location.search);
    var ato = q.get("ato");
    if (!ato || !ATOS_VALIDOS[ato]) return null;
    var quantia = q.get("quantia");
    if (quantia !== null && !/^\d+(\.\d{1,6})?$/.test(quantia)) return null;
    var indice = q.get("indice");
    if (indice !== null && !/^\d{1,3}$/.test(indice)) return null;
    return { ato: ato, quantia: quantia, indice: indice === null ? 0 : Number(indice) };
  }

  function aplicarIntencao() {
    var i = intencaoDaURL();
    if (!i) return;
    S.indice = i.indice;
    if (i.quantia !== null && $("quantia")) $("quantia").value = i.quantia;
    var b = $("btn-" + i.ato);
    if (b) b.setAttribute("data-sugerido", "1");
    diga("Voce veio do console para " + i.ato +
      (i.quantia !== null ? " " + i.quantia : "") +
      ". Nada foi montado ainda: confira o valor no campo, clique no ato, e leia o " +
      "cartao antes de assinar. Estes bytes vao ser montados AQUI, do artefato " +
      "compilado — nada de calldata atravessou a URL.", "ok");
  }

  function ligar() {
    aplicarIntencao();
    $("btnConectar").addEventListener("click", function () {
      conectar().catch(function (e) { diga(String(e.message || e), "bad"); });
    });
    ["criar", "aprovar", "depositar", "sacar"].forEach(function (q) {
      var b = $("btn-" + q);
      if (b) b.addEventListener("click", function () { preparar(q); });
    });
    $("btnEnviar").addEventListener("click", function () {
      enviar(S.congelado)
        .catch(function (e) { diga(String(e.message || e), "bad"); })
        .then(function () { $("btnEnviar").disabled = true; });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ligar);
  else ligar();
})();
