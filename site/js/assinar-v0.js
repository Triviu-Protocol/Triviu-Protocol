/* =============================================================================
   ASSINAR · a superficie de assinatura da V0, usada DE DENTRO do console.

   POR QUE ISTO EXISTE, e nao mais uma pagina.
   Ate 2026-08-23 quem quisesse assinar um passo da V0 era levado para fora do
   console, para /cofre/. O fundador perguntou por que existia uma pagina que ele
   nao pediu, e a pergunta estava certa: o console dele e o produto, e ser
   teletransportado para outra tela no meio de um fluxo de deploy nao e um fluxo.

   O que impedia assinar de dentro tem numero: o console tem 75 atribuicoes a
   `innerHTML`, e o check-assinatura recusa qualquer uma que nao seja a string
   vazia. Medido: DESSAS 75, UMA fica perto do caminho de assinatura. As outras
   74 sao tabelas, paineis e graficos que nao tem nada a ver com assinar.
   Converter as 74 seria semanas de risco de regressao por zero ganho no caminho
   que importa.

   Entao a fronteira mudou de lugar: em vez de uma PAGINA limpa, um MODULO limpo.
   Este arquivo tem zero innerHTML, monta o cartao pela API do DOM, congela a
   carga, tira a impressao digital e abre a carteira — e passa nas mesmas onze
   regras que a tela fina passava. O console o CHAMA e nunca toca na carteira
   sozinho, entao ele continua cobrado como somente-leitura pelo bloco de
   cobertura do guardiao.

   O ALCANCE, dito para nao ser comprado por mais do que vale: um modulo limpo
   dentro de uma pagina que tem innerHTML noutro lugar nao e o mesmo que uma
   pagina inteira limpa. HTML injetado noutra regiao nao consegue reescrever
   ESTE cartao — ele e construido do zero, por DOM, a cada abertura, a partir de
   `p.carga` — mas conseguiria desenhar algo por cima. Contra isso ha duas
   coisas, e as duas estao fora desta pagina: a calldata e a digital sao
   impressas aqui para conferencia, e a carteira mostra o `to` e o `data` reais
   antes de voce assinar. A ultima palavra e da carteira, e sempre foi.

   A maquinaria abaixo NAO e nova. Ela saiu de js/cofre.js, que o Tubarao-branco
   auditou e que recusou nove mutacoes num red-team. Uma definicao, um caminho.
   ============================================================================= */
