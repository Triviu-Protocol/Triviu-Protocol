#!/usr/bin/env node
/* OS PORTOES MORDEM?  ·  2026-08-19
 * ---------------------------------------------------------------------------
 * Lei #14 manda transformar cada ressalva em portao automatico cravado. Ate
 * este arquivo existir, isso nao estava sendo feito: os controles rodavam a mao
 * no terminal, o resultado ia para um documento, e o documento envelhecia. Um
 * comando num transcript nao e portao.
 *
 * A consequencia foi medida, nao imaginada. Um conserto fechou um furo em que a
 * regra amarrava por PROXIMIDADE em vez de CONTENCAO; dias depois — na mesma
 * onda — o mesmo furo voltou por outro mecanismo (callback anonimo em vez de
 * statement no topo), com assinatura identica. Nada re-executava a prova, entao
 * nada avisou.
 *
 * Este portao e a prova, executavel. Cada linha do corpus abaixo e um controle
 * que ja pegou um defeito real desta casa, agora congelado: ele roda no hook, na
 * esteira, e em toda invocacao do trilho.
 *
 * ===========================================================================
 * COMO ELE JULGA · e por que precisa de laboratorio
 * ===========================================================================
 *
 * Um controle so mede quando a LINHA DE BASE APROVA. Rodar um controle numa
 * arvore que ja esta vermelha por divida conhecida devolve RECUSA para tudo —
 * inclusive para o controle removido — e isso nao e sinal, e ruido. Ja
 * aconteceu aqui: tres controles seguidos "confirmaram" o que nao tinham
 * medido.
 *
 * Por isso o corpus roda num LABORATORIO: uma copia da arvore do indice, onde
 * os arquivos nao-commitados (a divida do modelo-2) nao existem e a linha de
 * base e verde. O fixture entra la, o portao roda la, e o repositorio de
 * verdade nao e tocado em nenhum momento.
 *
 * E o corpus tem os DOIS sentidos, sempre. Um portao que so recusa e tao
 * inutil quanto um que so aprova: `mordida` prova que ele pega o defeito,
 * `calado` prova que ele nao pega o codigo legitimo. Sem os dois, a unica
 * forma de fazer o portao "passar" e afrouxa-lo.
 */
import { readdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, cpSync, existsSync, unlinkSync, symlinkSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { OBRIGATORIOS } from "./_obrigatorios.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

/* ===========================================================================
 * O CORPUS · cada linha e uma cicatriz desta casa
 * ===========================================================================
 * `mordida` = o portao TEM de recusar   ·  `calado` = o portao TEM de aprovar
 * `onde` = arquivo que recebe o fixture, relativo a raiz do laboratorio
 */
const CORPUS = [
  /* ----- check-alcance-dom · alcance da subarvore que assina (Lei #1) ----- */
  { portao: "check-alcance-dom", tipo: "mordida", onde: "site/js/zz.js",
    nome: "querySelector('#lp-') e escrita",
    codigo: `document.querySelector("#lp-erro").innerHTML = "x";` },

  { portao: "check-alcance-dom", tipo: "mordida", onde: "site/js/zz.js",
    nome: "prefixo nu guardado em variavel",
    codigo: `const P = "lp-";\ndocument.getElementById(P + k).textContent = "y";` },

  { portao: "check-alcance-dom", tipo: "mordida", onde: "site/js/zz.js",
    nome: "prefixo nu via .concat",
    codigo: `document.getElementById("lp-".concat(k)).innerHTML = "z";` },

  { portao: "check-alcance-dom", tipo: "mordida", onde: "site/js/zz.js",
    nome: "seletor de atributo em caixa alta",
    codigo: `document.querySelectorAll("[ID^='lp-']").forEach(function (e) { e.remove(); });` },

  { portao: "check-alcance-dom", tipo: "mordida", onde: "site/js/zz.js",
    nome: "seletor de classe .lp-*",
    codigo: `document.querySelector(".lp-erro").className = "q";` },

  { portao: "check-alcance-dom", tipo: "mordida", onde: "site/js/zz.js",
    nome: "alvo irresoluvel · o literal e da propria escrita",
    codigo: `function w(t) { document.getElementById(t).classList.add("on"); }` },

  { portao: "check-alcance-dom", tipo: "mordida", onde: "site/js/zz.js",
    nome: "A-8 · amarra emprestada por vizinhanca (statement no topo)",
    codigo: `function abrir(id) { var o = document.getElementById(id); if (o) o.hidden = false; }
abrir("temaOv");
var id = String.fromCharCode(108, 112, 45) + "endereco";
document.getElementById(id).innerHTML = "<b>0x0</b>";` },

  { portao: "check-alcance-dom", tipo: "mordida", onde: "site/js/zz.js",
    nome: "C-1 · amarra atravessando arrow aninhada",
    codigo: `function abrir(id) {
  [1, 2].forEach((id) => { document.getElementById(id).innerHTML = "<b>x</b>"; });
}
abrir("temaOv");` },

  { portao: "check-alcance-dom", tipo: "mordida", onde: "site/js/zz.js",
    nome: "C-1 · amarra atravessando callback anonimo",
    codigo: `function abrir(id) {
  algo.forEach(function (id) { document.getElementById(id).innerHTML = "<b>x</b>"; });
}
abrir("temaOv");` },

  { portao: "check-alcance-dom", tipo: "mordida", onde: "site/js/zz.js",
    nome: "a funcao amarrada RECEBE um id lp-* numa chamada",
    codigo: `function w(t) { document.getElementById(t).innerHTML = ""; }\nw("lp-erro");` },

  { portao: "check-alcance-dom", tipo: "calado", onde: "site/js/zz.js",
    nome: "escrita DENTRO da funcao, amarrada por chamadas literais",
    codigo: `function abrir(id) { document.getElementById(id).innerHTML = "x"; }
abrir("temaOv"); abrir("outro");` },

  { portao: "check-alcance-dom", tipo: "calado", onde: "site/js/zz.js",
    nome: "amarrada, com blocos if/for entre a chamada e o cabecalho",
    codigo: `function abrir(id) { if (true) { for (;;) { document.getElementById(id).innerHTML = "x"; } } }
abrir("temaOv");` },

  { portao: "check-alcance-dom", tipo: "calado", onde: "site/js/zz.js",
    nome: "iterador sobre array nomeado de literais",
    codigo: `var C = ["a-um", "a-dois"];\nC.forEach(function (id) { document.getElementById(id).textContent = ""; });` },

  { portao: "check-alcance-dom", tipo: "calado", onde: "site/js/zz.js",
    nome: "LEITURA de lp-* · livre por desenho",
    codigo: `const e = document.querySelector("#lp-ler");\nif (e) { console.log(e.textContent); }` },

  /* O id destes dois controles era `c-ler` ate 2026-08-19. Naquele dia a tela
     `/calldata/` entrou na cobertura do check-alcance-dom e `c-` virou namespace
     protegido — entao um fixture que usava `c-ler` passou a ser, corretamente,
     uma violacao. O fixture e que envelheceu: a intencao dele e provar a amarra
     por atribuicao literal, e isso nao depende de qual namespace o id usa. */
  { portao: "check-alcance-dom", tipo: "calado", onde: "site/js/zz.js",
    nome: "C-5 · atribuicao literal em statement ANTERIOR (a amarra 2 documentada)",
    codigo: `const $ = i => document.getElementById(i);
var id = "zz-ler";
$(id).innerHTML = "x";` },

  { portao: "check-alcance-dom", tipo: "calado", onde: "site/js/zz.js",
    nome: "amarra 1 · array de literais no mesmo statement",
    codigo: `const $ = i => document.getElementById(i);
["a-um", "a-dois"].forEach(id => { $(id).innerHTML = "x"; });` },

  { portao: "check-alcance-dom", tipo: "mordida", onde: "site/js/zz.js",
    nome: "atribuicao literal a OUTRO nome nao amarra este",
    codigo: `const $ = i => document.getElementById(i);
var outro = "zz-ler";
$(alvo).innerHTML = "x";` },

  { portao: "check-alcance-dom", tipo: "mordida", onde: "site/js/zz.js",
    nome: "arrow de corpo de EXPRESSAO · fronteira sem chave nenhuma",
    codigo: `const $ = i => document.getElementById(i);
function abrir(id) { const p = (id) => $(id).innerHTML = "<b>x</b>"; p(z); }
abrir("temaOv");` },

  { portao: "check-alcance-dom", tipo: "mordida", onde: "site/js/zz.js",
    nome: "arrow de um parametro, sem parenteses e sem chave",
    codigo: `const $ = i => document.getElementById(i);
function abrir(id) { const p = id => $(id).innerHTML = "x"; p(z); }
abrir("temaOv");` },

  { portao: "check-alcance-dom", tipo: "calado", onde: "site/js/zz.js",
    nome: "arrow FECHADA antes da escrita, com o mesmo nome de parametro",
    codigo: `const $ = i => document.getElementById(i);
function abrir(id) { [1, 2].map(id => id + 1); $(id).innerHTML = "x"; }
abrir("temaOv"); abrir("outro");` },

  /* D-1 · as duas direcoes do desvio de contagem de chaves. Caminhando para
     tras, `}` INCREMENTA a profundidade e `{` a consome — entao os dois erram,
     em sentidos opostos. O cabecalho de check-alcance-dom afirma que este corpus
     exercita as duas; estes dois fixtures sao o que torna a frase verdadeira. */
  { portao: "check-alcance-dom", tipo: "mordida", onde: "site/js/zz.js",
    nome: "D-1 · chave `}` dentro de string, antes da escrita",
    codigo: `const $ = i => document.getElementById(i);
const t = "fecha }";
$(alvo).innerHTML = "x";` },

  { portao: "check-alcance-dom", tipo: "mordida", onde: "site/js/zz.js",
    nome: "D-1 · chave `{` dentro de string, antes da escrita",
    codigo: `const $ = i => document.getElementById(i);
const t = "abre {";
$(alvo).innerHTML = "x";` },

  /* ----------------- check-sem-estilo-inline · F-3 ----------------------- */
  { portao: "check-sem-estilo-inline", tipo: "mordida", onde: "site/js/zz.js",
    nome: "atributo style= montado em string",
    codigo: 'd.innerHTML = `<i style="color:red"></i>`;' },

  { portao: "check-sem-estilo-inline", tipo: "mordida", onde: "site/js/zz.js",
    nome: "A-5 · STYLE= em caixa alta",
    codigo: 'd.innerHTML = `<i STYLE="color:red"></i>`;' },

  { portao: "check-sem-estilo-inline", tipo: "mordida", onde: "site/js/zz.js",
    nome: "A-5 · setAttribute(\"STYLE\")",
    codigo: 'e.setAttribute("STYLE", "color:red");' },

  { portao: "check-sem-estilo-inline", tipo: "mordida", onde: "site/js/zz.js",
    nome: "A-5 · bloco <STYLE> em caixa alta",
    codigo: 'd.innerHTML = `<STYLE>.a{color:red}</STYLE>`;' },

  { portao: "check-sem-estilo-inline", tipo: "calado", onde: "site/js/zz.js",
    nome: "CSSOM · a CSP nao governa, e nao e materia deste portao",
    codigo: 'e.style.color = "red";' },

  { portao: "check-sem-estilo-inline", tipo: "calado", onde: "site/js/zz.js",
    nome: "as mesmas formas DENTRO de comentario",
    codigo: '/* style="x" e <style> aqui dentro */\nconst y = 2;' },

  /* ---------------------------- check-csp -------------------------------- */
  { portao: "check-csp", tipo: "mordida", onde: "site/simulate/index.html", modo: "inserir",
    nome: "preconnect para terceiro · a CSP nao governa isso",
    ancora: '<link href="/vendor/estilos/simulate.css" rel="stylesheet">',
    codigo: '<link rel="preconnect" href="https://fonts.gstatic.com">' },

  { portao: "check-csp", tipo: "mordida", onde: "site/simulate/index.html", modo: "inserir",
    nome: "dns-prefetch para terceiro",
    ancora: '<link href="/vendor/estilos/simulate.css" rel="stylesheet">',
    codigo: '<link rel="dns-prefetch" href="https://cdn.example.com">' },

  { portao: "check-enderecos-drift", tipo: "calado", onde: "site/enderecos.js",
    modo: "copiar", de: "contracts/deploy/enderecos.js",
    nome: "copia byte-identica a fonte canonica" },

  { portao: "check-hook-vivo", tipo: "calado", onde: ".githooks/pre-commit",
    nome: "hook correto · invoca o trilho no indice",
    codigo: [
      "#!/usr/bin/env sh",
      'node "$(git rev-parse --show-toplevel)/scripts/portoes.mjs" --indice',
      "exit $?",
    ].join("\n") },

  { portao: "check-multichain-honesty", tipo: "calado", onde: "site/zz.html",
    nome: "afirma o verdadeiro · Polygon implantada, as outras nao",
    codigo: '<html><body><p>Triviu runs on Polygon today. Arbitrum and BSC use the same contracts and are not deployed yet.</p></body></html>' },

  { portao: "check-console-abi", tipo: "mordida", onde: "site/js/abi-console.js",
    nome: "o ABI da tela divergiu do que os artefatos produzem",
    codigo: 'var ABI = {"contratos":{},"extras":{}};' },

  { portao: "check-console-abi", tipo: "calado", onde: "site/js/abi-console.js",
    modo: "copiar", de: "site/js/abi-console.js",
    nome: "o ABI da tela reproduz os artefatos de contracts/out" },

  /* --------------- check-regra6-magnitude · F-6b · Lei #1 ----------------- */
  { portao: "check-regra6-magnitude", tipo: "mordida", onde: "site/js/motor.js", modo: "trocar",
    nome: "a deteccao de maximo canonico some · uint96 max volta a passar",
    ancora: "function ehMaximoCanonico", codigo: "function ehMaximoCanonicoDesligado" },

  { portao: "check-regra6-magnitude", tipo: "mordida", onde: "site/js/motor.js", modo: "trocar",
    nome: "tiposPorPalavra sai do motor · a regra volta a lancar ReferenceError",
    ancora: "  function tiposPorPalavra(papel, assinatura) {",
    codigo: "  function tiposPorPalavraRemovida(papel, assinatura) {" },

  { portao: "check-regra6-magnitude", tipo: "calado", onde: "site/js/zz.js",
    nome: "arquivo solto nao afeta a regra 6 · ela vive no motor",
    codigo: "var x = 1;" },

  /* --- a classe que o red team do Escorpiao abriu em 2026-08-19 ------------
     Quatro exploits, um mecanismo: portao que decide LENDO TEXTO cai contra quem
     escreve o texto sem o efeito. As mordidas abaixo sao os PoCs dele, cravados
     no artefato — porque comando em transcricao nao e portao. */

  { portao: "check-origem-unica", tipo: "mordida", onde: "site/js/console-lp.js", modo: "trocar",
    nome: "PoC A1 do Escorpiao · a cardinalidade vira ramo morto e qualquer host da lista passa",
    ancora: "if (hosts.length !== 1) {",
    codigo: "if (hosts.length !== 1 && false) {" },

  { portao: "check-duas-fontes", tipo: "mordida", onde: "site/js/console-lp.js", modo: "trocar",
    nome: "PoC B1 do Escorpiao · o throw fica no texto e nunca roda",
    ancora: "        if (a !== b) {", codigo: "        if (a !== b && false) {" },

  { portao: "check-provedor-unico", tipo: "mordida", onde: "site/js/console.js", modo: "inserir",
    nome: "PoC C1 do Escorpiao · leitura do slot disfarcada por concatenacao",
    ancora: "function pedirCarteira", codigo: '  var atalho = window["eth" + "ereum"];' },

  /* O PoC E1 na sua forma completa — arquivo NOVO que assina disfarcado — so o
     `check-assinatura` julga, e ele esta em SEM_CORPUS enquanto a divida do
     modelo-2 deixar a linha de base vermelha. O que da para exercer aqui e o
     DISFARCE, que e o mecanismo do ataque: arquivo novo cujo envio e a leitura
     do slot nascem de um `+`. Se a dobra de literais parar de funcionar, esta
     mordida cala — e e por isso que ela existe. */
  { portao: "check-provedor-unico", tipo: "mordida", onde: "site/js/atalho-oculto.js",
    nome: "PoC E1 do Escorpiao · arquivo novo que assina e le o slot, os dois montados com um mais",
    codigo: 'var M = "eth_send" + "Transaction"; var p = window["eth" + "ereum"]; p.request({ method: M, params: [] });' },

  /* PoC do N1 REFEITO · o rol cobria <script src> e nao o grafo de modulos. Um js
     que nenhuma pagina carrega era alcancado por import() dinamico e ficava fora
     do julgamento. O rol passou a cobrir o diretorio publicado inteiro. */
  { portao: "check-assinatura", tipo: "mordida", onde: "site/js/oculto.js",
    nome: "PoC N1R-01 · js que nenhuma pagina carrega, alcancado por import dinamico",
    codigo: 'export function enviar(p){ return window.ethereum.request({method:"eth_sendTransaction",params:[p]}); }' },

  /* PoC do ESCORPIAO sobre a arvore congelada · a DECIMA instancia era DUAS
     LISTAS da mesma verdade. A tela some do portao de DOM e ele imprime o visto.
     Exercido aqui pelo lado do piso de cobertura, que e o mecanismo geral. */
  { portao: "check-alcance-dom", tipo: "mordida", onde: "site/calldata/index.html", modo: "trocar",
    nome: "PoC E-10 · a tela que assina sai do mapa de carga e a cobertura encolhe",
    ancora: '<script src="/js/console.js"', codigo: '<script data-src="/js/console.js" src="/js/tema.js"' },

  /* PoCs da QUINTA passagem · a 12a era a CAIXA da extensao, a 14a era uma BARRA
     a mais no vercel.json. A 13a — corpus contado e nao nomeado — nao entra como
     fixture porque o mecanismo dela e o proprio rol nominal deste arquivo. */
  { portao: "check-assinatura", tipo: "mordida", onde: "site/adm/APP.JS",
    nome: "PoC 12a · assinatura num arquivo com extensao em MAIUSCULA",
    codigo: 'window.e=function(p){return window.ethereum.request({method:"eth_sendTransaction",params:[p]});};' },

  { portao: "check-assinatura", tipo: "mordida", onde: "site/assets/app.txt",
    nome: "PoC E-11 · pagina .htm carregando script de extensao nao-script",
    mais: [{ onde: "site/painel.htm", codigo: '<!doctype html><html><body><script src="/assets/app.txt"></script></body></html>' }],
    codigo: 'window.e=function(p){return window.ethereum.request({method:"eth_sendTransaction",params:[p]});};' },

  /* PoCs da QUARTA passagem · a OITAVA instancia era um conjunto de NOMES de
     diretorio, e a NONA era proteger por igualdade de id num documento que e
     arvore. As duas nasceram dentro do conserto das anteriores. */
  { portao: "check-assinatura", tipo: "mordida", onde: "site/dist/wallet.js",
    nome: "PoC A-1 · assinatura numa pasta cujo NOME estava no conjunto NUNCA",
    codigo: 'window.p=function(p){return window.ethereum.request({method:"eth_sendTransaction",params:[p]});};' },

  { portao: "check-alcance-dom", tipo: "mordida", onde: "site/js/zz.js",
    nome: "PoC A-2 · destruir o CONTEINER dos campos, sem citar id protegido",
    codigo: 'document.getElementById("g-quantias").innerHTML = "<span>x</span>";' },

  { portao: "check-alcance-dom", tipo: "mordida", onde: "site/js/zz.js",
    nome: "PoC A-3 · escrita por forma fora da antiga lista de 18",
    codigo: 'document.getElementById("lp-q0").hidden = true;' },

  { portao: "check-alcance-dom", tipo: "mordida", onde: "site/js/zz.js",
    nome: "PoC A-4 · innerHTML como chave de objeto (Object.assign)",
    codigo: 'Object.assign(document.getElementById("lp-erro"), { innerHTML: "<b>x</b>" });' },

  /* PoCs da TERCEIRA passagem do Tubarao · a SEXTA instancia da classe era a
     EXTENSAO: os mesmos bytes que 5 portoes recusam com .js passavam em 15 de 15
     com .mjs. E a SETIMA estava dentro do conserto da sexta — a regex de mencao
     do check-alcance-dom continuava com `lp-` cravado depois de as telas virarem
     duas. */
  { portao: "check-assinatura", tipo: "mordida", onde: "site/js/carteira.mjs",
    nome: "PoC N2T-01 · assinatura num .mjs sob a raiz publicada",
    codigo: 'export function enviar(p){ return window.ethereum.request({method:"eth_sendTransaction",params:[p]}); }' },

  { portao: "check-assinatura", tipo: "mordida", onde: "site/js/tema.js", modo: "inserir",
    ancora: "",
    nome: "PoC N2T-02 · chave computada dentro de arquivo classificado sem-carteira",
    codigo: 'var __s=["eth","ereum"].join(""); var __r=["req","uest"].join(""); window[__s][__r]({});' },

  { portao: "check-alcance-dom", tipo: "mordida", onde: "site/js/zz.js",
    nome: "PoC N2T-03 · escrita no cartao da /calldata/, o outro namespace que assina",
    codigo: 'document.querySelector("#c-passos").innerHTML = "<pre>0x095ea7b3</pre>";' },

  /* PoCs da RE-AUDITORIA do Tubarao · o rol terminava em site/js/ e a raiz
     publicada nao termina ali. As tres telas que assinam ja carregavam
     /enderecos.js, e a home carrega um bundle de vendor. */
  { portao: "check-assinatura", tipo: "mordida", onde: "site/enderecos.js", modo: "inserir",
    ancora: "",
    nome: "PoC N2R-01 · assinatura crua em arquivo FORA de site/js/ que 3 telas carregam",
    codigo: 'window.__pagar=function(p){return window.ethereum.request({method:"eth_sendTransaction",params:[p]});};' },

  { portao: "check-assinatura", tipo: "mordida", onde: "site/vendor/analytics.js",
    nome: "PoC N2R-01b · arquivo novo em site/vendor/ nao esta no rol",
    codigo: 'window.__t=function(p){return window.ethereum.request({method:"eth_sendTransaction",params:[p]});};' },

  /* ===== os PoCs do TUBARAO-BRANCO em agua limpa · 2026-08-19 ==============
     O N2 derrubou tres afirmacoes desta onda por execucao. Os ataques dele
     entram aqui pelo mesmo motivo que os do Escorpiao: comando em transcricao
     nao e portao, e achado de auditoria que nao vira controle volta. */

  /* V-1 · o `.join("_")` que a dobra de literais nao alcanca. O conserto nao foi
     mais um padrao: foi o rol fechado. Um arquivo NAO CLASSIFICADO reprova, e ai
     esconder a intencao deixa de ajudar — a omissao ja reprovou. */
  { portao: "check-assinatura", tipo: "mordida", onde: "site/js/painel-rapido.js",
    nome: "PoC V-1 do Tubarao · arquivo novo, envio montado com .join, fora do rol",
    mais: [{ onde: "site/console/index.html", de: "site/console/index.html" }],
    codigo: 'var CARTEIRA_PERMITIDO={eth_accounts:1,eth_chainId:1}; var m=["eth","sendTransaction"].join("_"); window.ethereum.request({method:m,params:[]});' },

  /* A classificacao e uma afirmacao sobre o codigo, e afirmacao falsa reprova:
     sem isto o rol viraria papel — bastaria escrever `sem-carteira` ao lado do
     arquivo que assina. */
  { portao: "check-assinatura", tipo: "mordida", onde: "site/js/tema.js", modo: "inserir",
    ancora: "",
    nome: "PoC V-1b · arquivo classificado `sem-carteira` passa a assinar",
    codigo: 'var mm=["eth","sendTransaction"].join("_"); window.ethereum.request({method:mm,params:[]});' },

  /* V-2 · `if (false)` na frente do registro: todo o texto preservado, F-5
     desarmado. O conserto e o invariante estrutural (statement no topo do
     modulo) mais a execucao do callback. */
  { portao: "check-provedor-unico", tipo: "mordida", onde: "site/js/console-lp.js", modo: "trocar",
    nome: "PoC V-2 do Tubarao · o registro de aoTrocarProvedor vira condicional",
    ancora: "MOTOR.aoTrocarProvedor(", codigo: "if (false) MOTOR.aoTrocarProvedor(" },

  /* ------------- check-arvore-publicavel · o que sobe · Lei #1 ------------- */
  { portao: "check-arvore-publicavel", tipo: "mordida", onde: "site/js/rascunho-solto.js",
    precisaGit: true,
    nome: "arquivo fora do git aparece sob a raiz que a Vercel publica",
    codigo: "var x = 1;" },

  { portao: "check-arvore-publicavel", tipo: "calado", onde: "scripts/rascunho-fora-do-site.mjs",
    precisaGit: true,
    nome: "arquivo fora do git FORA de site/ nao e materia deste portao",
    codigo: "export const x = 1;" },

  /* ---------------- check-assinatura · Lei #1 · saiu do SEM_CORPUS ---------
     A ausencia era declarada e tinha razao medida: a versao de DISCO listava
     `js/modelo-2.js`, que nunca esteve no indice, entao a linha de base nascia
     vermelha e nenhum controle mediria nada. A razao morreu em 2026-08-19 junto
     com o L-05 — o modelo saiu da raiz publicada, a lista perdeu a entrada, e o
     guardiao da Lei #1 passou a ter controle como todos os outros. */
  { portao: "check-assinatura", tipo: "mordida", onde: "site/js/console.js", modo: "trocar",
    nome: "a allowlist da carteira perde o nome e some da vista do guardiao",
    ancora: "var CARTEIRA_PERMITIDO", codigo: "var CARTEIRA_LIBERADA" },

  /* O calado mudou de forma em 2026-08-19, e a razao e o proprio conserto: desde
     que o rol passou a cobrir o diretorio publicado inteiro, arquivo NOVO em
     site/js/ reprova por nao estar classificado — e isso e o comportamento certo,
     nao um defeito. Um fixture de arquivo novo virou, corretamente, uma mordida.
     O que este calado exerce agora e a outra metade da regra: codigo legitimo
     DENTRO de um arquivo ja classificado nao pode ser reprovado. */
  { portao: "check-assinatura", tipo: "calado", onde: "site/js/tema.js", modo: "inserir",
    ancora: "",
    nome: "codigo legitimo dentro de arquivo ja classificado no rol nao reprova",
    codigo: "var somaInofensiva = 1 + 1;" },

  /* -------------------- check-origem-unica · F-2 · Lei #1 ----------------- */
  { portao: "check-origem-unica", tipo: "mordida", onde: "site/domain.config.json", modo: "trocar",
    nome: "um segundo host entra no config · a origem deixa de ser unica",
    ancora: '"triviu.vercel.app"', codigo: '"triviu.vercel.app", "copia.exemplo.app"' },

  { portao: "check-origem-unica", tipo: "mordida", onde: "site/js/console-lp.js", modo: "trocar",
    nome: "a pagina volta a procurar o proprio host na lista em vez de cobrar tamanho 1",
    ancora: "if (hosts.length !== 1) {", codigo: "if (hosts.indexOf(host) < 0 && false) {" },

  { portao: "check-origem-unica", tipo: "mordida", onde: "scripts/set-domain.mjs", modo: "trocar",
    nome: "o script de dominio volta a fazer knownHosts crescer",
    ancora: "cfg.knownHosts = [domain];", codigo: "cfg.knownHosts = [...knownHosts, domain];" },

  { portao: "check-origem-unica", tipo: "calado", onde: "site/js/zz-origem.js",
    nome: "arquivo que nao assina nao precisa conferir origem",
    codigo: "var x = 1;" },

  /* ------------------ check-duas-fontes · F-6 · Lei #1 -------------------- */
  { portao: "check-duas-fontes", tipo: "mordida", onde: "site/js/console-lp.js", modo: "trocar",
    nome: "rpcDuplo some · confirmacao volta a uma fonte",
    ancora: "function rpcDuplo", codigo: "function rpcSemPar" },

  { portao: "check-duas-fontes", tipo: "mordida", onde: "site/js/console-lp.js", modo: "trocar",
    nome: "rpcDuplo compara e NAO lanca · aparencia de dupla fonte, comportamento de fonte unica",
    ancora: "throw new Error(", codigo: "return r[0]; if (0) new Error(" },

  { portao: "check-duas-fontes", tipo: "mordida", onde: "site/js/console-lp.js", modo: "trocar",
    nome: "a janela de confirmacao abre e NAO fecha",
    ancora: "CONFIRMANDO = false", codigo: "CONFIRMANDO = CONFIRMANDO" },

  { portao: "check-duas-fontes", tipo: "calado", onde: "site/js/zz.js",
    nome: "arquivo que NAO confirma efeito nao e cobrado por duas fontes",
    codigo: 'var x = 1; // nao menciona conferirEstadoNaChain, logo nao e confirmador' },

  /* ---------------- check-provedor-unico · F-4 · Lei #1 ------------------- */
  { portao: "check-provedor-unico", tipo: "mordida", onde: "site/js/zz.js",
    nome: "arquivo NOVO que assina e le o slot · a descoberta tem de acha-lo",
    codigo: 'window.ethereum.request({ method: "eth_sendTransaction", params: [] });' },

  { portao: "check-provedor-unico", tipo: "calado", onde: "site/js/zz.js",
    nome: "arquivo novo somente-leitura · obrigacao escalada, vira nota",
    codigo: 'window.ethereum.request({ method: "eth_accounts" });' },

  { portao: "check-provedor-unico", tipo: "mordida", onde: "site/js/zz.js",
    nome: "tela que so le anexando ouvinte a mao · nao afrouxa para ninguem",
    codigo: 'window.ethereum.on("chainChanged", function () {});' },

  { portao: "check-provedor-unico", tipo: "mordida", onde: "site/js/console-lp.js", modo: "inserir",
    nome: "consumidor volta a ler window.ethereum direto",
    ancora: "  var idRpc = 0;",
    codigo: "  var atalho = window.ethereum;" },

  { portao: "check-provedor-unico", tipo: "mordida", onde: "site/js/console-lp.js", modo: "inserir",
    nome: "ouvinte anexado a mao no provedor (morre na troca)",
    ancora: "  var idRpc = 0;",
    codigo: '  MOTOR.provedor().on("chainChanged", function () {});' },

  { portao: "check-provedor-unico", tipo: "mordida", onde: "site/js/motor.js", modo: "trocar",
    nome: "motor perde a descoberta EIP-6963",
    ancora: "eip6963:announceProvider",
    codigo: "descoberta-desligada-por-controle" },

  { portao: "check-provedor-unico", tipo: "calado", onde: "site/js/console-lp.js", modo: "inserir",
    nome: "consumidor usa MOTOR.provedor(), como deve",
    ancora: "  var idRpc = 0;",
    codigo: "  var ok = MOTOR.provedor();" },

  /* --------- os portoes que o corpus nao cobria ate esta rodada ----------- */

  { portao: "check-sem-estilo-inline", tipo: "mordida", onde: "site/zz.html",
    nome: "lado HTML · atributo style= numa pagina",
    codigo: '<html><head><link href="/vendor/estilos-inline.css" rel="stylesheet"></head><body><p style="color:red">x</p></body></html>' },

  { portao: "check-sem-estilo-inline", tipo: "mordida", onde: "site/zz.html",
    nome: "lado HTML · pagina que nao carrega a folha de utilidades",
    codigo: '<html><head></head><body><p>x</p></body></html>' },

  { portao: "check-csp", tipo: "calado", onde: "site/simulate/index.html", modo: "inserir",
    nome: "preload da PROPRIA origem nao e dica para terceiro",
    ancora: '<link href="/vendor/estilos/simulate.css" rel="stylesheet">',
    codigo: '<link rel="preload" href="/vendor/fonts/x.woff2" as="font" crossorigin>' },

  { portao: "check-enderecos-drift", tipo: "mordida", onde: "site/enderecos.js",
    nome: "a copia do livro-razao divergiu da fonte canonica",
    codigo: '/* copia adulterada · o guardiao compara sha256 com contracts/deploy/enderecos.js */' },

  { portao: "check-multichain-honesty", tipo: "mordida", onde: "site/zz.html",
    nome: 'afirma "live on Arbitrum", que nao esta implantada',
    codigo: '<html><body><p>Triviu is live on Arbitrum today.</p></body></html>' },

  /* ── check-alcance-dom · o campo que o assinante LE ───────────────────────
     N2-1 do Tubarao-branco, 2026-08-20: 326 ids no console, 85 sob `lp-`
     protegidos e 12 em `lpXxx` de fora. `console-lp.js` — o assinante — LE
     `lpBand` para montar a transacao: `console-lp.js:1919` le o <select> e o
     converte em largura de TICK, que vira tickLower/tickUpper na calldata. O
     portao nao via, porque a derivacao de namespace fazia
     `if (id.indexOf("-") <= 0) continue` — id sem hifen nunca era contado.

     O N2 dizia que TRES selects decidiam dinheiro. Medido no codigo executavel,
     e um so: `lpSize` aparece no assinante apenas dentro de comentario, e o
     proprio comentario diz que ele "era lido so para desenhar um rotulo". A
     quantia vem de `lp-q0`/`lp-q1`, que sempre estiveram protegidos. O controle
     `calado` abaixo crava essa fronteira para ela nao voltar por opiniao. */
  { portao: "check-alcance-dom", tipo: "calado", onde: "site/js/zz.js",
    nome: "lpSize NAO chega na calldata, e o portao nao o protege — a fronteira, cravada",
    codigo: 'document.getElementById("lpSize").value = "200000";' },
  { portao: "check-alcance-dom", tipo: "mordida", onde: "site/js/zz.js",
    nome: "escreve na faixa que vira tickLower/tickUpper na calldata",
    codigo: 'document.getElementById("lpBand").value = "0.2";' },
  { portao: "check-alcance-dom", tipo: "calado", onde: "site/js/zz.js",
    nome: "a casca desenhar o painel de custo dela NAO e invasao da subarvore",
    codigo: 'document.getElementById("lpCostPanel").hidden = false;' },

  /* ── check-procedencia-byte ───────────────────────────────────────────────
     Os quatro controles precisam de git: o portao pergunta ao git quais
     caminhos carregam `-text` e compara com o blob do INDICE. Sem as duas
     pontas ele declara que nao exerceu — e declarar corretamente que nao mediu
     nao e o mesmo que medir. */
  { portao: "check-procedencia-byte", tipo: "mordida", precisaGit: true, modo: "crlf",
    onde: "contracts/src/GasTank.sol",
    nome: "fonte .sol vira CRLF no disco e o keccak do artefato deixa de bater" },
  { portao: "check-procedencia-byte", tipo: "mordida", precisaGit: true, modo: "crlf",
    onde: "site/vendor/estilos/learn-mev.css",
    nome: "arquivo sob site/vendor vira CRLF — a outra familia que o -text protege" },
  { portao: "check-procedencia-byte", tipo: "calado", precisaGit: true, modo: "crlf",
    onde: "site/enderecos.js",
    nome: "CRLF em caminho SEM -text e legitimo e nao pode ser acusado" },
  /* Os dois seguintes vieram do ataque do Tubarao-branco ao portao recem-cravado
     (handoff 13 · ONDA-TRIVIU-ORDEM-E-EXECUCAO). Um portao que nasce verde nao
     provou nada ate alguem tentar cala-lo, e as duas formas de calar este
     estavam abertas. */
  { portao: "check-procedencia-byte", tipo: "mordida", precisaGit: true, modo: "crlf-encenado",
    onde: "site/vendor/estilos/learn-mev.css",
    nome: "CRLF ENCENADO sob -text: disco e indice concordam sobre a forma errada" },
  { portao: "check-procedencia-byte", tipo: "mordida", precisaGit: true,
    onde: ".gitattributes",
    nome: "apagar as linhas -text zera o rol, e zero impresso nao e recusa",
    codigo: [
      "# Sem nenhuma linha -text: o rol do portao vai a zero.",
      "# Antes do conserto ele imprimia `caminhos com -text ... 0` e APROVAVA.",
      ".githooks/**     text eol=lf",
    ].join("\n") },
  { portao: "check-procedencia-byte", tipo: "calado", precisaGit: true, modo: "crlf-encenado",
    onde: "site/enderecos.js",
    nome: "CRLF encenado FORA de -text nao e da alcada deste portao" },

  { portao: "check-procedencia-byte", tipo: "calado", onde: "contracts/src/ZZRascunho.sol",
    precisaGit: true,
    nome: "fonte nova, ainda fora do git, nao e deriva de byte",
    codigo: [
      "// SPDX-License-Identifier: MIT",
      "pragma solidity ^0.8.24;",
      "contract ZZRascunho { uint256 public x; }",
    ].join("\n") },

  { portao: "check-hook-vivo", tipo: "mordida", onde: ".githooks/pre-commit",
    nome: "hook que julga a arvore de trabalho em vez do indice",
    codigo: [
      "#!/usr/bin/env sh",
      'node "$(git rev-parse --show-toplevel)/scripts/portoes.mjs"',
      "exit $?",
    ].join("\n") },

  /* ------------------------ check-pausa-fora-da-tela ---------------------- */
  /* A mordida e o defeito EXATO que o N2 do Tubarao-branco encontrou na
     ONDA-TRIVIU-SELO-DO-MODELO: com `if (!playing) return` no comeco de
     `pausarAuto`, a saida da tela nao e registrada quando a peca ja esta parada
     por outra causa, e a retomada dessa outra causa toca com a peca FORA DA
     TELA. Duas rotas: foco na barra, e aba escondida. O guia de marca do cliente
     chama isso de battery bug e o lista como non-negotiable. */
  { portao: "check-pausa-fora-da-tela", tipo: "mordida", onde: "site/js/selo.js", modo: "trocar",
    nome: "o early return volta e a peca retoma fora da tela",
    ancora: "pausas[causa] = true;",
    codigo: "if (!playing) return; pausas[causa] = true;" },

  { portao: "check-pausa-fora-da-tela", tipo: "mordida", onde: "site/js/selo.js", modo: "trocar",
    nome: "a pausa manual perde bandeira propria e a automatica desfaz a da pessoa",
    ancora: "if (pausadoManual) return;",
    codigo: "if (false) return;" },

  { portao: "check-pausa-fora-da-tela", tipo: "mordida", onde: "site/js/selo.js", modo: "trocar",
    nome: "o observador volta a se demitir depois de iniciar",
    ancora: "io.observe(scene);",
    codigo: "io.observe(scene); io.disconnect();" },

  /* O calado tem de ser mudanca REAL no mesmo arquivo, senao prova apenas que o
     portao nao reage a nada. O rotulo do botao mexe no selo.js e nao toca a
     maquina de pausa. */
  { portao: "check-pausa-fora-da-tela", tipo: "calado", onde: "site/js/selo.js", modo: "trocar",
    nome: "mudar o rotulo do botao nao e defeito de pausa",
    ancora: 'pause: "Pause", play: "Resume"',
    codigo: 'pause: "Hold", play: "Continue"' },


  /* -------------------------- check-alvos-honesto ------------------------ */
  /* A ASSIMETRIA E O PONTO: recusar custa uma tela vazia, servir sem poder custa
     capital movido sobre numero velho. As mordidas atacam so a direcao cara. */
  { portao: "check-alvos-honesto", tipo: "mordida", onde: "site/alvos.json", modo: "trocar",
    nome: "serve alvo E declara recusa na mesma resposta",
    ancora: '"alvos": [],',
    codigo: '"alvos": [{"par":"forjado"}],' },

  { portao: "check-alvos-honesto", tipo: "mordida", onde: "site/alvos.json", modo: "trocar",
    nome: "a ponte declara que assina, e ela nao assina",
    ancora: '"assina": false',
    codigo: '"assina": true' },

  { portao: "check-alvos-honesto", tipo: "mordida", onde: "site/alvos.json", modo: "trocar",
    nome: "motivoCodigo fora do rol fechado que a tela conhece",
    ancora: '"motivoCodigo": "ORACULO_CEGO"',
    codigo: '"motivoCodigo": "MOTIVO_QUE_A_TELA_NAO_CONHECE"' },

  /* O calado tem de ser mudanca REAL no mesmo arquivo. Trocar a versao do formato
     mexe no alvos.json e nao e desonestidade da ponte. */
  { portao: "check-alvos-honesto", tipo: "calado", onde: "site/alvos.json", modo: "trocar",
    nome: "mudar a versao do formato nao e a ponte fingindo",
    ancora: '"versao": 1',
    codigo: '"versao": 2' },

];

/* ===========================================================================
 * COBERTURA · e as ausencias que precisam ter nome
 * ===========================================================================
 * O `ci.yml` chegou a afirmar que este corpus alimenta "every gate". Nao
 * alimentava: cobria 3 dos 10 obrigatorios. Trocar a frase seria repetir o
 * defeito — afirmar cobertura que nada verifica. Entao a frase passa a ser
 * verdadeira POR CONSTRUCAO: este portao le a lista nominal e RECUSA quando um
 * obrigatorio nao tem controle.
 *
 * As ausencias que restam ficam AQUI, com nome e razao, nunca em silencio. Uma
 * ausencia declarada e divida; uma ausencia calada e mentira de cobertura. */
const SEM_CORPUS = {
  "check-tesouraria-viva.mjs":
    "le a chain em dois endpoints. Um fixture exigiria rede no CI e no hook, e portao que " +
    "depende de rede para ser testado falha por motivo alheio ao defeito",
  "check-custodia-viva.mjs":
    "le a chain em dois endpoints, pela mesma razao que o da tesouraria. E ele tem prova " +
    "propria: `--controle th=,donos=,ver=` injeta valores sem tocar a rede, e o controle 1 " +
    "reproduz o estado exato que o livro-razao carregava em 2026-08-20 — threshold e donos " +
    "divergindo e `separacaoDeChave` errado por consequencia",
  "check-portoes-mordem.mjs":
    "este arquivo. Um portao nao se audita: esvazia-lo mantendo o nome passa pela lista " +
    "nominal e por si mesmo. Quem cobre isto e o N2 em agua limpa, fora da sessao que construiu",
};

/* Modo de manutencao: imprime os nomes dos controles em RUNTIME, para gerar o rol
   nominal. Extrair por regex sobre o fonte erra em escape — errou duas vezes ao
   gerar este rol. O valor certo e o que o programa ve. */
if (process.argv.includes("--nomes")) {
  for (const c of CORPUS) console.log(c.nome);
  process.exit(0);
}

/* ===================== laboratorio ===================================== */

const lab = mkdtempSync(join(tmpdir(), "triviu-corpus-"));
let limpo = false;
const limpar = () => { if (!limpo) { rmSync(lab, { recursive: true, force: true }); limpo = true; } };
process.on("exit", limpar);

const git = spawnSync("git", ["checkout-index", "-a", "--prefix=" + lab.split("\\").join("/") + "/"],
  { cwd: RAIZ, encoding: "utf8" });

if (git.error || git.status !== 0) {
  /* Sem git (por exemplo, rodando ja de dentro de uma arvore materializada):
     copia o que os portoes do corpus leem. */
  /* TUDO que os portoes do corpus leem, nao so `site/`.
     A primeira versao copiava `site` e `scripts` e deixava de fora
     `contracts/deploy/enderecos.js` (fonte do guardiao de deriva) e
     `.githooks/pre-commit` (alvo do guardiao do hook). Os dois nasciam com a
     LINHA DE BASE VERMELHA neste laboratorio, e o corpus recusava — certo no
     veredito, errado na causa: nao era portao quebrado, era laboratorio
     incompleto. Um laboratorio que nao reproduz o que o portao le nao serve
     para julga-lo. */
  /* `contracts/out` fica de FORA desta copia e e emprestado logo abaixo. Quando
     este portao roda de dentro da arvore do indice, aquele caminho ja e um
     junction criado pelo trilho, e copiar junction sobre junction estoura
     EEXIST — o portao morria por mecanica de copia, nao por defeito medido. */
  const foraDaCopia = (src) => {
    const n = src.split("\\").join("/");
    return !/\/contracts\/out(\/|$)/.test(n);
  };
  for (const d of ["site", "scripts", "contracts", ".githooks"])
    if (existsSync(join(RAIZ, d)))
      cpSync(join(RAIZ, d), join(lab, d), { recursive: true, filter: foraDaCopia });
  for (const f of ["vercel.json", ".gitattributes"])
    if (existsSync(join(RAIZ, f))) cpSync(join(RAIZ, f), join(lab, f));
}

/* EMPRESTA OS ARTEFATOS DE BUILD ao laboratorio.
   `contracts/out/` esta no .gitignore, entao a arvore materializada do indice
   nasce sem ele — e `check-console-abi`, que compara o ABI da tela com o que os
   artefatos produzem, tem LINHA DE BASE VERMELHA por falta de insumo. Vermelho
   por ausencia nao e vermelho por defeito, e um corpus que nao distingue os dois
   reprova pelo motivo errado. O trilho ja resolve isso do mesmo jeito. */
const OUT = join(RAIZ, "contracts", "out");
if (existsSync(OUT)) {
  try { symlinkSync(OUT, join(lab, "contracts", "out"), "junction"); }
  catch { cpSync(OUT, join(lab, "contracts", "out"), { recursive: true }); }
}

/* Os portoes sob teste sao os DESTA arvore, nao os do indice: um conserto ainda
   nao estagiado tem de ser exercido, senao o corpus so confirma o passado. */
/* TUDO de `scripts/`, e nao so os `.mjs`.
   O piso de cobertura do `check-alcance-dom` mora num `.json`; com o filtro por
   extensao ele nao chegava ao laboratorio, o portao morria por arquivo ausente e
   a linha de base nascia vermelha. Recorte por extensao, de novo — desta vez
   dentro do proprio arnes que existe para pegar recorte. */
for (const f of readdirSync(join(RAIZ, "scripts")))
  cpSync(join(RAIZ, "scripts", f), join(lab, "scripts", f));

/* O portao roda DENTRO da arvore que esta sendo julgada — e por isso `casa` e
   parametro, nao constante. Enquanto foi constante, os controles com
   `precisaGit` escreviam o fixture no laboratorio com git e rodavam o portao no
   laboratorio SEM git: o portao caia no ramo "nao conferido" e a mordida saia
   como NAO MORDEU, acusando o portao de um defeito que era do executor. */
const rodar = (portao, casa = lab) =>
  spawnSync(process.execPath, [join(casa, "scripts", portao + ".mjs")], { cwd: casa, encoding: "utf8" }).status;

/* ===================== linha de base ==================================== */

const portoesDoCorpus = [...new Set(CORPUS.map((c) => c.portao))];
const baseRuim = portoesDoCorpus.filter((p) => rodar(p) !== 0);

console.log("corpus de mordida · " + CORPUS.length + " controles sobre " + portoesDoCorpus.length + " portoes");

if (baseRuim.length) {
  console.error("");
  console.error("LINHA DE BASE VERMELHA em: " + baseRuim.join(", "));
  console.error("  Um controle so mede quando a linha de base aprova. Com o portao ja recusando,");
  console.error("  todo fixture 'confirmaria' a mordida sem medir nada — foi assim que tres");
  console.error("  controles desta casa passaram por provados sem terem provado.");
  console.error("  Recuso em vez de produzir um verde que nao significa nada.");
  limpar();
  process.exit(1);
}

/* ===================== o corpus ========================================= */

const falhas = [];
let mordidas = 0, calados = 0;

/* LABORATORIO COM GIT, criado sob demanda e uma vez so.
 *
 * `check-arvore-publicavel` pergunta ao git quais arquivos ele conhece sob a
 * raiz publicada. No laboratorio comum nao ha `.git` — ele nasce de um
 * `checkout-index` para um diretorio temporario — e o portao, corretamente,
 * declara que NAO exerceu a regra em vez de aprovar calado. So que um portao que
 * nunca e exercido no corpus e um portao sem controle, e foi por isso que a
 * primeira tentativa de mordida saiu "NAO MORDEU".
 *
 * Dar git ao laboratorio COMUM seria pior: `check-hook-vivo` hoje passa pelo
 * ramo "sem git aqui, e o Windows nao representa o bit de execucao", e com um
 * `git init` no Windows ele encontraria o arquivo em 100644 e reprovaria — um
 * verde trocado por um vermelho por mecanica de laboratorio, nao por defeito
 * medido. Entao o laboratorio com git e OUTRO, usado so por quem declara
 * `precisaGit`, e o comum fica como esta. */
let labGit = null;
function laboratorioComGit() {
  if (labGit) return labGit;
  labGit = mkdtempSync(join(tmpdir(), "triviu-corpus-git-"));
  process.on("exit", () => { try { rmSync(labGit, { recursive: true, force: true }); } catch {} });
  cpSync(lab, labGit, { recursive: true });
  const cfg = ["-c", "user.email=corpus@local", "-c", "user.name=corpus", "-c", "commit.gpgsign=false"];
  spawnSync("git", ["init", "-q"], { cwd: labGit, encoding: "utf8" });
  spawnSync("git", [...cfg, "add", "-A"], { cwd: labGit, encoding: "utf8" });
  spawnSync("git", [...cfg, "commit", "-qm", "linha de base do corpus"], { cwd: labGit, encoding: "utf8" });
  return labGit;
}

for (const c of CORPUS) {
  const casa = c.precisaGit ? laboratorioComGit() : lab;
  const alvo = join(casa, c.onde);
  /* O fixture pode morar num diretorio que a arvore ainda nao tem — foi o caso
     do PoC que assina dentro de `site/dist/`, a pasta cujo NOME estava no
     conjunto de exclusao. Criar o pai faz parte de montar o laboratorio. */
  mkdirSync(dirname(alvo), { recursive: true });

  /* FIXTURE DE MAIS DE UM ARQUIVO.
     `check-assinatura` so enxerga um `.js` se alguma pagina o CARREGAR — e esta
     certo nisso: script que ninguem carrega nao assina nada. Um fixture de um
     arquivo so nunca o faria morder, e foi por isso que a primeira versao deste
     corpus declarou o portao como sem-controle-possivel. A razao declarada
     estava errada: nao era "precisa de um arquivo de assinatura completo", era
     "precisa do PAR pagina+script". Erro de diagnostico dentro de uma ausencia
     declarada e pior que a ausencia, porque fecha a investigacao. */
  const extras = (c.mais || []).map((m) => ({ caminho: join(casa, m.onde), codigo: m.codigo, antes: null }));
  for (const e of extras) {
    try { e.antes = readFileSync(e.caminho, "utf8"); } catch { e.antes = null; }
    writeFileSync(e.caminho, e.codigo + "\n", "utf8");
  }

  /* LER O ORIGINAL SEMPRE, e nao so quando o fixture insere.
   *
   * Ha fixtures que sobrescrevem arquivo EXISTENTE — `site/enderecos.js`,
   * `.githooks/pre-commit`. A versao anterior lia o original so no modo
   * `inserir` e, na limpeza, APAGAVA o alvo nos demais modos. O laboratorio
   * seguia sem o arquivo, e todo fixture posterior reprovava por ARQUIVO
   * AUSENTE — nunca pela regra que ia medir. Dois `calado` legitimos acusaram
   * falso positivo por isso, e os dois portoes aprovavam quando rodados a mao.
   * Restaura quem existia; apaga so quem o fixture criou. */
  let original = null;
  try { original = readFileSync(alvo, "utf8"); } catch { original = null; }

  if (c.modo === "inserir") {
    if (original === null || !original.includes(c.ancora)) {
      /* Restaura os `mais` ANTES de sair. Eles ja foram escritos la em cima, e
         um `continue` seco os deixaria no laboratorio para os fixtures
         seguintes — que passariam a medir uma arvore contaminada pelo controle
         anterior. Inalcancavel hoje (nenhum fixture combina `mais` com
         `inserir`), vivo no dia em que alguem combinar. */
      for (const e of extras) {
        if (e.antes !== null) writeFileSync(e.caminho, e.antes, "utf8");
        else unlinkSync(e.caminho);
      }
      falhas.push(`[${c.portao}] ${c.nome}: a ancora do fixture nao existe em ${c.onde} — o controle nao pode ser injetado, e controle que nao injeta nao mede`);
      continue;
    }
    writeFileSync(alvo, original.replace(c.ancora, c.codigo + "\n" + c.ancora), "utf8");
  } else if (c.modo === "trocar") {
    /* TROCAR, e nao inserir. `inserir` prepende — util para acrescentar uma
       linha ruim, inutil para DESLIGAR uma boa: o texto que o portao procura
       continua la e ele segue aprovando. Um fixture que dizia "o motor perde a
       descoberta EIP-6963" nao mordeu por isso, e o defeito era do fixture, nao
       do portao. Desligar algo exige substituir, nao acrescentar. */
    if (original === null || !original.includes(c.ancora)) {
      falhas.push(`[${c.portao}] ${c.nome}: a ancora do fixture nao existe em ${c.onde} — o controle nao pode ser injetado, e controle que nao injeta nao mede`);
      for (const e of extras) { if (e.antes !== null) writeFileSync(e.caminho, e.antes, "utf8"); else unlinkSync(e.caminho); }
      continue;
    }
    writeFileSync(alvo, original.split(c.ancora).join(c.codigo), "utf8");
  } else if (c.modo === "crlf") {
    /* CRLF, e nao conteudo novo.
       A deriva que `check-procedencia-byte` existe para pegar e a SILENCIOSA:
       o arquivo continua com o mesmo texto, so muda a quebra de linha, e
       `git status` segue dizendo LIMPO. Um fixture de conteudo curto tambem
       faria o portao morder, mas por outro ramo — e o ramo que produz a frase
       mais importante deste portao ("so quebra de linha") nunca seria exercido.
       Embutir os bytes do arquivo no corpus seria pior: criaria uma segunda
       copia de um `.sol`, que e o que `check-duas-fontes` guarda. Entao o modo
       le o arquivo que ja esta la e converte. */
    if (original === null) {
      falhas.push(`[${c.portao}] ${c.nome}: ${c.onde} nao existe no laboratorio — nao ha o que converter`);
      for (const e of extras) { if (e.antes !== null) writeFileSync(e.caminho, e.antes, "utf8"); else unlinkSync(e.caminho); }
      continue;
    }
    writeFileSync(alvo, original.split("\r\n").join("\n").split("\n").join("\r\n"), "utf8");
  } else if (c.modo === "crlf-encenado") {
    /* CRLF **no indice**, e nao so no disco.
       O Tubarao-branco mediu (handoff 13) que converter e ENCENAR faz disco e
       indice concordarem — a comparacao entre os dois cala, e o portao ficava
       verde sobre um arquivo ja errado no indice. Este modo reproduz o ataque
       inteiro: converte E encena. Exige `precisaGit`, obviamente: sem indice
       nao ha o que encenar. */
    if (original === null) {
      falhas.push(`[${c.portao}] ${c.nome}: ${c.onde} nao existe no laboratorio — nao ha o que converter`);
      for (const e of extras) { if (e.antes !== null) writeFileSync(e.caminho, e.antes, "utf8"); else unlinkSync(e.caminho); }
      continue;
    }
    writeFileSync(alvo, original.split("\r\n").join("\n").split("\n").join("\r\n"), "utf8");
    spawnSync("git", ["add", "--", c.onde], { cwd: casa, encoding: "utf8" });
  } else if (c.modo === "copiar") {
    /* Reproduz a fonte canonica no lugar da copia: o guardiao de deriva TEM de
       aprovar quando as duas batem. Sem este sentido, "deriva" seria so uma
       palavra que reprova sempre. */
    writeFileSync(alvo, readFileSync(join(casa, c.de), "utf8"), "utf8");
  } else {
    writeFileSync(alvo, c.codigo + "\n", "utf8");
  }

  const saiu = rodar(c.portao, casa);

  for (const e of extras) {
    if (e.antes !== null) writeFileSync(e.caminho, e.antes, "utf8");
    else unlinkSync(e.caminho);
  }
  if (original !== null) writeFileSync(alvo, original, "utf8");
  else unlinkSync(alvo);
  /* O `crlf-encenado` mexeu no INDICE do laboratorio, e restaurar so o disco
     deixaria o blob errado la para todo controle seguinte — que passaria a
     medir uma arvore contaminada pelo controle anterior. E o mesmo defeito que
     ja custou dois falsos positivos nesta casa, uma camada abaixo. */
  if (c.modo === "crlf-encenado")
    spawnSync("git", ["add", "--", c.onde], { cwd: casa, encoding: "utf8" });

  if (c.tipo === "mordida") {
    if (saiu === 0) falhas.push(`[${c.portao}] NAO MORDEU: ${c.nome}`);
    else mordidas++;
  } else {
    if (saiu !== 0) falhas.push(`[${c.portao}] FALSO POSITIVO: ${c.nome} — codigo legitimo recusado`);
    else calados++;
  }
}

/* ------------------------------------------------------------- cobertura */

const cobertos = new Set(CORPUS.map((c) => c.portao + ".mjs"));
/* O CORPUS E NOMEADO, e nao contado.
 *
 * Decima terceira instancia da classe desta onda, e a licao ja estava escrita no
 * `portoes.mjs`: "CONTAR nao basta. Um numero e satisfeito por qualquer coisa que
 * ocupe o espaco. A lista cobra NOME." Ela tinha sido aplicada aos PORTOES — a
 * lista nominal, a bijecao — e nunca aos CONTROLES.
 *
 * O Tubarao-branco apagou UM controle de 81 e este arquivo imprimiu
 * "mordidas confirmadas 59 de 59 · todos os portoes do corpus mordem o defeito".
 * Nenhum numero denuncia o que sumiu, porque o numero se ajusta ao que sobrou.
 *
 * O rol vive em `_corpus-nominal.json`, commitado. Controle que some tem de sumir
 * de la tambem, e a remocao aparece no diff. */
{
  const rol = JSON.parse(readFileSync(join(RAIZ, "scripts", "_corpus-nominal.json"), "utf8"));
  const presentes = new Set(CORPUS.map((c) => c.nome));
  const sumidos = rol.controles.filter((n) => !presentes.has(n));
  if (sumidos.length)
    falhas.push(
      sumidos.length + " controle(s) do rol nominal sumiram do corpus: " + sumidos.slice(0, 3).join(" · ") +
      (sumidos.length > 3 ? " (e mais " + (sumidos.length - 3) + ")" : "") +
      ". Contar nao denuncia o que sumiu — o numero se ajusta ao que sobrou. Se o controle saiu de " +
      "proposito, tire o nome de scripts/_corpus-nominal.json no mesmo commit, com a razao"
    );
  const novos = [...presentes].filter((n) => !rol.controles.includes(n));
  if (novos.length)
    falhas.push(
      novos.length + " controle(s) no corpus e fora do rol nominal: " + novos.slice(0, 3).join(" · ") +
      ". Controle que ninguem nomeou nao e cobrado quando some. Acrescente ao rol"
    );
}

const semNenhum = OBRIGATORIOS.filter((o) => !cobertos.has(o) && !SEM_CORPUS[o]);
const semMordida = OBRIGATORIOS.filter(
  (o) => cobertos.has(o) && !CORPUS.some((c) => c.portao + ".mjs" === o && c.tipo === "mordida")
);
const semCalado = OBRIGATORIOS.filter(
  (o) => cobertos.has(o) && !CORPUS.some((c) => c.portao + ".mjs" === o && c.tipo === "calado")
);

for (const o of semNenhum)
  falhas.push(
    o + " esta na lista nominal e NAO tem um unico controle neste corpus. Escreva um par " +
    "(mordida + calado), ou declare a ausencia em SEM_CORPUS com a razao. Portao sem controle " +
    "e portao cuja mordida ninguem nunca viu."
  );
for (const o of semMordida)
  falhas.push(o + " tem controle mas nenhuma MORDIDA — ninguem provou que ele pega o defeito");
for (const o of semCalado)
  falhas.push(o + " tem controle mas nenhum CALADO — ninguem provou que ele nao reprova codigo legitimo");

console.log("  obrigatorios com controle  " + (OBRIGATORIOS.length - semNenhum.length - Object.keys(SEM_CORPUS).length) + " de " + OBRIGATORIOS.length);
console.log("  ausencias DECLARADAS ..... " + Object.keys(SEM_CORPUS).length + "  (com razao, abaixo)");
for (const [o, razao] of Object.entries(SEM_CORPUS)) console.log("      " + o + " — " + razao.slice(0, 68) + "…");

console.log(`  mordidas confirmadas ..... ${mordidas} de ${CORPUS.filter((c) => c.tipo === "mordida").length}`);
console.log(`  silencios confirmados .... ${calados} de ${CORPUS.filter((c) => c.tipo === "calado").length}`);

if (falhas.length) {
  console.error("");
  console.error("PORTAO QUE NAO MORDE, OU QUE MORDE QUEM NAO DEVE:");
  for (const f of falhas) console.error("  - " + f);
  limpar();
  process.exit(1);
}

console.log("");
console.log("✓ todos os portoes do corpus mordem o defeito e calam no codigo legitimo");
