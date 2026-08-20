#!/usr/bin/env node
/* PORTAO DE ALCANCE DE ESCRITA NO DOM  ·  2026-08-19
 * ---------------------------------------------------------------------------
 * Condicao de VETO pre-declarada pelo Tubarao-branco na ONDA-TRIVIU-CONSOLE-
 * PORTE-DO-MODELO, 2026-08-13, nas palavras dele:
 *
 *   "Uma tela que so desenha, se puder escrever no DOM da tela que assina,
 *    reescreve o cartao que o usuario esta lendo antes de clicar. B exige
 *    PORTAO, nao promessa. O numero de innerHTML nao e a metrica; ALCANCE DE
 *    ESCRITA e."
 *
 * POR QUE ESTE ARQUIVO EXISTE SEPARADO do check-assinatura.mjs: aquele prova
 * propriedades DE DENTRO do caminho que assina — congelamento, regra 6 sobre os
 * bytes, regra 11. Este prova uma propriedade DE FORA: que ninguem mais alcanca
 * aquele caminho. Sao invariantes de sentido oposto, e juntar os dois num
 * arquivo faria a falha de um mascarar a do outro no mesmo exit code.
 *
 * O INVARIANTE, e ele foi MEDIDO antes de ser escrito: a superficie que assina
 * e namespaced. Os 85 ids da subarvore de assinatura no HTML comecam todos com
 * `lp-`, e o unico script que os escreve e o motor. A regra entao e:
 *
 *   NENHUM script fora do MOTOR pode ESCREVER num elemento `lp-*`.
 *
 * Leitura e livre — console-app.js consulta $("lp-ler") para saber se a tela
 * existe, e isso nao reescreve cartao nenhum. O portao distingue os dois.
 *
 * FALHA FECHADA, e ate 2026-08-19 esta linha era uma promessa que o codigo
 * abaixo nao cumpria: se um alvo de escrita nao puder ser resolvido a um id, o
 * portao RECUSA em vez de assumir que esta fora. Recusar demais e o modo de
 * falha correto num vetor de Lei #1.
 *
 * O ALCANCE EXATO DESSA PROMESSA, e ela ja foi frouxa duas vezes num dia.
 *
 * PRIMEIRA VERSAO: o portao ignorava alvo irresoluvel. A promessa era falsa.
 *
 * SEGUNDA VERSAO: passou a recusar, resolvendo por literais numa janela de ~260
 * caracteres em volta da chamada — nos DOIS sentidos. O Tubarao-branco, em agua
 * limpa, mostrou que isso e quase nada: o argumento da propria escrita entra na
 * janela. `classList.add(cls)` RECUSA, `classList.add("on")` PASSA. Como toda
 * chamada real carrega algum literal, a regra praticamente nunca disparava — e o
 * cabecalho chamava o vao de "literal nao relacionado", o que soa incidental.
 * Nao era incidental: era a chamada.
 *
 * TERCEIRA VERSAO, esta. A resolucao olha SO PARA TRAS e so aceita o que de fato
 * liga a variavel. Quatro amarras, nesta ordem:
 *
 *   1. array de literais dentro do statement   ["a","b"].forEach(id => $(id))
 *   2. atribuicao literal ao mesmo nome        var id = "c-ler"; $(id)
 *   3. parametro de funcao                     resolve pelos pontos de chamada
 *                                              DESTE arquivo · so amarra se todos
 *                                              passarem literal, e nenhum for lp-*
 *   4. parametro de callback de iterador       CAMPOS.forEach(function(id){$(id)})
 *                                              resolve pela declaracao de CAMPOS
 *
 * Qualquer alvo que nenhuma das quatro amarre, e que sofra escrita, RECUSA.
 * Medido nesta arvore: 11 arquivos fora do motor, 8 mencoes (todas leitura),
 * ZERO irresoluveis — a promessa passou a custar nenhum falso positivo, e ela
 * amarra o dia em que passar a custar.
 *
 * O QUE CONTINUA FORA, dito para ninguem ler garantia mais larga: a amarra 3 le
 * pontos de chamada DENTRO do arquivo. Uma funcao exportada e chamada de outro
 * arquivo com um id `lp-*` nao seria vista. Hoje nenhum script fora do motor
 * exporta funcao de escrita — quando algum exportar, esta linha vira divida.
 */
import { readFileSync, readdirSync } from "node:fs";
import { codigoNormalizado } from "./_comentarios.mjs";
import { executaveis, carregadosPorPagina, raizPublicada } from "./_arvore.mjs";
import { ASSINANTES } from "./_assinantes.mjs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = raizPublicada(RAIZ).abs;
const JS = join(RAIZ, "site", "js");
/* AS TELAS QUE ASSINAM SAO DERIVADAS, NAO CRAVADAS.
 *
 * Este portao julgava `site/console/index.html` e o prefixo `lp-`, escritos a
 * mao. Mas a lista de assinantes do `check-assinatura` tem DUAS telas, e a outra
 * — `/calldata/`, prefixo `c-` — e justamente onde o cartao da transacao e
 * desenhado antes da assinatura. O Tubarao-branco reescreveu `#c-passos` a
 * partir de um script qualquer e passou em 15 de 15; o controle dele foi o mesmo
 * ataque em `#lp-erro`, que reprovou em quatro portoes. So mudava o namespace.
 *
 * Setima aparicao do mesmo erro de metodo nesta onda. Agora as telas saem do
 * mapa de carga: qualquer pagina que carregue um arquivo da lista de assinantes
 * E uma tela que assina, e todas sao julgadas. Acrescentar uma terceira tela nao
 * exige lembrar deste arquivo. */
/* Importada de `_assinantes.mjs`. Estava cravada aqui, e um rename rotineiro
   fazia este portao perder uma tela inteira em silencio — ver o cabecalho de la. */
const ASSINANTES_REL = ASSINANTES;
const TELAS = (() => {
  const mapa = carregadosPorPagina(RAIZ);
  const paginas = new Set();
  for (const [rel, pags] of mapa)
    if (ASSINANTES_REL.includes(rel)) for (const pg of pags) paginas.add(pg);
  return [...paginas].sort();
})();

