#!/usr/bin/env node
/* PORTAO DO F-4 · o provedor de carteira e capturado UMA VEZ  ·  2026-08-19
 * ---------------------------------------------------------------------------
 * Gate aberto pelo Tubarao-branco em 2026-08-12 — "window.ethereum confiado como
 * ultimo a escrever" — e classificado MEDIUM em 2026-08-19. A ameaca nao e um
 * atacante; e uma colisao corriqueira:
 *
 *   duas carteiras instaladas disputam `window.ethereum`. A segunda vence a
 *   corrida DEPOIS da carga. Codigo que rele o slot a cada chamada passa a falar
 *   com o objeto NOVO, enquanto os listeners de `chainChanged`, registrados uma
 *   unica vez na carga, seguem presos ao VELHO. O usuario troca de chain, o
 *   handler nao dispara, e a calldata congelada para uma chain fica armada para
 *   ser assinada em outra.
 *
 * O handler que impede isso ja estava escrito e correto. Ele nunca era chamado.
 * Era o F-5 desarmado pelo F-4, e por isso este portao cobra os dois.
 *
 * ===========================================================================
 * AS QUATRO REGRAS, e por que cada uma existe
 * ===========================================================================
 *
 * 1. FORA DO MOTOR, NINGUEM LE `window.ethereum`. A captura mora num lugar so
 *    (`motor.js`), e quem consome pergunta a ele. Comentario nao conta — a
 *    varredura roda sobre codigo executavel.
 *
 * 2. NINGUEM CHAMA `.on(` DIRETO NO PROVEDOR. Ouvinte anexado a mao nao
 *    sobrevive a troca. `MOTOR.ouvir` guarda o par e re-anexa sozinho.
 *
 * 3. O MOTOR DESCOBRE POR EIP-6963. A Escada de Reuso parou no degrau 4: o
 *    padrao existe porque `window.ethereum` e um slot unico disputado, e a
 *    pagina deve ESCOLHER em vez de aceitar quem escreveu por ultimo.
 *
 * 4. A TROCA DE PROVEDOR INVALIDA O CONGELAMENTO. Quando o objeto muda no meio
 *    de uma calldata congelada, a pagina nao sabe o que aconteceu enquanto os
 *    handlers estavam no objeto anterior. Recusa por nao saber.
 *
 * FALHA FECHADA: arquivo que deveria existir e nao existe reprova. Portao que
 * nao consegue olhar nao aprova.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { codigoNormalizado } from "./_comentarios.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const JS = join(RAIZ, "site", "js");
const MOTOR = "motor.js";

/* DESCOBRE quem toca a carteira. Nao lista.
 *
 * A primeira versao trazia `["console-lp.js", "console.js"]` escrito a mao, e o
 * furo apareceu no primeiro controle ponta a ponta: um arquivo NOVO com
 * `var x = window.ethereum;` passou pelo hook e o commit entrou. O portao nao o
 * varria porque ele nao estava na lista — e quem cria arquivo novo e exatamente
 * quem nao sabe que existe uma lista para editar.
 *
 * E a mesma classe que o `portoes.mjs` ja tinha fechado uma vez ("descobre, nao
 * lista") e que eu reintroduzi aqui. Varre `site/js/*.js` inteiro: qualquer
 * arquivo que mencione o slot ou os eventos de carteira e consumidor, tenha nome
 * previsto ou nao. O motor sai da varredura porque ele e a captura. */
