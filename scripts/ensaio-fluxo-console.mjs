#!/usr/bin/env node
/**
 * ENSAIO DE FLUXO — dirige o console de verdade, e nao um pedaço dele.
 *
 * POR QUE ISTO EXISTE, e e a resposta ao unico pedido que importa: sair do
 * ciclo de erro atras de erro. Em 2026-08-23 o fundador clicou seis vezes e
 * achou seis defeitos, e nenhum dos testes existentes podia te-los achado —
 * porque todos medem camadas diferentes daquela em que os defeitos moravam:
 *
 *   portoes.mjs             estrutura e texto dos arquivos
 *   ensaio-console-fork.mjs a CALLDATA, contra a chain
 *   check-assinatura        as onze regras do caminho que assina
 *   ...e nada                a MAQUINA DE ESTADO do console
 *
 * Os seis defeitos, um a um, moravam na camada sem teste: o seletor que voltava
 * a USDT porque havia uma segunda lista escrita em JS; o modal que existia e nao
 * aparecia; o indice fixo em 0 quando o cofre 0 ja existia; `S.triad` nulo depois
 * de um recibo de sucesso. Enquanto essa camada nao tiver teste, o fundador
 * continua sendo o teste dela — e cada rodada dele custa gas de verdade: tres
 * cofres nasceram na conta dele por causa do estado que a tela nao guardou.
 *
 * O QUE ELE FAZ. Carrega o `index.html` real para descobrir os ids, monta um DOM
 * suficiente, carrega os QUATRO scripts na ordem da pagina, liga uma carteira de
 * mentira a um fork de verdade, e entao CLICA: conectar, escolher moeda, deploy
 * pelo Builder, deploy pelo Copilot, adicionar e remover liquidez. Depois de
 * cada passo ele confere o ESTADO — nao a aparencia.
 *
 * O QUE ELE NAO FAZ, dito para nao ser comprado por mais do que vale: nao
 * renderiza, nao calcula layout, nao tem CSS. Ele nao acha "o modal ficou
 * invisivel" — quem acha isso e a medicao de `getBoundingClientRect` que vive
 * dentro do proprio modulo, e ela existe por causa daquele defeito. Este ensaio
 * acha o que e ESTADO: nulo onde devia haver endereco, lista vazia onde devia
 * haver opcao, handler que nao existe, saldo que nao acompanha a chain.
 *
 *   node scripts/ensaio-fluxo-console.mjs --porta 8901
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { webcrypto } from "node:crypto";

const RAIZ = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const SITE = join(RAIZ, "site");
const arg = (n) => process.argv.find((a, i) => process.argv[i - 1] === n);
const PORTA = Number(arg("--porta")) || 8901;
const NO = `http://127.0.0.1:${PORTA}`;
const DONO = "0x930BB359901426a0D3139848a6C09f0C9EA0851a";

const falhas = [];
const notas = [];
const conferir = (cond, oq, detalhe) => {
  const linha = (cond ? "  ✓ " : "  ✗ ") + oq + (detalhe ? " · " + detalhe : "");
  console.log(linha);
  (cond ? notas : falhas).push(linha.trim());
  return cond;
};

/* ═══ 1 · o fork ═══════════════════════════════════════════════════════════ */
let idRpc = 0;
async function rpcFork(method, params = []) {
  const r = await fetch(NO, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++idRpc, method, params }) });
  const j = await r.json();
  if (j.error) { const e = new Error(j.error.message); e.data = j.error.data; throw e; }
  return j.result;
}
try {
  const cid = Number(BigInt(await rpcFork("eth_chainId")));
  if (cid !== 137) { console.error(`✗ o no em ${NO} serve a chain ${cid}, nao a 137`); process.exit(1); }
  console.log(`fork da Polygon em ${NO} · bloco ${Number(BigInt(await rpcFork("eth_blockNumber")))}`);
} catch {
  console.error(`✗ nao ha fork em ${NO}. Suba um e rode de novo:\n` +
    `    anvil --fork-url https://polygon-bor-rpc.publicnode.com --port ${PORTA}`);
  process.exit(1);
}
await rpcFork("anvil_impersonateAccount", [DONO]);
await rpcFork("anvil_setBalance", [DONO, "0x" + (10n ** 22n).toString(16)]);

/* ═══ 2 · o DOM, do tamanho que o console precisa ═════════════════════════ */
/* Os ids saem do HTML REAL. Inventar a lista aqui faria o ensaio passar num
   console cujo HTML perdeu um elemento — que e exatamente um dos jeitos de a
   tela quebrar sem ninguem ver. */
const HTML = readFileSync(join(SITE, "v0/index.html"), "utf8");
/* Os ids vem do HTML **e** dos template literals do JS. Metade das telas deste
   console e montada em runtime — `shell()` escreve `<select id="wBase">` num
   template — e cobrar so o HTML estatico acusaria oito ids que existem, o que
   faria este ensaio gritar sobre o que esta certo. Um teste com falso positivo
   e um teste que a gente aprende a ignorar. */