(function (raiz) {
  "use strict";

  /* ---------------------------------------------------------------- travas -- */
  /* ALLOWLIST de carteira: quatro metodos e mais nenhum. Nenhum metodo de
     autorizacao fora da chain entra — eles nao custam gas, nao aparecem na
     chain, e so se manifestam quando ja foram usados. A familia que pede troca
     de rede tambem nao entra: este modulo nao pede troca, ele RECUSA operar
     fora da 137, e recusar e mais forte que pedir. */
  var CARTEIRA_PERMITIDO = {
    eth_accounts: 1, eth_requestAccounts: 1, eth_chainId: 1, eth_sendTransaction: 1
  };
  var RPC_PERMITIDO = {
    eth_call: 1, eth_chainId: 1, eth_getCode: 1, eth_blockNumber: 1,
    eth_estimateGas: 1, eth_getBalance: 1, eth_getTransactionReceipt: 1
  };
  var RPCS = ["https://polygon-bor-rpc.publicnode.com", "https://polygon.drpc.org", "https://1rpc.io/matic"];

  if (!raiz || !raiz.TRIVIU_V0) throw new Error("/enderecos-v0.js precisa carregar antes de /js/assinar-v0.js");
  if (!raiz.TRIVIU_ABI_V0) throw new Error("/js/abi-v0-console.js precisa carregar antes de /js/assinar-v0.js");
  raiz.TRIVIU_ABI = raiz.TRIVIU_ABI_V0;
  if (!raiz.TRIVIU_MOTOR) throw new Error("/js/motor.js precisa carregar antes de /js/assinar-v0.js");

  var L = raiz.TRIVIU_V0;
  /* As primitivas entram como NOMES LOCAIS e nao atras de um alias. O guardiao
     extrai as expressoes dos dois lados do congelamento e as EXECUTA isoladas
     sobre uma transacao sintetica, exigindo digests iguais — e uma expressao que
     alcance um alias do escopo de fora nao sobrevive a essa extracao. */
  var M = raiz.TRIVIU_MOTOR;
  var sig = M.sig;
  var cargaDaTx = M.cargaDaTx;
  var hashDaCarga = M.hashDaCarga;
  var recusarAprovacaoInfinita = M.recusarAprovacaoInfinita;
  var conferirTelaContraCalldata = M.conferirTelaContraCalldata;
  var CODIFICADOR_POR_TIPO = M.CODIFICADOR_POR_TIPO;

  /* O contexto do passo em aberto. `seloAtual()` retrata ISTO, e o retrato e
     comparado por VALOR no clique: se quem chamou mudar a quantia entre montar e
     assinar, a digital continua batendo — ela prova que o OBJETO nao mudou — e o
     passo ja e outro. Quem pega isso e o selo. */
  /* `moeda` entra no contexto porque a moeda-base de um cofre e ESCOLHA DO
     DONO, e nao do protocolo. Medido no contrato em 2026-08-23:
       · `TriviuVault.deposit` chama `_checkOwner()` e `_deposit()`, e `_deposit`
         faz `safeTransferFrom` e mais nada — nenhuma verificacao de moeda;
       · `TriviuVault.setBaseCurrency` e `_checkOwner()`: o dono decide;
       · `ProtocolRegistry.isBaseCurrency` e consumido em UM lugar so,
         `VaultExecution.sol:283`, dentro da execucao de ciclo, com
         `revert BaseNotCurated()`.
     Ou seja: criar, depositar e sacar aceitam qualquer ERC-20. A curadoria do
     registro so pesa quando o CICLO executar — que e o que esta travado ate a
     governanca abrir. Eu tinha restringido a tela a uma moeda so, lendo o
     registro e presumindo que ele governava o deposito. Nao governa. */
  var CTX = { conta: null, cofre: null, indice: 0, quantia: null, moeda: null,
              alvo: null, ligado: null, limites: null };
  function moedaDoPasso() { return CTX.moeda || L.V0.baseCurrency; }
  var GERACAO = 0;
  var ENVIANDO = false;
  var CONGELADO = null;
  var ELS = null;

  function seloAtual() {
    return JSON.stringify([
      String(CTX.conta || "").toLowerCase(),
      String(CTX.cofre || "").toLowerCase(),
      String(CTX.indice),
      String(CTX.quantia),
      String(CTX.moeda || ""),
      String(CTX.alvo || ""),
      String(CTX.ligado)
    ]);
  }

  /* ------------------------------------------------------------------ DOM --- */
  /* innerHTML nao aparece neste arquivo. Numa superficie que mostra o que voce
     vai assinar, HTML injetado reescreve a propria frase que voce esta
     conferindo — e a regra e mais dura que "nao injete dado do usuario": aqui
     nao se injeta HTML nenhum. Regra que depende de julgar se a string e
     confiavel sera julgada errado um dia; esta nao pede julgamento. */
  function limpar(el) { while (el && el.firstChild) el.removeChild(el.firstChild); }
  function novo(tag, cls, conteudo) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (conteudo !== undefined && conteudo !== null) el.textContent = conteudo;
    return el;
  }
  function linha(pai, rotulo, valor, cls) {
    var d = novo("div", "asskv");
    d.appendChild(novo("span", "assk", rotulo));
    d.appendChild(novo("span", "assv " + (cls || ""), valor));
    pai.appendChild(d);
    return d;
  }
  function diga(msg, cls) {
    if (!ELS) return;
    ELS.saida.appendChild(novo("p", "assln " + (cls || ""), msg));
    ELS.saida.scrollTop = ELS.saida.scrollHeight;
  }

  /* --------------------------------------------------------------- carteira - */
  /* O PONTO UNICO por onde este modulo fala com a carteira. A allowlist acima
     nao vale declarada: vale porque existe UM lugar que a consulta e LANCA. */
  function pedirCarteira(metodo, params) {
    if (!CARTEIRA_PERMITIDO[metodo]) {
      throw new Error("bloqueado: este modulo so pode chamar " +
        Object.keys(CARTEIRA_PERMITIDO).join(" / ") + " numa carteira. Recusado: " + metodo);
    }
    if (!raiz.ethereum) throw new Error("nenhuma carteira encontrada nesta pagina");
    return raiz.ethereum.request(params ? { method: metodo, params: params } : { method: metodo });
  }

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
        if (j.error) {
          /* O `data` do erro E O MOTIVO: sao os quatro bytes do erro
             customizado que o contrato lancou. Jogar fora aqui e o que fazia a
             tela dizer "reverteria — nada foi enviado" e nada mais, quando o
             contrato tinha dito exatamente por que. O fundador viu isso: a
             recusa estava certa e mmuda. */
          var err = new Error(j.error.message || "erro de RPC");
          err.data = j.error.data;
          err.code = j.error.code;
          throw err;
        }
        return j.result;
      }).catch(function (e) {
        i += 1;
        if (i < RPCS.length) return tentar();
        throw e;
      });
    }
    return tentar();
  }

  /* Cicatriz de 2026-08-12: o decodificador herdado indexava palavras de 32
     bytes sobre a string CRUA da reversao, que comeca com o seletor — todo
     argumento saia deslocado em quatro bytes e o NOME do erro saia certo. A tela
     imprimia a verdade e a mentira lado a lado, com a mesma tipografia. */
  function decodificarRevert(dados) {
    if (typeof dados !== "string" || !/^0x[0-9a-fA-F]*$/.test(dados) || dados.length < 10) return null;
    var sel = dados.slice(0, 10).toLowerCase();
    var ABI = raiz.TRIVIU_ABI_V0;
    var achado = null;
    if (ABI && ABI.contratos) {
      Object.keys(ABI.contratos).forEach(function (p) {
        var e = ABI.contratos[p].erros && ABI.contratos[p].erros[sel];
        if (e && !achado) achado = e;
      });
    }
    return achado ? { seletor: sel, nome: achado.assinatura } : { seletor: sel, nome: null };
  }

  /* ------------------------------------------------------------ os 4 atos --- */
  /* Cada passo devolve o cartao E a calldata da MESMA fonte. O motor confere um
     contra o outro: cartao dizendo uma funcao e bytes chamando outra e o ataque
     que aquilo fecha. */
  function passoCriar() {
    var args = [
      { nome: "owner", tipo: "address", valor: CTX.conta },
      { nome: "index", tipo: "uint256", valor: String(CTX.indice) }
    ];
    return montar("factory", "createVault(address,uint256)", L.V0.factory, args,
      "Cria o seu cofre. Um contrato, e so o seu endereco o comanda.");
  }

  function passoAprovar() {
    var args = [
      { nome: "spender", tipo: "address", valor: CTX.cofre },
      { nome: "value", tipo: "uint256", valor: String(CTX.quantia) }
    ];
    var p = montar("erc20", "approve(address,uint256)", moedaDoPasso(), args,
      "Autoriza o cofre a puxar EXATAMENTE esta quantia. Nunca ilimitado.");
    /* O elo com o ABI fica EXPLICITO aqui e nao escondido dentro de montar():
       um seletor que chega por variavel e um seletor que ninguem consegue
       cobrar. A recusa e sobre os BYTES — uma palavra de 32 bytes toda de uns e
       a aprovacao ilimitada, independente do que a tela escreveu ao lado. */
    p.dados = recusarAprovacaoInfinita(
      sig("erc20", "approve(address,uint256)") +
      CODIFICADOR_POR_TIPO.address(args[0].valor) +
      CODIFICADOR_POR_TIPO.uint256(args[1].valor),
      "erc20", "approve(address,uint256)");
    return p;
  }

  function passoDepositar() {
    var args = [
      { nome: "token", tipo: "address", valor: moedaDoPasso() },
      { nome: "amount", tipo: "uint256", valor: String(CTX.quantia) }
    ];
    return montar("vault", "deposit(address,uint256)", CTX.cofre, args,
      "Move a quantia para dentro do seu cofre.");
  }

  /* ─── A CERCA ─────────────────────────────────────────────────────────────
     Cinco atos que o cofre expoe e que sao `_checkOwner()`: quem manda na
     politica do cofre e o dono dele, e nao o protocolo. Todos com argumentos de
     tipo estatico, uma palavra cada, montaveis pelo codificador do motor.
     `setLimits(uint64,uint64,uint16,uint112)` esteve FORA desta lista ate
     2026-08-23, e o motivo esta preservado porque a ordem importou: o motor nao
     tinha `uint112`, e soma-lo mexeria na superficie que as quatro telas de
     assinatura compartilham — Lei do Sangue, Tubarao ANTES e nao depois. O
     Tubarao vetou soma-lo isolado, exigiu que a classe fosse consertada
     primeiro (todo uint passou a validar a propria largura), e so entao o tipo
     entrou. O ato existe agora porque aquela condicao foi cumprida, e nao
     porque alguem cansou de esperar.
     O QUE CONTINUA FORA: `executeAsOwner`, cujo `ExecutionParams` carrega
     `bytes routeCalldata` — tipo dinamico, que este codificador nao monta. */
  function passoAtivo() {
    var args = [
      { nome: "token", tipo: "address", valor: CTX.alvo },
      { nome: "allowed", tipo: "bool", valor: CTX.ligado ? "true" : "false" }
    ];
    return montar("vault", "setAllowedAsset(address,bool)", CTX.cofre, args,
      CTX.ligado ? "Libera este ativo dentro do seu cofre. A cerca nasce fechada."
                 : "Bloqueia este ativo dentro do seu cofre.");
  }

  function passoEstrategia() {
    var args = [{ nome: "strategy", tipo: "address", valor: CTX.alvo }];
    return montar("vault", "setStrategy(address)", CTX.cofre, args,
      "Aponta o seu cofre para uma estrategia. So o seu endereco pode trocar isto.");
  }

  function passoMoedaDoCofre() {
    var args = [
      { nome: "token", tipo: "address", valor: CTX.alvo },
      { nome: "enabled", tipo: "bool", valor: CTX.ligado ? "true" : "false" }
    ];
    return montar("vault", "setBaseCurrency(address,bool)", CTX.cofre, args,
      "Define a moeda-base DO SEU COFRE. Quem decide isto e voce, nao o protocolo.");
  }

  /* Os quatro tetos do cofre, numa palavra so na chain e em quatro campos aqui.
     A ordem dos argumentos e a da assinatura, e nao a do layout empacotado —
     sao coisas diferentes: `pack()` poe cooldown nos bits altos, e a chamada
     recebe cooldown primeiro por coincidencia, nao por regra. */
  function passoLimites() {
    var args = [
      { nome: "cooldown", tipo: "uint64", valor: CTX.limites.cooldown },
      { nome: "maxValidity", tipo: "uint64", valor: CTX.limites.maxValidity },
      { nome: "minRatioBps", tipo: "uint16", valor: CTX.limites.minRatioBps },
      { nome: "quantum", tipo: "uint112", valor: CTX.limites.quantum }
    ];
    return montar("vault", "setLimits(uint64,uint64,uint16,uint112)", CTX.cofre, args,
      "Define os quatro tetos do SEU cofre. `minRatioBps` em zero desliga o piso " +
      "de razao — e desligar um piso e uma decisao, nao um descuido.");
  }

  function passoGuarda() {
    var args = [{ nome: "guard", tipo: "address", valor: CTX.alvo }];
    return montar("vault", CTX.ligado ? "addGuard(address)" : "removeGuard(address)",
      CTX.cofre, args,
      CTX.ligado ? "Soma um guardiao ao seu cofre." : "Tira um guardiao do seu cofre.");
  }

  function passoSacar() {
    var args = [
      { nome: "token", tipo: "address", valor: moedaDoPasso() },
      { nome: "amount", tipo: "uint256", valor: String(CTX.quantia) },
      { nome: "to", tipo: "address", valor: CTX.conta }
    ];
    return montar("vault", "withdraw(address,uint256,address)", CTX.cofre, args,
      "Tira a quantia do cofre e devolve para a sua carteira. Sempre disponivel.");
  }

  function montar(papel, assinatura, para, args, explicacao) {
    var dados = sig(papel, assinatura);
    for (var i = 0; i < args.length; i++) {
      var cod = CODIFICADOR_POR_TIPO[args[i].tipo];
      if (!cod) throw new Error("tipo sem codificador neste modulo: " + args[i].tipo);
      dados += cod(args[i].valor);
    }
    /* `alvo`/`valor`, e nao `to`: sao os campos que amarrarTx() consome para
       fazer nascer p.tx. Ter dois nomes para a mesma coisa e como duas
       canonicalizacoes entraram, uma vez. */
    return { papel: papel, assinatura: assinatura, alvo: para, dados: dados, valor: 0,
             args: args, explicacao: explicacao };
  }

  /* --------------------------------------------------- amarrar e congelar --- */
  /* REGRA 11 · a ligacao tela<->calldata roda ANTES de existir `p.tx`. Passo que
     nao amarra nao vira transacao: nao ha objeto para congelar, nao ha cartao
     para desenhar, nao ha o que clicar. Recusar depois de existir tx, digital e
     cartao ja e tarde — a essa altura a pessoa ja leu algo. */
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

  /* A carga nasce AQUI, congelada, e a impressao digital sai DELA. Depois disto
     nada e recalculado: o cartao desenha daqui, o clique reconfere contra isto,
     e a carteira recebe esta mesma referencia. */
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
    var c = ELS.cartao;
    limpar(c);
    c.appendChild(novo("h3", "asstitulo", p.assinatura));
    c.appendChild(novo("p", "assexplica", p.explicacao));
    /* TUDO aqui sai de `p.carga` — o objeto congelado, o mesmo que a carteira
       recebe. Nao de `p.dados`, nao de `p.alvo`. `chainId` e a unica excecao e
       fica declarada: ele nao mora na carga (a carteira o recebe pela sessao) e
       e reconferido em separado contra eth_chainId no clique. */
    linha(c, "contrato", p.carga.to, "mono");
    linha(c, "chain destes bytes", String(p.tx.chainId), "mono");
    p.args.forEach(function (a) { linha(c, a.nome + " (" + a.tipo + ")", String(a.valor), "mono"); });
    linha(c, "valor nativo", BigInt(p.carga.value) === 0n
      ? "0 POL — zero explicito, nunca por omissao" : p.carga.value, "mono");
    linha(c, "impressao digital", String(p.hash).slice(0, 32) + "…", "mono");
    linha(c, "calldata", String((p.carga.data.length - 2) / 2) + " bytes", null);
    var pre = novo("pre", "asscod");
    pre.setAttribute("translate", "no");
    pre.textContent = p.carga.data;
    c.appendChild(pre);
    /* O resultado da regra 11, impresso: quantas palavras da calldata foram
       RECONSTRUIDAS a partir do que esta escrito acima. */
    if (p.ligacao) {
      linha(c, "palavras ligadas a tela",
        String(p.ligacao.ligadas) + " de " + String(p.ligacao.palavras), "mono");
    }
    return c;
  }

  /* -------------------------------------------------------------- enviar ---- */
  var resolverPromessa = null;

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
    if (seloAtual() !== p.selo) {
      diga("o contexto mudou depois que estes bytes foram congelados. Nada foi enviado " +
        "e sua carteira nao foi consultada — monte de novo e leia os bytes novos.", "bad");
      return null;
    }
    if (!p.ligacao) {
      diga("este passo nao amarrou a tela a calldata, e passo que nao amarra nao vira " +
        "transacao. Nada foi enviado.", "bad");
      return null;
    }

    ENVIANDO = true;
    ELS.btnEnviar.disabled = true;
    try {
      /* A carga NAO e construida aqui. Foi construida uma unica vez no
         congelamento e e ESTA REFERENCIA que foi impressa digitalmente, que o
         cartao desenhou e que vai para a carteira. Um literal montado no envio —
         ainda que com os mesmos campos — faria a impressao digital provar o que
         a pagina CONGELOU e nao o que ela ENVIA. */
      var carga = p.carga;

      var tx = p.tx;
      var h = await hashDaCarga(carga, tx.chainId);
      if (h !== p.hash) {
        throw new Error("RECUSADO, nada foi enviado: o objeto nao e o que foi impresso na tela. " +
          "Selo ao desenhar " + p.hash.slice(0, 16) + "…, selo agora " + h.slice(0, 16) + "…");
      }

      /* A chain e reconferida no CLIQUE e nao na conexao: entre conectar e
         clicar cabe uma troca de rede inteira. Esta pagina nao pede troca — ela
         recusa, e voce troca. Pagina que troca a sua rede em silencio e pagina
         que decide onde voce assina. */
      var cid = await pedirCarteira("eth_chainId");
      if (cid !== L.CHAIN_HEX) {
        throw new Error("RECUSADO, nada foi enviado: a carteira esta na rede " + cid +
          " e estes bytes foram congelados para a " + L.CHAIN_HEX + ".");
      }

      /* E a CONTA tambem. Uma aprovacao pertence ao endereco que a concede, e um
         cofre ao endereco que o comanda: entre montar e clicar cabe uma troca de
         conta, nao so de rede. */
      var contas = await pedirCarteira("eth_accounts");
      var ativa = contas && contas.length ? String(contas[0]) : "";
      if (ativa.toLowerCase() !== String(carga.from).toLowerCase()) {
        throw new Error("RECUSADO, nada foi enviado: a conta ativa da carteira e " + (ativa || "(nenhuma)") +
          " e estes bytes foram montados para " + carga.from + ".");
      }

      /* Simula antes de expor o envio: uma transacao que reverteria nao chega a
         pedir assinatura, e o motivo da reversao sai pelo nome do erro. */
      try {
        await lerChain("eth_call", [{ from: carga.from, to: carga.to, data: carga.data }, "latest"]);
      } catch (sim) {
        var r = decodificarRevert(sim && sim.data ? sim.data : "");
        var porque = r && r.nome ? " com " + r.nome
          : (sim && sim.message ? " (" + String(sim.message).slice(0, 120) + ")" : "");
        throw new Error("reverteria" + porque + " — nada foi enviado, e sua carteira nao foi consultada");
      }

      diga("a transacao esta na sua carteira agora. Nada mais acontece aqui ate voce aceitar ou recusar.", "ok");
      /* A MESMA referencia conferida acima. */
      var hash = await pedirCarteira("eth_sendTransaction", [carga]);
      diga("enviada: " + hash, "tx");

      var rec = await esperarRecibo(hash);
      if (!rec) {
        diga("enviada, mas o recibo nao chegou a tempo. O hash acima e a fonte.", "bad");
        return { hash: hash, recibo: null };
      }
      var ok = rec.status === "0x1";
      diga("recibo: status " + rec.status + (ok ? " (sucesso)" : " (FALHOU na chain)") +
        " · bloco " + (rec.blockNumber ? parseInt(rec.blockNumber, 16) : "—") +
        " · gas " + (rec.gasUsed ? parseInt(rec.gasUsed, 16) : "—"), ok ? "ok" : "bad");
      if (!ok) {
        diga("minerada e FALHOU. Gas foi gasto e nada mudou. Isso e a resposta da chain, " +
          "nao a leitura desta pagina.", "bad");
      }
      return { hash: hash, recibo: rec, ok: ok };
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

  /* ------------------------------------------------------------ a janela ---- */
  function construirJanela() {
    if (ELS) return ELS;
    var fundo = novo("div", "assfundo");
    /* AS PROPRIEDADES QUE DECIDEM SE A JANELA EXISTE SAO CRAVADAS AQUI, e nao
       herdadas de um arquivo de estilo. O motivo foi medido em 2026-08-23: o
       fundador clicou em Deploy, o terminal escreveu "confira e assine na
       janela", e a janela nao apareceu. A logica estava certa — rodada fora do
       navegador, ela montava o cartao com onze elementos e somava a classe que
       abre. O que faltou foi o CSS: o navegador tinha uma copia anterior de
       console-v0.css em cache, e nessa copia `.assfundo` nao existia.
       O sintoma foi o pior possivel: nenhum erro, nenhuma mensagem, o fluxo
       parado esperando um clique num elemento invisivel. Uma superficie que
       pergunta "voce autoriza?" nao pode depender de um arquivo que pode vir
       velho, sobrescrito ou faltando. O CSS continua valendo para a APARENCIA;
       a EXISTENCIA e destas linhas.
       Sao atribuicoes com valor LITERAL de proposito: o guardiao recusa `.style`
       que receba expressao, porque CSS vindo de dado reescreve o que se le antes
       de assinar. Literal ele aceita, e literal e o que basta aqui. */
    fundo.style.position = "fixed";
    fundo.style.top = "0";
    fundo.style.right = "0";
    fundo.style.bottom = "0";
    fundo.style.left = "0";
    fundo.style.zIndex = "2147483000";
    fundo.style.display = "none";
    fundo.style.alignItems = "center";
    fundo.style.justifyContent = "center";
    fundo.style.padding = "24px";
    var cx = novo("div", "asscaixa");
    cx.style.maxWidth = "760px";
    cx.style.width = "100%";
    cx.style.maxHeight = "88vh";
    cx.style.overflow = "auto";

    /* A MARCA, e nao um cinza qualquer. Os valores abaixo sao os do manual —
       `--paper`, `--raised`, `--ink`, `--rule`, `--scrim` — nos dois temas, com a
       tipografia da casa: Public Sans no texto, IBM Plex Mono no que e codigo.
       Eles vao no estilo do elemento, e nao so na folha, pelo mesmo motivo do
       layout: uma janela que pergunta "voce autoriza?" nao pode aparecer sem
       identidade porque um arquivo veio velho do cache. A folha continua valendo
       e pode refinar; isto e o piso.
       O tema e LIDO do documento em vez de presumido: a primeira versao cravou
       fundo branco e ficou ilegivel no tema escuro, que e o que o fundador usa. */
    var escuro = document.documentElement.getAttribute("data-theme") === "dark";
    if (escuro) {
      fundo.style.background = "rgba(9,10,13,.72)";
      cx.style.background = "#191C22";
      cx.style.color = "#ECEDEA";
      cx.style.border = "1px solid #2A2E36";
      cx.style.boxShadow = "0 24px 64px rgba(0,0,0,.55)";
    } else {
      fundo.style.background = "rgba(22,24,29,.62)";
      cx.style.background = "#FFFFFF";
      cx.style.color = "#16181D";
      cx.style.border = "1px solid #DDE0DA";
      cx.style.boxShadow = "0 24px 64px rgba(22,24,29,.22)";
    }
    cx.style.padding = "24px";
    cx.style.borderRadius = "10px";
    /* Sem aspas dentro do valor: a familia com espaco e valida como sequencia de
       identificadores em CSS, e o guardiao exige que uma atribuicao a `.style`
       seja um literal SEM aspas internas — porque a regra dele nao pode depender
       de julgar onde uma string termina. A regra esta certa e o valor cede. */
    cx.style.fontFamily = "Public Sans, system-ui, -apple-system, sans-serif";
    cx.setAttribute("role", "dialog");
    cx.setAttribute("aria-modal", "true");
    cx.setAttribute("aria-label", "Confira antes de assinar");

    cx.appendChild(novo("p", "asscabeca", "Confira estes bytes. Sua carteira vai mostrar os mesmos."));
    var cartao = novo("div", "asscartao");
    cx.appendChild(cartao);
    var saida = novo("div", "asssaida");
    cx.appendChild(saida);

    var barra = novo("div", "assbarra");
    var btnCancelar = novo("button", "assbtn", "Cancelar");
    var btnEnviar = novo("button", "assbtn assprim", "Assinar na carteira");
    /* `--ultramarine` e a cor da acao no manual: #2743C7 no claro, #8FA1F2 no
       escuro, com `--on-brand` por cima. O botao que abre a carteira usa a cor
       da marca; o que cancela nao usa cor nenhuma, porque cancelar nao e uma
       decisao que precise de enfase. */
    btnCancelar.style.padding = "10px 18px";
    btnCancelar.style.borderRadius = "6px";
    btnCancelar.style.cursor = "pointer";
    btnCancelar.style.background = "transparent";
    btnCancelar.style.font = "inherit";
    btnEnviar.style.padding = "10px 18px";
    btnEnviar.style.borderRadius = "6px";
    btnEnviar.style.cursor = "pointer";
    btnEnviar.style.fontWeight = "600";
    btnEnviar.style.font = "inherit";
    if (escuro) {
      btnCancelar.style.border = "1px solid #2A2E36";
      btnCancelar.style.color = "#A2A8B2";
      btnEnviar.style.background = "#8FA1F2";
      btnEnviar.style.color = "#131519";
      btnEnviar.style.border = "1px solid #8FA1F2";
    } else {
      btnCancelar.style.border = "1px solid #DDE0DA";
      btnCancelar.style.color = "#52575D";
      btnEnviar.style.background = "#2743C7";
      btnEnviar.style.color = "#FFFFFF";
      btnEnviar.style.border = "1px solid #2743C7";
    }
    /* Os botoes tambem: uma janela que aparece com botoes invisiveis e pior que
       uma janela que nao aparece, porque parece que travou. */
    btnCancelar.style.padding = "10px 18px";
    btnCancelar.style.borderRadius = "9px";
    btnCancelar.style.cursor = "pointer";
    btnEnviar.style.padding = "10px 18px";
    btnEnviar.style.borderRadius = "9px";
    btnEnviar.style.cursor = "pointer";
    btnEnviar.style.background = "#2743C7";
    btnEnviar.style.color = "#ffffff";
    btnEnviar.style.fontWeight = "600";
    barra.appendChild(btnCancelar);
    barra.appendChild(btnEnviar);
    cx.appendChild(barra);
    fundo.appendChild(cx);
    document.body.appendChild(fundo);

    ELS = { fundo: fundo, caixa: cx, cartao: cartao, saida: saida, btnEnviar: btnEnviar, btnCancelar: btnCancelar };

    /* Handler de clique com a palavra `function` de proposito: o parser do
       guardiao procura exatamente esta forma, e uma seta aqui deixaria a regiao
       INVISIVEL para a varredura que proibe remontar calldata no clique. Um
       arquivo em que o guardiao nao enxerga handler nenhum e um arquivo em que
       essa regra nao esta sendo aplicada — e ele reporta isso, mas so se souber
       procurar. */
    btnEnviar.addEventListener("click", function () {
      enviar(CONGELADO).then(function (r) {
        if (r) fechar(r);
      }).catch(function (e) {
        diga(String(e && e.message ? e.message : e), "bad");
        ELS.btnEnviar.disabled = false;
      });
    });
    btnCancelar.addEventListener("click", function () {
      diga("cancelado. Nada foi enviado.", null);
      fechar(null);
    });
    return ELS;
  }

  function fechar(resultado) {
    if (ELS) {
      ELS.fundo.classList.remove("assaberto");
      ELS.fundo.style.display = "none";
    }
    CONGELADO = null;
    var r = resolverPromessa;
    resolverPromessa = null;
    if (r) r(resultado);
  }

  var ATOS = {
    criar: passoCriar,
    aprovar: passoAprovar,
    depositar: passoDepositar,
    sacar: passoSacar,
    ativo: passoAtivo,
    estrategia: passoEstrategia,
    limites: passoLimites,
    moedaDoCofre: passoMoedaDoCofre,
    guarda: passoGuarda
  };

  /* ------------------------------------------------------------- a porta ---- */
  /* O que o console chama. Devolve uma promessa que resolve com o recibo quando
     a transacao e minerada, ou com null quando a pessoa cancela. Ela NUNCA
     resolve com sucesso sem recibo: o console nao tem como escrever um saldo
     por engano a partir do retorno desta funcao. */
  async function assinar(ato, opcoes) {
    var fabrica = ATOS[ato];
    if (!fabrica) throw new Error("ato desconhecido neste modulo: " + String(ato));
    var o = opcoes || {};
    CTX.conta = o.conta || null;
    CTX.cofre = o.cofre || null;
    CTX.indice = o.indice === undefined || o.indice === null ? 0 : Number(o.indice);
    CTX.quantia = o.quantia === undefined ? null : o.quantia;
    CTX.moeda = o.moeda || null;
    CTX.alvo = o.alvo || null;
    CTX.ligado = o.ligado === undefined ? null : !!o.ligado;
    CTX.limites = o.limites || null;
    if (!CTX.conta) throw new Error("sem conta conectada: nao ha para quem montar estes bytes");
    /* Recusa ANTES de construir a janela. Um `setLimits` sem os quatro campos
       montaria a calldata com `undefined`, e o codificador recusaria depois de a
       pessoa ja estar olhando um cartao pela metade. */
    if (ato === "limites") {
      var faltando = ["cooldown", "maxValidity", "minRatioBps", "quantum"]
        .filter(function (k) { return !CTX.limites || CTX.limites[k] === undefined || CTX.limites[k] === null; });
      if (faltando.length) {
        throw new Error("setLimits pede os quatro tetos e faltou: " + faltando.join(", ") +
          ". Os quatro vao juntos na mesma palavra — mandar so um apagaria os outros tres.");
      }
    }

    construirJanela();
    limpar(ELS.saida);
    var p = fabrica();
    amarrarTx(p, CTX.conta);
    await congelar(p);
    p.selo = seloAtual();
    CONGELADO = p;
    desenharCartao(p);
    ELS.btnEnviar.disabled = false;
    ELS.fundo.classList.add("assaberto");
    ELS.fundo.style.display = "flex";

    /* A JANELA E MEDIDA DEPOIS DE ABERTA, e nao presumida aberta.
       Esta e a classe inteira do defeito de 2026-08-23: o passo foi montado, o
       cartao desenhado, a classe somada — e nada apareceu, porque o navegador
       tinha um CSS velho em cache. Nenhum erro, nenhuma mensagem, o fluxo parado
       esperando um clique num elemento invisivel. Uma tela que nao aparece e uma
       tela que trava sem dizer que travou.
       A tecnica nao e nova nesta casa: em 2026-08-13 alguem achou uma tela do
       console que existia e ninguem alcancava, e achou medindo exatamente isto —
       `offsetParent` nulo e largura zero num elemento que o codigo dizia estar
       de pe. O que era diagnostico virou guarda.
       Se a medicao nao existir (fora do navegador, num teste), nao ha o que
       medir e a guarda nao inventa um veredito. */
    if (typeof ELS.caixa.getBoundingClientRect === "function") {
      var r = ELS.caixa.getBoundingClientRect();
      if (!r.width || !r.height) {
        ELS.fundo.style.display = "none";
        CONGELADO = null;
        resolverPromessa = null;
        throw new Error("A janela de assinatura foi montada e NAO ficou visivel (" +
          Math.round(r.width) + "x" + Math.round(r.height) + "). Nada foi enviado e sua carteira " +
          "nao foi consultada. Isso costuma ser folha de estilo antiga em cache: recarregue com " +
          "Ctrl+Shift+R. Se persistir, algo nesta pagina esta cobrindo a janela.");
      }
    }
    ELS.btnEnviar.focus();
    return new Promise(function (resolve) { resolverPromessa = resolve; });
  }

  /* `decodificarRevert` sai daqui porque o console precisou dela para traduzir a
     recusa de `dryRunChecks`, e uma segunda copia la seria a mesma classe de
     defeito que o cabecalho de motor.js descreve: duas canonicalizacoes do mesmo
     objeto que se separam sem ninguem notar. Uma definicao, dois consumidores. */
  var API = { assinar: assinar, atos: Object.keys(ATOS),
              decodificarRevert: decodificarRevert };
  if (typeof module !== "undefined" && module.exports) { module.exports = API; }
  if (raiz) { raiz.TRIVIU_ASSINAR = API; }
})(typeof window !== "undefined" ? window : null);