const MOTOR = "console-lp.js";          // so para as mensagens que citam um nome
/* OS NAMESPACES SAO DERIVADOS DAS TELAS, e nao escritos aqui.
 *
 * Era `const PREFIXO = "lp-"` — uma tela, um prefixo, os dois cravados. A outra
 * tela que assina usa `c-` e nao era coberta. Agora cada tela entrega os seus
 * ids, e o prefixo de cada uma sai da contagem: um namespace real aparece em
 * dezenas de ids, um id solto nao vira namespace. O piso de 5 e arbitrario e
 * esta declarado como tal; o que ele evita e um `id="ok"` virar o namespace
 * `ok-`. */
const PISO_DE_NAMESPACE = 5;

const IDS_POR_TELA = new Map(
  TELAS.map((tela) => [
    tela,
    [...readFileSync(join(SITE, tela), "utf8").matchAll(/id="([\w-]+)"/g)].map((m) => m[1]),
  ])
);

const PREFIXOS = (() => {
  /* O NAMESPACE SAI DE QUEM ESCREVE NELE, e nao de quem tem mais ids.
   *
   * A derivacao anterior elegia o prefixo DOMINANTE de cada tela. O
   * Tubarao-branco a virou acrescentando 90 `<span id="zz-xNNN">` a `/console/`:
   * `zz-` passou a campeao com 90 contra os 85 de `lp-`, e a subarvore que
   * assina saiu inteira da protecao com o portao imprimindo o visto. Decidir
   * protecao por contagem de elementos deixa a protecao na mao de quem edita o
   * HTML.
   *
   * O criterio certo e outro e nao se manipula pelo HTML: a subarvore que assina
   * e a que o SCRIPT QUE ASSINA escreve. Cada tela entrega o seu assinante pelo
   * mapa de carga; do fonte dele saem os ids citados; deles saem os prefixos. Um
   * atacante que queira mover o namespace tem de editar o proprio arquivo que
   * passa pelas quatro checagens — e ai o `check-assinatura` responde.
   *
   * O piso continua, e continua declarado: prefixo citado menos de 5 vezes pelo
   * assinante e ocorrencia solta, nao namespace. */
  const mapa = carregadosPorPagina(RAIZ);
  const escolhidos = new Set();
  for (const [tela, ids] of IDS_POR_TELA) {
    const donos = [...mapa].filter(([rel, pags]) => ASSINANTES_REL.includes(rel) && pags.includes(tela));
    const conta = new Map();
    for (const [rel] of donos) {
      let fonte = "";
      try { fonte = codigoNormalizado(readFileSync(join(SITE, rel), "utf8")); } catch { continue; }
      for (const id of new Set(ids)) {
        const i = id.indexOf("-");
        if (i <= 0) continue;
        if (!fonte.includes(id)) continue;          /* o assinante nao cita este id */
        const pre = id.slice(0, i + 1);
        conta.set(pre, (conta.get(pre) || 0) + 1);
      }
    }
    for (const [pre, n] of conta) if (n >= PISO_DE_NAMESPACE) escolhidos.add(pre);
  }
  return [...escolhidos].sort();
})();

/* OS ANCESTRAIS DOS CAMPOS TAMBEM SAO PROTEGIDOS. O DOM e uma arvore.
 *
 * Aqui morava a NONA instancia da classe desta onda. A protecao era por
 * IGUALDADE de id: um script so era acusado se citasse `lp-q0` ou `c-passos`.
 * Mas `lp-q0` e `lp-q1` — os campos de quantia — vivem dentro de
 * `<div id="g-quantias">`, e `g-` nao era protegido porque nao era o prefixo
 * dominante da tela.
 *
 * O Tubarao-branco destruiu os campos de quantia, os pisos de slippage e o teto
 * SEM CITAR UM UNICO ID PROTEGIDO:
 *
 *     document.getElementById("g-quantias").innerHTML = "...";
 *     document.getElementById("g-minimos").hidden = true;
 *
 * e o portao imprimiu "nenhum script fora do motor escreve na subarvore que
 * assina" — a frase que o cabecalho deste arquivo chama de pior que portao
 * nenhum.
 *
 * Contencao nao e igualdade: quem alcanca o PAI alcanca o filho. O conjunto
 * protegido passa a incluir todo elemento que CONTENHA um id protegido na
 * subarvore dele. A ancestralidade sai de uma varredura de profundidade sobre o
 * HTML — sem parser, contando abertura e fechamento de tag. */
function ancestraisDe(html, idsAlvo, cascas) {
  const achados = new Set();
  const presentes = new Set();
  const cobertura = new Map();
  const contar = (id) => cobertura.set(id, (cobertura.get(id) || 0) + 1);
  const pilha = [];
  const TAG = /<(\/?)([a-zA-Z][\w-]*)([^>]*)>/g;
  const AUTO = new Set(["br", "hr", "img", "input", "meta", "link", "source", "track", "wbr", "col", "area", "base", "embed", "param"]);
  let m;
  while ((m = TAG.exec(html))) {
    const fecha = m[1] === "/";
    const tag = m[2].toLowerCase();
    const atrs = m[3] || "";
    if (AUTO.has(tag) || atrs.trim().endsWith("/")) {
      const id = (atrs.match(/\bid\s*=\s*["']([^"']+)["']/) || [])[1];
      if (id && idsAlvo.has(id)) { presentes.add(id); for (const a of pilha) if (a) contar(a); }
      continue;
    }
    if (fecha) { pilha.pop(); continue; }
    const id = (atrs.match(/\bid\s*=\s*["']([^"']+)["']/) || [])[1] || null;
    if (id && idsAlvo.has(id)) { presentes.add(id); for (const a of pilha) if (a) contar(a); }
    pilha.push(id);
  }
  /* CASCA DE PAGINA NAO E GRUPO DE CAMPO.
     Medido em 2026-08-20: `main` e `p-lp` cobrem 100% dos 85 ids de /console/, e
     `conteudo` cobre 100% dos 58 de /calldata/; os grupos reais cobrem de 4% a
     20%. Proteger a casca fazia a palavra `main` — que aparece em qualquer
     bundle, inclusive no do three — virar mencao a subarvore que assina, e a base
     nascia vermelha por ruido.
     LIMITE DECLARADO, porque ele existe: destruir a casca inteira nao e pego por
     esta regra. A diferenca com o grupo de campo e que apagar a pagina toda e
     visivel para quem olha, e trocar um grupo de campo por outro nao. */
  /* O DENOMINADOR E O DA PAGINA, e nao o do conjunto global.
     A primeira redacao usava `idsAlvo.size` — os 143 ids das duas telas. Numa
     tela com 85, a casca cobria 85 de 143 e passava por "grupo de campo". O
     denominador certo e quantos alvos existem NESTA pagina. */
  const total = presentes.size;
  for (const [id, n] of cobertura) (n < total ? achados : cascas).add(id);
  return achados;
}