const JS_CONSOLE = readFileSync(join(SITE, "js/console-v0.js"), "utf8");
const IDS = new Set([
  ...[...HTML.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]),
  ...[...JS_CONSOLE.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]),
  ...[...JS_CONSOLE.matchAll(/\bid='([^']+)'/g)].map((m) => m[1])
]);
const OPCOES_HTML = new Map();
for (const m of HTML.matchAll(/<select[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
  OPCOES_HTML.set(m[1], [...m[2].matchAll(/<option[^>]*>([^<]*)</g)].map((x) => x[1]));
}

const criados = new Map();
function El(tag, id) {
  const el = {
    tagName: String(tag).toUpperCase(), id: id || "", children: [], attrs: {},
    className: "", _texto: "", value: "", disabled: false, hidden: false,
    /* `style` com setProperty/getPropertyValue: o console pinta tokens de tema
       em runtime (`--brand`, `--accent`), e um objeto vazio quebra na primeira
       linha. Isto e limitacao do stub, e o stub tem de acompanhar o produto. */
    style: { setProperty(k, v) { this[k] = v; }, getPropertyValue(k) { return this[k] || ""; }, removeProperty(k) { delete this[k]; } },
    dataset: {}, ouvintes: {}, options: [],
    get firstChild() { return this.children[0] || null; },
    get lastChild() { return this.children[this.children.length - 1] || null; },
    get textContent() { return this._texto || this.children.map((c) => c.textContent).join(""); },
    set textContent(v) { this._texto = String(v); this.children = []; },
    set innerHTML(v) { this._html = String(v); this.children = []; },
    get innerHTML() { return this._html || ""; },
    appendChild(c) { this.children.push(c); if (c.tagName === "OPTION") this.options.push(c); return c; },
    removeChild(c) { this.children = this.children.filter((x) => x !== c); this.options = this.options.filter((x) => x !== c); return c; },
    remove() {},
    setAttribute(k, v) { this.attrs[k] = String(v); if (k === "id") this.id = String(v); },
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    addEventListener(ev, fn) { (this.ouvintes[ev] = this.ouvintes[ev] || []).push(fn); },
    removeEventListener() {},
    querySelector(sel) { return acharPorSeletor(this, sel); },
    querySelectorAll(sel) { return acharTodos(this, sel); },
    closest() { return null; },
    focus() {}, blur() {}, scrollIntoView() {},
    getBoundingClientRect() { return { width: 760, height: 420, top: 0, left: 0, right: 760, bottom: 420 }; },
    classList: {
      _s: new Set(),
      add(...c) { c.forEach((x) => this._s.add(x)); },
      remove(...c) { c.forEach((x) => this._s.delete(x)); },
      toggle(c, on) { if (on === undefined) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); } else if (on) this._s.add(c); else this._s.delete(c); },
      contains(c) { return this._s.has(c); }
    },
    scrollTop: 0, scrollHeight: 0, offsetWidth: 760, offsetHeight: 420, offsetParent: {}
  };
  el.classList = { ...el.classList, _s: new Set() };
  el.classList.add = (...c) => c.forEach((x) => el.classList._s.add(x));
  el.classList.remove = (...c) => c.forEach((x) => el.classList._s.delete(x));
  el.classList.toggle = (c, on) => { if (on) el.classList._s.add(c); else el.classList._s.delete(c); };
  el.classList.contains = (c) => el.classList._s.has(c);
  return el;
}
function todosDescendentes(no, saida = []) {
  for (const c of no.children) { saida.push(c); todosDescendentes(c, saida); }
  return saida;
}
function bate(el, sel) {
  const s = String(sel).trim();
  if (s.startsWith("#")) return el.id === s.slice(1);
  if (s.startsWith(".")) return el.classList.contains(s.slice(1)) || String(el.className).split(/\s+/).includes(s.slice(1));
  if (s.startsWith("[")) { const m = /\[([^\]=]+)(?:=["']?([^\]"']*)["']?)?\]/.exec(s); return m ? (m[2] === undefined ? m[1] in el.attrs || m[1] in el.dataset : el.attrs[m[1]] === m[2]) : false; }
  return el.tagName === s.toUpperCase();
}
const acharPorSeletor = (raiz, sel) => todosDescendentes(raiz).find((e) => bate(e, sel)) || null;
const acharTodos = (raiz, sel) => todosDescendentes(raiz).filter((e) => bate(e, sel));

const body = El("body");
const html = El("html");
html.attrs["data-theme"] = "light";
const doc = {
  body, documentElement: html, head: El("head"),
  createElement: (t) => El(t),
  createElementNS: (ns, t) => El(t),
  createTextNode: (t) => { const e = El("#text"); e.textContent = t; return e; },
  createDocumentFragment: () => El("fragment"),
  getElementById(id) {
    if (criados.has(id)) return criados.get(id);
    /* Elemento criado sob demanda para QUALQUER id, e nao so os do HTML: o
       console cria nós em runtime e depois os procura por id. Devolver null
       aqui faria o ensaio quebrar no console em vez de medi-lo — e o que
       interessa e o id que o HTML PROMETE, conferido em separado abaixo. */
    const el = El("div", id);
    if (OPCOES_HTML.has(id)) { el.tagName = "SELECT"; }
    criados.set(id, el);
    body.appendChild(el);
    return el;
  },
  querySelector: (s) => acharPorSeletor(body, s),
  querySelectorAll: (s) => acharTodos(body, s),
  addEventListener() {}, removeEventListener() {},
  readyState: "complete",
  visibilityState: "visible"
};

/* ═══ 3 · a carteira de mentira, contra o fork de verdade ════════════════ */
const enviadas = [];
const carteira = {
  async request({ method, params }) {
    if (method === "eth_requestAccounts" || method === "eth_accounts") return [DONO];
    if (method === "eth_chainId") return "0x89";
    if (method === "eth_sendTransaction") {
      const tx = params[0];
      enviadas.push(tx);
      return rpcFork("eth_sendTransaction", [{ from: tx.from, to: tx.to, data: tx.data, value: tx.value }]);
    }
    throw new Error("a carteira do ensaio nao implementa " + method);
  },
  on() {}
};