const CONSUMIDORES = readdirSync(JS)
  .filter((f) => f.endsWith(".js") && f !== MOTOR)
  .filter((f) => {
    const src = codigoNormalizado(readFileSync(join(JS, f), "utf8"));
    return /\bwindow\s*\.\s*ethereum\b/.test(src) ||
           /\.\s*on\s*\(\s*["'`](chainChanged|accountsChanged)["'`]/.test(src) ||
           /MOTOR\s*\.\s*(provedor|ouvir|descobrirProvedor|aoTrocarProvedor)\s*\(/.test(src);
  });

const falhas = [];
const notas = [];

const ler = (arq) => {
  const p = join(JS, arq);
  if (!existsSync(p)) { falhas.push(`${arq} nao existe — o portao nao consegue olhar, entao recusa`); return null; }
  return codigoNormalizado(readFileSync(p, "utf8"));
};

/* ------------------------------------------------- 1 · a captura e unica -- */

const motor = ler(MOTOR);
if (motor) {
  for (const [nome, re] of [
    ["provedor()", /\bfunction\s+provedor\s*\(/],
    ["ouvir()", /\bfunction\s+ouvir\s*\(/],
    ["descobrirProvedor()", /\bfunction\s+descobrirProvedor\s*\(/],
    ["aoTrocarProvedor()", /\bfunction\s+aoTrocarProvedor\s*\(/],
  ]) if (!re.test(motor)) falhas.push(`${MOTOR}: ${nome} ausente — a captura unica nao existe`);

  /* 3 · descoberta por padrao, nao por invencao */
  if (!/eip6963:announceProvider/.test(motor))
    falhas.push(`${MOTOR}: nao escuta 'eip6963:announceProvider'. Sem o padrao, a pagina aceita quem escreveu por ultimo no slot em vez de ESCOLHER`);
  if (!/eip6963:requestProvider/.test(motor))
    falhas.push(`${MOTOR}: nao dispara 'eip6963:requestProvider'. Carteira que ja anunciou antes do script nao seria vista`);
  if (!/ethereum#initialized/.test(motor))
    falhas.push(`${MOTOR}: nao escuta 'ethereum#initialized'. Carteira que injeta tarde deixaria a tela morta ate recarregar`);
}

/* --------------------------- 2 · consumidor nao toca no slot nem no .on -- */

let leiturasDiretas = 0, onDiretos = 0;
const somenteLeitura = [];

for (const arq of CONSUMIDORES) {
  const src = ler(arq);
  if (!src) continue;
  const linhaDe = (i) => src.slice(0, i).split("\n").length;

  /* A OBRIGACAO ESCALA COM O QUE A TELA FAZ, e isto nao e concessao.
   *
   * O F-4 existe porque calldata congelada para uma chain pode ser assinada em
   * outra quando os ouvintes ficam num objeto e as chamadas vao noutro. Uma tela
   * que so LE endereco nao congela nada, nao monta calldata, nao tem o que
   * invalidar — exigir dela `aoTrocarProvedor` seria cobrar a anulacao de algo
   * que nao existe, e obrigar a carregar `motor.js` numa pagina que nao assina
   * acrescenta script sem ganho de seguranca nenhum.
   *
   * Medido em 2026-08-19: `positions.js` declara allowlist somente-leitura
   * (`eth_accounts` / `eth_requestAccounts`) e `site/positions/index.html` nao
   * carrega o motor. O risco que sobra la e mostrar o endereco de uma carteira
   * diferente da que o usuario pensa — inconsistencia de tela, nao perda de
   * fundo. Sai como NOTA, com nome e contagem, para nao virar cobertura
   * presumida.
   *
   * O que NAO afrouxa para ninguem: ouvinte anexado a mao. Handler preso ao
   * objeto errado esta errado numa tela que so le tanto quanto numa que assina. */
  const assina = /eth_sendTransaction/.test(src);
  if (!assina) {
    for (const m of src.matchAll(/\.\s*on\s*\(\s*["'`](chainChanged|accountsChanged|connect|disconnect)["'`]/g)) {
      onDiretos++;
      falhas.push(
        `${arq}:${linhaDe(m.index)} anexa '${m[1]}' direto no provedor. Ouvinte anexado a mao morre na ` +
        `troca de carteira — e isso vale para tela que so le tambem`
      );
    }
    const n = [...src.matchAll(/\bwindow\s*\.\s*ethereum\b/g)].length;
    if (n) somenteLeitura.push(`${arq} — ${n} leitura(s) do slot · allowlist somente-leitura, nao congela nada`);
    continue;
  }

  /* A UNICA leitura permitida do slot e a ENTREGA ao motor.
   *
   * O motor nao pode ler `window.ethereum` sozinho: o `check-assinatura` cobra
   * que todo arquivo que alcanca carteira declare a allowlist, e a allowlist
   * mora na tela. Entao a tela le o slot UMA vez e o entrega — e essa entrega
   * tem forma unica e reconhecivel:
   *
   *     MOTOR.descobrirProvedor(fn, window.ethereum, function () { return window.ethereum; })
   *
   * Qualquer outra leitura e o furo de volta. A janela abaixo e curta de
   * proposito: se alguem escrever a entrega em 400 caracteres, e porque nao e
   * uma entrega. */
  const permitidas = new Set();
  for (const m of src.matchAll(/MOTOR\s*\.\s*descobrirProvedor\s*\(/g)) {
    /* A chamada tem DOIS usos legitimos do slot — o fallback imediato e a funcao
       que o le de novo quando a carteira chega tarde. Uma janela preguicosa
       parava no primeiro e reprovava o segundo; a janela e contada a partir da
       chamada, e cobre a lista de argumentos inteira. */
    const fim = Math.min(src.length, m.index + 300);
    for (const w of src.slice(m.index, fim).matchAll(/\bwindow\s*\.\s*ethereum\b/g))
      permitidas.add(m.index + w.index);
  }

  for (const m of src.matchAll(/\bwindow\s*\.\s*ethereum\b/g)) {
    if (permitidas.has(m.index)) continue;   // a entrega ao motor
    leiturasDiretas++;
    falhas.push(
      `${arq}:${linhaDe(m.index)} le window.ethereum fora da entrega ao motor. Reler o slot e o furo: ` +
      `a pagina passa a falar com um objeto enquanto os ouvintes ficam noutro. Use MOTOR.provedor()`
    );
  }
  for (const m of src.matchAll(/\.\s*on\s*\(\s*["'`](chainChanged|accountsChanged|connect|disconnect)["'`]/g)) {
    onDiretos++;
    falhas.push(
      `${arq}:${linhaDe(m.index)} anexa '${m[1]}' direto no provedor. Ouvinte anexado a mao morre na ` +
      `troca de carteira — use MOTOR.ouvir, que re-anexa sozinho`
    );
  }

  /* 4 · a troca invalida */
  if (!/MOTOR\s*\.\s*aoTrocarProvedor\s*\(/.test(src))
    falhas.push(
      `${arq}: nao reage a troca de provedor. Quando o objeto muda no meio de uma calldata congelada, ` +
      `esta tela nao soube de chain nem de conta durante a troca — tem de invalidar, nao supor`
    );
  else if (!/aoTrocarProvedor[\s\S]{0,400}invalidarCongelamento/.test(src))
    falhas.push(
      `${arq}: reage a troca de provedor e NAO invalida o congelamento. Reagir sem invalidar e o ` +
      `defeito que o F-5 ja tinha: avisar em vez de anular`
    );
}

/* ============ 5 · O REGISTRO E EXERCIDO, NAO LIDO ==========================
 *
 * A regra 4 acima procurava `MOTOR.aoTrocarProvedor(` no texto e a janela
 * `aoTrocarProvedor[\s\S]{0,400}invalidarCongelamento`. O Tubarao-branco
 * derrubou as duas em agua limpa com doze caracteres:
 *
 *     if (false) MOTOR.aoTrocarProvedor(function () { invalidarCongelamento(...) });
 *
 * Texto integralmente preservado, F-5 desarmado, cinco portoes verdes. E o
 * mesmo PoC A1/B1 que o Escorpiao ja tinha provado noutros dois portoes,
 * aplicado justamente ao que o PRD chama de espinha da dependencia — porque a
 * migracao para execucao (M2) alcancou `check-origem-unica` e
 * `check-duas-fontes` e NAO alcancou este.
 *
 * Duas travas, e nenhuma delas e lista de padroes suspeitos:
 *
 * 5a · O REGISTRO E INCONDICIONAL. Handler de troca de provedor que so existe
 *      sob condicao nao e handler: e uma intencao. A chamada tem de ser um
 *      STATEMENT no topo do modulo — profundidade de chaves 1 (o corpo da IIFE)
 *      e primeira coisa da linha. `if (false)`, `x &&`, `cond ?`, ou qualquer
 *      aninhamento dentro de funcao quebram o invariante por CONSTRUCAO, sem
 *      que este portao precise adivinhar a forma do disfarce.
 *
 * 5b · O CALLBACK E EXECUTADO. O corpo e extraido e rodado com
 *      `invalidarCongelamento` e `estado` instrumentados. O que se cobra nao e
 *      a presenca do nome numa janela de 400 caracteres: e que chamar o handler
 *      RESULTE em invalidacao.
 *
 * Tentei antes carregar a tela inteira numa `vm` com DOM de mentira — seria mais
 * fiel — e o `Proxy` que responde a qualquer propriedade levou a IIFE a laco
 * infinito (timeout de 5 s nos dois arquivos). Registrado para ninguem gastar a
 * tarde de novo nesse caminho.
 */
let registrosExercidos = 0;
for (const arq of CONSUMIDORES) {
  const src = ler(arq);
  if (!src) continue;
  if (!/eth_sendTransaction/.test(src)) continue;   /* tela que nao congela nao tem o que invalidar */

  const i = src.search(/MOTOR\s*\.\s*aoTrocarProvedor\s*\(/);
  if (i < 0) continue;                              /* a regra 4 ja reprovou a ausencia */

  /* 5a · statement no topo do modulo */
  let prof = 0;
  for (let k = 0; k < i; k++) {
    const c = src[k];
    if (c === "{") prof += 1;
    else if (c === "}") prof -= 1;
  }
  const inicioDaLinha = src.lastIndexOf("\n", i - 1) + 1;
  const antesNaLinha = src.slice(inicioDaLinha, i).trim();

  if (prof !== 1 || antesNaLinha !== "") {
    falhas.push(
      `${arq}: o registro de aoTrocarProvedor NAO e incondicional — profundidade de chaves ${prof} ` +
      `(esperado 1) e ${antesNaLinha === "" ? "inicio de linha" : "precedido por \`" + antesNaLinha.slice(0, 24) + "\`"}. ` +
      "Handler de troca de provedor que existe sob condicao nao e handler, e `if (false)` na frente " +
      "preserva todo o texto que uma varredura procuraria"
    );
    continue;
  }

  /* 5b · o callback roda */
  let abre = src.indexOf("(", i), n = 0, fim = -1;
  for (let k = abre; k < src.length; k++) {
    const c = src[k];
    if (c === "(") n += 1;
    else if (c === ")") { n -= 1; if (n === 0) { fim = k; break; } }
  }
  if (fim < 0) {
    falhas.push(`${arq}: nao consegui delimitar o callback de aoTrocarProvedor para executa-lo`);
    continue;
  }
  const callback = src.slice(abre + 1, fim).trim();

  /* O AMBIENTE E DESCOBERTO, NAO LISTADO.
   *
   * A primeira versao injetava tres nomes escritos a mao
   * (`invalidarCongelamento`, `estado`, `console`) e o callback lancou
   * `ReferenceError: $ is not defined` — o auxiliar de DOM da tela. Listar
   * dependencia e a mesma classe de defeito que este portao existe para pegar:
   * quem escreve o proximo callback nao sabe que ha uma lista para editar.
   *
   * `with` sobre um Proxy que responde a QUALQUER identificador resolve o
   * escopo por descoberta. O corpo de `new Function` nao e estrito, entao `with`
   * e legal aqui. O que interessa e instrumentado; o resto vira funcao muda que
   * devolve outra funcao muda, e o callback corre inteiro sem tocar em DOM. */
  const chamou = [];
  const mudo = (nome) => new Proxy(function () {}, {
    get(_t, k) {
      if (k === Symbol.toPrimitive || k === "toString") return () => "";
      if (k === "then") return undefined;
      return mudo(nome + "." + String(k));
    },
    set() { return true; },
    apply() { return mudo(nome + "()"); },
    has() { return true; },
  });
  const ambiente = new Proxy({
    invalidarCongelamento: (m) => chamou.push(["invalidarCongelamento", m]),
    estado: (m) => chamou.push(["estado", m]),
    console: { log() {}, warn() {}, error() {} },
  }, {
    has: () => true,
    get(alvo, k) {
      if (k === Symbol.unscopables) return undefined;
      if (Object.prototype.hasOwnProperty.call(alvo, k)) return alvo[k];
      return mudo(String(k));
    },
  });

  try {
    const criar = new Function("__amb", "with (__amb) { return (" + callback + "); }");
    criar(ambiente)();
  } catch (e) {
    falhas.push(
      `${arq}: o callback de aoTrocarProvedor lancou ${e.name} ao ser executado (${e.message}). ` +
      "Handler que nao roda nao invalida nada"
    );
    continue;
  }

  if (!chamou.some(([nome]) => nome === "invalidarCongelamento")) {
    falhas.push(
      `${arq}: o callback de aoTrocarProvedor RODOU e nao chamou invalidarCongelamento. ` +
      "Reagir sem invalidar e o defeito que o F-5 ja tinha: avisar em vez de anular"
    );
    continue;
  }
  registrosExercidos += 1;
}

/* ------------------------------------------------------------- relatorio */

console.log(`portao do F-4 · provedor capturado uma vez · motor: ${MOTOR}`);
console.log(`  consumidores varridos ......... ${CONSUMIDORES.length}`);
console.log(`  leituras diretas do slot ...... ${leiturasDiretas}`);
console.log(`  ouvintes anexados a mao ....... ${onDiretos}`);
console.log(`  descoberta EIP-6963 ........... ${motor && /eip6963:announceProvider/.test(motor) ? "sim" : "NAO"}`);
console.log(`  registros EXERCIDOS ........... ${registrosExercidos}  (statement no topo + callback executado)`);
console.log(`  telas somente-leitura .......... ${somenteLeitura.length}  (obrigacao escalada)`);
for (const n of somenteLeitura) console.log(`      ${n}`);
for (const n of notas) console.log(`  nota: ${n}`);
console.log(`  NAO conferido ................. se a carteira REAL troca de objeto em producao — isso e render, nao leitura`);

if (falhas.length) {
  console.error("\nF-4 ABERTO:");
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log("\n✓ um provedor, capturado uma vez, e a troca dele invalida os bytes congelados");