const IDS_DIRETOS = new Set(
  [...IDS_POR_TELA.values()].flat().filter((id) => PREFIXOS.some((p) => id.startsWith(p)))
);

const IDS_PROTEGIDOS = (() => {
  const todos = new Set(IDS_DIRETOS);
  /* A CASCA E EXCLUIDA GLOBALMENTE, e nao por pagina.
     `conteudo` cobre 100% dos ids de /calldata/ — e casca la — e menos que 100%
     em /console/, entao entrava pela outra porta e o portao passava a acusar
     `console-app.js` por montar a propria pagina. Quem e casca em alguma tela e
     casca em todas. */
  const cascas = new Set();
  const achadosPorTela = [];
  for (const [tela] of IDS_POR_TELA) {
    const html = readFileSync(join(SITE, tela), "utf8");
    achadosPorTela.push(ancestraisDe(html, IDS_DIRETOS, cascas));
  }
  for (const conj of achadosPorTela) for (const a of conj) if (!cascas.has(a)) todos.add(a);
  return todos;
})();


const PREFIXO = PREFIXOS[0] || "lp-";   /* compat: mensagens que citam um so */

/* AS REGEX SAO CONSTRUIDAS DOS PREFIXOS DERIVADOS, e nao escritas com um deles.
 *
 * Aqui morava o SETIMO recorte desta onda, e ele estava DENTRO do conserto do
 * sexto: as telas passaram a ser derivadas, os ids passaram a ser 227 em vez de
 * 85, e o laco que procura mencao continuou com `(lp-[\w-]+)` cravado. O
 * conjunto protegido conhecia `c-passos`; a regex nunca o casava. Reescrever o
 * cartao da `/calldata/` seguia passando.
 *
 * Consertar um recorte escrevendo outro e o que esta onda vem repetindo. As
 * expressoes abaixo nascem de `PREFIXOS`, que nasce das telas, que nascem do
 * mapa de carga. */
const escapar = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const ALT_PREFIXOS = PREFIXOS.map(escapar).join("|");

/* A ALTERNATIVA DE MENCAO SAI DO CONJUNTO PROTEGIDO, e nao dos prefixos.
 *
 * Pela SEGUNDA vez nesta onda eu alarguei o conjunto de ids e deixei a regex
 * atras dele. Da primeira, as telas viraram duas e a regex continuou com `lp-`
 * cravado. Desta, os ancestrais entraram no conjunto — `g-quantias` contem
 * `lp-q0` e `lp-q1` — e a regex continuou saindo so dos PREFIXOS dominantes,
 * que nao incluem `g-`. O id estava protegido e nunca era casado.
 *
 * Alargar um conjunto sem alargar quem o consulta nao alarga nada. A alternativa
 * abaixo e a UNIAO dos prefixos com os ids protegidos literais: os prefixos
 * pegam ids que o HTML ainda nao tem, os literais pegam os ancestrais, que nao
 * compartilham prefixo com ninguem. */
const ALT_PROTEGIDOS = [
  ...PREFIXOS.map(escapar),
  ...[...IDS_PROTEGIDOS].filter((id) => !PREFIXOS.some((p) => id.startsWith(p))).map(escapar),
].join("|");
const RE_MENCAO = new RegExp('["\'`][^"\'`\n]*?((?:' + ALT_PROTEGIDOS + ')[\\w-]*)', "g");
const RE_SELETOR_PREFIXO = new RegExp('\\[\\s*id\\s*\\^?=\\s*["\']?(?:' + ALT_PREFIXOS + ')', "gi");
const RE_PREFIXO_NU = new RegExp('["\'`](?:' + ALT_PREFIXOS + ')["\'`]', "g");

/* A POSSE E DERIVADA, e ela e por TELA.
 *
 * Era `const MOTOR = "console-lp.js"` — um dono, um namespace, os dois cravados.
 * Com duas telas que assinam isso deixa de fazer sentido: `console-lp.js` e dono
 * de `lp-*` porque a tela `/console/` o carrega, e `console.js` e dono de `c-*`
 * pela mesma razao na `/calldata/`. Cravar um deles transformava o outro em
 * invasor da propria subarvore.
 *
 * A posse sai do mapa de carga: quem a tela carrega, e da lista de assinantes,
 * responde pelos ids daquela tela. Uma terceira tela nao exige editar nada. */
const DONO_DO_NAMESPACE = (() => {
  const mapa = carregadosPorPagina(RAIZ);
  const posse = new Map();   /* prefixo -> Set de scripts */
  for (const [tela, ids] of IDS_POR_TELA) {
    const pres = new Set();
    for (const id of ids) {
      const i = id.indexOf("-");
      if (i > 0) { const pre = id.slice(0, i + 1); if (PREFIXOS.includes(pre)) pres.add(pre); }
    }
    for (const [rel, pags] of mapa)
      if (pags.includes(tela) && ASSINANTES_REL.includes(rel))
        for (const pre of pres) {
          if (!posse.has(pre)) posse.set(pre, new Set());
          posse.get(pre).add(rel);
        }
  }
  return posse;
})();

const eDono = (arq, id) => {
  for (const [pre, donos] of DONO_DO_NAMESPACE)
    if (id.startsWith(pre) && donos.has(arq)) return true;
  return false;
};


/* Escritas no DOM que podem alterar o que o usuario LE antes de assinar.
   `classList` e `style` entram: quem controla a aparencia pode esconder uma
   linha do cartao sem trocar um caractere do texto. */