/* TODO RPC DA POLYGON VAI PARA O FORK DURANTE O ENSAIO.
   O modulo de assinatura le a chain pelos endpoints publicos e escreve pela
   carteira. No navegador as duas pontas sao a mesma chain e isso e consistente;
   aqui a carteira escreve no fork e a leitura iria para a mainnet — o recibo de
   uma transacao que so existe no fork nunca apareceria, e a simulacao previa
   julgaria o estado errado (na mainnet o indice ja esta ocupado, no fork nao).
   Redirecionar aqui e o que torna as duas pontas a MESMA chain outra vez. Nao e
   um remendo do produto: e o ensaio dizendo em qual chain ele esta. */
const fetchReal = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (/polygon|drpc|1rpc/i.test(u) && !u.includes("127.0.0.1")) return fetchReal(NO, init);
  return fetchReal(url, init);
};

/* ═══ 4 · a janela ════════════════════════════════════════════════════════ */
const w = {
  crypto: webcrypto, document: doc, ethereum: carteira,
  location: { origin: "http://127.0.0.1", search: "", href: "", assign() {} },
  localStorage: { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = v; }, removeItem(k) { delete this._d[k]; } },
  matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
  navigator: { language: "en", clipboard: { writeText: async () => {} } },
  addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
  /* O que o console usa da JANELA, e nao do documento. Cada um destes entrou
     porque a carga quebrou nele — e a lista curta e proposital: um Proxy que
     devolvesse funcao vazia para tudo esconderia justamente o erro que este
     ensaio existe para achar. */
  scrollTo() {}, scrollBy() {}, scroll() {}, print() {},
  getComputedStyle: () => ({ getPropertyValue: () => "", setProperty() {} }),
  IntersectionObserver: function () { return { observe() {}, unobserve() {}, disconnect() {} }; },
  ResizeObserver: function () { return { observe() {}, unobserve() {}, disconnect() {} }; },
  MutationObserver: function () { return { observe() {}, disconnect() {} }; },
  performance: { now: () => Date.now() },
  history: { pushState() {}, replaceState() {} },
  innerWidth: 1440, innerHeight: 900, devicePixelRatio: 1,
  requestAnimationFrame: (f) => setTimeout(f, 0), cancelAnimationFrame: () => {},
  setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {},
  fetch, TextEncoder, URL, URLSearchParams, console,
  AudioContext: function () { return { createOscillator: () => ({ connect() {}, start() {}, stop() {}, frequency: { value: 0 } }), createGain: () => ({ connect() {}, gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} } }), destination: {}, currentTime: 0, state: "running", resume() {} }; },
  THREE: undefined
};
w.window = w; w.self = w; w.top = w; w.globalThis = w;
globalThis.document = doc;
globalThis.window = w;
globalThis.localStorage = w.localStorage;
globalThis.requestAnimationFrame = w.requestAnimationFrame;
globalThis.matchMedia = w.matchMedia;
globalThis.AudioContext = w.AudioContext;

/* Os nomes injetados sao os que um script de pagina ve como globais. O `window`
   entra tambem por `globalThis` porque parte do console fala `window.x` e parte
   fala `x` direto, e as duas formas tem de encontrar o mesmo objeto. */
for (const k of ["scrollTo", "scrollBy", "getComputedStyle", "IntersectionObserver",
                 "ResizeObserver", "MutationObserver", "performance", "history",
                 "innerWidth", "innerHeight", "devicePixelRatio", "dispatchEvent"]) {
  globalThis[k] = w[k];
}
/* O CONSOLE EXPOE O QUE O ENSAIO PRECISA DIRIGIR. Ate aqui o ensaio chamava
   `TRIVIU_ASSINAR.assinar` direto — o MODULO — e nunca passava pelo `tx()` do
   console, que e o roteador que decide o ato, mede o indice livre e chama o
   modulo. Um defeito entre o clique e o modulo era invisivel, e foi exatamente
   ali que o proximo apareceu: o terminal do fundador parava entre o log e a
   janela, sem erro.
   O anexo abaixo nao muda o produto — ele so devolve, para o ensaio, referencias
   a funcoes que ja existem no arquivo. */
const ANEXO_DE_ENSAIO = `
;try{ globalThis.__console = {
  tx: typeof tx === "function" ? tx : null,
  primeiroIndiceLivre: typeof primeiroIndiceLivre === "function" ? primeiroIndiceLivre : null,
  lerTudoDaChain: typeof lerTudoDaChain === "function" ? lerTudoDaChain : null,
  desligarPainelDeGas: typeof desligarPainelDeGas === "function" ? desligarPainelDeGas : null,
  renderProntidao: typeof renderProntidao === "function" ? renderProntidao : null,
  S: typeof S !== "undefined" ? S : null,
  TRIVIU: typeof TRIVIU !== "undefined" ? TRIVIU : null,
  LER: typeof LER !== "undefined" ? LER : null,
  contaDaOperacao: typeof contaDaOperacao === "function" ? contaDaOperacao : null,
  renderCustos: typeof renderCustos === "function" ? renderCustos : null,
  mudarCerca: typeof mudarCerca === "function" ? mudarCerca : null,
  renderCercaReal: typeof renderCercaReal === "function" ? renderCercaReal : null,
  lerCercaReal: typeof lerCercaReal === "function" ? lerCercaReal : null,
  mudarLimites: typeof mudarLimites === "function" ? mudarLimites : null,
  simularCiclo: typeof simularCiclo === "function" ? simularCiclo : null,
  estadoDeZero: typeof estadoDeZero === "function" ? estadoDeZero : null,
  emTempo: typeof emTempo === "function" ? emTempo : null,
  nomeDoRevert: typeof nomeDoRevert === "function" ? nomeDoRevert : null,
  O_QUE_FAZER: typeof O_QUE_FAZER !== "undefined" ? O_QUE_FAZER : null
}; }catch(e){ globalThis.__consoleErro = e; }
`;

function carregar(rel) {
  const src = readFileSync(join(SITE, rel), "utf8") +
    (rel === "js/console-v0.js" ? ANEXO_DE_ENSAIO : "");
  try {
    new Function("window", "document", "localStorage", "requestAnimationFrame",
      "matchMedia", "AudioContext", "THREE", "navigator", "getComputedStyle",
      "IntersectionObserver", "ResizeObserver", "MutationObserver", "performance", src)
      (w, doc, w.localStorage, w.requestAnimationFrame, w.matchMedia, w.AudioContext,
       undefined, w.navigator, w.getComputedStyle, w.IntersectionObserver,
       w.ResizeObserver, w.MutationObserver, w.performance);
    return null;
  } catch (e) { return e; }
}

console.log("\n=== 1 · os quatro scripts carregam, na ordem da pagina ===");
for (const rel of ["enderecos-v0.js", "js/abi-v0-console.js", "js/motor.js", "js/assinar-v0.js"]) {
  const e = carregar(rel);
  conferir(!e, `${rel} carrega`, e ? e.message.slice(0, 110) : "");
}
const erroConsole = carregar("js/console-v0.js");
conferir(!erroConsole, "js/console-v0.js carrega", erroConsole ? erroConsole.message.slice(0, 140) : "");

/* O console publica no escopo do `new Function`, entao o que da para conferir de
   fora e o que ele pendurou em `window`. O modulo de assinatura publica. */
conferir(!!w.TRIVIU_ASSINAR, "window.TRIVIU_ASSINAR existe",
  w.TRIVIU_ASSINAR ? "atos: " + w.TRIVIU_ASSINAR.atos.join(" · ") : "");

console.log("\n=== 2 · os ids que o HTML promete estao todos la ===");
/* COMENTARIO FORA ANTES DE MEDIR. Esta e a terceira vez que a mesma armadilha
   morde neste repositorio: um detector varreu a fonte crua, achou o proprio
   nome que um comentario citava, e acusou defeito onde havia explicacao. Aqui
   custou uma execucao inteira — o id `gasPainelProntidao` foi REMOVIDO do
   codigo e continuou aparecendo porque o comentario que explicava a remocao o
   citava. Prosa nao e chamada de funcao, e um teste que nao sabe disso ensina a
   ignora-lo. */
const semComentarios = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
     .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + m.slice(p.length).replace(/./g, " "));
const JS_LIMPO = semComentarios(JS_CONSOLE);
const idsUsados = [...JS_LIMPO.matchAll(/\$\('([A-Za-z][\w-]*)'\)/g)].map((m) => m[1]);
const semNoHtml = [...new Set(idsUsados)].filter((id) => !IDS.has(id));
conferir(semNoHtml.length === 0,
  `${new Set(idsUsados).size} ids procurados pelo console sao declarados em algum lugar`,
  semNoHtml.length ? "FALTAM: " + semNoHtml.slice(0, 12).join(", ") : "no HTML ou nos templates do JS");

console.log("\n=== 3 · os seletores de moeda ===");
for (const id of ["pBase", "nvBase"]) {
  const opcoes = OPCOES_HTML.get(id);
  conferir(opcoes !== undefined, `<select id="${id}"> existe no HTML`,
    opcoes ? `${opcoes.length} opcao(oes) escritas a mao` : "");
  if (opcoes) {
    conferir(opcoes.length === 0,
      `${id} nasce VAZIO (a chain preenche)`,
      opcoes.length ? "tem opcoes cravadas: " + opcoes.join(", ") : "");
  }
}
const formJs = JS_CONSOLE;
/* O MESMO fonte, sem comentario. Asserção que mede o que a TELA diz tem de ler
   isto, e não `formJs`: comentário não é dito a ninguém.
   Quarta vez que esta casa tropeça no mesmo lugar, e desta vez o comentário que
   enganou o detector foi escrito pelo próprio autor do detector, na linha que
   explicava que a frase antiga tinha saído. Ver `comentario-engana-regex`. */
const semComentarioJs = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + m.slice(p.length).replace(/./g, " "));
const formJsLimpo = semComentarioJs(JS_CONSOLE);
const optsEmJs = [...formJs.matchAll(/<select id="(wBase|pBase|nvBase)"[^>]*>\s*(<option[^>]*>[^<]*<\/option>\s*)+/g)];
conferir(optsEmJs.length === 0,
  "nenhum <option> de moeda escrito a mao dentro do JS",
  optsEmJs.length ? optsEmJs.map((m) => m[1]).join(", ") : "");

console.log("\n=== 4 · o console nao fala com a carteira sozinho ===");
conferir(!/eth_sendTransaction/.test(formJs),
  "console-v0.js nao menciona eth_sendTransaction",
  "quem assina e js/assinar-v0.js");

console.log("\n=== 5 · o estado depois de um recibo ===");
/* O caminho de criacao e exercitado pelo MODULO, que e onde ele vive, com a
   carteira do ensaio ligada ao fork. O que se confere e o RESULTADO na chain:
   o cofre previsto passa a existir. */