/* A LEITURA E QUE E LISTADA. Escrita e o resto.
 *
 * Aqui morava a lista de 18 formas de escrever no DOM, e o Tubarao-branco a
 * atravessou com sete linhas que escrevem em ids EXPLICITAMENTE protegidos:
 *
 *     el.hidden = true;              el.disabled = true;
 *     el.replaceWith(novo);          el.after(novo);      el.before(novo);
 *     el.insertBefore(novo, null);   Object.assign(el, { innerHTML: t });
 *
 * `.append\w*` cobria `append` e `appendChild` e nao cobria nenhuma dessas. A
 * API de escrita do DOM e ABERTA — `hidden`, `disabled`, `inert`, `contentEditable`,
 * qualquer propriedade refletida, e os metodos de insercao que nao comecam por
 * "append". Enumera-las e a mesma classe de erro que esta onda ja pagou nove
 * vezes.
 *
 * Entao o onus inverte, como no rol fechado do guardiao de assinatura: o que se
 * enumera e a LEITURA, que e um conjunto pequeno e fechado. Depois de uma mencao
 * a id protegido, se a janela contem qualquer atribuicao a propriedade ou
 * qualquer chamada de metodo que NAO esteja na lista de leitura, e escrita.
 *
 * Falha para o lado de acusar, e isso e deliberado num portao que carrega VETO
 * de Lei #1: um falso alarme custa uma linha de allowlist declarada; uma escrita
 * nao vista custa o cartao que o usuario le antes de assinar. */
const LEITURAS = [
  "textContent", "innerText", "innerHTML", "outerHTML", "value", "checked",
  "getAttribute", "hasAttribute", "getAttributeNames", "closest", "matches",
  "querySelector", "querySelectorAll", "contains", "length", "dataset",
  "children", "parentElement", "parentNode", "firstChild", "lastChild",
  "nextElementSibling", "previousElementSibling", "getBoundingClientRect",
  "id", "tagName", "className", "classList", "style", "options", "selectedIndex",
  "files", "form", "labels", "validity", "type", "name", "disabled", "hidden",
  "scrollTop", "scrollHeight", "offsetWidth", "offsetHeight", "clientWidth",

  /* Registro de ouvinte e foco: nao escrevem conteudo nenhum. */
  "addEventListener", "removeEventListener", "focus", "blur",

  /* Metodos de String e Array que caem na janela por vizinhanca — a janela tem
     220 caracteres e alcanca o que vem DEPOIS da leitura do elemento.
     `($("lp-erro").textContent || "").trim()` e leitura, e o `.trim()` e da
     string, nao do elemento. */
  "trim", "toLowerCase", "toUpperCase", "split", "replace", "includes",
  "startsWith", "endsWith", "padStart", "padEnd", "slice", "indexOf", "test",
  "match", "toString", "then", "catch", "forEach", "map", "filter", "join",

  /* `click()` · o unico item desta lista que exige justificativa, e ela e
     CRUZADA e verificavel, nao conveniencia.
     Disparar clique num elemento da subarvore executa o handler daquele
     elemento — nao o codigo de quem clicou. E os handlers da subarvore que
     assina vivem, por construcao, nos arquivos da classe `assina`, porque o rol
     fechado do `check-assinatura` recusa qualquer arquivo que alcance a carteira
     fora dessa classe. Entao um clique so pode acionar codigo que ja passou pelas
     quatro checagens.
     Se o rol fechado cair, esta permissao cai junto — e por isso ela esta escrita
     aqui, apontando para a garantia de que depende, em vez de parecer obvia.
     Uso medido: `console-app.js:366` dispara `lp-ler` (botao de LEITURA da chain)
     a partir de `ct-ler`, para nao duplicar o caminho de leitura em dois lugares. */
  "click",

  /* Console e diagnostico: nao tocam o DOM. Entram aqui porque a janela alcanca
     `console.log(e.textContent)` logo depois de uma LEITURA legitima, e o portao
     passava a chamar leitura de escrita. */
  "log", "warn", "error", "info", "debug", "table", "assert",
];

/* Uma escrita e: `.prop =` (e nao `==`/`===`/`=>`), OU `.metodo(` cujo nome nao
   esteja em LEITURAS, OU a propriedade aparecendo como chave de objeto — que foi
   como `Object.assign(el, { innerHTML: t })` passou pelo `/\.innerHTML\s*=/`. */