const A = w.TRIVIU_V0.V0, M = w.TRIVIU_MOTOR;
const call = (to, data) => rpcFork("eth_call", [{ to, data }, "latest"]);
const End = (x) => "0x" + String(x).slice(-40);
async function enderecoDoCofre(i) {
  return End(await call(A.factory, M.sig("factory", "vaultAddress(address,uint256)") +
    M.CODIFICADOR_POR_TIPO.address(DONO) + M.CODIFICADOR_POR_TIPO.uint256(String(i))));
}
let livre = null;
for (let i = 0; i < 30; i++) {
  const c = await enderecoDoCofre(i);
  if ((await rpcFork("eth_getCode", [c, "latest"])) === "0x") { livre = { i, c }; break; }
}
conferir(livre !== null, "ha um indice livre no fork", livre ? `indice ${livre.i}` : "");

if (livre && w.TRIVIU_ASSINAR) {
  const p = w.TRIVIU_ASSINAR.assinar("criar", { conta: DONO, indice: livre.i });
  await new Promise((r) => setTimeout(r, 300));
  const modal = body.children.find((c) => String(c.className).includes("assfundo"));
  conferir(!!modal, "o modulo montou a janela no body");
  conferir(!!modal && modal.classList.contains("assaberto"), "a janela foi marcada como aberta");
  const botao = modal && acharPorSeletor(modal, ".assprim");
  conferir(!!botao, "o botao de assinar existe na janela");
  if (botao && botao.ouvintes.click) {
    botao.ouvintes.click[0]();
    const r = await p;
    conferir(!!r && r.ok === true, "a transacao foi minerada no fork",
      r && r.recibo ? "bloco " + parseInt(r.recibo.blockNumber, 16)
        : r && r.hash ? "enviada (" + r.hash.slice(0, 12) + "…) e o recibo nao voltou"
        : "cancelada ou recusada");
    const existe = (await rpcFork("eth_getCode", [livre.c, "latest"])) !== "0x";
    conferir(existe, "o cofre previsto passou a EXISTIR na chain", livre.c);
  } else {
    conferir(false, "o botao de assinar tem ouvinte de clique");
  }
}

console.log("\n=== 6 · o roteador do console, dirigido de verdade ===");
const C = globalThis.__console;
conferir(!!C, "o ensaio alcanca as funcoes do console",
  globalThis.__consoleErro ? String(globalThis.__consoleErro.message).slice(0, 90) : "");
if (C) {
  conferir(typeof C.tx === "function", "tx() existe");
  conferir(typeof C.primeiroIndiceLivre === "function", "primeiroIndiceLivre() existe");
  conferir(!!C.LER && typeof C.LER.vaultAddress === "function", "LER.vaultAddress existe");

  /* As tres funcoes que entraram na ultima onda rodam de verdade, e nao so
     existem: `desligarPainelDeGas` e chamada de dentro de `lerTudoDaChain` SEM
     try/catch, entao se ela lancar, a leitura inteira morre e com ela o
     `connect()`. Existir nao e funcionar. */
  for (const nome of ["desligarPainelDeGas", "renderProntidao"]) {
    let erro = null;
    try { await C[nome](); } catch (e) { erro = e; }
    conferir(!erro, `${nome}() roda sem lancar`, erro ? String(erro.message).slice(0, 100) : "");
  }

  if (C.S) { C.S.wallet = { connected: true, address: DONO, real: true, chainId: "0x89" }; }
  let erroLer = null;
  try { await C.lerTudoDaChain(); } catch (e) { erroLer = e; }
  conferir(!erroLer, "lerTudoDaChain() roda sem lancar",
    erroLer ? String(erroLer.message).slice(0, 110) : "");

  let livreConsole = null, erroIdx = null;
  try { livreConsole = await C.primeiroIndiceLivre(DONO); } catch (e) { erroIdx = e; }
  conferir(!erroIdx && livreConsole, "primeiroIndiceLivre() responde",
    erroIdx ? String(erroIdx.message).slice(0, 110) : `indice ${livreConsole && livreConsole.indice}`);

  /* E o caminho inteiro do clique: `tx({ato:'criar'})`, que loga, mede o indice
     e abre a janela. Um `setTimeout` corre em paralelo para clicar em Assinar
     assim que a janela existir — porque `tx` so resolve depois disso. */
  let erroTx = null, rTx = null;
  const clicar = setInterval(() => {
    const m = body.children.find((c) => String(c.className).includes("assfundo"));
    const b = m && acharPorSeletor(m, ".assprim");
    if (b && b.ouvintes.click && m.classList.contains("assaberto")) {
      clearInterval(clicar);
      b.ouvintes.click[0]();
    }
  }, 120);
  try {
    rTx = await Promise.race([
      C.tx({ ato: "criar", to: null, fn: "createVault(you, 0)", gas: 170000, label: "createVault", indice: 0 }),
      new Promise((_, rej) => setTimeout(() => rej(new Error("tx() nao resolveu em 40s — travou entre o log e a janela")), 40000))
    ]);
  } catch (e) { erroTx = e; }
  clearInterval(clicar);
  conferir(!erroTx, "tx({ato:'criar'}) percorre do clique ao recibo",
    erroTx ? String(erroTx.message).slice(0, 130) : (rTx && rTx.ok ? "minerada" : String(rTx)));
}

console.log("\n=== 7 · a conta da taxa, contra a aritmetica do contrato ===");
if (C && C.contaDaOperacao) {
  /* Os numeros nao sao escolhidos por conveniencia: sao os que separam ponto
     flutuante de aritmetica inteira, e o valor onde o teto do reembolso morde.
     `Fees.protocolFee` faz mulDiv(traded, feeBps, 10000) e TRUNCA; `gasRefund`
     devolve min(declarado, min(10^casas, traded * 100 / 10000)).
     O caso de 999 unidades-base existe por isso: 0,5% dele e 4,995, e o
     contrato paga 4. Uma tela em ponto flutuante mostraria 5. */
  const casos = [
    { neg: 70000n,      feeBps: 50, casas: 6, taxa: 350n,     teto: 700n },
    { neg: 100000000n,  feeBps: 50, casas: 6, taxa: 500000n,  teto: 1000000n },
    { neg: 250000000n,  feeBps: 50, casas: 6, taxa: 1250000n, teto: 1000000n },
    { neg: 1000000000n, feeBps: 50, casas: 6, taxa: 5000000n, teto: 1000000n },
    { neg: 999n,        feeBps: 50, casas: 6, taxa: 4n,       teto: 9n }
  ];
  let bons = 0;
  for (const k of casos) {
    const r = C.contaDaOperacao(k.neg, k.feeBps, k.casas, null);
    if (r.taxa === k.taxa && r.tetoRefund === k.teto) bons += 1;
    else console.log(`      negociado ${k.neg}: taxa ${r.taxa} (esperado ${k.taxa}) · teto ${r.tetoRefund} (esperado ${k.teto})`);
  }
  conferir(bons === casos.length,
    `a conta da tela bate com Fees.sol em ${bons} de ${casos.length} casos`,
    "inclui o truncamento (999 -> 4, e nao 5) e o teto absoluto mordendo em 250");
  const r250 = C.contaDaOperacao(250000000n, 50, 6, null);
  conferir(r250.tetoRefund === 1000000n,
    "em 250 o teto ABSOLUTO corta o reembolso",
    "1% daria 2,50 e o contrato paga no maximo 1,00");
  conferir(typeof C.renderCustos === "function", "renderCustos() existe e roda nas leituras");
}

console.log("\n=== 8 · a fonte do saldo ===");
conferir(/LER\.balanceOf/.test(formJs), "o saldo do cofre vem de balanceOf, e nao de conta local");
conferir(/primeiroIndiceLivre/.test(formJs), "o indice do novo cofre e MEDIDO, e nao fixo em 0");
conferir(/adotarCofrePrincipal\(indiceReal\)/.test(formJs),
  "depois de criar, o console ADOTA o cofre lendo a chain",
  "sem isto, S.triad fica nulo e a linha seguinte quebra");

console.log("\n=== 9 · a cerca: liberar E BLOQUEAR, medido na chain ===");
/* A metade que faltava. `setAllowedAsset(token,false)` nao existia em lugar
   nenhum desta tela — o unico chamador passava `ligado: true` fixo, no
   onboarding. E quando ela foi construida, o codificador de `bool` mandava 1
   para a chain com a tela imprimindo `false`: bloquear liberava.
   Aqui os dois lados sao exercidos contra o cofre de verdade, e quem responde e
   `assetDecimals` — que vale as casas quando liberado e ZERO quando bloqueado
   (VaultConfig._list). Ler a tela nao provaria nada; ler o cofre prova. */
const WETH = "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619";
if (C && C.mudarCerca && C.S && C.S.triad && C.S.triad.vault) {
  const cofre = C.S.triad.vault;
  conferir(typeof C.renderCercaReal === "function", "renderCercaReal() existe");
  conferir(typeof C.LER.casasDoAtivo === "function", "LER.casasDoAtivo() existe");
  conferir(typeof C.LER.guardas === "function", "LER.guardas() existe");

  /* guards() e address[]: se a decodificacao ler a palavra 0 como endereco, sai
     o deslocamento (0x…20) no lugar de um guardiao. */
  let gs = null, erroG = null;
  try { gs = await C.LER.guardas(cofre); } catch (e) { erroG = e; }
  conferir(!erroG && Array.isArray(gs), "guards() decodifica como lista",
    erroG ? String(erroG.message).slice(0, 90) : `${gs && gs.length} guardiao(oes)`);
  if (Array.isArray(gs)) {
    conferir(!gs.some((g) => /^0x0{62}20$/i.test(String(g))),
      "nenhum 'guardiao' que na verdade e o deslocamento do array");
  }

  const clicarAssinar = () => setInterval(() => {
    const m = body.children.find((c) => String(c.className).includes("assfundo"));
    const b = m && acharPorSeletor(m, ".assprim");
    if (b && b.ouvintes.click && m.classList.contains("assaberto")) b.ouvintes.click[0]();
  }, 120);

  const casas = async () => await C.LER.casasDoAtivo(cofre, WETH);
  const antes = await casas().catch(() => null);
  conferir(antes !== null, "a chain responde assetDecimals antes de qualquer mudanca",
    `agora ${antes}`);

  /* LIBERAR */
  let t1 = clicarAssinar(), erro1 = null;
  try {
    await Promise.race([
      C.mudarCerca("ativo", { addr: WETH, nome: "WETH" }, true),
      new Promise((_, r) => setTimeout(() => r(new Error("liberar nao resolveu em 40s")), 40000))
    ]);
  } catch (e) { erro1 = e; }
  clearInterval(t1);
  const liberado = await casas().catch(() => null);
  conferir(!erro1 && liberado === 18,
    "LIBERAR: a chain passa a responder 18 casas para WETH",
    erro1 ? String(erro1.message).slice(0, 110) : `assetDecimals = ${liberado}`);

  /* BLOQUEAR — o que nao existia */
  let t2 = clicarAssinar(), erro2 = null;
  try {
    await Promise.race([
      C.mudarCerca("ativo", { addr: WETH, nome: "WETH" }, false),
      new Promise((_, r) => setTimeout(() => r(new Error("bloquear nao resolveu em 40s")), 40000))
    ]);
  } catch (e) { erro2 = e; }
  clearInterval(t2);
  const bloqueado = await casas().catch(() => null);
  conferir(!erro2 && bloqueado === 0,
    "BLOQUEAR: a chain volta a responder ZERO para WETH",
    erro2 ? String(erro2.message).slice(0, 110)
      : `assetDecimals = ${bloqueado}${bloqueado === 18 ? " — A CERCA ABRIU QUANDO MANDOU FECHAR" : ""}`);

  conferir(liberado === 18 && bloqueado === 0,
    "os dois lados do mesmo controle fazem coisas OPOSTAS na chain",
    "e nao a mesma coisa duas vezes, que era o defeito");
} else {
  falhas.push("secao 9: sem cofre em S.triad.vault, a cerca nao pode ser exercida");
}