const RE_ATRIBUICAO = /\.\s*([A-Za-z_$][\w$]*)\s*=(?!=|>)/g;
const RE_CHAMADA = /\.\s*([A-Za-z_$][\w$]*)\s*\(/g;
const RE_CHAVE_DE_OBJETO = /\{[^{}]*\b(textContent|innerText|innerHTML|outerHTML|value|className|src|href|hidden|disabled|inert|contentEditable)\s*:/;

function escritaNaJanela(janela) {
  for (const m of janela.matchAll(RE_ATRIBUICAO)) return "atribuicao a ." + m[1];
  for (const m of janela.matchAll(RE_CHAMADA))
    if (!LEITURAS.includes(m[1])) return "chamada de ." + m[1] + "()";
  const k = RE_CHAVE_DE_OBJETO.exec(janela);
  if (k) return "propriedade '" + k[1] + "' escrita como chave de objeto";
  return null;
}



/* O removedor de comentario vem de `_comentarios.mjs` e preserva a numeracao de
   linha. Este arquivo tinha a versao ingenua ate 2026-08-19; a razao de o
   detalhe importar esta escrita la, junto com o numero que ele custou. */

/* QUAL FUNCAO ENVOLVE ESTA POSICAO · por contagem de chaves, nao por proximidade.
 *
 * A primeira versao desta resolucao pegava o ULTIMO cabecalho de funcao antes da
 * chamada (`matchAll(...).pop()`). Proximidade nao e contencao, e a diferenca
 * virou um falso negativo do pior tipo — daqueles em que o rigor novo CALA:
 *
 *     function abrir(id) { … }          <- ultimo cabecalho antes
 *     abrir("temaOv");                  <- unica invocacao, literal seguro
 *     var id = "lp-" + "endereco";      <- statement NO TOPO, fora de abrir()
 *     document.getElementById(id).innerHTML = "…";
 *
 * A escrita esta no escopo do modulo. `abrir` nao a envolve. Mas o nome do
 * parametro colide, as invocacoes de `abrir` sao literais seguras, e o portao
 * emprestava essa amarra ao vizinho: exit 0, imprimindo "nenhum script fora do
 * motor escreve na subarvore que assina". Medido em 2026-08-19, achado pelo
 * Tubarao-branco em agua limpa na re-auditoria.
 *
 * Agora caminha para tras contando chaves. So volta uma funcao se a posicao
 * estiver DENTRO do corpo dela.
 *
 * Uma chave dentro de string literal ou de regex distorce a contagem, e a
 * primeira redacao deste comentario errou a direcao: caminhando PARA TRAS, `}`
 * INCREMENTA a profundidade e `{` a consome. Logo um `}` perdido faz pular um
 * nivel a mais — sai da funcao e pode amarrar DEMAIS — e um `{` perdido faz
 * parar cedo, amarrando de menos. Nao empurra sempre para `null`, como estava
 * escrito aqui ate a terceira passagem do N2.
 *
 * Quem cobre a consequencia nao e esta contagem: e o corpus de
 * `check-portoes-mordem.mjs`, que exercita as duas direcoes a cada commit. */
/* Palavras que abrem bloco e PARECEM chamada de funcao. Sem esta lista,
   `if (x) {` seria lido como o metodo `if(x)`. */
const NAO_E_FUNCAO = /\b(if|for|while|switch|catch|do|else|try|finally|return|typeof|new|delete|void|in|of)\s*$/;

function funcaoQueEnvolve(src, pos) {
  let profundidade = 0;
  for (let i = pos - 1; i >= 0; i--) {
    const c = src[i];
    if (c === "}") { profundidade++; continue; }
    if (c !== "{") continue;
    if (profundidade > 0) { profundidade--; continue; }

    /* `{` sem par: abre o bloco que contem `pos`. */
    const antes = src.slice(Math.max(0, i - 200), i);

    /* NOMEADA · da para resolver pelos pontos de chamada */
    const nomeada = antes.match(
      /(?:function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)|([A-Za-z_$][\w$]*)\s*=\s*function\s*\(([^)]*)\))\s*$/
    );
    if (nomeada)
      return {
        fn: nomeada[1] || nomeada[3],
        params: (nomeada[2] ?? nomeada[4] ?? "").split(",").map((p) => p.trim()),
        inicioDoCorpo: i,
      };

    /* FRONTEIRA DE FUNCAO SEM NOME · arrow, anonima, metodo de objeto/classe.
     *
     * Aqui a busca PARA, e essa e a correcao. A versao anterior so reconhecia a
     * forma nomeada e, ao encontrar uma arrow ou um callback anonimo, seguia
     * caminhando PARA FORA — atravessava a fronteira da funcao e agarrava a
     * funcao nomeada de cima. Um callback aninhado herdava a amarra de quem o
     * continha, so por coincidencia de nome de parametro:
     *
     *     function abrir(id) {           <- nomeada, invocada so com literal seguro
     *       algo.forEach((id) => {       <- fronteira que a versao anterior ATRAVESSAVA
     *         $(id).innerHTML = "…";     <- herdava a amarra de abrir()
     *       });
     *     }
     *
     * Mesma assinatura do A-8: proximidade tratada como contencao. Agora
     * qualquer fronteira de funcao encerra a busca. Sem nome nao ha pontos de
     * chamada para ler, entao devolve `null` — e `null` NAO amarra, que num
     * vetor de Lei #1 e a direcao certa de errar. */
    const semNome =
      /\)\s*=>\s*$/.test(antes) ||                                  // (a, b) => {
      /(?:^|[^\w$.])[A-Za-z_$][\w$]*\s*=>\s*$/.test(antes) ||        // id => {
      /\bfunction\s*\*?\s*\([^)]*\)\s*$/.test(antes) ||              // function (…) {
      (/[A-Za-z_$][\w$]*\s*\([^)]*\)\s*$/.test(antes) && !NAO_E_FUNCAO.test(antes.replace(/\([^)]*\)\s*$/, "")));
    if (semNome) return null;

    /* bloco comum (if, for, try): sai um nivel e continua para fora */
  }
  return null;   // escopo do modulo · nao ha funcao que envolva
}

/* PISO DE COBERTURA · cobertura que encolhe sozinha reprova.
 *
 * A fonte unica de ASSINANTES fecha o caso que o Escorpiao isolou. Isto fecha a
 * CLASSE: qualquer caminho futuro que faca este portao enxergar menos — outro
 * rename, um namespace que muda, uma tela que sai do mapa de carga por um
 * atributo diferente — reprova em vez de aprovar com menos alvos.
 *
 * O piso e um arquivo commitado, nao uma constante: baixa-lo aparece no diff e
 * tem de vir com razao escrita. */
const PISO = JSON.parse(readFileSync(join(RAIZ, "scripts", "_cobertura-minima.json"), "utf8"));

const falhas = [];

for (const [campo, obtido] of [
  ["telas", TELAS.length],
  ["ids", IDS_PROTEGIDOS.size],
  ["namespaces", PREFIXOS.length],
]) {
  if (obtido < PISO[campo])
    falhas.push(
      `cobertura ENCOLHEU: ${campo} caiu de ${PISO[campo]} (piso cravado) para ${obtido}. ` +
      "Este portao carrega VETO de Lei #1 e nao aprova enxergando menos do que ja enxergou. " +
      "Se a arvore mudou de verdade, suba scripts/_cobertura-minima.json no mesmo commit, com a razao"
    );
}
let lidos = 0, alvos = 0, leiturasOk = 0, prefixos = 0, concatenacoes = 0, indiretas = 0;

const idsHtml = new Set(
  [...IDS_PROTEGIDOS]
);

/* Bundle de terceiro minificado nao entra nesta varredura, e a razao esta
   declarada: 600 KB de nomes de uma letra produzem `$(n)` a cada linha, e cada
   um vira "alvo irresoluvel". Isso nao e deteccao, e ruido — e ruido treina
   gente a ignorar guardiao. A contencao do bundle e outra e vive no
   `check-assinatura`: a classe `vendor-fixo` exige bytes pregados por hash e
   proibe que ele divida pagina com calldata. */
const VENDOR = /(^|\/)vendor\//;

for (const arq of executaveis(RAIZ)) {
  if (VENDOR.test(arq)) continue;
  /* O dono da subarvore daquela tela escreve nela; qualquer outro nao. A
     comparacao e por id, e nao por arquivo, porque um script pode ser dono de um
     namespace e invasor de outro — que e exatamente o caso das duas telas. */
  if (ASSINANTES_REL.includes(arq) && [...DONO_DO_NAMESPACE.values()].some((d) => d.has(arq)))
    continue;
  const src = codigoNormalizado(readFileSync(join(SITE, arq), "utf8"));
  lidos++;

  const linhaDe = (i) => src.slice(0, i).split("\n").length;

  /* Cada mencao a um id da subarvore, EM QUALQUER POSICAO DENTRO DA STRING.
   *
   * A versao anterior exigia a aspa colada no `lp-`: /["'`](lp-[\w-]+)["'`]/.
   * Isso cobria `$("lp-erro")` e mais nada. Um `#` na frente — a forma mais
   * comum de escrever isto em JavaScript moderno — passava direto:
   *
   *     document.querySelector("#lp-erro").innerHTML = "…"
   *
   * e o portao imprimia, na mesma execucao, "nenhum script fora do motor
   * escreve na subarvore que assina". Nao era forma exotica: sao 23 usos de
   * `querySelector('#…')` em modelo-2.js (e zero em console-app.js — o numero 43/10
   * da primeira redacao foi copiado de um laudo sem ser medido, e esta corrigido). Um portao de
   * Lei #1 declarando seguranca enquanto a porta mais usada fica aberta e pior
   * que portao nenhum, porque quem le o `✓` para de procurar.
   *
   * Agora casa o id onde quer que ele apareca dentro da string — `"#lp-x"`,
   * `".lp-x"`, `"[id^=lp-]"`, `"lp-x"`. */
  for (const m of src.matchAll(RE_MENCAO)) {
    const id = m[1];
    if (!idsHtml.has(id)) continue;          // id que nao existe no HTML: inerte
    alvos++;
    // A janela que segue a mencao e onde uma escrita apareceria.
    const janela = src.slice(m.index, m.index + 220);
    const escreve = escritaNaJanela(janela);
    if (escreve) {
      falhas.push(`${arq}:${linhaDe(m.index)} escreve em '${id}', que pertence a subarvore que assina — ${escreve}`);
    } else {
      leiturasOk++;
    }
  }

  /* =======================================================================
   * 2026-08-19 · TRES MANEIRAS DE CHEGAR NA SUBARVORE SEM ESCREVER O ID
   * =======================================================================
   *
   * O laco acima procura o id LITERAL. Ele cobre `$("lp-erro")` e nao cobre
   * mais nada — e ha 85 ids `lp-*` no HTML, todos alcancaveis por caminhos que
   * nao passam por um literal. O portao vinha imprimindo "nenhum script fora do
   * motor escreve na subarvore que assina" enquanto tres portas ficavam
   * abertas. Nao havia exploracao: havia a AFIRMACAO sem a cobertura.
   *
   * 1 · SELETOR POR PREFIXO.  querySelectorAll('[id^="lp-"]') devolve os 85 de
   *     uma vez. Uma linha alcanca a subarvore inteira.
   *
   * 2 · ID MONTADO.  "lp-" + chave, ou `lp-${k}`. O id nunca aparece inteiro no
   *     codigo, e a busca por literal nao ve nada.
   *
   * 3 · ALVO IRRESOLUVEL.  $(x) onde x nao pode ser amarrado a nenhum literal.
   *     O cabecalho deste arquivo PROMETE falha fechada aqui — "se um alvo de
   *     escrita nao puder ser resolvido a um id, o portao RECUSA em vez de
   *     assumir que esta fora" — e ate hoje ele nao recusava: ignorava. Uma
   *     promessa falsa dentro de um portao de Lei #1 e pior que a ausencia
   *     dela, porque quem le o cabecalho para de procurar.
   *
   * Medido antes de escrever a regra 3, nos 11 arquivos fora do motor: 26
   * chamadas nao-literais sao resolviveis por literal na janela (o padrao
   * `["c-ler","c-montar"].forEach(id => $(id))`), 6 sao a definicao do proprio
   * helper `$`, e ZERO ficam irresoluveis com escrita. Cumprir a promessa custa
   * nenhum falso positivo hoje — e amarra o dia em que passar a custar. */

  /* 1 · seletor de atributo sobre o namespace · `[id^="lp-"]`, `[ID*='lp-']`.
     Nome de atributo em HTML nao distingue caixa, entao o casamento tambem nao. */
  for (const m of src.matchAll(/\[\s*id\s*[\^*$|~]?=\s*["'`]?#?lp-?/gi)) {
    prefixos++;
    falhas.push(
      `${arq}:${linhaDe(m.index)} usa seletor de atributo sobre o namespace '${PREFIXO}*' — ` +
      `uma linha assim alcanca os ${idsHtml.size} ids da subarvore que assina de uma vez`
    );
  }

  /* 2 · o PREFIXO NU, em qualquer forma.
   *
   * `"lp-"` sozinho numa string, num arquivo fora do motor, nao tem uso
   * legitimo: ninguem escreve o prefixo do namespace de assinatura a nao ser
   * para montar um id dele. Casar o prefixo — e nao a operacao que vem depois —
   * cobre de uma vez `"lp-" + k`, `"lp-".concat(k)`, `const P = "lp-"` guardado
   * para uso tres funcoes adiante, e qualquer forma que ainda nao inventaram.
   *
   * A versao anterior casava `["'`]lp-["'`]\s*\+` — o prefixo E o operador de
   * concatenacao colados. `"lp-".concat(k)` passava. `const P="lp-"` passava.
   * Enumerar operacoes e caca ao rato; casar o prefixo mata a ninhada. */
  for (const m of src.matchAll(/["'`]#?lp-["'`]|`#?lp-\$\{/g)) {
    concatenacoes++;
    falhas.push(
      `${arq}:${linhaDe(m.index)} escreve o prefixo nu '${PREFIXO}' — fora do motor ele so serve ` +
      `para montar um id da subarvore que assina, e um id montado nao aparece inteiro no codigo`
    );
  }

  /* 3 · alvo de escrita que nao se resolve a um id · a promessa do cabecalho.
   *
   * A resolucao olha SO PARA TRAS, e so ate o inicio do statement. A versao
   * anterior olhava uma janela de 260 caracteres nos dois sentidos, e o
   * argumento da PROPRIA escrita entrava nela: `classList.add("on")` trazia o
   * literal `"on"`, a regra se dava por satisfeita e calava. Como toda chamada
   * real carrega algum literal, a regra quase nunca disparava — e o cabecalho
   * descrevia o vao como "literal nao relacionado na vizinhanca", o que sugere
   * ruido incidental. Nao era incidental: era a chamada, ela mesma.
   *
   * Agora vale como amarra so o que de fato liga a variavel: um array de
   * literais antes da chamada (`["c-ler","c-montar"].forEach(id => $(id))`) ou
   * uma atribuicao literal ao mesmo identificador. */
  for (const m of src.matchAll(/(?:getElementById|\$)\(\s*([A-Za-z_$][\w$.]*)\s*\)/g)) {
    const nome = m[1];
    const antes = src.slice(Math.max(0, m.index - 90), m.index);
    if (/\$\s*=[^;]*$/.test(antes)) continue;          // a definicao do proprio helper

    /* Este consumidor ficou para tras quando a decisao de "o que e escrita" saiu
       da lista `ESCRITAS` e passou para `escritaNaJanela()`. Com a lista vazia,
       a regra de ALVO IRRESOLUVEL parou de disparar — e ela e a falha fechada
       deste portao, a parte que recusa quando nao consegue provar. Migrar o
       primeiro laco e esquecer o segundo e o mesmo erro de alargar um conjunto e
       deixar quem o consulta para tras, que ja aconteceu duas vezes aqui. */
    /* A JANELA TERMINA NO STATEMENT, e nao em 200 caracteres.
       Com a deteccao de escrita aberta (qualquer metodo fora da lista de
       leitura), 200 caracteres alcancam a linha seguinte: `localStorage.setItem`
       na linha de baixo passou a contar como escrita no alvo de cima. Janela
       larga com deteccao larga produz acusacao por vizinhanca. */
    const resto = src.slice(m.index, m.index + 200);
    const fimDoStatement = Math.min(
      ...[resto.indexOf(";"), resto.indexOf(String.fromCharCode(10))]
        .filter((i) => i >= 0)
        .concat([resto.length])
    );
    const escreve = escritaNaJanela(resto.slice(0, fimDoStatement));
    if (!escreve) continue;                             // so leitura: livre

    const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    /* AMARRA 1 · array de literais DENTRO do statement.
       Limitado ao statement de proposito: um array solto tres linhas acima nao
       amarra coisa nenhuma, e aceita-lo seria a frouxidao da segunda versao. */
    const inicioStmt = Math.max(0, src.lastIndexOf(";", m.index) + 1, src.lastIndexOf("\n", m.index - 200));
    const noStatement = src.slice(Math.max(inicioStmt, m.index - 400), m.index);
    if (/\[\s*(["'][\w-]+["']\s*,\s*)*["'][\w-]+["']\s*\]/.test(noStatement)) continue;

    /* AMARRA 2 · atribuicao literal ao MESMO nome, e ela nao cabe no statement.
     *
     * `var id = "c-ler"; $(id).innerHTML = "x";` sao dois statements. A janela
     * limitada ao statement corrente comeca DEPOIS do `;` — ou seja, depois da
     * atribuicao que amarra. O cabecalho documentava esta amarra e o codigo
     * recusava o proprio exemplo dela: falso positivo em codigo legitimo, achado
     * pelo Tubarao-branco na terceira passagem.
     *
     * A janela desta amarra olha 400 caracteres para tras, atravessando `;`.
     * Continua sendo so PARA TRAS e continua exigindo o MESMO identificador —
     * o que a torna precisa. O que nunca volta e olhar para frente, que era o
     * defeito original: la o literal do argumento da propria escrita amarrava. */
    const tras = src.slice(Math.max(0, m.index - 400), m.index);
    if (new RegExp("(?:^|[^\\w$.])" + esc(nome) + '\\s*=\\s*["\'`][\\w-]+["\'`]').test(tras)) continue;

    /* AMARRA 2 · o alvo e PARAMETRO DE FUNCAO · resolve pelos pontos de chamada.
     *
     * `function recusar(campoId, msg) { var c = $(campoId); … }` nao tem literal
     * nenhum por perto: os ids vivem em quem chama, `recusar("c-endereco", …)`.
     * Uma varredura para tras nunca vai encontra-los, e recusar aqui reprovaria
     * quatro trechos legitimos — portao vermelho em codigo correto e o caminho
     * mais curto para alguem afrouxa-lo.
     *
     * Entao: acha a funcao que envolve a chamada, confere a posicao do parametro,
     * e le TODAS as invocacoes dela neste arquivo. So amarra se cada uma passar
     * um literal, e nenhum comecar por `lp-`. Uma so passando variavel derruba a
     * amarra — se o proprio codigo nao sabe o que entra ali, eu tambem nao sei.
     *
     * Fica dentro do arquivo de proposito: cruzar arquivos exigiria um grafo de
     * modulos, e a fronteira que importa aqui ja e o arquivo — o motor e um
     * arquivo, e o invariante e sobre quem NAO e ele. */
    /* AMARRA 3 · parametro de callback de iterador sobre array NOMEADO.
     *
     * `var CAMPOS = ["c-endereco", …]; … CAMPOS.forEach(function (id) { $(id) … })`
     * — os literais existem, so nao estao no mesmo statement nem num ponto de
     * chamada nomeado. A amarra 1 nao alcanca (olha ate o inicio do statement) e
     * a amarra 2 nao alcanca (a funcao e anonima). Resolve pelo nome do array. */
    const iter = src.slice(Math.max(0, m.index - 300), m.index).match(
      /([A-Za-z_$][\w$.]*)\s*\.\s*(?:forEach|map|filter|some|every|find)\s*\(\s*(?:function\s*\(\s*([A-Za-z_$][\w$]*)|\(?\s*([A-Za-z_$][\w$]*)\s*\)?\s*=>)/
    );
    if (iter && (iter[2] === nome || iter[3] === nome)) {
      const arr = iter[1].split(".").pop();
      const decl = src.match(new RegExp(esc(arr) + '\\s*=\\s*\\[([^\\]]*)\\]'));
      if (decl) {
        const itens = decl[1].split(",").map((t) => t.trim()).filter(Boolean);
        const todosLit = itens.length > 0 && itens.every((t) => /^["'`][\w-]+["'`]$/.test(t));
        const noNamespace = itens.some((t) => /^["'`]#?lp-/.test(t));
        if (todosLit && !noNamespace) continue;
        if (noNamespace) {
          indiretas++;
          falhas.push(
            `${arq}:${linhaDe(m.index)} escreve iterando '${arr}', que contem id do namespace '${PREFIXO}'`
          );
          continue;
        }
      }
    }

    /* ARROW SEM CHAVE · a fronteira que a contagem de chaves nao pode ver.
     *
     * `funcaoQueEnvolve` acha o escopo caminhando por `{` e `}`. Uma arrow de
     * corpo de EXPRESSAO nao abre chave nenhuma:
     *
     *     function abrir(id) { const p = (id) => $(id).innerHTML = "x"; p(z); }
     *                                      ^^^^ escopo novo, zero chaves
     *
     * O caminhador passava reto por ela, chegava em `abrir`, lia as invocacoes
     * de `abrir` — todas com literal seguro — e amarrava. `exit 0`, com o portao
     * imprimindo que ninguem escreve na subarvore que assina. Terceira aparicao
     * da MESMA familia (A-8 · C-1 · esta), cada vez por uma fronteira que o
     * mecanismo anterior nao enxergava.
     *
     * A janela e o STATEMENT corrente dentro do corpo achado: uma arrow fechada
     * antes do statement nao amarra nada aqui, e considera-la seria reprovar
     * codigo legitimo. Se dentro dela houver uma arrow cujo parametro e o nosso
     * nome, quem amarra e ela — anonima, sem ponto de chamada para ler — e o
     * veredito e `null`, que nao amarra. */
    const cab = funcaoQueEnvolve(src, m.index);
    const limiteCorpo = cab ? cab.inicioDoCorpo : 0;
    const statement = src.slice(
      Math.max(limiteCorpo, src.lastIndexOf(";", m.index), src.lastIndexOf("{", m.index), src.lastIndexOf("}", m.index)),
      m.index
    );
    const arrowAmarra = [...statement.matchAll(/(?:\(([^)]*)\)|([A-Za-z_$][\w$]*))\s*=>/g)].some((a) =>
      (a[1] ?? a[2] ?? "").split(",").map((p) => p.trim()).includes(nome)
    );

    if (cab && !arrowAmarra) {
      const fn = cab.fn;
      const params = cab.params;
      const pos = params.indexOf(nome);
      if (fn && pos >= 0) {
        const chamadas = [...src.matchAll(new RegExp("(?<![\\w$.])" + esc(fn) + "\\s*\\(([^)]*)\\)", "g"))]
          /* A DECLARACAO NAO E CHAMADA. Comparar indice com o do cabecalho nao
             funciona: o cabecalho comeca em `function`, o casamento comeca no
             nome — dezenove caracteres adiante. A declaracao entrava na lista
             com `arg0 = "campoId"`, que nao e literal, e derrubava a amarra de
             todas as quatro chamadas legitimas logo abaixo. */
          .filter((c) => !/function\s+$/.test(src.slice(Math.max(0, c.index - 12), c.index)))
          .map((c) => (c[1].split(",")[pos] || "").trim());
        const todosLiterais = chamadas.length > 0 && chamadas.every((a) => /^["'`][\w-]+["'`]$/.test(a));
        const algumNoNamespace = chamadas.some((a) => /^["'`]#?lp-/.test(a));
        if (todosLiterais && !algumNoNamespace) continue;      // amarrado, e fora do namespace
        if (algumNoNamespace) {
          indiretas++;
          falhas.push(
            `${arq}:${linhaDe(m.index)} escreve via '${fn}(${nome})', e alguma invocacao dessa funcao ` +
            `passa um id do namespace '${PREFIXO}' — a escrita chega na subarvore que assina por parametro`
          );
          continue;
        }
      }
    }

    indiretas++;
    falhas.push(
      `${arq}:${linhaDe(m.index)} escreve num alvo que nao consegui amarrar a um id ` +
      `(${m[0].trim()}) — nem array de literais nem atribuicao literal a '${nome}' antes da chamada. ` +
      `Recuso por nao saber, que e o modo de falha correto num vetor de Lei #1 — ` +
      `nomeie o id, ou prove que ele nao e '${PREFIXO}*'`
    );
  }
}

console.log(
  "portao de alcance de escrita no DOM · namespaces " + PREFIXOS.map((p) => "'" + p + "*'").join(" e ") +
  " · telas: " + TELAS.join(", ")
);
console.log(`  ids da subarvore no HTML .......... ${idsHtml.size}`);
console.log(`  scripts varridos (fora do motor) .. ${lidos}`);
console.log(`  mencoes a ids da subarvore ........ ${alvos}  (leitura: ${leiturasOk})`);
console.log(`  seletores por prefixo ............. ${prefixos}`);
console.log(`  ids montados por concatenacao ..... ${concatenacoes}`);
console.log(`  escritas em alvo irresoluvel ...... ${indiretas}`);
console.log(`  fora do alcance ................... funcao exportada e chamada de OUTRO arquivo (ver cabecalho)`);

if (falhas.length) {
  console.error("\nVETO DE LEI #1 · tela de fora alcanca a subarvore que assina:");
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log("\n✓ nenhum script fora do motor escreve na subarvore que assina");