console.log("\n=== 10 · os tetos e a simulacao (Grupo A) ===");
if (C && C.LER && C.S && C.S.triad && C.S.triad.vault) {
  const cofre = C.S.triad.vault;
  const USDC = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";

  /* --- limits(): uma palavra, quatro campos ---------------------------- */
  let L = null, erroL = null;
  try { L = await C.LER.limites(cofre); } catch (e) { erroL = e; }
  conferir(!erroL && L, "limits() le e desempacota",
    erroL ? String(erroL.message).slice(0, 90)
      : `cooldown=${L.cooldown} maxValidity=${L.maxValidity} minRatioBps=${L.minRatioBps} quantum=${L.quantum}`);
  if (L) {
    /* Um cofre novo nasce com os quatro em zero, e a soma dos campos tem de
       reconstruir a palavra: se o deslocamento estiver errado, um campo rouba
       bits do vizinho e a conta nao fecha. */
    const remontada = (L.cooldown << 192n) | (L.maxValidity << 128n) |
      (L.minRatioBps << 112n) | L.quantum;
    conferir(remontada === L.palavra,
      "os quatro campos remontam a palavra original",
      "se um deslocamento estiver errado, um campo rouba bits do vizinho");
  }

  /* --- setLimits: gravar e RELER da chain ------------------------------ */
  const clicar = () => setInterval(() => {
    const m = body.children.find((c) => String(c.className).includes("assfundo"));
    const b = m && acharPorSeletor(m, ".assprim");
    if (b && b.ouvintes.click && m.classList.contains("assaberto")) b.ouvintes.click[0]();
  }, 120);
  const ALVO = { cooldown: "300", maxValidity: "1800", minRatioBps: "9900", quantum: "1000" };
  let t = clicar(), erroS = null;
  try {
    await Promise.race([
      C.mudarLimites(ALVO),
      new Promise((_, r) => setTimeout(() => r(new Error("setLimits nao resolveu em 40s")), 40000))
    ]);
  } catch (e) { erroS = e; }
  clearInterval(t);
  const depois = await C.LER.limites(cofre).catch(() => null);
  const bateu = depois && String(depois.cooldown) === ALVO.cooldown &&
    String(depois.maxValidity) === ALVO.maxValidity &&
    String(depois.minRatioBps) === ALVO.minRatioBps &&
    String(depois.quantum) === ALVO.quantum;
  conferir(!erroS && bateu, "setLimits grava os QUATRO e a chain devolve os quatro",
    erroS ? String(erroS.message).slice(0, 110)
      : (depois ? `cooldown=${depois.cooldown} maxValidity=${depois.maxValidity} ` +
          `minRatioBps=${depois.minRatioBps} quantum=${depois.quantum}` : "nao consegui reler"));

  /* --- dryRunChecks: view, e a recusa e a resposta --------------------- */
  let sim = null, erroD = null;
  try { sim = await C.LER.simular(cofre, 0, USDC); } catch (e) { erroD = e; }
  conferir(!erroD && sim, "dryRunChecks responde sem lancar",
    erroD ? String(erroD.message).slice(0, 90) : (sim.ok ? "propos um intent" : `recusou: ${sim.motivo}`));
  if (sim && !sim.ok) {
    /* Um cofre sem estrategia apontada TEM de recusar, e o nome do erro e o que
       torna a recusa util. `null` aqui significa que a tela diria "erro". */
    conferir(sim.motivo !== null, "a recusa vem com o NOME do erro do contrato",
      sim.motivo ? `${sim.motivo}` : "sem nome — a tela diria apenas 'erro'");
    conferir(!!(C.O_QUE_FAZER && C.O_QUE_FAZER[sim.motivo]),
      "o nome do erro tem tradução em instrucao",
      C.O_QUE_FAZER && C.O_QUE_FAZER[sim.motivo]
        ? String(C.O_QUE_FAZER[sim.motivo]).slice(0, 70) : `sem entrada para ${sim.motivo}`);
  }

  /* --- o ato deixou de recusar ----------------------------------------- */
  conferir(!/falta uint112 no codificador/.test(formJsLimpo),
    "o console parou de DIZER que falta uint112",
    "medido sem comentario: a explicacao historica cita a frase antiga de proposito");
  conferir(/limites:\s*\{\s*cofre:\s*'limites'/.test(formJsLimpo),
    "o ato `limites` aponta para um passo em vez de recusar");
  conferir(typeof C.emTempo === "function" && C.emTempo(0) !== "0s",
    "zero segundos NAO e exibido como '0s'",
    "zero desliga a checagem, e dizer as duas coisas igual esconde a diferenca");

  /* O piso desligado, por VALOR e nao por grafia. Este bloco existe porque a
     primeira versao comparava `v === '0'` e o Tubarao-branco mediu tres grafias
     que passavam sem confirmacao. Cada uma delas vira zero na calldata: quem
     digitasse `00` desligaria o piso de razao sem a tela perguntar nada. */
  if (typeof C.estadoDeZero === "function") {
    const zeros = ["0", "00", "000", "-0", " 0 ", "\t0\n"];
    const naoZeros = ["1", "9900", "0.0", "0x0", "", "abc", null, undefined];
    /* Aqui o motor ESTA carregado, entao a resposta e 'sim' ou 'nao' — nunca
       'nao-sei'. Exigir os valores exatos, e nao "diferente de nao", e o que
       separa medir do caminho feliz de medir a ausencia de resposta. */
    const falhouZero = zeros.filter((z) => C.estadoDeZero(z) !== "sim");
    const falhouNao = naoZeros.filter((z) => C.estadoDeZero(z) !== "nao");
    conferir(falhouZero.length === 0,
      `as ${zeros.length} grafias de zero disparam a confirmacao do piso`,
      falhouZero.length ? `passaram sem confirmar: ${falhouZero.map((x) => JSON.stringify(x)).join(" ")}`
        : "inclui 00, 000 e -0, que a versao por texto deixava passar");
    conferir(falhouNao.length === 0,
      `as ${naoZeros.length} entradas que NAO sao zero nao disparam a confirmacao`,
      falhouNao.length ? `confirmaram a toa: ${falhouNao.map((x) => JSON.stringify(x)).join(" ")}`
        : "confirmacao que aparece a toa treina a pessoa a clicar sem ler");
    /* FAIL-CLOSED: sem o motor, a guarda confirma em vez de calar.
       Recorto a funcao do fonte e a rodo num contexto SEM `TRIVIU_MOTOR`. Testar
       isto pelo console carregado seria impossivel — la o motor sempre esta. */
    const iZ = JS_CONSOLE.indexOf("function estadoDeZero(v){");
    let corpoZ = "";
    if (iZ >= 0) {
      let d = 0;
      for (let k = JS_CONSOLE.indexOf("{", iZ); k < JS_CONSOLE.length; k++) {
        if (JS_CONSOLE[k] === "{") d += 1;
        else if (JS_CONSOLE[k] === "}") { d -= 1; if (d === 0) { corpoZ = JS_CONSOLE.slice(iZ, k + 1); break; } }
      }
    }
    /* `estadoDeZero` tem TRES respostas, e o vetor cobre as tres. Recorto as
       a funcao e as constantes que ela usa. */
    const recortar = (nome) => {
      const ii = JS_CONSOLE.indexOf(nome);
      if (ii < 0) return "";
      let dd = 0;
      for (let k = JS_CONSOLE.indexOf("{", ii); k < JS_CONSOLE.length; k++) {
        if (JS_CONSOLE[k] === "{") dd += 1;
        else if (JS_CONSOLE[k] === "}") { dd -= 1; if (dd === 0) return JS_CONSOLE.slice(ii, k + 1); }
      }
      return "";
    };
    const consts = "var ZERO_SIM='sim', ZERO_NAO='nao', ZERO_NAO_SEI='nao-sei';";
    const pecasZ = consts + recortar("function estadoDeZero(v){");
    let estSemMotor = null;
    try {
      estSemMotor = new Function("window", pecasZ + "; return estadoDeZero;")({});
    } catch { estSemMotor = null; }
    /* Mede `estadoDeZero`, que e o que o caminho real chama. A versao anterior
       media `ehZero`, um booleano que ninguem chamava — o teste exercitava
       codigo fora do caminho e passava sem provar nada sobre o produto. */
    const fechado = typeof estSemMotor === "function" &&
      estSemMotor("0") !== "nao" && estSemMotor("00") !== "nao";
    conferir(fechado, "sem o motor a guarda do piso CONFIRMA em vez de calar",
      typeof estSemMotor !== "function" ? "nao consegui recortar estadoDeZero do fonte"
        : `estadoDeZero('0')=${estSemMotor("0")} — nao saber nao e saber que nao`);
    conferir(!/function ehZero\s*\(/.test(JS_CONSOLE),
      "nao ha booleano paralelo a estadoDeZero",
      "duas funcoes decidindo a mesma coisa divergem na primeira edicao que toca uma so");
    /* E a mensagem NAO pode afirmar que o valor e zero quando ninguem sabe. */
    conferir(typeof estSemMotor === "function" && estSemMotor("9900") === "nao-sei",
      "sem o motor o estado e 'nao-sei', e nao 'e zero'",
      typeof estSemMotor !== "function" ? "nao recortei estadoDeZero"
        : `estadoDeZero('9900')=${estSemMotor("9900")} — dizer 'minRatioBps = 0' a quem digitou 9900 seria falso`);
    const msg = recortar("function confirmarDesligarPiso(");
    conferir(/ZERO_NAO_SEI/.test(msg) && /Nao foi possivel conferir/.test(msg),
      "ha uma mensagem SEPARADA para o caso em que nao se sabe",
      "cautela nao autoriza a tela a afirmar um fato que ela nao verificou");
  } else {
    falhas.push("secao 10: estadoDeZero() nao esta exposta — o vetor do piso nao roda");
  }
} else {
  falhas.push("secao 10: sem cofre em S.triad.vault");
}

/* ------------------------------------------------------------------ saida - */
console.log("");
for (const n of notas) console.log("  " + n);
if (falhas.length) {
  console.error(`\n✗ fluxo do console: ${falhas.length} de ${falhas.length + notas.length} verificacoes falharam`);
  for (const f of falhas) console.error("  " + f);
  process.exit(1);
}
console.log(`\n✓ fluxo do console: ${notas.length} de ${notas.length} verificacoes passaram`);
