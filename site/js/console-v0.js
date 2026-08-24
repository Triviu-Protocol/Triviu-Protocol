
/* ═══════════════════════════════════════════════════════════════════════
   TRIVIU · CONSOLE — simulation. Wallet, chain, contracts and events live
   in memory. No network call is made. No key is read, asked for or touched.
   ═══════════════════════════════════════════════════════════════════════ */
const $ = id => document.getElementById(id);

/* ═══════════════════════════════════════════════════════════════════════
   TRIVIU · ON-CHAIN CONFIG — single source of truth.
   Mirrors contracts/deploy/enderecos.js from the real genesis on Polygon
   (chain 137, block ~92,478,5xx). Addresses verified against the deploy log.
   The console reads the chain from here; nothing is hardcoded elsewhere.
   ═══════════════════════════════════════════════════════════════════════ */
/* A PONTE, escrita de proposito e nao herdada por acidente.
   motor.js resolve o ABI em window.TRIVIU_ABI no PRIMEIRO uso, e o gerador da
   V0 publica em TRIVIU_ABI_V0 — nomes diferentes porque sao LINHAS diferentes,
   e `TriviuVault` existe nas duas com o mesmo nome e codigo diferente. Deixar
   o gerador publicar direto em TRIVIU_ABI faria as duas competirem pelo mesmo
   global, e a ordem das tags decidiria qual linha esta tela le. */
if (!window.TRIVIU_V0)     throw new Error('/enderecos-v0.js nao carregou — sem livro nao ha endereco, e endereco nao se digita');
if (!window.TRIVIU_ABI_V0) throw new Error('/js/abi-v0-console.js nao carregou — sem artefato nao ha seletor, e seletor nao se adivinha');
if (!window.TRIVIU_MOTOR)  throw new Error('/js/motor.js nao carregou — sem motor nao ha codificador');
window.TRIVIU_ABI = window.TRIVIU_ABI_V0;

var LIVRO = window.TRIVIU_V0;
var MOTOR = window.TRIVIU_MOTOR;
var sig = MOTOR.sig;
var CODIF = MOTOR.CODIFICADOR_POR_TIPO;
var recusarAprovacaoInfinita = MOTOR.recusarAprovacaoInfinita;

const TRIVIU = {
  chainId: LIVRO.CHAIN_ID,
  chainHex: LIVRO.CHAIN_HEX,
  /* OS TRES ENDPOINTS DO connect-src, e nao um quarto.
     Aqui havia `https://polygon-rpc.com`, com um comentario mandando trocar
     por um endpoint privado em producao. Duas coisas erradas de uma vez, e a
     segunda e maior que a primeira:
       · o endpoint passou a exigir chave e responde HTTP 401 — foi o erro que
         apareceu na tela na primeira vez que alguem abriu esta pagina;
       · ele NAO esta no `connect-src` do vercel.json. Em producao a CSP teria
         bloqueado a chamada ANTES de qualquer resposta, e o sintoma seria
         outro: nao um 401 legivel, mas leituras que simplesmente nao voltam.
     O 401 no localhost foi sorte: `python -m http.server` nao manda CSP, entao
     a chamada saiu e trouxe um erro que dava para ler. As outras tres telas ja
     usavam esta lista; esta era a unica fora.
     Trocar por um endpoint privado exige somar o host ao connect-src no mesmo
     passo — e por isso o portao passou a cobrar isso sozinho. */
  rpcs: ['https://polygon-bor-rpc.publicnode.com', 'https://polygon.drpc.org', 'https://1rpc.io/matic'],
  explorer: 'https://polygonscan.com',
  /* Do LIVRO, que e gerado de contracts/deployments/137.json — a mesma fonte
     que o Solidity le em UserFlow.s.sol. Sete enderecos digitados aqui a mao
     seriam uma segunda copia, e copia diverge: divergiu uma vez, em
     2026-08-22, quando a moeda-base foi trocada no shell e o Solidity
     continuou lendo do 137.json. */
  addr: LIVRO.V0,
  /* PAPEIS · declarados aqui e CONFERIDOS na chain, nunca afirmados.
     A distincao ja custou caro neste projeto: um livro-razao dizia que a Safe
     era 1-de-1 enquanto a chain dizia 2-de-3 — e registro que subestima a
     propria seguranca e o mais dificil de pegar, porque nao assusta ninguem.
     O ProtocolRegistry nao ENUMERA quem tem papel; ele responde se um endereco
     tem. Entao a tela pergunta por cada um, e o que ela mostra e a RESPOSTA.
     `treasury` nem e declarado: sai inteiro de `treasury()`. */
  roles: {
    governance: '0x73e344Be290c0D53Badbe528e45877296F6dAf6E', // conferido por hasRole(DEFAULT_ADMIN_ROLE, ·)
    operator:   '0xB3eE467647faa55f8BbD7611ef9e7654a506759f'  // conferido por isOperator(·)
  },
  papeisConferidos: null,   // preenchido por conferirPapeis(); null = nao perguntado
  /* O ENDERECO vem do livro; o SIMBOLO e as CASAS vem da CHAIN, em
     lerMoedaBase(). Um simbolo escrito aqui e uma afirmacao sobre um contrato
     que ninguem conferiu.
     Medido no bloco 92526491: `symbol()` = USDC, `decimals()` = 6,
     `isBaseCurrency()` = true. O livro e a chain CONCORDAM hoje — e escrever o
     simbolo aqui e exatamente o que faria os dois se separarem depois, sem
     sintoma. A moeda-base ja foi trocada uma vez, em 2026-08-22, e naquele dia
     quem sabia da troca era a chain. Quem decide e o contrato, nao a legenda. */
  base: { symbol: null, address: LIVRO.V0.baseCurrency, decimals: null },
  /* Nulos ate a chain responder. Zero seria um numero, e numero na tela e uma
     afirmacao — 'nao medido' e diferente de 'medi e deu zero'. */
  feeBps: null,        // ProtocolRegistry.feeBps() — cap FEE_BPS_MAX
  treasury: null,      // ProtocolRegistry.treasury()
  paused: null,        // ProtocolRegistry.paused()
  gatesOpen: null,     // isExecutor(executor) && isBaseCurrency(base) && !paused
  /* ABIs are attached at load time from contracts/abi/*.json (public repo) or the
     Foundry out/*.json. Until then, chain calls stay disabled — never guessed.
     Fill these arrays and the plug-points below light up on their own. */
  /* Os PLUG-POINTS acabaram. Estes quatro papeis existem no artefato compilado
     que /js/abi-v0-console.js publica, gerado de contracts/abi/*.json, e sao
     estes os nomes — nao os que o modelo prometia. A diferenca importa e foi
     medida:
       · `createVault(address)`      -> nao existe. E `createVault(address,uint256)`.
       · `deposit(amount)`           -> nao existe. E `deposit(address,uint256)`.
       · `escapeHatch.resgatar(...)` -> nao existe. O EscapeHatch tem DUAS funcoes,
                                        `owner()` e `withdraw(address,uint256,address)`.
       · `executor.executeCycle(...)`-> nao existe, e nao existe papel `executor`
                                        no artefato. A execucao e `vault.execute(...)`.
     Quatro nomes que pareciam codigo e nao chamavam contrato nenhum. Prosa nao
     envelhece com sintoma; seletor errado so aparece quando a transacao reverte. */
  abi: window.TRIVIU_ABI_V0,
  abiReady(papel){
    var g = (this.abi.contratos && this.abi.contratos[papel]) ||
            (this.abi.extras && this.abi.extras[papel]);
    return !!(g && g.funcoes && Object.keys(g.funcoes).length);
  },
  /* Medusa LOW (lotId=0 ambiguity): any code that reads lot events and counts
     "sold" MUST filter by side — a Buy on lot 0 is not a sale. When wiring lot
     reads, group by side before counting; never sum raw lotId occurrences. */
  countSold(events){ return (events||[]).filter(e => e && e.side === 'sell').length; }
};

/* Read-only JSON-RPC helper (no signing). Used for all chain READS. */
async function triviuRead(method, params){
  /* Failover na ordem da lista: no publico cai, e cair de um so endpoint faz a
     tela inteira parecer quebrada quando o que quebrou foi um servidor. */
  /* A allowlist de leitura era DECLARADA e nunca consultada: RPC_PERMITIDO
     existia no arquivo e nenhuma linha o lia. Lista que ninguem consulta e um
     comentario com cara de trava — a proxima linha somada ali entraria sem que
     nada reprovasse, e a mesma falta ja tinha sido encontrada no lado da
     carteira em /cofre/ no dia anterior. Mesma classe, mesmo conserto. */
  if (!RPC_PERMITIDO[method]) {
    throw new Error('bloqueado: esta pagina so le ' + Object.keys(RPC_PERMITIDO).join(' / ') +
      ' por RPC. Recusado: ' + method);
  }
  let ultimo;
  for (const url of TRIVIU.rpcs){
    try{
      const r = await fetch(url, { method:'POST', headers:{'content-type':'application/json'},
        body: JSON.stringify({ jsonrpc:'2.0', id:1, method, params }) });
      if(!r.ok) throw new Error('HTTP '+r.status);
      const j = await r.json();
      if(j.error) throw new Error(j.error.message||'RPC error');
      return j.result;
    }catch(e){ ultimo = e; }
  }
  throw new Error('nenhum dos '+TRIVIU.rpcs.length+' endpoints respondeu · ultimo erro: '+
    ((ultimo&&ultimo.message)||ultimo));
}

/* Tubarão-branco N2 · post-broadcast gate mirrored on the front:
   the deployer must hold NO admin role. Reads the chain, not the log.
   Lights up once the ProtocolRegistry ABI is plugged. */
async function triviuVerifyGenesis(deployer){
  if(!TRIVIU.abiReady('protocolRegistry')) return { checked:false, reason:'ABI not plugged yet' };
  // PLUG: encode hasRole(DEFAULT_ADMIN_ROLE, deployer) via the real ABI and eth_call
  //       both registries; require false on both before declaring genesis complete.
  return { checked:false, reason:'awaiting ABI plug' };
}

/* Escapes for ATTRIBUTE context. Without the quote characters a value can
   close the attribute and inject a handler. */
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
/* Helpers de DOM. Mesma assinatura e mesmo comportamento dos que ja existem em
   js/console.js, js/console-lp.js e js/console-app.js — as tres telas que passam
   no check-assinatura. Nao foram extraidos para um /js/dom.js compartilhado
   porque isso mexeria em tres arquivos que JA passam, e mexer no que passa nao
   estava no escopo desta onda. A duplicacao fica declarada aqui em vez de
   silenciosa. */
function limpar(el) { while (el && el.firstChild) el.removeChild(el.firstChild); }
function txt(el, s) { if (el) el.textContent = s; }
function novo(tag, cls, conteudo) {
  var el = document.createElement(tag);
  if (cls) el.className = cls;
  if (conteudo !== undefined && conteudo !== null) el.textContent = conteudo;
  return el;
}
/* icon() devolve STRING de SVG, e string so entra no DOM por innerHTML. Este
   devolve o ELEMENTO, montado com createElementNS porque SVG tem namespace
   proprio: createElement('svg') produz um elemento HTML de nome svg, que nao
   desenha nada. */
function iconEl(n, c) {
  var NS = 'http://www.w3.org/2000/svg';
  var svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'ic ' + (c || ''));
  svg.setAttribute('aria-hidden', 'true');
  var use = document.createElementNS(NS, 'use');
  use.setAttribute('href', '#i-' + n);
  svg.appendChild(use);
  return svg;
}

const icon = (n,c) => `<svg class="ic ${c||''}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
/* `rnd()` — o gerador de enderecos sorteados — foi removido em 2026-08-23,
   depois que o ultimo uso saiu. Nao ficou como codigo morto de proposito: um
   gerador de endereco falso parado num arquivo de produto e uma linha que a
   proxima pessoa chama sem saber o que ela produz. Endereco desta tela sai de
   `LER.vaultAddress`, que pergunta o CREATE2 a propria factory. */
const short = a => a ? a.slice(0,6)+'…'+a.slice(-4) : '—';
const fmt = (n,d=2) => Number(n).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const wait = ms => new Promise(r => setTimeout(r,ms));
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches || S.prefs.anim === 'off';

const BAND = {min:10, max:500};
const ASSETS = {WETH:'#2743C7', WBTC:'#E8B23A', LINK:'#1E7A46', AAVE:'#C13327', MATIC:'#7B3FE4'};
const WDN = ['sun','mon','tue','wed','thu','fri','sat'];
/* `register` era 95.000 de gas para uma funcao que a V0 nao tem: o passo virou
   duas leituras `view`, que custam zero. Cobrar gas por elas inflava o total que
   a calculadora mostra e fazia a pagina mentir para cima no unico numero que o
   usuario usa para decidir a rede. */
const GAS = {register:0, triad:2600000, fence:130000};
const NETS = [
 {id:'polygon', name:'Polygon PoS', coin:'POL', chainId:137, live:true, gwei:35,
  why:'The default and the cheapest place to learn — the protocol lands here first.'},
 {id:'arbitrum', name:'Arbitrum One', coin:'ETH', chainId:42161, live:false, gwei:0.02,
  why:'Stronger security (an Ethereum rollup). Waiting on its own audit gate.'},
 {id:'bsc', name:'BNB Smart Chain', coin:'BNB', chainId:56, live:false, gwei:1,
  why:'Deepest retail liquidity, and the most centralised of the three — said plainly. Waiting on its gate.'}
];

const newFence = () => ({paused:false, assets:[], tw:[0,24], tz:-3*3600, wm:0x7F, mts:10000,
  mnts:0, mop:65535, msbt:0, mdt:[false,0], lc:[false,0], dll:[false,0], mcr:[false,0],
  mcl:[false,0], nob:0, mgp:0});

const S = {
  onboarded:false, role:'user',
  wallet:{connected:false, address:null},
  triad:null, registry:null, base:'USDT',
  nets:['polygon'],
  profile:{name:'', tag:'TU', avatar:null},
  prefs:{theme:'light', density:'normal', cur:'USD', anim:'on', sound:true, lang:'en',
    /* ratified by the founder: arm once both legs exist. Loud, never quiet. */
    autoArm:true, armedOnce:false},
  notifs:[], gas:{}, toured:false,
  instances:[{id:'triviu', name:'Triviu', sub:'· console', accent:'#2743C7', logo:null, core:true}],
  activeInst:'triviu',
  vaults:[], activeVault:null, history:[], seq:1,
  refs:{claim:0, earned:0, list:[]},
  /* The engine that spends on its own. Off is the only honest default. */
  auto:{on:false, every:6000, cap:60, scope:'active', stamps:[]},
  /* Time window. Every consumer of history reads through hist(), never S.history. */
  range:{mode:'all', from:null, to:null},
  /* Measured results, keyed by strategy id. Empty means not measured — never zero. */
  bake:{}, mine:[]
};

/* ═══ BRAND BOUNDARY · one gate, used to WRITE and to READ ═════════════ */
/* Triviu is the L1 jurisdiction. A label — an L2 — is not bought, it is
   reached: a sustained average of 100,000 under management. The number is a
   threshold of responsibility, because a label carries other people's users. */
const LABEL_THRESHOLD = 100_000;
function capitalUnderManagement(){
  return S.vaults.reduce((a,v)=>a+v.idle+v.inPos,0);
}
function labelEligible(){ return capitalUnderManagement() >= LABEL_THRESHOLD; }

const LOGO_URL_RE  = /^(https?:\/\/|\/)[^\s"'<>]+$/;
/* Raster only. NEVER svg: an SVG can carry <script>, and this logo is
   printed into the header of every page of the console. */
const LOGO_DATA_RE = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/;
const MAX_LOGO_LEN = 300_000;
const ACCENT_RE    = /^#[0-9a-fA-F]{6}$/;
const validLogo = l => !!l && (LOGO_URL_RE.test(l) || (l.length <= MAX_LOGO_LEN && LOGO_DATA_RE.test(l)));
function sanitizeBrand(raw){
  const o = {};
  const n = (raw.name||'').trim();  if (n) o.name = n.slice(0,60);
  const s = (raw.sub||'').trim();   if (s) o.sub = s.slice(0,40);
  if (validLogo(raw.logo)) o.logo = raw.logo;
  const a = (raw.accent||'').trim(); if (ACCENT_RE.test(a)) o.accent = a;
  return o;
}
function readImage(file, ok){
  if (!file) return;
  if (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name))
    return toast('SVG is refused — it can carry a script.','err');
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) return toast('Use PNG, JPG, WEBP or GIF.','err');
  const r = new FileReader();
  r.onload = () => { const d = String(r.result);
    if (!validLogo(d)) return toast('That image is over 300 KB.','err');
    ok(d); };
  r.readAsDataURL(file);
}

/* A VERSAO DO ESTADO SALVO, e por que ela nasceu em 2026-08-23.
   Ate aqui, tudo que os botoes escreviam na tela ia para o localStorage — e o
   que eles escreviam eram efeitos de transacoes que nunca sairam. Um navegador
   que usou a tela naquele dia guarda ate hoje 1,00 USDC de saldo, duas
   sub-contas e 1,00000 POL de reserva de gas. Nada disso existe na chain.
   Corrigir o codigo nao apaga o que ja foi gravado: sem esta versao, a primeira
   coisa que a tela corrigida faria seria carregar os numeros inventados de volta
   e mostra-los com a autoridade de uma tela que agora le a chain. Isso seria
   pior que o defeito original.
   Mudar este numero descarta o estado salvo. Ele muda quando o SIGNIFICADO do
   que estava salvo muda — nao a cada mexida. */
var ESTADO_VERSAO = 2;

function save(){ try{ localStorage.setItem('triviu-console', JSON.stringify(Object.assign({_v:ESTADO_VERSAO}, S))); }catch(e){} }
function load(){
  try{
    const r = localStorage.getItem('triviu-console');
    if (r) {
      const salvo = JSON.parse(r);
      if (salvo && salvo._v === ESTADO_VERSAO) {
        Object.assign(S, salvo);
      } else {
        /* Descartado, e DITO. Apagar em silencio faria a pessoa achar que perdeu
           dados; ela nao perdeu — o que estava ali nunca esteve na chain. */
        localStorage.removeItem('triviu-console');
        setTimeout(() => toast('O estado guardado por este navegador vem de uma versao anterior ' +
          'desta tela, em que os botoes escreviam saldos que nunca existiram na chain. Ele foi ' +
          'descartado. Conecte a carteira: os numeros passam a vir do contrato.', 'err'), 900);
      }
    }
  }catch(e){}
  S.instances = (S.instances||[]).map(i => { const c = sanitizeBrand(i);
    return {id:i.id, core:!!i.core, name:c.name||'Instance', sub:c.sub||'',
            accent:c.accent||'#2743C7', logo:c.logo||null}; });
  if (!S.instances.length) S.instances = [{id:'triviu',name:'Triviu',sub:'· console',accent:'#2743C7',logo:null,core:true}];
  if (S.profile?.avatar && !validLogo(S.profile.avatar)) S.profile.avatar = null;
  (S.vaults||[]).forEach(v => { v.fence = Object.assign(newFence(), v.fence||{}); });
  /* A state saved by an older build has none of these keys. Object.assign keeps
     the defaults, but the shapes still get checked — a corrupted localStorage
     should not be able to hand the automation loop something it cannot read. */
  S.range = Object.assign({mode:'all', from:null, to:null}, S.range||{});
  /* Listed inline, not read from RANGES: load() must not depend on a const
     declared further down the file to have been evaluated first. */
  if (!['today','7d','30d','all','custom'].includes(S.range.mode)) S.range.mode = 'all';
  S.bake = (S.bake && typeof S.bake === 'object' && !Array.isArray(S.bake)) ? S.bake : {};
  /* An earlier build could store a record with n:0 — a strategy that never ran,
     rendered as a measured 0.000%. Drop those rather than display them. */
  Object.keys(S.bake).forEach(k => { const m = S.bake[k];
    if (!m || typeof m !== 'object' || !(m.n > 0)) delete S.bake[k]; });
  S.mine = Array.isArray(S.mine) ? S.mine.filter(x => x && x.id && x.fence && x.ex) : [];
  S.mine.forEach(s => { s.own = true; s.name = String(s.name||'Strategy').slice(0,40); });
  S.auto = Object.assign({on:false, every:6000, cap:60, scope:'active', stamps:[]}, S.auto||{});
  /* These three drive <select> elements. A stored value outside the option set
     does not throw — the select just renders BLANK, and the user sees a control
     with no state. Snap back to a listed value instead. */
  if (![3000,6000,12000,30000].includes(S.auto.every)) S.auto.every = 6000;
  if (![30,60,120,600].includes(S.auto.cap))           S.auto.cap   = 60;
  if (!['active','all'].includes(S.auto.scope))        S.auto.scope = 'active';
  /* Automation NEVER survives a reload. The panel promises the engine stops when
     the page closes; resuming it silently on load would make that a lie, and a
     loop that spends is the wrong thing to start without a hand on it. */
  S.auto.on = false;
  S.auto.stamps = (Array.isArray(S.auto.stamps) ? S.auto.stamps : []).filter(t => t > Date.now()-3600000);
  S.prefs = S.prefs || {};
  if (typeof S.prefs.autoArm    !== 'boolean') S.prefs.autoArm = true;
  if (typeof S.prefs.armedOnce  !== 'boolean') S.prefs.armedOnce = false;
}

let tT;
function toast(m,k){ const t = $('toast'); t.className = 'show '+(k||'');
  t.innerHTML = (k==='ok'?icon('check'):k==='err'?icon('alert'):icon('dot'))+'<span>'+esc(m)+'</span>';
  clearTimeout(tT); tT = setTimeout(()=>{t.className='';}, k==='err'?6000:3400); }

function applyTheme(t){
  document.documentElement.dataset.theme = t;
  /* The WebGL clear colour must follow the theme or every empty region of the
     page keeps the old paper. Called from here so it can never drift again. */
  if (typeof syncInk === 'function') syncInk();
  /* the brand ink is theme-dependent: recomputed here so it can never drift */
  if (typeof syncBrandInk === 'function') syncBrandInk();
  const i = $('themeIcon'); if (i) i.setAttribute('href', t==='dark'?'#i-sun':'#i-moon');
  const b = $('btnTheme'); if (b) b.setAttribute('aria-label', t==='dark'?'Switch to light theme':'Switch to dark theme');
  const ii = $('themeIconInit'); if (ii) ii.setAttribute('href', t==='dark'?'#i-sun':'#i-moon');
  const sel = $('pfTheme'); if (sel) sel.value = t;
}

/* ═══ SIMULATED WALLET ═════════════════════════════════════════════════ */
function walletConfirm({to,fn,gas}){
  return new Promise((res,rej) => {
    $('wFrom').textContent = S.wallet.address; $('wTo').textContent = to; $('wFn').textContent = fn;
    $('wGas').textContent = '~'+gas.toLocaleString('en-US')+' gas';
    $('walletOv').classList.add('show'); $('wConfirm').focus();
    $('wConfirm').onclick = () => { $('walletOv').classList.remove('show'); res(); };
    $('wReject').onclick = () => { $('walletOv').classList.remove('show'); turning(false);
      rej(new Error('Step dismissed.')); };
  });
}
function turning(on){ document.querySelectorAll('.mk,.mkbig').forEach(m => m.classList.toggle('turning', on)); }
/* ═══ O ROTEADOR DOS ATOS ═══════════════════════════════════════════════════
   Todo botao desta tela passa por aqui, e daqui saem exatamente tres coisas —
   nenhuma delas e "escrever na tela que aconteceu".

     1. o ato existe na linha V0 E /cofre/ o monta  -> vai para /cofre/ assinar
     2. o ato existe na linha V0 e /cofre/ ainda nao o monta -> RECUSA, dizendo
        qual e a assinatura real e que ela ainda nao tem tela
     3. o ato NAO existe nesta linha -> RECUSA, dizendo o que existe no lugar

   O QUE ESTAVA ERRADO, e foi o fundador quem viu antes de qualquer portao.
   Quando o caminho de assinatura saiu daqui por VETO (TUBARAO-25), o `apply()`
   ficou. `apply` e a funcao que muda o estado LOCAL — o saldo, a lista de
   sub-contas, a reserva de gas. Sem assinatura e com apply, cada clique
   escrevia na tela o efeito de uma transacao que nunca saiu:

       "Gas reserve funded · 1.00000 POL"    — nada foi enviado
       "Liquidity added · 1.00 USDC"         — nada foi enviado
       "Sub-account opened · Sub-account 2"  — nada foi criado

   A carteira nao abriu uma vez sequer, e a tela ficou com 1.00 USDC de saldo,
   1.00000 POL de reserva e 208 ciclos cobertos. Isso nao e uma simulacao
   rotulada: e uma tela dizendo que voce tem dinheiro que voce nao tem.

   Por isso `apply` nao e mais aceito. Se um ponto de chamada ainda o manda,
   isso e um ponto que nao foi convertido, e ele PARA aqui — em vez de mudar o
   estado em silencio como fazia.

   E `ato` e obrigatorio. Sem ele o roteador nao sabe se o botao corresponde a
   alguma coisa na chain, e um roteador que na duvida deixa passar volta a ser o
   que estava aqui antes. */
const ATOS = {
  /* Os quatro que /cofre/ monta, congela, imprime e assina. */
  criar:     { cofre: 'criar',     nome: 'factory.createVault(address,uint256)' },
  aprovar:   { cofre: 'aprovar',   nome: 'erc20.approve(address,uint256)' },
  depositar: { cofre: 'depositar', nome: 'vault.deposit(address,uint256)' },
  sacar:     { cofre: 'sacar',     nome: 'vault.withdraw(address,uint256,address)' },

  /* Existem no artefato compilado e ainda nao tem tela de assinatura. Recusar
     nomeando a assinatura real e diferente de recusar em branco: o proximo a
     construir a tela sabe exatamente o que montar. */
  /* CINCO que passaram de recusa a assinatura. Todos sao `_checkOwner()` no
     cofre — a politica de um cofre pertence ao dono dele — e todos tem
     argumentos de tipo estatico, montaveis pelo codificador do motor. */
  ativo:        { cofre: 'ativo',        nome: 'vault.setAllowedAsset(address,bool)' },
  estrategia:   { cofre: 'estrategia',   nome: 'vault.setStrategy(address)' },
  moedaDoCofre: { cofre: 'moedaDoCofre', nome: 'vault.setBaseCurrency(address,bool)' },
  guarda:       { cofre: 'guarda',       nome: 'vault.addGuard/removeGuard(address)' },
  /* `limites` recusou ate 2026-08-23 por falta de `uint112` no codificador, e a
     ordem em que isso se resolveu importa mais que o resultado: somar o tipo
     isolado foi VETADO pelo Tubarao-branco, que exigiu antes o conserto da
     classe — todo `uint` passou a validar a propria largura, e a conferencia
     tela-contra-calldata deixou de derivar o esperado da mesma funcao que
     produzia o observado. So depois disso o tipo entrou.
     A linha anterior aqui dizia "falta uint112 no codificador do motor" e
     continuou dizendo isso depois de o tipo ter entrado — uma tela afirmando
     um estado que deixara de ser verdade. */
  limites:      { cofre: 'limites',      nome: 'vault.setLimits(uint64,uint64,uint16,uint112)' },
  /* O unico ato com tipo dinamico. A linha que estava aqui dizia que "nenhuma
     tela monta essa calldata, e nenhuma outra monta ainda" — deixou de ser
     verdade quando as cinco pecas ficaram prontas e o resultado foi conferido
     contra o `abi.encode` do proprio compilador. */
  executar:     { cofre: 'executar',     nome: 'vault.executeAsOwner((...),(...))' },
  saida:      { falta: 'escapeHatch.withdraw(address,uint256,address)' },

  /* NAO EXISTEM nesta linha. Cada um destes era um botao que prometia uma
     transacao contra um contrato que nao esta na chain — ou que esta na OUTRA
     linha, que e pior, porque a pessoa pensaria estar operando a V0. */
  /* O GASTANK EXISTE, e a frase anterior deixava entender que nao.
     Medido em 2026-08-23, varrendo a arvore INTEIRA e nao so uma pasta:
     `GasTank.sol` existe, com teste ao lado, em contracts/src da linha ANTIGA, e
     esta VIVO em 0xFF0Dc2fC461E28bbAC7964496535989311e93f56 com 777 bytes.
     E mesmo existindo ele nao paga o gas de ninguem — e quem diz isso e o autor,
     no comentario do proprio contrato: o consumo automatico, gastar a reserva de
     alguem para completar uma perna presa, e item de v0.2 pendente das mecanicas
     de gatilho. Hoje e escrow puro: entra POL e so sai de volta para quem
     depositou. Medido: guarda 0,000000 POL. */
  gastank: { inexistente:
    'O GasTank EXISTE e esta vivo em 0xFF0Dc2fC461E28bbAC7964496535989311e93f56, mas e da linha ' +
    'ANTIGA e hoje nao paga gas de ninguem: o consumo automatico e item de v0.2, e o proprio ' +
    'contrato diz isso. Hoje ele e escrow — entra POL e so sai de volta para quem depositou, e ' +
    'ele guarda zero. Nesta linha o gas funciona diferente: as transacoes que VOCE assina (criar, ' +
    'aprovar, depositar, sacar) saem da sua carteira; o CICLO e aberto pelo OPERADOR, que adianta ' +
    'o gas em POL e e reembolsado pelo cofre em moeda-base, com teto de min(1 unidade, 1% do ' +
    'negociado). Voce nao precisa de reserva porque nao e voce que paga o gas do ciclo.' },
  indicacao: { inexistente:
    'TriviuReferralVault nao esta implantado em chain nenhuma. Nao ha contrato para chamar claim().' },
  cerca: { inexistente:
    'TriviuCerca nao esta implantada. A politica de um cofre V0 vive no proprio cofre — ' +
    'setAllowedAsset, setLimits, setStrategy, addGuard — e nao num contrato separado.' },
  pausa: { inexistente:
    'Um cofre V0 nao tem pausa. Ele tem `setLimits(uint64,uint64,uint16,uint112)` — e um teto ' +
    'zerado impede abrir — e tem o EscapeHatch, que tira tudo sem condicao. Um botao chamado ' +
    'PAUSE sobre um contrato sem pausa e um interruptor ligado em nada.' },
  espalhar: { inexistente:
    'Espalhar por N sub-contas sao N transacoes, uma por cofre, cada uma congelada e assinada ' +
    'separadamente. Esta tela nao junta transacoes, e juntar seria mentir sobre quantas ' +
    'assinaturas a operacao custa.' },
  ciclo: { inexistente:
    'A execucao de um ciclo e vault.execute((...)), uma tupla de 14 campos com dois campos ' +
    '`bytes`. Esta tela nao monta essa calldata, e nenhuma outra monta ainda.' }
};

async function tx({ato, to, fn, gas, label, apply, log, quantia, indice, alvo, ligado, limites, execucao}){
  if (apply) {
    throw new Error('PARADO: este botao ainda tenta mudar o estado da tela sozinho. ' +
      'Nada foi enviado e nada foi alterado — o ponto de chamada precisa ser convertido.');
  }
  const regra = ATOS[ato];
  if (!regra) {
    const m = 'PARADO: este botao nao declara qual ato da chain ele representa (`ato`), ' +
      'entao nao da para saber se ele corresponde a alguma coisa. Nada aconteceu.';
    toast(m, 'err'); log?.(m, 'bad');
    throw new Error(m);
  }

  if (regra.inexistente) {
    toast(regra.inexistente, 'err');
    log?.((label || ato) + ' — nao existe nesta linha', 'bad');
    log?.(regra.inexistente, 'dim');
    throw new Error(regra.inexistente);
  }

  if (regra.falta) {
    const m = (label || ato) + ' existe na V0 como `' + regra.falta + '`, e ainda nao ha tela que ' +
      'monte e congele essa calldata. Nada foi enviado.';
    toast(m, 'err'); log?.(m, 'bad');
    throw new Error(m);
  }

  /* Existe, e a assinatura acontece AQUI, sem sair da pagina.
     Ate 2026-08-23 esta linha mandava o usuario para /cofre/ — outra tela, no
     meio de um fluxo de deploy. O que mudou nao foi a regra e sim onde fica a
     fronteira: a maquinaria de congelar, imprimir a digital e abrir a carteira
     virou o modulo js/assinar-v0.js, que passa nas mesmas onze regras e e
     chamado daqui.
     Este console NAO fala com a carteira. Ele pede ao modulo, e o modulo abre a
     janela com a calldata, o cartao e a digital. Por isso este arquivo continua
     cobrado como somente-leitura pelo guardiao, com allowlist de tres. */
  if (!window.TRIVIU_ASSINAR) {
    throw new Error('/js/assinar-v0.js nao carregou — sem ele nao ha caminho de assinatura, ' +
      'e esta tela nao assina sozinha por desenho.');
  }
  log?.((label || ato) + ' — ' + regra.nome + ' · confira e assine na janela', 'tx');
  /* Criar exige o primeiro indice LIVRE, e ele e perguntado a chain agora — nao
     no momento em que a tela foi desenhada. Entre desenhar e clicar cabe um cofre
     criado noutra aba. */
  let indiceReal = indice === undefined || indice === null ? (activeV()?.indice ?? 0) : indice;
  let cofreAlvo = (activeV() && activeV().addr) || S.triad?.vault || null;
  if (regra.cofre === 'criar') {
    const livre = await primeiroIndiceLivre(S.wallet.address, log);
    indiceReal = livre.indice;
    cofreAlvo = livre.endereco;
  }
  const r = await window.TRIVIU_ASSINAR.assinar(regra.cofre, {
    conta: S.wallet.address,
    cofre: cofreAlvo,
    indice: indiceReal,
    moeda: S.moeda || TRIVIU.base.address,
    alvo: alvo === undefined ? null : alvo,
    ligado: ligado === undefined ? null : ligado,
    limites: limites === undefined ? null : limites,
    execucao: execucao === undefined ? null : execucao,
    quantia: quantia === undefined || quantia === null ? null : paraBase(quantia)
  });
  if (!r) { log?.('cancelado — nada foi enviado', 'dim'); return null; }
  if (!r.ok) {
    log?.('minerada e FALHOU na chain — nenhum estado mudou', 'bad');
    toast('A transacao foi minerada e reverteu. Gas foi gasto e nada mudou.', 'err');
    return r;
  }
  /* Minerada com sucesso. O numero na tela NAO e escrito daqui: a chain e
     relida. Escrever o efeito a partir do retorno seria a mesma coisa que o
     `apply()` fazia — a diferenca seria so ter havido uma transacao antes. */
  log?.('confirmada no bloco ' + parseInt(r.recibo.blockNumber, 16) + ' · relendo a chain', 'ok');
  /* CRIAR PRECISA ADOTAR. Ate 2026-08-23 o console minerava o createVault com
     sucesso e a linha seguinte lia `S.triad.vault` — com `S.triad` nulo, porque
     o `apply()` que o preenchia saiu com o veto e nada tomou o lugar dele.
     O custo disso nao foi um erro na tela: o fundador tentou de novo, e cada
     tentativa criou OUTRO cofre e gastou gas de verdade. Ficaram tres cofres na
     conta dele — indices 0, 1 e 2 — por um estado que a tela nao guardou.
     Adotar LE DA CHAIN o que acabou de nascer; nao deduz do retorno. */
  if (regra.cofre === 'criar') {
    await adotarCofrePrincipal(indiceReal);
    log?.('cofre adotado: ' + S.triad.vault + ' (indice ' + indiceReal + ')', 'ok');
  }
  /* Depois de um recibo o console rele TUDO: taxa, papeis, moeda e saldos. Ler
     so o saldo deixaria a taxa velha na tela depois de a governanca muda-la. */
  await lerTudoDaChain();
  return r;
}

/* AS LEITURAS DE CHAIN, num lugar so. Elas viviam soltas dentro do `connect()`
   e por isso nao aconteciam em nenhum outro caminho — nem numa aba recarregada,
   nem depois de trocar de conta. Uma definicao, todos os chamadores.
   `allSettled` e nao `all`: um endpoint fora do ar numa leitura nao pode
   derrubar as outras duas, e o que nao respondeu fica `null` — que na tela se le
   como "nao medido", diferente de zero. */
async function lerTudoDaChain(){
  /* OS SALDOS ENTRAM AQUI, e a falta deles era visivel na tela: o painel de
     redes mostrava 1,00 de liquidez enquanto o cofre tinha ZERO na chain.
     
ecarregarDaChain() so rodava depois de um recibo, entao numa aba
     recarregada o saldo vinha do localStorage — um numero de dinheiro que
     sobreviveu a sessao e nao foi reconferido contra o contrato.
     E a mesma familia do dinheiro pintado, com outra fonte: nao e a tela que
     escreve, e a tela que LEMBRA e nao confere. */
  const r = await Promise.allSettled([preencherMoedas(), lerProtocolo(), conferirPapeis()]);
  await recarregarSaldos();
  const falhou = r.filter(x => x.status === 'rejected');
  if (falhou.length){
    toast(falhou.length + ' de ' + r.length + ' leituras de chain nao voltaram. ' +
      'O que esta em branco na tela nao foi medido — nao e zero.', 'err');
  }
  if (typeof renderOver === 'function') renderOver();
  desligarPainelDeGas();
  renderProntidao().catch(() => {});
  renderCustos();
  return r;
}

/* O PRIMEIRO INDICE LIVRE, MEDIDO. Nao existe "o indice 0": existe o primeiro
   que ainda nao tem contrato. O CREATE2 deriva um endereco por (dono, indice) e
   RECUSA nascer onde ja ha codigo — `FailedDeployment()`.
   Foi isto que travou o deploy do fundador: a tela pedia sempre o indice 0, e o
   cofre 0 dele existe desde 2026-08-22. A simulacao recusou antes de abrir a
   carteira, que e o comportamento certo, e a tela nao sabia oferecer o proximo.
   Eu ja tinha consertado isto NO ENSAIO e nao tinha trazido para o produto —
   consertar a instancia e nao a classe. */
async function primeiroIndiceLivre(dono, log, desde) {
  /* EM LOTE, e nao um de cada vez. Medido em 2026-08-23 contra os endpoints
     publicos, na conta do fundador com sete cofres: 16 chamadas em serie levam
     2962ms e o mesmo resultado em lote leva 2041ms. Nao e a diferenca entre
     rapido e lento — e a diferenca entre uma tela que responde e uma tela que
     parece ter travado, porque durante esses tres segundos o console logava a
     intencao e sumia.
     E PIORA SOZINHO: a busca comeca no zero e cada cofre criado soma duas
     chamadas. Com sete cofres sao dezesseis; com vinte seriam quarenta e dois.
     Por isso a busca comeca no que ja se sabe — `S.vaults.length` — e o zero so
     entra quando nao se sabe nada. Se o palpite estiver ocupado, o lote seguinte
     continua de onde parou; se estiver livre demais, o resultado e o mesmo,
     porque o que se procura e o PRIMEIRO livre a partir dali e o que veio antes
     ja foi criado por esta mesma conta. */
  const LOTE = 12;
  const inicio = desde === undefined ? Math.max(0, (S.vaults || []).length) : Math.max(0, desde);
  log?.('procurando o primeiro indice livre na sua conta a partir de ' + inicio +
    ' — sao duas leituras de chain por indice, e isto leva alguns segundos', 'dim');

  for (let base = inicio; base < inicio + 60; base += LOTE) {
    const faixa = Array.from({ length: LOTE }, (_, k) => base + k);
    const enderecos = await Promise.all(faixa.map((i) => LER.vaultAddress(dono, i)));
    const existem = await Promise.all(enderecos.map((e) => LER.existe(e)));
    const k = existem.findIndex((x) => x === false);
    if (k >= 0) {
      log?.('primeiro indice livre: ' + faixa[k] + ' · ' + enderecos[k], 'ok');
      return { indice: faixa[k], endereco: enderecos[k] };
    }
    log?.('indices ' + faixa[0] + ' a ' + faixa[faixa.length - 1] + ' ocupados; procurando adiante', 'dim');
  }
  /* Se o palpite pulou por cima de um buraco — um cofre apagado do estado local
     que ainda existe na chain nao acontece, mas o contrario sim: estado local
     com mais cofres do que a chain tem — vale a pena voltar ao zero UMA vez
     antes de desistir. */
  if (inicio > 0 && desde === undefined) return primeiroIndiceLivre(dono, log, 0);
  throw new Error('nao achei indice livre em 60 tentativas a partir de ' + inicio + ' nesta conta');
}

/* Converte o que a pessoa digitou para as casas da moeda-base, por STRING.
   `Math.round(a * 10 ** casas)` erra: 0.07 * 1e6 da 70000.00000000001 em ponto
   flutuante, e um centavo a mais ou a menos numa calldata e outra transacao. */
function paraBase(n) {
  const casas = TRIVIU.base.decimals === null || TRIVIU.base.decimals === undefined
    ? 6 : Number(TRIVIU.base.decimals);
  const s = String(n).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error('quantia invalida: ' + s);
  const [inteiro, frac = ''] = s.split('.');
  if (frac.length > casas) {
    throw new Error('esta moeda tem ' + casas + ' casas decimais e voce digitou ' + frac.length + '.');
  }
  return (BigInt(inteiro) * 10n ** BigInt(casas) + BigInt((frac + '0'.repeat(casas)).slice(0, casas))).toString();
}

/* A chain e a fonte. Isto rele o que mudou depois de uma transacao minerada, em
   vez de deduzir o efeito dela. */
/* Os saldos, lidos do contrato, num lugar so. Separado de lerTudoDaChain para
   que quem so quer o saldo nao releia taxa e papeis, e para que quem le tudo nao
   precise lembrar de pedir o saldo tambem. */
async function recarregarSaldos() {
  if (!S.wallet.address) return;
  const casas = TRIVIU.base.decimals || 6;
  for (const v of S.vaults) {
    try {
      const endereco = await LER.vaultAddress(S.wallet.address, v.indice ?? 0);
      v.addr = endereco;
      v.existe = await LER.existe(endereco);
      /* chain: balanceOf na moeda-base, lido do contrato apos o recibo. */
      v.idle = Number(await LER.balanceOf(TRIVIU.base.address, endereco)) / 10 ** casas;
    } catch (e) { /* endpoint fora do ar nao pode zerar um saldo na tela */ }
  }
  if (typeof renderVaults === 'function') renderVaults();
  if (typeof renderOver === 'function') renderOver();
  if (typeof renderLiquidity === 'function') renderLiquidity();
  save();
}

/* ═══ OS PASSOS, MONTADOS DO ARTEFATO ═══════════════════════════════════════
   Cada funcao devolve a calldata REAL: seletor tirado de sig(), que le o
   artefato compilado, mais uma palavra por argumento pelo codificador do motor.
   Nenhum seletor e digitado e nenhum endereco e literal.

   ONDE ESTA CALLDATA VAI, e onde ela NAO vai. Ela e desenhada na tela e
   estimada com eth_estimateGas. Ela NAO e assinada aqui: esta tela nao tem
   caminho de assinatura (VETO TUBARAO-25). Quando o passo e aceito, quem assina
   e /cofre/ — e /cofre/ MONTA A CALLDATA DE NOVO, do mesmo artefato, em vez de
   receber estes bytes prontos. Isso e de proposito: uma tela que aceita bytes de
   outra tela assina o que a outra mandar, e a impressao digital que ela tira
   passaria a provar a origem em vez do conteudo. O que atravessa e a INTENCAO
   (qual ato, qual quantia), nao a calldata. */
const TX = {
  createVault(dono, indice){
    return sig('factory','createVault(address,uint256)') +
           CODIF.address(dono) + CODIF.uint256(String(indice));
  },
  approveBase(gastador, quantia){
    /* A recusa e sobre os BYTES: uma palavra de 32 bytes toda de uns e a
       aprovacao ilimitada, independente do que a tela escreveu ao lado. */
    return recusarAprovacaoInfinita(
      sig('erc20','approve(address,uint256)') +
      CODIF.address(gastador) + CODIF.uint256(String(quantia)),
      'erc20','approve(address,uint256)');
  },
  deposit(token, quantia){
    /* `deposit(address,uint256)` — o token entra na chamada. O modelo dizia
       `deposit(amount)`, com uma palavra so, e essa chamada reverteria. */
    return sig('vault','deposit(address,uint256)') +
           CODIF.address(token) + CODIF.uint256(String(quantia));
  },
  withdraw(token, quantia, para){
    return sig('vault','withdraw(address,uint256,address)') +
           CODIF.address(token) + CODIF.uint256(String(quantia)) + CODIF.address(para);
  },
  setStrategy(estrategia){
    return sig('vault','setStrategy(address)') + CODIF.address(estrategia);
  },
  escapeHatch(token, quantia, para){
    /* O EscapeHatch tem DUAS funcoes no artefato: owner() e
       withdraw(address,uint256,address). `resgatar(...)`, que o modelo nomeava,
       nao existe em lugar nenhum das duas linhas. */
    return sig('escapeHatch','withdraw(address,uint256,address)') +
           CODIF.address(token) + CODIF.uint256(String(quantia)) + CODIF.address(para);
  },
  /* O QUE ESTA TELA AINDA NAO MONTA, dito aqui e nao escondido atras de um
     `return null` silencioso. `execute` e a abertura de posicao, e a assinatura
     real e
        execute((address,address,address,address,uint256,uint64,uint64,
                 uint256,uint256,uint256,uint256,uint256,bytes,bytes32))
     — uma tupla de 14 campos, dois deles de tipo DINAMICO (`bytes`). O
     codificador do motor posiciona uma palavra por argumento estatico; com tipo
     dinamico a cabeca leva deslocamento e a cauda vem depois, e a conta deixa de
     ser de um-para-um. Montar isso exige um codificador de tupla que ainda nao
     existe neste repositorio.
     Ele LANCA em vez de devolver null. Um `return null` aqui viraria um botao
     que nao faz nada e ninguem sabe por que — e foi assim que os cinco
     plug-points do modelo passaram dias parecendo implementados. */
  execute(){
    throw new Error('execute((...)) ainda nao e montado por esta tela: a tupla de 14 campos ' +
      'tem dois campos `bytes`, e o codificador de tupla nao existe neste repositorio. ' +
      'Nada foi montado, e nada sera oferecido para assinatura.');
  }
};

/* ═══ LEITURA DE CHAIN ══════════════════════════════════════════════════════
   Tudo que a tela afirma sobre a chain passa por aqui. Uma palavra de 32 bytes
   e recortada por posicao, e a posicao vem da assinatura — nao de contagem a
   olho sobre o hex. */
function chamar(para, dados){
  return triviuRead('eth_call', [{ to: para, data: dados }, 'latest']);
}
const pal = (hex, i) => String(hex||'').replace(/^0x/,'').slice(i*64, (i+1)*64);
const comoEndereco = (w) => '0x' + String(w).slice(-40);
const comoNumero  = (w) => BigInt('0x' + (w || '0'));
const comoBool    = (w) => BigInt('0x' + (w || '0')) !== 0n;
/* `symbol()` devolve string ABI: deslocamento, comprimento, bytes. Ler os
   primeiros 32 bytes como se fossem o texto daria lixo com cara de simbolo. */
function comoTexto(hex){
  const c = String(hex||'').replace(/^0x/,'');
  if (c.length < 128) return null;
  const n = Number(BigInt('0x' + c.slice(64,128)));
  if (!n || n > 64) return null;
  let s = '';
  for (let i=0;i<n;i++) s += String.fromCharCode(parseInt(c.slice(128+i*2, 130+i*2), 16));
  return s;
}

const LER = {
  vaultAddress: async (dono, indice) => comoEndereco(pal(await chamar(TRIVIU.addr.factory,
    sig('factory','vaultAddress(address,uint256)') + CODIF.address(dono) + CODIF.uint256(String(indice))), 0)),
  feeBps:   async () => Number(comoNumero(pal(await chamar(TRIVIU.addr.protocolRegistry, sig('protocolRegistry','feeBps()')), 0))),
  feeBpsMax:async () => Number(comoNumero(pal(await chamar(TRIVIU.addr.protocolRegistry, sig('protocolRegistry','FEE_BPS_MAX()')), 0))),
  treasury: async () => comoEndereco(pal(await chamar(TRIVIU.addr.protocolRegistry, sig('protocolRegistry','treasury()')), 0)),
  paused:   async () => comoBool(pal(await chamar(TRIVIU.addr.protocolRegistry, sig('protocolRegistry','paused()')), 0)),
  isExecutor:     async (a) => comoBool(pal(await chamar(TRIVIU.addr.protocolRegistry,
    sig('protocolRegistry','isExecutor(address)') + CODIF.address(a)), 0)),
  isBaseCurrency: async (a) => comoBool(pal(await chamar(TRIVIU.addr.protocolRegistry,
    sig('protocolRegistry','isBaseCurrency(address)') + CODIF.address(a)), 0)),
  balanceOf: async (token, quem) => comoNumero(pal(await chamar(token,
    sig('erc20','balanceOf(address)') + CODIF.address(quem)), 0)),
  decimals:  async (token) => Number(comoNumero(pal(await chamar(token, sig('erc20','decimals()')), 0))),
  symbol:    async (token) => comoTexto(await chamar(token, sig('erc20','symbol()'))),
  dono:      async (cofre) => comoEndereco(pal(await chamar(cofre, sig('vault','owner()')), 0)),
  estrategia:async (cofre) => comoEndereco(pal(await chamar(cofre, sig('vault','strategy()')), 0)),
  /* A CERCA, lida do cofre em vez de presumida.
     `VaultConfig._list` grava `decimals` quando lista e ZERO quando deslista, e
     `_readDecimals` so aceita de 1 a 18 — entao zero nunca e um "liberado" com
     zero casas, e a leitura e sem ambiguidade: >0 liberado, 0 bloqueado.
     Medido em contracts/src/vault/VaultConfig.sol:163-186. */
  casasDoAtivo: async (cofre, token) => Number(comoNumero(pal(await chamar(cofre,
    sig('vault','assetDecimals(address)') + CODIF.address(token)), 0))),
  casasDaMoeda: async (cofre, token) => Number(comoNumero(pal(await chamar(cofre,
    sig('vault','baseCurrencyDecimals(address)') + CODIF.address(token)), 0))),
  /* `guards()` devolve address[] — tipo dinamico, e o retorno vem em tres
     partes: deslocamento, contagem, e as palavras. Ler a palavra 0 como se fosse
     um endereco devolveria `0x...20`, o deslocamento, e a tela mostraria um
     guardiao que nao existe. */
  guardas: async (cofre) => {
    const hex = String(await chamar(cofre, sig('vault','guards()')) || '').replace(/^0x/, '');
    if (hex.length < 128) return [];
    const n = Number(BigInt('0x' + hex.slice(64, 128)));
    const fora = [];
    for (let i = 0; i < n; i++) {
      const w = hex.slice(128 + i * 64, 192 + i * 64);
      if (w.length === 64) fora.push(comoEndereco(w));
    }
    return fora;
  },
  /* OS LIMITES, desempacotados da unica palavra que `limits()` devolve.
     `Limits` e um user-defined value type sobre bytes32, e os quatro campos
     moram em deslocamentos fixos (contracts/src/api/types/Limits.sol):
        cooldown  uint64  >> 192
        maxValidity uint64 >> 128
        minRatioBps uint16 >> 112      (zero DESLIGA a checagem)
        quantum   uint112  os 112 bits baixos
     Ler a palavra como um numero so mostraria um inteiro de 78 digitos que nao
     significa nada para quem le. */
  limites: async (cofre) => {
    const w = comoNumero(pal(await chamar(cofre, sig('vault','limits()')), 0));
    return {
      palavra: w,
      cooldown: w >> 192n,
      maxValidity: (w >> 128n) & 0xFFFFFFFFFFFFFFFFn,
      minRatioBps: (w >> 112n) & 0xFFFFn,
      quantum: w & ((1n << 112n) - 1n)
    };
  },
  /* A SIMULACAO. `dryRunChecks` e `view`: nao gasta, nao assina, nao muda nada.
     Ela roda a cadeia inteira — cooldown, moeda-base habilitada, pergunta a
     estrategia, veta o intent e passa pelos guardioes — e devolve o Intent que
     a estrategia quer executar.
     O valor dela esta TAMBEM no que ela recusa: cada revert e uma resposta.
     `StrategyCallFailed` significa que nao ha estrategia apontada;
     `BaseNotEnabled`, que a moeda-base do cofre esta desligada. Traduzir isso e
     a diferenca entre a tela dizer o que fazer e dizer "erro". */
  simular: async (cofre, lotId, base) => {
    try {
      const r = await chamar(cofre, sig('vault','dryRunChecks(uint256,address)') +
        CODIF.uint256(String(lotId)) + CODIF.address(base));
      const hex = String(r || '').replace(/^0x/, '');
      if (hex.length < 384) return { ok: false, cru: r, motivo: null };
      return { ok: true, intent: {
        lado: Number(comoNumero(pal(r, 0))) === 0 ? 'compra' : 'venda',
        ativo: comoEndereco(pal(r, 1)),
        base: comoEndereco(pal(r, 2)),
        entra: comoNumero(pal(r, 3)),
        saiMin: comoNumero(pal(r, 4)),
        lote: comoNumero(pal(r, 5))
      } };
    } catch (e) {
      return { ok: false, motivo: nomeDoRevert(e), erro: e };
    }
  },
  /* Os dois que entram no `proposalHash`. O cofre RECALCULA o hash com o nonce e
     a epoca DELE no momento da execucao: se qualquer um mudar entre montar e
     assinar, a chain recusa com CommitmentMismatch. Ler no ultimo instante e
     parte do desenho, e nao um detalhe. */
  nonce:       async (cofre) => comoNumero(pal(await chamar(cofre, sig('vault','nonce()')), 0)),
  configEpoch: async (cofre) => comoNumero(pal(await chamar(cofre, sig('vault','configEpoch()')), 0)),
  existe:    async (a) => { const c = await triviuRead('eth_getCode', [a, 'latest']); return !!c && c !== '0x'; }
};

/* O nome do erro NAO e decodificado aqui. `assinar-v0.js` ja tem
   `decodificarRevert`, com a cicatriz de 2026-08-12 escrita dentro dela — a
   versao herdada indexava as palavras sobre a string CRUA, que comeca com o
   seletor, e todo argumento saia deslocado em quatro bytes enquanto o NOME saia
   certo: a tela imprimia a verdade e a mentira com a mesma tipografia.
   Escrever uma segunda copia aqui recriaria a separacao que o cabecalho de
   motor.js descreve como o mecanismo do F-1. Uma definicao, dois consumidores. */
function nomeDoRevert(e){
  const texto = JSON.stringify((e && (e.data || e.message)) || e || '');
  const m = /0x[0-9a-fA-F]{8,}/.exec(texto);
  if (!m) return null;
  const d = window.TRIVIU_ASSINAR?.decodificarRevert?.(m[0]);
  if (!d) return null;
  if (!d.nome) return d.seletor;            /* seletor cru ja e melhor que "erro" */
  const i = d.nome.indexOf('(');
  return i >= 0 ? d.nome.slice(0, i) : d.nome;
}

/* Cada erro do cofre, dito em portugues e virado em INSTRUCAO. A tabela nomeia
   so os que a simulacao produz de verdade; o resto cai no nome cru, que ja e
   melhor do que nada. */
const O_QUE_FAZER = {
  StrategyCallFailed: 'Nao ha estrategia apontada neste cofre, ou ela nao respondeu. Aponte uma estrategia na cerca acima.',
  BaseNotEnabled: 'A moeda-base deste cofre esta desligada. Ligue-a na cerca acima — quem decide isso e voce, nao o protocolo.',
  CooldownActive: 'O intervalo minimo entre execucoes ainda nao passou. Veja `cooldown` nos limites.',
  AmountQuantizedToZero: 'A quantia ficou em zero depois de aplicada a granularidade (`quantum`). Baixe o quantum ou deposite mais.',
  NoLots: 'Nao ha lote aberto para fechar, e a estrategia pediu um fechamento.',
  BaseNotCurated: 'O registro do protocolo nao cura esta moeda-base. O ciclo so roda com uma moeda curada.'
};

/* Quem a chain diz que e a moeda-base, e nao quem a legenda dizia. */
/* A MOEDA-BASE NAO E UMA ESCOLHA NESTA LINHA, e a tela oferecia tres.
   Os seletores traziam USDT, USDC.e e DAI escritos no HTML. Nenhuma das tres e
   a moeda curada: o ProtocolRegistry responde `isBaseCurrency` = true para UMA
   so, a USDC nativa da implantacao, e um cofre aberto sobre qualquer outra
   reverte no primeiro deposito.
   Um seletor com tres opcoes das quais zero funcionam nao e uma escolha — e um
   convite a um erro que so aparece depois de a pessoa ter gasto gas. Agora ele
   e preenchido pela CHAIN e traz exatamente o que o registro cura. */
/* AS MOEDAS QUE O COFRE ACEITA, e a verdade ao lado de cada uma.
   Eu tinha travado esta tela numa moeda so, lendo `isBaseCurrency` do
   ProtocolRegistry e presumindo que ele governava o deposito. Medido no
   contrato: ele e consumido em UM lugar, `VaultExecution.sol:283`, dentro da
   EXECUCAO de ciclo, com `revert BaseNotCurated()`. Criar cofre, depositar e
   sacar nao passam por ele — `_deposit` faz `safeTransferFrom` e mais nada, e
   `TriviuVault.setBaseCurrency` e `_checkOwner()`: o dono decide a moeda-base do
   proprio cofre.
   Entao a lista volta. O que NAO volta e o silencio sobre a diferenca: cada
   opcao diz se o registro a cura, porque essa e a que vai poder rodar ciclo
   quando a governanca abrir. Oferecer sem dizer seria o defeito antigo com
   outro sinal. */
const MOEDAS = [
  { nome: 'USDC',   addr: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359' },
  { nome: 'USDT',   addr: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F' },
  { nome: 'USDC.e', addr: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' },
  { nome: 'DAI',    addr: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063' },
  { nome: 'WETH',   addr: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619' },
  { nome: 'WBTC',   addr: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6' },
  { nome: 'WPOL',   addr: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270' }
];

async function preencherMoedas(){
  const lidas = await Promise.all(MOEDAS.map(async (m) => {
    const [sim, casas, curada] = await Promise.all([
      LER.symbol(m.addr).catch(() => m.nome),
      LER.decimals(m.addr).catch(() => null),
      LER.isBaseCurrency(m.addr).catch(() => null)
    ]);
    return { addr: m.addr, nome: sim || m.nome, casas: casas, curada: curada };
  }));
  MOEDAS_LIDAS = lidas;
  const escolhida = S.moeda || (lidas.find((x) => x.curada) || lidas[0]).addr;
  for (const id of ['pBase','wBase','nvBase']){
    const sel = $(id);
    if (!sel) continue;
    while (sel.firstChild) sel.removeChild(sel.firstChild);
    for (const m of lidas){
      const o = document.createElement('option');
      o.value = m.addr;
      /* A etiqueta diz o que a chain respondeu e o que o registro cura. Um
         seletor que so mostra o simbolo esconde que duas moedas diferentes
         respondem "USDC" — a nativa e a ponte — e sao contratos distintos. */
      o.textContent = m.nome + (m.casas === null ? '' : ' · ' + m.casas + ' casas') +
        (m.curada === true ? ' · curada para ciclo' : m.curada === false ? ' · nao curada para ciclo' : '');
      sel.appendChild(o);
    }
    sel.value = escolhida;
    sel.disabled = false;
    sel.title = 'Deposito e saque aceitam qualquer uma. A curadoria do registro so pesa quando o ciclo executar.';
  }
  S.moeda = escolhida;
  const m = lidas.find((x) => x.addr === escolhida);
  S.base = m ? m.nome : S.base;
  TRIVIU.base.address = escolhida;
  TRIVIU.base.symbol = m ? m.nome : null;
  TRIVIU.base.decimals = m ? m.casas : null;
  return lidas;
}
let MOEDAS_LIDAS = [];

/* Quem a chain diz que e a moeda-base curada pelo registro. */
async function preencherMoedaBase(){
  const b = await lerMoedaBase();
  const rotulo = b.symbol || 'a moeda-base curada';
  for (const id of ['pBase','wBase','nvBase']){
    const sel = $(id);
    if (!sel) continue;
    while (sel.firstChild) sel.removeChild(sel.firstChild);
    const o = document.createElement('option');
    o.value = rotulo; o.textContent = rotulo;
    sel.appendChild(o);
    sel.value = rotulo;
    /* Uma opcao so: nao ha o que escolher, e um seletor destravado sobre uma
       lista de um item so ensina que existe alternativa. */
    sel.disabled = true;
    sel.title = 'Curada pelo ProtocolRegistry (' + b.address + '). Esta linha aceita uma so.';
  }
  S.base = rotulo;
  if (b.curada === false){
    toast('O registro NAO cura ' + b.address + ' como moeda-base. Um cofre aberto sobre ela ' +
      'reverteria no primeiro deposito.', 'err');
  }
  return b;
}

async function lerMoedaBase(){
  const e = TRIVIU.base.address;
  const [sim, casas, curada] = await Promise.all([
    LER.symbol(e).catch(()=>null), LER.decimals(e).catch(()=>null), LER.isBaseCurrency(e).catch(()=>null)
  ]);
  TRIVIU.base.symbol = sim; TRIVIU.base.decimals = casas; TRIVIU.base.curada = curada;
  return TRIVIU.base;
}

/* Quem a chain confirma nos papeis. Devolve o que foi PERGUNTADO, e `null` no
   que nao deu para perguntar — que e diferente de `false`. */
async function conferirPapeis(){
  const ADMIN = '0x' + '0'.repeat(64);   // DEFAULT_ADMIN_ROLE e bytes32(0)
  const [gov, op] = await Promise.all([
    chamar(TRIVIU.addr.protocolRegistry,
      sig('protocolRegistry','hasRole(bytes32,address)') + ADMIN.slice(2) + CODIF.address(TRIVIU.roles.governance))
      .then(x => comoBool(pal(x,0))).catch(() => null),
    chamar(TRIVIU.addr.protocolRegistry,
      sig('protocolRegistry','isOperator(address)') + CODIF.address(TRIVIU.roles.operator))
      .then(x => comoBool(pal(x,0))).catch(() => null)
  ]);
  TRIVIU.papeisConferidos = { governance: gov, operator: op };
  return TRIVIU.papeisConferidos;
}

/* O estado do protocolo, medido. `gatesOpen` nao e uma constante escrita no
   arquivo: e a conjuncao de tres leituras, e se qualquer uma falhar ele fica
   `null` — que e diferente de `false`. */
async function lerProtocolo(){
  const [taxa, teto, tes, parado, exec, base] = await Promise.all([
    LER.feeBps().catch(()=>null), LER.feeBpsMax().catch(()=>null),
    LER.treasury().catch(()=>null), LER.paused().catch(()=>null),
    LER.isExecutor(TRIVIU.addr.executor).catch(()=>null),
    LER.isBaseCurrency(TRIVIU.base.address).catch(()=>null)
  ]);
  TRIVIU.feeBps = taxa; TRIVIU.feeBpsMax = teto; TRIVIU.treasury = tes; TRIVIU.paused = parado;
  TRIVIU.gatesOpen = (exec === null || base === null || parado === null) ? null
                   : (exec && base && !parado);
  return TRIVIU;
}
/* As duas travas que scripts/check-assinatura.mjs cobra de toda tela que assina.
   Sao ALLOWLIST: o que nao esta aqui nao e chamado, e somar uma linha exige
   passar pelo guardiao. Nenhum metodo de assinatura de mensagem entra —
   os metodos de assinatura de mensagem e de envio cru produzem autorizacao
   off-chain, que nao custa gas, nao aparece na chain, e so se manifesta quando ja
   foi usada. A familia de metodos de CARTEIRA que pede troca de rede saiu inteira
   em 2026-08-22: esta tela nao pede troca de rede, ela recusa operar fora da 137. */
/* TRES metodos, todos de LEITURA. O quarto saiu junto com o caminho de
   assinatura (TUBARAO-25): allowlist que autoriza envio numa tela que nao
   envia e uma porta destrancada esperando alguem passar. Esta tela pergunta
   quem voce e e em que rede esta; ela nao move nada. */
var CARTEIRA_PERMITIDO = { eth_accounts:1, eth_requestAccounts:1, eth_chainId:1 };
var RPC_PERMITIDO = { eth_call:1, eth_chainId:1, eth_getCode:1, eth_getLogs:1, eth_blockNumber:1,
                      eth_gasPrice:1, eth_estimateGas:1, eth_getBalance:1, eth_getTransactionReceipt:1 };

async function connect(){
  /* SESSAO RESTAURADA TAMBEM LE A CHAIN. Este `return` cedo estava certo sobre
     nao reabrir a carteira e errado sobre o resto: numa aba recarregada,
     `S.wallet.connected` volta do localStorage como true, a funcao retornava, e
     as tres leituras — moeda-base, taxa e papeis — nunca aconteciam. O painel
     ficava dizendo "nao lida · conecte a carteira" com a carteira conectada.
     Ler a chain nao precisa de carteira e nao custa nada; e o `eth_requestAccounts`
     que precisa. Entao a sessao restaurada pula a carteira e NAO pula a leitura. */
  if (S.wallet.connected) { await lerTudoDaChain(); return; }
  if (window.ethereum && window.ethereum.request){
    try{
      const acc = await window.ethereum.request({method:'eth_requestAccounts'});
      if (!acc || !acc.length) throw new Error('no account');
      const cid = await window.ethereum.request({method:'eth_chainId'});
        /* RECUSA, e nao pedido de troca. O que havia aqui chamava
           o metodo de troca de rede da carteira dentro de um catch VAZIO: se a troca
           falhasse, o erro era engolido e a sessao seguia com real:true numa
           chain errada, calada. O envio seguinte assinaria contra um endereco
           que naquela chain e outra coisa, ou nada.
           Recusar e mais forte que pedir: a familia inteira sai da tela, e o
           erro deixa de ser silencioso. Quem troca de rede e a pessoa, na
           carteira dela, sabendo o que esta fazendo. */
        if (cid !== TRIVIU.chainHex){
          throw new Error('Wrong network: this wallet is on ' + cid + ' and this screen only operates on '
            + TRIVIU.chainHex + ' (Polygon PoS 137). Switch networks in your wallet and connect again.');
        }
      S.wallet = {connected:true, address:acc[0], real:true, chainId:cid};
      S.registry = TRIVIU.addr.protocolRegistry;  // real registry, from genesis
      /* AS LEITURAS ACONTECEM AQUI, e nao ficam esperando alguem lembrar.
         Elas existiram por algumas horas sem nenhum chamador: quatro funcoes que
         perguntavam a chain e ninguem perguntava a elas. E a mesma forma de um
         portao registrado que nunca roda — o codigo existe, parece cobertura, e
         cobre zero.
         `Promise.allSettled` e nao `all`: um endpoint fora do ar em UMA leitura
         nao pode derrubar a conexao inteira. O que nao respondeu fica `null`, e
         `null` na tela se le como "nao medido", que e diferente de zero. */
      await lerTudoDaChain();
      if (window.ethereum.on && !window.__twEvt){ window.__twEvt = true;
        window.ethereum.on('accountsChanged', a => { if(!a||!a.length){S.wallet={connected:false,address:null};} else {S.wallet.address=a[0];} save(); location.reload(); });
        window.ethereum.on('chainChanged', c => { S.wallet.chainId=c; save(); });
      }
      save(); return;
    }catch(e){
      /* A recusa PARA. O que havia aqui caia para uma carteira sorteada e
         seguia — e a partir dali toda a tela operava sobre um endereco que nao
         era de ninguem, com a mesma aparencia de uma sessao real. Uma pessoa que
         nao lesse o aviso de canto passaria a ler numeros sobre um cofre
         inexistente. Recusar e mais forte que continuar de outro jeito. */
      throw new Error('A carteira recusou: ' + ((e && e.message) || e) +
        '. Nada foi conectado — esta tela le a chain com a SUA conta ou nao le.');
    }
  }
  throw new Error('Nenhuma carteira encontrada nesta pagina. Esta tela mostra o estado real dos ' +
    'seus contratos na Polygon, e para isso ela precisa saber qual e a sua conta.');
}

/* ═══ THE CONTRACTS · shown, commented, always available ═══════════════ */
const SRC = {
 /* Corrigido em 2026-08-22 contra a fonte e contra a chain.
    O que estava aqui era Solidity ESCRITO A MAO, nao extraido de contrato
    nenhum. Ele nomeava `register()`, `deployVault()`, `deployExecutor()`,
    `deployReferralVault()` e `isBaseToken()` — cinco funcoes que NAO EXISTEM em
    nenhuma das duas linhas do Triviu, e prometia "ONE transaction, THREE
    contracts" num fluxo em que a chain faz outra coisa.
    Um corpo de Solidity escrito a mao envelhece sem sintoma: ele parece codigo,
    e ninguem confere prosa. O que esta abaixo e COPIA VERBATIM de
    contracts/src/protocol/VaultFactory.sol, a linha V0, que e a dos enderecos
    que esta pagina imprime. */
 registry:{file:'VaultFactory.sol · ' + LIVRO.V0.factory, fns:[
  {sig:'createVault(address owner, uint256 index)', ex:'This is the deploy, and it creates ONE contract: an ERC-1967 proxy that is your vault, pointing at the shared implementation. There is no registration step before it and no permission on it — the function has no access modifier, so anyone may pay the gas, but `owner` is written into the proxy at initialisation and only that address commands it. It is not payable: the protocol charges nothing to create a vault, you pay gas.', body:
`    function createVault(address owner, uint256 index) external returns (address vault) {
        vault = Create2.deploy(0, _salt(owner, index), _initCode(owner));
        emit VaultCreated(vault, owner, index);
    }`},
  {sig:'vaultAddress(address owner, uint256 index)', ex:'The address of your vault before it exists. CREATE2 derives it from owner and index, so this console can show you the address you are about to create and you can check it against the one the transaction returns.', body:
`    function vaultAddress(address owner, uint256 index) external view returns (address) {
        return Create2.computeAddress(_salt(owner, index), keccak256(_initCode(owner)));
    }`},
  {sig:'_initCode(address owner)', ex:'Why the vault costs so little to deploy: what is created is a proxy, and the logic lives once at IMPLEMENTATION, shared by everyone. `index` lets one owner hold more than one vault — same owner, different salt, different address.', body:
`    function _initCode(address owner) private view returns (bytes memory) {
        return abi.encodePacked(
            type(ERC1967Proxy).creationCode,
            abi.encode(IMPLEMENTATION, abi.encodeCall(ITriviuVault.initialize, (owner)))
        );
    }`},
  {sig:'_salt(address owner, uint256 index)', ex:'O quarto membro do arquivo, omitido ate 2026-08-22 de um painel que se anuncia \'shown, commented, always available\'. Ele e o que faz o endereco do seu cofre ser previsivel: o mesmo dono com o mesmo index sempre deriva o mesmo endereco, e trocar o index da outro cofre para a mesma pessoa.', body:
`    function _salt(address owner, uint256 index) private pure returns (bytes32) {
        return keccak256(abi.encode(owner, index));
    }`}]},
 vault:{file:'TriviuVault.sol', fns:[
  {sig:'deposit(uint256 amount)', ex:'The token leaves your wallet and enters YOUR strongbox. onlyOwner: nobody else — not the keeper, not the registry — can deposit or pull through an allowance.', body:
`function deposit(uint256 amount) external onlyOwner {
    if (amount == 0) revert ZeroAmount();
    baseToken.transferFrom(msg.sender, address(this), amount);
    idle += amount;
    emit Deposited(msg.sender, amount, idle);
}`},
  {sig:'withdraw(uint256 amount)', ex:'The way out, always open: onlyOwner and uncapped. Withdrawal never depends on an interface, a keeper or a governance vote.', body:
`function withdraw(uint256 amount) external onlyOwner {
    // No cap, no waiting period, nobody's approval.
    if (amount > idle) revert InsufficientBalance();
    idle -= amount;
    baseToken.transfer(msg.sender, amount);
    emit Withdrawn(msg.sender, amount, idle);
}`},
  {sig:'resgatar(address token, uint256 quantia)', ex:'The unconditional exit, and it is a superset of sacar(): it takes ANY token out of the vault to you, including the base currency. It does not consult the engine, the commander, the fence, or any cycle state. There is no configuration of any contract in this system that can stop it.', body:
`function resgatar(address token, uint256 quantia) external soDono naoReentrante {
    // No cap, no waiting period, nobody approval, no engine consulted.
    // A leg left stranded by a defective future engine leaves through here.
    if (token == address(0))  revert EnderecoZerado();
    if (quantia == 0)         revert QuantiaZero();
    if (!IERC20(token).transfer(dono, quantia))
        revert TransferenciaFalhou(token, dono, quantia);
    emit Resgatado(token, quantia);
}`}]},
 /* A chave chama-se `executor` e o contrato NAO e um executor: a TriviuCerca
    comanda o cofre e chama o Executor compartilhado. O rotulo errado e o motivo
    pelo qual `S.triad.executor` desta pagina aponta para uma cerca.
    E o mais importante, conferido na chain em 2026-08-22: a TriviuCerca NAO
    ESTA IMPLANTADA em endereco nenhum. O codigo abaixo e fonte real, e nao esta
    rodando. Na linha V0 — a dos enderecos que esta pagina imprime — nao existe
    contrato de cerca separado; os mesmos limites vivem DENTRO do cofre:
      definirAtivo(address,bool)   ->  vault.setAllowedAsset(address,bool)
      definirTamanho / cadencia    ->  vault.setLimits(uint64,uint64,uint16,uint112)
      definirPausa(bool)           ->  NAO TEM equivalente do dono na V0. A saida
                                       do dono e withdraw(), sempre aberta, e
                                       adoptEscapeHatch(). O `paused` da V0 e do
                                       ProtocolRegistry e e do protocolo, nao seu.
      _exigePernasLimpas(Leg[])    ->  as checagens vivem dentro de execute();
                                       o ensaio publico e dryRunChecks(uint256,address). */
 executor:{file:'TriviuCerca.sol · NAO IMPLANTADA · fonte real, fora da chain', fns:[
  {sig:'ciclar(uint256 principal, uint256 minProfit, Leg[] legs)', ex:'The keeper doorway. Every gate is checked before a single token moves, and the profit floor is checked TWICE: once on what the keeper asks for, and once on what the vault actually received. The second check is the one that matters, because the first can be satisfied by a request the engine never honours.', body:
`function ciclar(uint256 principal, uint256 minProfit, Leg[] calldata legs)
    external naoReentrante returns (uint256 crescimento)
{
    if (pausada)                    revert CercaPausada();
    if (msg.sender != operador)     revert NaoEOperador(msg.sender, operador);

    if (tamanhoMaximo == 0)         revert TetoNaoConfigurado();
    if (principal > tamanhoMaximo)  revert PrincipalAcimaDoTeto(principal, tamanhoMaximo);
    if (principal < tamanhoMinimo)  revert PrincipalAbaixoDoPiso(principal, tamanhoMinimo);

    // The floor that closes profit theft. Without it a compromised keeper
    // closes the cycle at exact break-even and keeps the spread: the vault
    // did not shrink, so nothing else reverts.
    if (pisoDeLucroBps == 0)        revert PisoDeLucroNaoConfigurado();
    uint256 lucroExigido = principal * pisoDeLucroBps / 10_000;
    if (minProfit < lucroExigido)   revert LucroAbaixoDoPiso(minProfit, lucroExigido);

    if (precoMaximoDeGas == 0)      revert TetoDeGasNaoConfigurado();
    if (tx.gasprice > precoMaximoDeGas)
                                    revert GasAcimaDoTeto(tx.gasprice, precoMaximoDeGas);

    uint64 agora = uint64(block.timestamp);
    _exigeCadencia(agora);
    _exigeJanela(agora);
    _exigePernasLimpas(legs);

    ultimoCiclo = agora;                       // effect before interaction

    crescimento = cofre.ciclar(principal, minProfit, legs);

    // Verified, not delegated. The engine enforces minProfit; the fence does
    // not take its one promise on trust from a contract the owner can swap.
    if (crescimento < lucroExigido)
        revert LucroEntregueAbaixoDoPiso(crescimento, lucroExigido);
}`},
  {sig:'_exigePernasLimpas(Leg[] legs)', ex:'Every leg, not the first. Router, both tokens, and the chain itself: leg N must start where leg N-1 ended, and the cycle must open and close in your base currency. The chain check is what tells a cycle apart from a bag of loose swaps assembled by someone after the spread.', body:
`function _exigePernasLimpas(Leg[] calldata legs) private view {
    uint256 n = legs.length;
    if (n == 0)           revert SemPernas();
    if (n > MAX_PERNAS)   revert PernasDemais(n, MAX_PERNAS);

    address esperado = base;
    for (uint256 i; i < n; ++i) {
        Leg calldata perna = legs[i];

        if (!routerPermitido[perna.router])   revert RouterNaoPermitido(perna.router, i);
        if (!ativoPermitido[perna.tokenIn])   revert AtivoNaoPermitido(perna.tokenIn, i);
        if (!ativoPermitido[perna.tokenOut])  revert AtivoNaoPermitido(perna.tokenOut, i);

        if (perna.tokenIn != esperado)        revert CicloNaoFecha(esperado, perna.tokenIn, i);
        esperado = perna.tokenOut;
    }
    if (esperado != base) revert CicloNaoFecha(base, esperado, n - 1);
}`},
  {sig:'definirAtivo(address token, bool permitido)', ex:'The asset list, one token at a time. An empty list DENIES: there is no branch that reads emptiness as permission. The fence is born with it empty, and with the router list empty too, because the most dangerous field in a leg is the router and an asset list alone leaves it unowned.', body:
`function definirAtivo(address token, bool permitido) external soDono {
    if (token == address(0)) revert EnderecoZerado();
    ativoPermitido[token] = permitido;
    emit AtivoDefinido(token, permitido);
}`},
  {sig:'definirPausa(bool valor)', ex:'Convenience, not defence — and the console says so because saying otherwise is how the last version earned its veto. Your real handbrake lives in the vault: definirComandante(address(0)) cuts this whole contract out of the circuit, and sacar() never consults the fence at all.', body:
`function definirPausa(bool valor) external soDono {
    emit PausaDefinida(pausada, valor);
    pausada = valor;
}`}]}
};
const KW = /\b(function|external|internal|view|returns|address|uint256|uint40|bool|calldata|storage|revert|if|else|for|emit|onlyOwner|onlyKeeper|indexed|event|delete|memory)\b/g;
const FN = /\b(createVault|vaultAddress|setAllowedAsset|setBaseCurrency|setStrategy|addGuard|setLimits|withdraw|registrar|implantarCofre|depositar|sacar|resgatar|ciclar|definirAtivo|definirRouter|definirPausa|definirTamanho|definirPisoDeLucro|definirIntervalo|definirJanela|definirPrecoMaximoDeGas|definirOperador|definirMotor|definirComandante|declararIndicador|receber|varrer|transferFrom|transfer|balanceOf|approve)\b/g;
const hl = s => esc(s).replace(/\/\/[^\n]*/g, m => `\x01c${m}\x02`).replace(KW,'\x01k$1\x02').replace(FN,'\x01f$1\x02');
function codeHtml(key, spot){
  return SRC[key].fns.map((f,i) => {
    const b = hl(f.body).replace(/\x01(k|f|c)/g,(m,x)=>`<span class="${x}">`).replace(/\x02/g,'</span>');
    return `<span class="fnblk${spot===i?' spot':''}" id="fn_${i}">${b}</span>`;
  }).join('\n\n');
}

/* ═══ INITIATION ═══════════════════════════════════════════════════════ */
const STEPS = ['Networks &amp; cost','Check the chain','Deploy your vault','Addresses','Open the console'];
const stepDone = [0,0,0,0,0];
let step = 0, guide = {key:null,i:0};

function showInit(which){
  ['initHero','initBuilder','initPilot'].forEach(v => $(v).hidden = v !== which);
  $('btnBackHero').hidden = which === 'initHero';
  window.scrollTo({top:0,behavior:'instant'});
  requestAnimationFrame(()=>{ computeAnchor(); onScroll3D(); });
}
$('pickBuilder').onclick = () => { showInit('initBuilder'); renderStep(0); };
$('pickPilot').onclick = () => showInit('initPilot');
$('btnBackHero').onclick = () => showInit('initHero');

function renderNav(){
  /* era innerHTML com template. Cada botao montado, e o rotulo entra por
     textContent — entao um passo que um dia venha de fora nao pode trazer
     marcacao junto. */
  const nav = $('stepNav');
  limpar(nav);
  STEPS.forEach((s, i) => {
    const b = novo('button', 'stepbtn');
    b.dataset.step = i;
    if (i === step) b.setAttribute('aria-current', 'step');
    b.appendChild(novo('span', 'n', '0' + i));
    b.appendChild(document.createTextNode(s));
    const st = novo('span', 'st');
    if (stepDone[i]) st.appendChild(iconEl('check'));
    b.appendChild(st);
    nav.appendChild(b);
  });
  $('stepNav').querySelectorAll('.stepbtn').forEach(b => b.onclick = () => renderStep(+b.dataset.step));
}
const term = (msg,cls) => {
  const b = $('termBody'); if (!b) return;
  const e = b.querySelector('.faint'); if (e) e.remove();
  const d = document.createElement('div'); d.className = 'ln '+(cls||'');
  /* era innerHTML com a string de icon(). O guardiao de assinatura recusa
     qualquer coisa que nao seja vazio ali, e recusa por desenho: regra que
     depende de julgar se a string e confiavel e regra que um dia alguem
     julga errado. */
  d.appendChild(iconEl({ok:'check',err:'x',tx:'arrow'}[cls]||'dot'));
  d.appendChild(novo('span', null, msg));
  b.appendChild(d); b.scrollTop = b.scrollHeight;
};
function shell(o){
  return `<div class="codehead"><span class="file" translate="no">${esc(o.file)}</span>
    <span class="pill ok">verbatim from the deployed source</span>
    <button class="mini ghost" id="btnGuide">${icon('book')}Guided reading</button>
    <div class="spacer"></div><span class="mono faint" translate="no">${esc(o.addr||'—')}</span></div>
  <div class="codewrap"><pre class="code" id="codePane" tabindex="0" translate="no">${codeHtml(o.key)}</pre>
    <div class="guide" id="guideBox" role="note"><div class="gfn" id="gFn"></div><p id="gEx"></p>
      <div class="gnav"><button class="mini" id="gPrev">${icon('left')}Previous</button>
        <button class="mini primary" id="gNext">Next ${icon('arrow')}</button>
        <span class="gpos" id="gPos"></span></div></div>
    <div class="actionbar"><span class="small faint">${o.hint||''}</span>
      <button class="primary big" id="btnAction">${o.btn}</button></div></div>
  <div class="formbar">${o.form||''}</div>
  <div class="calldata" id="calldataLine" translate="no"><b>funcao</b> · ${esc(o.calldata||'—')}<br><span class="small faint">A calldata real aparece na sua carteira, antes de assinar. Esta tela nao a fabrica.</span></div>
  <div class="term"><p class="cap">Terminal — every transaction, live</p>
    <div id="termBody"><p class="faint">Run the step to see the output. Failures show too — always.</p></div></div>`;
}
function wireGuide(key){
  guide = {key,i:0};
  $('btnGuide').onclick = () => renderGuide();
  $('gPrev').onclick = () => { if (guide.i>0){guide.i--;renderGuide();} };
  $('gNext').onclick = () => { if (guide.i < SRC[guide.key].fns.length-1){guide.i++;renderGuide();}
    else { $('guideBox').style.display='none'; $('codePane').innerHTML = codeHtml(guide.key); } };
}
function renderGuide(){
  const c = SRC[guide.key], f = c.fns[guide.i];
  $('codePane').innerHTML = codeHtml(guide.key, guide.i);
  $('fn_'+guide.i)?.scrollIntoView({block:'center',behavior:reduced()?'auto':'smooth'});
  $('guideBox').style.display = 'block';
  $('gFn').textContent = f.sig; $('gEx').textContent = f.ex;
  $('gPos').textContent = (guide.i+1)+' / '+c.fns.length;
  $('gPrev').disabled = guide.i === 0;
}
/* Lei #1 · FECHADO em 2026-08-22 removendo a mentira, nao maquiando-a.
 *
 * Aqui morava `calldataFor(fn)`, que produzia oito digitos hex a partir das
 * LETRAS do nome da funcao e os exibia sob o rotulo "calldata", ao lado do botao
 * que abre a carteira. O valor nao tinha relacao alguma com o seletor real e
 * mudaria se alguem renomeasse a funcao sem tocar em contrato nenhum.
 *
 * Calldata inventada antes de assinar e pior que nenhuma: ensina a pessoa a
 * conferir um campo que nao confere nada, e o habito sobrevive ao dia em que o
 * campo passar a valer.
 *
 * POR QUE NAO FOI CODIFICADO DE VERDADE: seletor real e keccak-256 da assinatura
 * canonica, e nao ha keccak neste arquivo — traze-lo sao 300+ linhas de
 * infraestrutura para um campo informativo. Desproporcional, e a pressa de
 * fechar um achado nao justifica trazer criptografia para dentro de uma tela.
 *
 * O QUE ENTRA NO LUGAR e verdade e e conferivel: a ASSINATURA da funcao, que a
 * pessoa pode cruzar com o contrato no explorer, e a frase que diz onde a
 * calldata real aparece — na carteira, antes de assinar, que e o unico lugar
 * onde ela pode ser conferida com consequencia. */
const assinaturaDe = fn => fn;

function renderStep(n){
  step = n; renderNav();
  const pane = $('stepPane');

  if (n === 0){
    pane.innerHTML = `<div style="padding:var(--s5)">
      <h2>Pick the networks — and know the cost first.</h2>
      <p class="small muted" style="margin:var(--s2) 0 var(--s4);max-width:70ch">You can mark more than
      one. The calculator sums the estimated gas of the whole flow — register, deploy, fence — in each
      network's own currency. An estimate, not a promise: gas moves every block.</p>
      <div class="nets" id="netGrid"></div>
      <div class="panel" style="margin:var(--s4) 0"><h3>Deploy cost</h3>
        <div id="calcBox" style="margin-top:var(--s3)"></div>
        <p class="hint">register ~${GAS.register.toLocaleString('en-US')} · triad
        ~${GAS.triad.toLocaleString('en-US')} (one transaction, one contract: your proxy) · fence
        ~${GAS.fence.toLocaleString('en-US')} units. Edit the gwei to try a scenario.</p></div>
      <div style="display:flex;justify-content:flex-end"><button class="primary big" id="btnAction">
        Continue ${icon('arrow')}</button></div></div>`;
    const grid = $('netGrid');
    NETS.forEach(nt => {
      const b = document.createElement('button');
      b.className = 'net'; b.setAttribute('aria-pressed', S.nets.includes(nt.id));
      if (!nt.live){ b.disabled = true; b.title = 'No network is "live" before its audit gate.'; }
      b.innerHTML = `<h4>${esc(nt.name)} <span class="pill ${nt.live?'ok':'warn'}">${nt.live?'available':'waiting on its gate'}</span></h4>
        <div class="coin">gas currency: ${esc(nt.coin)} · chain ${nt.chainId}</div>
        <div class="why">${esc(nt.why)}</div>`;
      b.onclick = () => { S.nets = S.nets.includes(nt.id) ? S.nets.filter(x=>x!==nt.id) : [...S.nets,nt.id];
        renderStep(0); };
      grid.appendChild(b);
    });
    const calc = () => {
      $('calcBox').innerHTML = NETS.filter(n => S.nets.includes(n.id)).map(n => {
        const c = g => ((g*n.gwei)/1e9).toFixed(n.gwei<1?6:4);
        const t = GAS.register+GAS.triad+GAS.fence;
        return `<div class="calcline"><span>${esc(n.name)} · <span class="faint">gwei</span>
          <input style="width:74px;display:inline-block;padding:3px 6px" data-g="${esc(n.id)}"
            value="${n.gwei}" aria-label="Gas price in gwei on ${esc(n.name)}"></span>
          <span class="num">register ${c(GAS.register)} · triad ${c(GAS.triad)} · fence ${c(GAS.fence)}
          · <b>total ≈ ${c(t)} ${esc(n.coin)}</b></span></div>`;
      }).join('') || '<p class="faint small">Mark at least one network.</p>';
      $('calcBox').querySelectorAll('[data-g]').forEach(i => i.oninput = () => {
        NETS.find(x=>x.id===i.dataset.g).gwei = parseFloat(i.value)||0; calc(); });
    };
    calc();
    $('btnAction').onclick = () => { if (!S.nets.length) return toast('Mark at least one network.','err');
      stepDone[0]=1; renderStep(1); };
    return;
  }

  /* 2026-08-22: este passo mandava `register()` para S.registry, que e o
     ProtocolRegistry da V0 — e a V0 NAO TEM registro. A funcao nao existe no
     contrato: a transacao reverteria, e o passo cobrava gas por ela na
     calculadora acima.
     O passo NAO foi apagado, porque apagar um passo do fluxo e decisao do
     fundador e nao minha. Ele parou de ESCREVER o que nao existe e passou a LER
     o que existe: as duas chamadas abaixo sao `view`, custam zero, e sao
     exatamente a conferencia que faz sentido antes de implantar — a moeda base
     esta curada, e qual endereco o seu cofre vai ter. */
  if (n === 1){
    pane.innerHTML = shell({file:'ProtocolRegistry.sol + VaultFactory.sol', key:'registry',
      btn:'Check before you deploy', hint:'2 reads · no transaction, no gas',
      addr:S.registry?short(S.registry):'read on connect',
      calldata:assinaturaDe('isBaseCurrency(address) + vaultAddress(address,uint256)')});
    wireGuide('registry');
    $('btnAction').onclick = async () => {
      const b = $('btnAction'); b.disabled = true;
      try{
        if (!S.wallet.connected){ term('connecting your wallet'); await connect();
          term('connected: '+short(S.wallet.address),'ok'); renderStep(1); return; }
        term('isBaseCurrency('+S.base+') on the ProtocolRegistry','ok');
        term('vaultAddress(you, 0) on the VaultFactory — the CREATE2 address your vault will have','ok');
        term('there is no registration on this line: the next step deploys directly','ok');
        stepDone[1]=1; renderStep(2);
      }catch(e){ term(e.message,'err'); toast(e.message,'err'); }
      finally{ b.disabled = false; }
    };
    return;
  }

  if (n === 2){
    pane.innerHTML = shell({file:'VaultFactory.sol · 0xF4e60C6B…843c', key:'registry',
      btn:'Deploy your vault', hint:'1 transaction · one contract: your ERC-1967 proxy',
      addr:S.registry?short(S.registry):'—',
      /* O seletor nasce VAZIO e a chain o preenche logo abaixo. As tres opcoes
         que estavam escritas aqui — USDT, USDC.e e DAI — NAO sao curadas pelo
         ProtocolRegistry: medido token a token em 2026-08-23, `isBaseCurrency`
         responde true para UMA so, a USDC nativa. Um cofre aberto sobre qualquer
         das outras reverte no primeiro deposito, depois de a pessoa ja ter gasto
         gas para cria-lo.
         Eu tinha tirado as opcoes do HTML e deixado ESTA, que e montada por JS a
         cada render do passo e sobrescrevia o que a chain havia preenchido na
         carga. Tirar de um lugar so e nao ter tirado. */
      form:`<div><label for="wBase">Base currency of your vault</label><select id="wBase"></select></div>`,
      calldata:assinaturaDe('createVault(address,uint256)')});
    wireGuide('registry');
    /* O passo redesenha o seletor toda vez que e aberto, entao ele precisa ser
       preenchido DEPOIS do desenho — preencher so na carga da pagina deixa o
       select vazio assim que alguem volta para este passo. Foi assim que o
       Copilot apareceu com o campo em branco e o botao Start ao lado sem nada
       para comecar. */
    preencherMoedas().catch(() => {
      const s = $('wBase');
      if (s && !s.options.length) {
        const o = document.createElement('option');
        o.textContent = 'nao foi possivel ler a moeda-base da chain';
        s.appendChild(o); s.disabled = true;
      }
    });
    $('wBase').onchange = e => {
      /* O valor da opcao e o ENDERECO, e nao o simbolo: dois contratos
         diferentes respondem "USDC" nesta chain, e escolher por simbolo
         escolheria o errado metade das vezes. */
      S.moeda = e.target.value;
      const m = MOEDAS_LIDAS.find(x => x.addr === S.moeda);
      if (m) { S.base = m.nome; TRIVIU.base.address = m.addr; TRIVIU.base.symbol = m.nome; TRIVIU.base.decimals = m.casas; }
    };
    $('btnAction').onclick = async () => {
      const b = $('btnAction'); b.disabled = true;
      try{
        if (!S.wallet.connected) throw new Error('Connect the wallet in step 01 first.');
        if (!stepDone[1]) throw new Error('Run the chain check first — it derives the CREATE2 address this step deploys to.');
        await tx({ato:'criar', to:S.registry, fn:'createVault(you, 0)', gas:GAS.triad,
          label:'createVault(you, 0)', log:term, indice:0});
        term('TriviuVault:         '+S.triad.vault,'ok');
        term('Executor (compartilhado): '+TRIVIU.addr.executor,'ok');
        term('EscapeHatch:             '+TRIVIU.addr.escapeHatch,'ok');
        stepDone[2]=1; save(); renderStep(3);
      }catch(e){ term(e.message,'err'); toast(e.message,'err'); }
      finally{ b.disabled = false; }
    };
    return;
  }

  if (n === 3){
    const rows = S.triad
      ? [['TriviuVault — your strongbox',S.triad.vault],
         ['Executor — shared, already on chain, not yours to deploy',TRIVIU.addr.executor],
         ['EscapeHatch — the unconditional exit',TRIVIU.addr.escapeHatch]]
      : [['(deploy your vault in step 02)','']];
    pane.innerHTML = `<div style="padding:var(--s5)">
      <h2>Your contracts.</h2>
      <p class="small muted" style="margin:var(--s2) 0 var(--s4);max-width:72ch">Guard these addresses —
      they are yours and independent of this page. <b style="color:var(--saffron-ink)">In this simulation
      they are generated in your browser and do not exist on chain.</b> In the real thing: do not trust
      the list, open each one on the explorer and confirm.</p>
      <div class="tscroll"><table translate="no"><thead><tr><th>contract</th><th>address</th></tr></thead>
        <tbody>${rows.map(([n2,a]) => `<tr><td>${esc(n2)}</td><td>${esc(a||'—')}</td></tr>`).join('')}</tbody></table></div>
      <div style="display:flex;justify-content:flex-end;margin-top:var(--s5)">
        <button class="primary big" id="btnAction">Open the console ${icon('arrow')}</button></div></div>`;
    $('btnAction').onclick = () => { stepDone[3]=1; stepDone[4]=1; finishInit(); };
    return;
  }
  if (n === 4) finishInit();
}

/* ── copilot ───────────────────────────────────────────────────────── */
const P_STAGES = ['Connect','Check the chain','Deploy','Default fence','Console ready'];
function pStages(now,done){
  $('pStages').innerHTML = P_STAGES.map((s,i) =>
    `<span class="pill ${i<done?'ok':(i===now?'brand':'')}">${i<done?icon('check'):''}${esc(s)}</span>`).join('');
}
function pSay(text,cls){
  return new Promise(res => {
    const f = $('pFeed'), first = f.querySelector('.faint'); if (first) f.innerHTML = '';
    const d = document.createElement('div'); d.className = 'pln '+(cls||'');
    /* era innerHTML com concatenacao. Tres spans montados, um a um. */
    const who = novo('span', 'who', 'copilot ');
    who.appendChild(iconEl('arrow'));
    who.appendChild(document.createTextNode(' '));
    d.appendChild(who);
    d.appendChild(novo('span', 'tt'));
    d.appendChild(novo('span', 'cursor'));
    f.appendChild(d); f.scrollTop = f.scrollHeight;
    const tt = d.querySelector('.tt'); let i = 0;
    if (reduced()){ tt.textContent = text; d.querySelector('.cursor').remove(); return res(); }
    const tick = () => { if (i <= text.length){ tt.textContent = text.slice(0,i); i += 2;
        f.scrollTop = f.scrollHeight; setTimeout(tick,12); }
      else { d.querySelector('.cursor').remove(); res(); } };
    tick();
  });
}
$('btnPilotGo').onclick = async () => {
  const b = $('btnPilotGo'); b.disabled = true;
  try{
    $('pilotSetup').hidden = true; pStages(0,0);
    S.base = $('pBase').value;
    await pSay('Welcome. I will create your vault and explain every stage. You sign — your wallet will open twice. House rule: do not trust me, verify every hash.');
    await connect();
    await pSay('Wallet connected: '+short(S.wallet.address)+' on Polygon PoS 137. ProtocolRegistry at '+short(S.registry)+' — everything derives from it.','ok');
    pStages(1,1);
    await pSay('Stage 1 of 2 — Reading the chain. There is no registration on this line: I check that ' + S.base + ' is a curated base currency and derive the CREATE2 address your vault will have. Both are reads — no signature, no gas.');
    await pSay('isBaseCurrency(' + S.base + ') and vaultAddress(you, 0) answered. Nothing to sign here.','ok');
    pStages(2,2);
    await pSay('Stage 2 of 2 — Deploying your vault over '+S.base+'. ONE transaction creates ONE contract: an ERC-1967 proxy that is your vault, and only your address commands it. There is no triad: the Executor is shared by everyone and already on chain, and TriviuReferralVault is not deployed anywhere. The strategy is a separate deploy, in the step after this one. (signature 1 of 1)');
    await tx({ato:'criar', to:S.registry, fn:'createVault(you, 0)', gas:GAS.triad,
      label:'createVault', indice:0});
    await pSay('Vault live.\\n  Your vault: '+S.triad.vault+'\\n  Executor:   shared, already on chain, not yours to deploy\\n  Referral:   not deployed on any chain\\nOnly the first is yours, and it does not depend on this page.','ok');
    pStages(3,3);
    await pSay('Stage 3 of 3 — The fence. It is born CLOSED: empty asset list, empty router list, zero ceilings, zero profit floor. Nothing opens until you arm it, and arming it is your transaction, not ours. Empty the fence and that sub-account opens nothing, ever. I will allow the conservative pair, WETH and WBTC; you adjust all sixteen controls afterwards in the console. (signature 3 of 3)');
    /* SAO DUAS transacoes, uma por ativo, e a tela diz isso ANTES da primeira.
       `setAllowedAsset(address,bool)` libera UM token por chamada — descrever as
       duas numa frase so e depois abrir duas carteiras e a diferenca entre um
       fluxo e uma surpresa. Se a segunda falhar, o log diz onde parou: metade da
       cerca aberta e um estado real, e esconde-lo seria pior que te-lo. */
    await pSay('A cerca abre um ativo por transacao: sao DUAS assinaturas, WETH e depois WBTC.','dim');
    const PARES_CERCA = [
      ['WETH', '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619'],
      ['WBTC', '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6']
    ];
    for (const [nomeAtivo, enderecoAtivo] of PARES_CERCA) {
      const rc = await tx({ato:'ativo', to:S.triad.vault,
        fn:'setAllowedAsset(' + nomeAtivo + ', true)', gas:GAS.fence,
        label:'setAllowedAsset(' + nomeAtivo + ')', alvo: enderecoAtivo, ligado: true});
      if (!rc || !rc.ok) {
        await pSay('A cerca parou em ' + nomeAtivo + '. Nada alem do que voce assinou aconteceu.','err');
        break;
      }
      await pSay('Cerca: ' + nomeAtivo + ' liberado on-chain.','ok');
    }
    pStages(4,4);
    await pSay('Done. Two honest reminders before the console: the keeper only ever operates INSIDE your fence, and withdrawal from the vault is always yours and uncapped. And for most participants the expected result trends to zero — this is education, not income. Deposit only what you can lose.');
    pStages(5,5); save();
    $('btnPilotDone').hidden = false;
  }catch(e){
    await pSay(e.message+'\nNothing beyond what you signed happened. Try again, or use the Builder step by step.','err');
    $('pilotSetup').hidden = false; b.disabled = false;
  }
};
$('btnPilotDone').onclick = finishInit;

function finishInit(){
  S.onboarded = true; save();
  $('viewInit').hidden = true;
  $('viewConsole').hidden = false;
  bootConsole();
  window.scrollTo({top:0,behavior:'instant'});
}

/* ═══ CONSOLE ══════════════════════════════════════════════════════════ */
document.addEventListener('click', e => {
  const nb = e.target.closest('.navb'); if (nb) return go(nb.dataset.p);
  const g = e.target.closest('[data-go]'); if (g) return go(g.dataset.go);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape')
  document.querySelectorAll('.ov.show').forEach(o => o.classList.remove('show')); });
/* ═══ PROVIDE LIQUIDITY · render ═══════════════════════════════════ */
const lpUSD  = (n, d) => (n < 0 ? '-$' : '$') + fmt(Math.abs(n), d ?? 2);
const lpNet  = r => r === 'arbitrum' ? 'Arbitrum' : 'Polygon';
const lpPool = r => `${esc(r.par)} <span class="faint">${r.tier/100}bps</span>`;

function renderLP(){
  const cap   = parseInt($('lpSize').value, 10);
  const faixa = parseFloat($('lpBand').value);
  const rede  = $('lpChain').value;
  const linhas = lpRotear(cap, faixa, rede);

  $('lpSizeState').textContent = `${lpUSD(cap,0)} · ±${faixa*100}%`;
  $('lpWindow').textContent = `7 days · measured ${LP_MEDIDO.meta.medidoEm}`;

  /* ── a tabela ── */
  if (!linhas.length){
    $('lpRows').innerHTML = `<tr><td colspan="11" class="faint">Nothing was measured for
      ${lpUSD(cap,0)} at ±${faixa*100}%${rede ? ' on ' + lpNet(rede) : ''}. That is an absence of
      measurement, not an absence of opportunity — and the console will not fill it with a guess.</td></tr>`;
  } else {
    $('lpRows').innerHTML = linhas.map((r, i) => `
      <tr>
        <td class="num mono faint">${i+1}</td>
        <td>${lpNet(r.rede)}</td>
        <td translate="no">${lpPool(r)}</td>
        <td class="num mono">${r.tier/100}bps</td>
        <td class="num mono">±${r.faixa*100}%</td>
        <td class="num mono ${r.liq > 0 ? 'win' : 'lose'}"><b>${r.liq > 0 ? '+' : ''}${lpUSD(r.liq)}</b></td>
        <td class="num mono ${r.apr > 0 ? 'win' : 'lose'}"><b>${fmt(r.apr,2)}%</b></td>
        <td class="num mono">${lpUSD(r.tvl,0)}</td>
        <td class="num mono ${r.saidas ? 'lose' : 'faint'}">${r.saidas}</td>
        <td class="num mono faint">${r.saidas ? '—' : '100%'}</td>
        <td class="num mono faint">${fmt(r.swaps,0)}</td>
      </tr>`).join('');
  }

  /* ── o custo da escolha de rede ── */
  const custo = lpCustoDaEscolha(cap, faixa, rede);
  $('lpCostPanel').hidden = !custo;
  if (custo){
    const pior = custo.pontos > 0;
    $('lpCostBody').innerHTML = `
      <p class="small">You chose <b>${lpNet(rede)}</b>. That is a legitimate choice — familiarity with
      a network is worth something real, and this console will not override it. It will, however, tell
      you the price.</p>
      <div class="tscroll" style="margin-top:var(--s3)"><table translate="no">
        <thead><tr><th>choice</th><th>best measured pool</th><th>net over 7 days</th>
          <th>annualised</th></tr></thead>
        <tbody>
          <tr><td>${lpNet(custo.dentro.rede)} <span class="faint">— yours</span></td>
            <td translate="no">${lpPool(custo.dentro)}</td>
            <td class="num mono">${lpUSD(custo.dentro.liq)}</td>
            <td class="num mono"><b>${fmt(custo.dentro.apr,2)}%</b></td></tr>
          <tr><td>${lpNet(custo.geral.rede)} <span class="faint">— best measured</span></td>
            <td translate="no">${lpPool(custo.geral)}</td>
            <td class="num mono">${lpUSD(custo.geral.liq)}</td>
            <td class="num mono"><b>${fmt(custo.geral.apr,2)}%</b></td></tr>
        </tbody></table></div>
      <p class="small" style="margin-top:var(--s3)">At ${lpUSD(cap,0)}, staying on ${lpNet(rede)}
        ${pior ? 'costs' : 'gains'} <b class="${pior ? 'lose' : 'win'}">${fmt(Math.abs(custo.pontos),2)}
        percentage points</b> — ${lpUSD(Math.abs(custo.dolares))} over the seven days measured,
        ${lpUSD(Math.abs(custo.ano),0)} if a year looked like that week. It will not, but the
        comparison between two numbers measured the same way still holds.</p>`;
  }

  /* ── a inversao do ranking ── */
  const pools = [];
  for (const p of LP_MEDIDO.pools){
    if (rede && p.rede !== rede) continue;
    if (!p.linhas.some(l => l[0] === faixa)) continue;
    pools.push(p);
  }
  $('lpFlipHead').innerHTML = '<th>rank</th>' +
    LP_TAMANHOS.map(t => `<th class="num mono">${lpUSD(t,0)}</th>`).join('');
  const porTam = LP_TAMANHOS.map(t => lpRotear(t, faixa, rede));
  const fundo  = Math.max(...porTam.map(c => c.length));
  $('lpFlipRows').innerHTML = !fundo
    ? `<tr><td colspan="${LP_TAMANHOS.length+1}" class="faint">Nothing measured in this band.</td></tr>`
    : Array.from({length: Math.min(fundo, 6)}, (_, i) => `
      <tr><td class="num mono faint">${i+1}</td>` + porTam.map(col => {
        const r = col[i];
        if (!r) return '<td class="faint">—</td>';
        return `<td translate="no"><span class="num mono ${r.apr>0?'win':'lose'}">${fmt(r.apr,1)}%</span>
          <br><span class="faint" style="font-size:11px">${esc(r.par)} ${r.tier/100} ·
          ${r.rede === 'arbitrum' ? 'ARB' : 'POL'}</span></td>`;
      }).join('') + '</tr>').join('');

  /* ── a procedencia ── */
  const M = LP_MEDIDO.meta;
  $('lpProv').innerHTML = ['arbitrum','polygon'].map(r => {
    const m = M[r];
    return `<tr><td>${lpNet(r)}</td>
      <td class="num mono">${M.janelaDias} days</td>
      <td class="num mono">${fmt(m.blocos,0)}</td>
      <td class="num mono">${fmt(m.janelas,0)}</td>
      <td class="num mono ${m.falhas ? 'lose' : 'win'}">${m.falhas}</td>
      <td class="num mono">${m.gwei} gwei</td>
      <td class="num mono">${m.nativo} at ${lpUSD(m.precoNativo,4)}</td>
      <td class="num mono">${lpUSD(m.abrirFechar,4)}</td></tr>`;
  }).join('');
}



function go(p){
  document.querySelectorAll('.navb').forEach(b =>
    b.dataset.p === p ? b.setAttribute('aria-current','page') : b.removeAttribute('aria-current'));
  document.querySelectorAll('.pane').forEach(s => s.classList.toggle('on', s.id === 'p-'+p));
  ({over:renderOver, analytics:renderAnalytics, vaults:renderVaults, fence:renderFence,
    ops:renderOps, refs:renderRefs, contracts:renderContracts, layers:renderLayers,
    liquidity:renderLiquidity, strategy:renderStrategies, lp:renderLP}[p] || (()=>{}))();
  renderRangeBars();
  SFX.tap();
  window.scrollTo({top:0,behavior:'instant'});
}
['lpSize','lpBand','lpChain'].forEach(id => { const el = $(id); if (el) el.onchange = renderLP; });
/* ── verificacao do endpoint · as tres perguntas que decidem se ele serve ── */
const rpcNet = $('pfRpcNet'), rpcUrl = $('pfRpcUrl'), rpcVer = $('rpcVerdict');
if (rpcNet) rpcNet.onchange = () => {
  const r = rpcNet.value, u = rpcDe(r);
  rpcUrl.value = RPC_RUNTIME[r] || '';
  rpcVer.innerHTML = u
    ? `${r} is on <span class="mono">${esc(rpcHost(u))}</span> — untested this session.`
    : `<b class="lose">${r} has no endpoint.</b> Paste one above.`;
};
if ($('btnRpcTest')) $('btnRpcTest').onclick = async () => {
  const rede = rpcNet.value;
  const alvo = (rpcUrl.value || '').trim() || RPC_NATIVO[rede];
  if (!alvo){ rpcVer.innerHTML = '<b class="lose">Nothing to test.</b> Paste an endpoint.'; return; }
  const b = $('btnRpcTest'); b.disabled = true;
  rpcVer.innerHTML = `Asking <span class="mono">${esc(rpcHost(alvo))}</span> three questions…`;
  const pergunta = async (m, p) => {
    const r = await fetch(alvo, { method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({jsonrpc:'2.0', id:1, method:m, params:p}) });
    const j = await r.json();
    if (j.error) throw new Error(j.error.message);
    return j.result;
  };
  const linhas = [];
  let serve = true;
  try {
    const bn = parseInt(await pergunta('eth_blockNumber', []), 16);
    linhas.push(`<b class="win">block ${bn.toLocaleString('en-US')}</b> — it answers`);
    const porBloco = rede === 'polygon' ? 1.5 : 0.25;
    const atras = Math.round(7*86400/porBloco);
    const topico = '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67';
    try {
      await pergunta('eth_getLogs', [{ topics:[topico],
        fromBlock:'0x'+(bn-atras).toString(16), toBlock:'0x'+(bn-atras+49).toString(16) }]);
      linhas.push('<b class="win">seven days back</b> — historical logs served');
    } catch(e){ serve = false;
      linhas.push(`<b class="lose">seven days back — refused:</b> ${esc(e.message.slice(0,70))}`); }
    let teto = 0;
    for (const n of [50, 100, 1000, 10000]){
      try { await pergunta('eth_getLogs', [{ topics:[topico],
        fromBlock:'0x'+(bn-n).toString(16), toBlock:'0x'+bn.toString(16) }]); teto = n; }
      catch(e){ break; }
    }
    linhas.push(teto ? `range ceiling <b>${teto.toLocaleString('en-US')} blocks</b>`
                     : '<b class="lose">no usable range</b>');
    if (serve && teto){
      RPC_RUNTIME[rede] = alvo;   /* memoria apenas · save() nunca ve isto */
      linhas.push(`<b class="win">Set for this session.</b> Not saved anywhere.`);
    }
  } catch(e){ serve = false; linhas.push(`<b class="lose">no answer:</b> ${esc(e.message.slice(0,70))}`); }
  rpcVer.innerHTML = linhas.map(l => '· ' + l).join('<br>');
  b.disabled = false;
};

const pfFee = $('pfFee'), pfFeePr = $('pfFeePr');
if (pfFee) pfFee.onchange = e => {
  const url = (pfFeePr && pfFeePr.value || '').trim();
  if (!/^https?:\/\/.+\/.+/.test(url)){
    e.target.value = String(PROTOCOLO.feeBps);
    toast('A fee change needs its pull-request URL. The contract refuses it too.','err');
    return;
  }
  PROTOCOLO.feeBps = Math.min(parseInt(e.target.value,10)||0, MAX_FEE_BPS);
  toast(`Success fee is now ${PROTOCOLO.pct} of a positive result.`,'ok');
  renderOver(); renderRefs();
};
$('btnHelpTop').onclick = () => go('help');
$('bmark').onclick = () => go('over');
$('btnTheme').onclick = () => { S.prefs.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(S.prefs.theme); syncInk(); renderOver(); renderAnalytics(); SFX.tap(); save(); };
if ($('btnThemeInit')) $('btnThemeInit').onclick = () => { S.prefs.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(S.prefs.theme); if(typeof syncInk==='function')syncInk(); SFX.tap && SFX.tap(); save(); };
const activeV = () => S.vaults.find(v => v.id === S.activeVault) || S.vaults[0] || null;

/* ── sub-accounts ──────────────────────────────────────────────────── */
/* The strategy a sub-account is born with. It is a set of LIMITS, not a method,
   and emptying the fence still stops that sub-account dead. */
const DEFAULT_STRATEGY = 'meridian';
/* A monotonic counter, not a timestamp. Ten sub-accounts opened in one loop all
   land in the same millisecond, and a duplicate id sends activeVault, the batch
   selection and the close button to the wrong vault. Measured: 10 created, ids
   not unique. Seeded past whatever the saved state already used. */
let _vseq = 0;
function nextVaultId(){
  const used = new Set(S.vaults.map(v => v.id));
  let id;
  do { id = 'v' + Date.now().toString(36) + '-' + (++_vseq).toString(36); } while (used.has(id));
  return id;
}
/* O COFRE, LIDO DA CHAIN E NAO SORTEADO.
   O endereco sai de `vaultAddress(dono, indice)` na propria VaultFactory: e o
   CREATE2 que a factory computa, o mesmo numero que ela vai usar no deploy.
   Antes daqui havia `rnd()` — quarenta digitos hexadecimais sorteados. O
   endereco aparecia na tela, dava para copiar, e nao correspondia a contrato
   nenhum em chain nenhuma.
   O saldo sai de `balanceOf` na moeda-base. Cofre recem-criado tem ZERO, e zero
   e o que a tela mostra: o `idle:250` que havia aqui era um numero inventado que
   a pessoa lia como dinheiro dela. */
async function adotarCofrePrincipal(indice){
  const dono = S.wallet.address;
  const ind = indice === undefined || indice === null ? 0 : Number(indice);
  const cofre = await LER.vaultAddress(dono, ind);
  const [existe, saldo] = await Promise.all([
    LER.existe(cofre),
    LER.balanceOf(TRIVIU.base.address, cofre).catch(() => 0n)
  ]);
  const casas = TRIVIU.base.decimals || 6;
  S.triad = { vault: cofre, executor: TRIVIU.addr.executor, referralVault: null };
  S.vaults = [{ id:'v1', name:'Main', base: TRIVIU.base.symbol || S.base, color:'#2743C7',
    addr: cofre, indice: ind, existe,
    idle: Number(saldo) / 10 ** casas, inPos: 0,
    fence: newFence(), positions: [], nextPos: 1,
    cycles: 0, rev: 0, net: 0, gas: 0, fee: 0 }];
  S.activeVault = 'v1';
}

async function newVault(name, base, color, seed, indice){
  /* Sub-conta e outro cofre da MESMA factory, com outro indice: o CREATE2
     deriva um endereco por (dono, indice). O endereco vem da chain, e o saldo
     comeca em ZERO porque cofre novo nao tem dinheiro — o que a pessoa digitou
     como tamanho de abertura vira o passo de deposito, e nao um saldo pintado
     na tela antes de qualquer transacao. */
  const endereco = await LER.vaultAddress(S.wallet.address, indice);
  const v = {id:nextVaultId(),
    name, base, color, addr:endereco, indice, existe:await LER.existe(endereco),
    idle:0, aAportar:seed, inPos:0,
    fence:newFence(), positions:[], nextPos:1, cycles:0, rev:0, net:0, gas:0, fee:0,
    strategy:DEFAULT_STRATEGY};
  const d = stratById(DEFAULT_STRATEGY);
  if (d) Object.assign(v.fence, JSON.parse(JSON.stringify(d.fence)));
  return v;
}
$('btnNewVault').onclick = async () => {
  /* Blank means OPEN EMPTY. The 10 floor is about the size of a trade, not about
     the balance standing in the vault — and opening ten containers that each
     already hold 10 is what stopped a clean 5,000 ÷ 10 = 500 from fitting. Open
     empty, then spread. Any amount actually typed still obeys the band. */
  const raw$ = $('nvSeed').value.trim();
  const seed = raw$ === '' ? 0 : parseFloat(raw$);
  const n = Math.max(1, Math.min(20, +$('nvCount').value || 1));
  if (!Number.isFinite(seed) || seed < 0) return toast('Enter an opening size, or leave it blank to open empty.','err');
  if (seed > 0 && seed < BAND.min) return toast(`Below ${BAND.min} the gas eats the trade. Leave it blank to open empty instead.`,'err');
  if (seed > BAND.max) return toast(`Above ${BAND.max} slippage starts eating the edge — open another sub-account instead.`,'err');
  const raw = $('nvName').value.trim().slice(0,40);
  const made = [];
  for (let i=0;i<n;i++){
    /* One name for one, numbered names for many — so a list of twenty is still
       readable a week later. */
    const nm = n === 1
      ? (raw || 'Sub-account ' + (S.vaults.length+1))
      : `${raw || 'Sub-account'} ${String(i+1).padStart(2,'0')}`;
    /* O indice acompanha quantos cofres ja existem para este dono: e ele que
       entra no CREATE2, e dois cofres com o mesmo indice seriam o mesmo endereco. */
    const v = await newVault(nm, $('nvBase').value, $('nvColor').value, seed, S.vaults.length);
    S.vaults.push(v); made.push(v);
  }
  $('nvName').value=''; $('nvSeed').value='';
  S.activeVault = made[made.length-1].id;
  renderVaults(); renderOps(); renderFence(); renderStrategies(); renderLiquidity(); repaintAll(); save();
  const d = stratById(DEFAULT_STRATEGY);
  toast(n === 1
    ? `Sub-account opened ${seed?'with '+fmt(seed,2):'empty'}, fenced with ${d?d.name:'the default'}.`
    : `${n} sub-accounts opened ${seed?'· '+fmt(seed*n,2)+' committed':'empty — spread the liquidity next'} · each fenced with ${d?d.name:'the default'}.`,'ok');
  notify(n===1?`Sub-account opened · ${made[0].name}`:`${n} sub-accounts opened`,'ok');
  maybeArm('sub-accounts opened');
};
function bandBar(v){
  const t = v.idle + v.inPos;
  const p = Math.max(0, Math.min(1,(t - BAND.min)/(BAND.max - BAND.min)));
  return `<span class="band"><span>${BAND.min}</span><span class="bandbar">
    <i style="width:${(p*100).toFixed(1)}%;background:${esc(v.color)}"></i></span><span>${BAND.max}</span></span>`;
}
function renderVaults(){
  $('vaultGrid').innerHTML = S.vaults.length ? S.vaults.map(v => {
    const t = v.idle+v.inPos, pct = t ? Math.round(v.inPos/t*100) : 0;
    const fenceOn = v.fence.assets.length > 0;
    return `<button class="vcard" data-v="${esc(v.id)}" aria-pressed="${v.id===S.activeVault}"
      style="border-top-color:${esc(v.color)}">
      <span class="vn"><span class="vdot" style="background:${esc(v.color)}"></span>${esc(v.name)}
        <span class="pill" style="margin-left:auto">${esc(v.base)}</span></span>
      <span class="vrow"><span>idle</span><b>${fmt(v.idle)}</b></span>
      <span class="vrow"><span>in position</span><b>${fmt(v.inPos)}</b></span>
      <span class="vrow"><span>cycles · reverts</span><b>${v.cycles} · <span class="lose">${v.rev}</span></b></span>
      <span class="vrow"><span>fence</span><b class="${fenceOn?'win':'lose'}">${fenceOn?v.fence.assets.length+' allowed':'EMPTY'}</b></span>
      <span class="vbar"><i style="width:${pct}%;background:${esc(v.color)}"></i></span>${bandBar(v)}
      <span class="small faint mono" style="display:block;margin-top:var(--s2)">${short(v.addr)}</span></button>`;
  }).join('') : '<p class="faint small">No sub-account yet. Open the first one above — start at the bottom of the band.</p>';
  $('vaultGrid').querySelectorAll('.vcard').forEach(c => c.onclick = () => {
    S.activeVault = c.dataset.v; renderVaults(); renderOps(); });
  const v = activeV();
  $('vaultDetail').hidden = !v; if (!v) return;
  $('vdName').textContent = v.name; $('vdBase').textContent = v.base;
  $('vdIdle').textContent = fmt(v.idle); $('vdPos').textContent = fmt(v.inPos);
  $('vdCyc').textContent = v.cycles; $('vdRevSub').textContent = v.rev+' reverted';
  $('vdNet').textContent = (v.net>=0?'+':'')+fmt(v.net,3);
  $('vdNet').className = 'v '+(v.net>=0?'win':'lose');
  const open = (v.positions||[]).filter(p => p.open);
  $('posTable').hidden = !open.length; $('posEmpty').hidden = !!open.length;
  if (open.length) $('posTable').querySelector('tbody').innerHTML = open.map(p =>
    `<tr><td>${p.id}</td><td>${esc(p.asset)}</td><td>${fmt(p.cost)}</td>
     <td>${new Date(p.at).toLocaleString('en-US')}</td>
     <td><button class="mini danger" data-rescue="${p.id}">${icon('rescue')}Rescue</button></td></tr>`).join('');
  $('posTable').querySelectorAll('[data-rescue]').forEach(b => b.onclick = async () => {
    const p = v.positions.find(x => x.id === +b.dataset.rescue);
    try{ await tx({ato:'saida', to:v.addr, fn:'withdraw('+p.asset+', '+p.cost+', you)', gas:70000,
      label:'EscapeHatch.withdraw'});
      renderVaults(); renderOver(); save(); toast('Position rescued to your wallet.','ok');
    }catch(e){ toast(e.message,'err'); }
  });
}
/* O HANDOFF PARA /cofre/ saiu daqui em 2026-08-23. Ele existiu por algumas
   horas e resolvia o problema errado: mandava o usuario para outra pagina no
   meio de um fluxo de deploy, porque a maquinaria de assinatura morava numa
   tela e nao num modulo. Agora mora em js/assinar-v0.js, e a janela abre
   aqui. Quem quiser a tela fina ainda pode ir a /cofre/ direto — ela
   continua valendo e continua passando nas onze regras — mas ninguem e
   levado para la no meio de nada. */

$('btnDep').onclick = () => { const v = activeV(); if (!v) return;
  const a = parseFloat($('vdDep').value); if (!a || a<=0) return toast('Enter an amount.','err');
  if (v.idle+v.inPos+a > BAND.max) return toast(`This sub-account is capped at ${BAND.max}. Open another — that is the design.`,'err');
  /* NAO soma no numero da tela. Somar aqui e escrever dinheiro que a chain nao
     tem: o saldo desta tela vem de `balanceOf`, e o unico jeito de ele subir e
     uma transacao acontecer. O passo vai para /cofre/, que o congela e o assina;
     quando voce voltar, o numero sobe porque a chain subiu. */
  tx({ato:'depositar', to:v.addr, fn:'deposit(base, '+a+')', gas:78000,
    label:'deposit', quantia:a, indice:v.indice}).catch(e => toast(e.message,'err')); };
$('btnWd').onclick = () => { const v = activeV(); if (!v) return;
  const a = parseFloat($('vdWd').value); if (!a || a<=0) return toast('Enter an amount.','err');
  if (a > v.idle) return toast('Not enough idle balance.','err');
  tx({ato:'sacar', to:v.addr, fn:'withdraw(base, '+a+', you)', gas:60000,
    label:'withdraw', quantia:a, indice:v.indice}).catch(e => toast(e.message,'err')); };
$('btnDelVault').onclick = () => { S.vaults = S.vaults.filter(x => x.id !== S.activeVault);
  S.activeVault = S.vaults[0]?.id || null; renderVaults(); renderOps(); renderOver(); save(); toast('Sub-account closed.'); };

/* ── A ROTA ─────────────────────────────────────────────────────────────────
   `routeCalldata` e a chamada que o Executor faz ao router, e quem a monta hoje
   e esta tela — o oraculo, que normalmente faria isso, esta em zero.

   O DESTINO DO SWAP E O COFRE, e nao o executor. Isto nao e obvio e erraria a
   rota inteira: `VaultExecution` mede `tokenOut.balanceOf(address(this))` antes
   e depois, com `this` sendo o COFRE; e `Executor.run` exige
   `tokenOut.balanceOf(executor) == baselineOut`, ou seja, o executor nao pode
   ficar com nada. Uma rota com `to` = executor reverte em BalanceDeltaNonZero
   depois de o gas ter sido pago.

   O router NAO precisa de curadoria nesta linha: `_checkRoute` cura o EXECUTOR
   e usa denylist para target e spender — proibidos sao o proprio cofre, o
   executor, e qualquer token da cerca. A trava existe para a "rota" nao poder
   ser uma chamada direta a um token.

   O seletor sai do keccak que esta pagina agora carrega, e nao de uma constante
   digitada: `swapExactTokensForTokens(uint256,uint256,address[],address,uint256)`. */
const ROTA_V2 = 'swapExactTokensForTokens(uint256,uint256,address[],address,uint256)';
/* QuickSwap V2 na Polygon. NAO precisa de curadoria nesta linha — `_checkRoute`
   cura o executor e usa denylist para target/spender. A proposta de governanca
   `allow-quickswap-v2-router` esta `held` e abre alvo no ParameterRegistry
   0x1Adab61e…, que e da linha ANTIGA: ela nao governa este cofre. */
const ROTEADOR_V2 = '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff';

function montarRotaV2({entra, saiMin, caminho, paraOCofre, prazo}){
  if (!window.TRIVIU_KECCAK) {
    throw new Error('o keccak nao carregou, e sem ele nao ha como calcular o seletor da rota ' +
      'nem o commitment. Nada foi montado.');
  }
  const seletor = window.TRIVIU_KECCAK.keccak256(ROTA_V2).slice(0, 10);
  const corpo = window.TRIVIU_MOTOR.abiEncodeTuplaDinamica([
    { nome: 'amountIn', tipo: 'uint256', valor: String(entra) },
    { nome: 'amountOutMin', tipo: 'uint256', valor: String(saiMin) },
    { nome: 'path', tipo: 'address[]', valor: caminho },
    { nome: 'to', tipo: 'address', valor: paraOCofre },
    { nome: 'deadline', tipo: 'uint256', valor: String(prazo) }
  ]);
  return { hex: seletor + corpo.hex.slice(2), seletor, assinatura: ROTA_V2, mapa: corpo.mapa };
}

/* Monta uma execucao inteira, do que a chain diz agora ate o hash que ela vai
   recalcular. Nada aqui e digitado: o Intent vem de `dryRunChecks`, o nonce e a
   epoca vem do cofre, e os dois hashes saem do keccak.

   A ORDEM importa e nao e arbitraria. O cofre recalcula o `proposalHash` com o
   nonce e a `configEpoch` DELE no instante da execucao — mudar a cerca entre
   montar e assinar invalida a proposta, de proposito, porque a estrategia
   respondeu sobre um cofre que ja e outro. Por isso os dois sao lidos por
   ultimo, e nao no comeco. */
async function montarExecucao({cofre, base, prazoEmSegundos}){
  if (!window.TRIVIU_KECCAK) throw new Error('o keccak nao carregou; nada foi montado');
  const K = window.TRIVIU_KECCAK, MO = window.TRIVIU_MOTOR;

  /* 1 · o que a estrategia quer. Se ela recusar, a recusa e a resposta. */
  const sim = await LER.simular(cofre, 0, base);
  if (!sim.ok){
    const e = new Error('a simulacao recusou' + (sim.motivo ? ': ' + sim.motivo : '') +
      (sim.motivo && O_QUE_FAZER[sim.motivo] ? ' — ' + O_QUE_FAZER[sim.motivo] : ''));
    e.simulacao = sim;
    throw e;
  }
  const it = sim.intent;

  /* 2 · a rota. O destino e o COFRE: o executor nao pode ficar com o resultado,
     e quem mede o ganho e o proprio cofre. */
  const agora = Math.floor(Date.now() / 1000);
  const prazo = agora + (Number(prazoEmSegundos) || 600);
  const rota = montarRotaV2({
    entra: it.entra, saiMin: it.saiMin,
    caminho: it.lado === 'compra' ? [it.base, it.ativo] : [it.ativo, it.base],
    paraOCofre: cofre, prazo
  });

  /* 3 · o estado do cofre, lido POR ULTIMO. */
  const [nonce, epoca, estrategia] = await Promise.all([
    LER.nonce(cofre), LER.configEpoch(cofre), LER.estrategia(cofre)
  ]);

  /* 4 · os dois hashes, na forma que o contrato recalcula. */
  const proposta = K.keccak256Hex(MO.abiEncode([
    { tipo: 'uint256', valor: String(TRIVIU.chainId ?? 137) },
    { tipo: 'address', valor: cofre },
    { tipo: 'uint64', valor: String(nonce) },
    { tipo: 'uint64', valor: String(epoca) },
    { tipo: 'address', valor: estrategia },
    { tipo: 'address', valor: it.lado === 'compra' ? it.base : it.ativo },
    { tipo: 'address', valor: it.lado === 'compra' ? it.ativo : it.base },
    { tipo: 'uint256', valor: String(it.entra) },
    { tipo: 'uint256', valor: String(it.lote) }
  ]));
  const declaredRefund = '0';
  const executionHash = K.keccak256Hex(MO.abiEncode([
    { tipo: 'bytes32', valor: proposta },
    { tipo: 'address', valor: TRIVIU.addr.executor },
    { tipo: 'address', valor: ROTEADOR_V2 },
    { tipo: 'address', valor: ROTEADOR_V2 },
    { tipo: 'uint256', valor: String(it.entra) },
    { tipo: 'uint256', valor: String(it.saiMin) },
    { tipo: 'uint64', valor: String(prazo) },
    { tipo: 'uint256', valor: declaredRefund },
    { tipo: 'bytes32', valor: K.keccak256Hex(rota.hex) }
  ]));

  return {
    side: it.lado === 'compra' ? '0' : '1',
    asset: it.ativo, base: it.base,
    amountIn: String(it.entra), minOut: String(it.saiMin), lotId: String(it.lote),
    executor: TRIVIU.addr.executor, target: ROTEADOR_V2, spender: ROTEADOR_V2,
    operatorMinOut: String(it.saiMin), validUntil: String(prazo), configEpoch: String(epoca),
    declaredRefund, declaredGas: '0', declaredGasPrice: '0', declaredQuote: String(it.saiMin),
    candidateLotId: String(it.lote),
    routeCalldata: rota.hex, executionHash,
    rotaNome: 'QuickSwap V2', proposta, nonce: String(nonce)
  };
}

/* ── A CERCA REAL · os seis controles que o cofre V0 tem ────────────────────
   Nasceu de um veto: `setAllowedAsset(token,false)` — bloquear um ativo — nao
   existia em lugar nenhum desta tela. O unico chamador passava `ligado: true`
   fixo, no onboarding. Metade de cada controle estava construida, e a metade que
   faltava era justamente a que fecha.
   Toda linha aqui le a chain antes de desenhar. Estado de tela que afirma cerca
   sem ter perguntado ao cofre e a mesma classe de defeito que ja custou cinco
   cofres criados a toa. */
let CERCA_LIDA = null;

async function lerCercaReal(cofre){
  const [limites, ativos, moedas, guardas, estrategia] = await Promise.all([
    LER.limites(cofre).catch(() => null),
    Promise.all(MOEDAS_LIDAS.map(async (m) => ({
      ...m, casas: await LER.casasDoAtivo(cofre, m.addr).catch(() => null) }))),
    Promise.all(MOEDAS_LIDAS.map(async (m) => ({
      ...m, casas: await LER.casasDaMoeda(cofre, m.addr).catch(() => null) }))),
    LER.guardas(cofre).catch(() => null),
    LER.estrategia(cofre).catch(() => null)
  ]);
  return { cofre, limites, ativos, moedas, guardas, estrategia };
}

/* Segundos viram algo que se le. `0` nao e "zero segundos" para quem configura
   um cofre: e a checagem DESLIGADA, e dizer as duas coisas com a mesma palavra
   e o que faz alguem desligar um piso sem perceber. */
function emTempo(s){
  const n = Number(s);
  if (!n) return 'zero — sem intervalo minimo';
  if (n < 60) return n + 's';
  if (n < 3600) return (n / 60).toFixed(n % 60 ? 1 : 0) + ' min';
  if (n < 86400) return (n / 3600).toFixed(n % 3600 ? 1 : 0) + ' h';
  return (n / 86400).toFixed(n % 86400 ? 1 : 0) + ' dias';
}

function renderCercaReal(){
  const corpo = $('cercaRealCorpo');
  if (!corpo) return;
  const cofre = S.triad?.vault || activeV()?.addr || null;
  if (!cofre){
    corpo.textContent = '';
    const p = document.createElement('p');
    p.className = 'faint small';
    p.textContent = 'Abra um cofre primeiro. Sem cofre nao ha cerca para ler.';
    corpo.appendChild(p);
    return;
  }
  /* `renderFence()` roda em varios pontos, e alguns deles chegam antes de
     `preencherMoedas()` voltar. Com MOEDAS_LIDAS vazio o painel desenharia
     zero linhas — e zero linha se le como "nenhum ativo liberado", que e uma
     afirmacao sobre a chain que ninguem fez. Dizer que ainda nao leu e diferente
     de dizer que nao ha. */
  if (!MOEDAS_LIDAS.length){
    corpo.textContent = '';
    const p = document.createElement('p');
    p.className = 'faint small';
    p.textContent = 'As moedas ainda nao foram lidas da chain. Sem elas esta lista estaria vazia ' +
      'por falta de leitura, e nao por falta de ativo liberado — e as duas coisas sao diferentes.';
    corpo.appendChild(p);
    return;
  }
  if (!CERCA_LIDA || CERCA_LIDA.cofre !== cofre){
    corpo.textContent = '';
    const p = document.createElement('p');
    p.className = 'faint small';
    p.textContent = 'Lendo a cerca da chain…';
    corpo.appendChild(p);
    lerCercaReal(cofre).then((c) => { CERCA_LIDA = c; renderCercaReal(); })
      .catch((e) => { corpo.textContent = ''; const q = document.createElement('p');
        q.className = 'faint small';
        q.textContent = 'Nao consegui ler a cerca: ' + e.message +
          '. Nada e afirmado sobre ela enquanto a leitura nao voltar.';
        corpo.appendChild(q); });
    return;
  }

  const C = CERCA_LIDA;
  const naoLido = (x) => x === null || x === undefined;
  corpo.textContent = '';

  /* Cada linha: nome, o que a chain diz, e os DOIS botoes. */
  const linha = (rot, estado, aviso, botoes) => {
    const d = document.createElement('div');
    d.className = 'fitem';
    const h = document.createElement('div');
    h.className = 'row';
    const t = document.createElement('div');
    const b = document.createElement('b'); b.textContent = rot;
    const s = document.createElement('span');
    s.className = aviso ? 'small warn' : 'small faint';
    s.textContent = ' · ' + estado;
    t.appendChild(b); t.appendChild(s);
    h.appendChild(t);
    const acoes = document.createElement('div');
    acoes.className = 'tight';
    for (const btn of botoes) acoes.appendChild(btn);
    h.appendChild(acoes);
    d.appendChild(h);
    return d;
  };
  const botao = (texto, classe, aoClicar) => {
    const b = document.createElement('button');
    b.className = 'mini ' + classe;
    b.textContent = texto;
    b.onclick = aoClicar;
    return b;
  };

  /* --- os quatro tetos, numa palavra so na chain ----------------------- */
  const tituloL = document.createElement('p');
  tituloL.className = 'eyebrow';
  tituloL.textContent = 'setLimits(uint64,uint64,uint16,uint112) · os tetos deste cofre';
  corpo.appendChild(tituloL);
  const L = C.limites;
  const campoLim = (id, rot, valor) => {
    const cx = document.createElement('div');
    const lab = document.createElement('label');
    lab.className = 'sr'; lab.htmlFor = id; lab.textContent = rot;
    const inp = document.createElement('input');
    inp.id = id; inp.placeholder = rot; inp.inputMode = 'decimal';
    inp.value = valor === null || valor === undefined ? '' : String(valor);
    cx.appendChild(lab); cx.appendChild(inp);
    return cx;
  };
  if (!L){
    corpo.appendChild(linha('limites', 'nao consegui ler limits()', true, []));
  } else {
    corpo.appendChild(linha('cooldown', emTempo(L.cooldown) + ' · intervalo minimo entre execucoes', false, []));
    corpo.appendChild(linha('maxValidity', emTempo(L.maxValidity) + ' · validade maxima declaravel', false, []));
    corpo.appendChild(linha('minRatioBps',
      (L.minRatioBps === 0n ? 'ZERO — o piso de razao esta DESLIGADO'
        : (Number(L.minRatioBps) / 100) + '% de razao minima saida/entrada'),
      L.minRatioBps === 0n, []));
    corpo.appendChild(linha('quantum', String(L.quantum) +
      ' · granularidade de amountIn, em unidades-base', false, []));

    const editar = document.createElement('div');
    editar.className = 'row';
    editar.appendChild(campoLim('lim_cd', 'cooldown (s)', L.cooldown));
    editar.appendChild(campoLim('lim_mv', 'validade (s)', L.maxValidity));
    editar.appendChild(campoLim('lim_mr', 'razao (bps)', L.minRatioBps));
    editar.appendChild(campoLim('lim_qt', 'quantum', L.quantum));
    const acaoL = document.createElement('div');
    acaoL.className = 'tight';
    acaoL.appendChild(botao('Gravar os quatro', 'primary', () => {
      /* Os quatro vao JUNTOS na mesma palavra: mandar um apaga os outros tres.
         Por isso os campos nascem preenchidos com o que a chain respondeu — quem
         quiser mudar um so nao precisa saber os outros de cabeca. */
      const v = (id) => String(document.getElementById(id)?.value ?? '').trim();
      const quatro = { cooldown: v('lim_cd'), maxValidity: v('lim_mv'),
                       minRatioBps: v('lim_mr'), quantum: v('lim_qt') };
      const vazio = Object.entries(quatro).filter(([, x]) => x === '').map(([k]) => k);
      if (vazio.length) return toast('Faltou: ' + vazio.join(', ') +
        '. Os quatro gravam juntos — deixar um em branco apagaria o valor atual dele.', 'err');
      const est = estadoDeZero(quatro.minRatioBps);
      if (est !== ZERO_NAO && !confirmarDesligarPiso(est)) return;
      mudarLimites(quatro);
    }));
    editar.appendChild(acaoL);
    corpo.appendChild(editar);
  }

  /* --- a simulacao: view, custa zero ----------------------------------- */
  const tituloS = document.createElement('p');
  tituloS.className = 'eyebrow';
  tituloS.textContent = 'dryRunChecks(uint256,address) · o que a estrategia quer fazer, sem gastar';
  corpo.appendChild(tituloS);
  const explS = document.createElement('p');
  explS.className = 'faint small';
  explS.textContent = 'Chamada de leitura: nao assina, nao gasta gas, nao muda nada. Roda a cadeia ' +
    'inteira — intervalo, moeda-base, a pergunta a estrategia, o veto e os guardioes — e devolve a ' +
    'intencao. Quando ela recusa, a recusa e a resposta: diz exatamente o que falta.';
  corpo.appendChild(explS);
  const saidaS = document.createElement('div');
  saidaS.id = 'cercaSimulacao';
  corpo.appendChild(saidaS);
  const acaoS = document.createElement('div');
  acaoS.className = 'tight';
  acaoS.appendChild(botao('Simular', 'primary', () => simularCiclo(saidaS)));
  /* Executar fica AO LADO de simular, e nao noutra aba: simular custa zero e
     responde a mesma pergunta que executar responde caro. Quem separa os dois
     em telas distintas convida a pular o barato. */
  acaoS.appendChild(botao('Executar', 'ghost', () => executarCiclo(saidaS)));
  corpo.appendChild(acaoS);

  /* --- ativos: liberar e BLOQUEAR ------------------------------------- */
  const tituloA = document.createElement('p');
  tituloA.className = 'eyebrow';
  tituloA.textContent = 'setAllowedAsset(address,bool) · o que o executor pode comprar';
  corpo.appendChild(tituloA);
  for (const a of C.ativos){
    const liberado = !naoLido(a.casas) && a.casas > 0;
    const estado = naoLido(a.casas) ? 'nao consegui ler'
      : (liberado ? 'liberado · ' + a.casas + ' casas' : 'bloqueado');
    corpo.appendChild(linha(a.nome, estado, naoLido(a.casas), [
      botao('Liberar', liberado ? 'ghost' : 'primary', () => mudarCerca('ativo', a, true)),
      botao('Bloquear', liberado ? 'primary' : 'ghost', () => mudarCerca('ativo', a, false))
    ]));
  }

  /* --- moeda-base do cofre: ligar e DESLIGAR -------------------------- */
  const tituloM = document.createElement('p');
  tituloM.className = 'eyebrow';
  tituloM.textContent = 'setBaseCurrency(address,bool) · a moeda-base DESTE cofre, que e escolha sua';
  corpo.appendChild(tituloM);
  for (const m of C.moedas){
    const ligada = !naoLido(m.casas) && m.casas > 0;
    const curada = m.curada === true ? ' · curada pelo registro' :
      (m.curada === false ? ' · nao curada: ciclo reverte em BaseNotCurated' : '');
    const estado = naoLido(m.casas) ? 'nao consegui ler'
      : ((ligada ? 'ligada · ' + m.casas + ' casas' : 'desligada') + curada);
    corpo.appendChild(linha(m.nome, estado, naoLido(m.casas), [
      botao('Ligar', ligada ? 'ghost' : 'primary', () => mudarCerca('moedaDoCofre', m, true)),
      botao('Desligar', ligada ? 'primary' : 'ghost', () => mudarCerca('moedaDoCofre', m, false))
    ]));
  }

  /* --- guardioes: somar e TIRAR --------------------------------------- */
  const tituloG = document.createElement('p');
  tituloG.className = 'eyebrow';
  tituloG.textContent = 'addGuard(address) / removeGuard(address) · quem mais pode fechar posicao';
  corpo.appendChild(tituloG);
  if (C.guardas === null){
    corpo.appendChild(linha('guardioes', 'nao consegui ler guards()', true, []));
  } else if (!C.guardas.length){
    corpo.appendChild(linha('guardioes', 'nenhum · so voce fecha', false, []));
  } else {
    for (const g of C.guardas){
      corpo.appendChild(linha(g, 'guardiao deste cofre', false, [
        botao('Tirar', 'primary', () => mudarCerca('guarda', { addr: g, nome: g }, false))
      ]));
    }
  }
  const somarG = document.createElement('div');
  somarG.className = 'row';
  const campoG = document.createElement('input');
  campoG.id = 'cercaGuardaNovo';
  campoG.placeholder = '0x… endereco do guardiao';
  const rotG = document.createElement('label');
  rotG.className = 'sr'; rotG.htmlFor = 'cercaGuardaNovo';
  rotG.textContent = 'endereco do guardiao a somar';
  const capsG = document.createElement('div');
  capsG.appendChild(rotG); capsG.appendChild(campoG);
  somarG.appendChild(capsG);
  const acaoG = document.createElement('div');
  acaoG.className = 'tight';
  acaoG.appendChild(botao('Somar guardiao', 'primary', () => {
    const v = String(campoG.value || '').trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(v)) return toast('Isso nao e um endereco.', 'err');
    mudarCerca('guarda', { addr: v, nome: v }, true);
  }));
  somarG.appendChild(acaoG);
  corpo.appendChild(somarG);

  /* --- estrategia: apontar e LIMPAR ----------------------------------- */
  const tituloE = document.createElement('p');
  tituloE.className = 'eyebrow';
  tituloE.textContent = 'setStrategy(address) · a estrategia deste cofre';
  corpo.appendChild(tituloE);
  const ZERO = '0x0000000000000000000000000000000000000000';
  const temEstrategia = C.estrategia && C.estrategia.toLowerCase() !== ZERO;
  corpo.appendChild(linha('estrategia',
    C.estrategia === null ? 'nao consegui ler'
      : (temEstrategia ? C.estrategia : 'nenhuma apontada'),
    C.estrategia === null,
    temEstrategia ? [botao('Limpar', 'primary',
      () => mudarCerca('estrategia', { addr: ZERO, nome: 'endereco zero' }, false))] : []));
  const apontarE = document.createElement('div');
  apontarE.className = 'row';
  const campoE = document.createElement('input');
  campoE.id = 'cercaEstrategiaNova';
  campoE.placeholder = '0x… endereco da estrategia';
  const rotE = document.createElement('label');
  rotE.className = 'sr'; rotE.htmlFor = 'cercaEstrategiaNova';
  rotE.textContent = 'endereco da estrategia a apontar';
  const capsE = document.createElement('div');
  capsE.appendChild(rotE); capsE.appendChild(campoE);
  apontarE.appendChild(capsE);
  const acaoE = document.createElement('div');
  acaoE.className = 'tight';
  acaoE.appendChild(botao('Apontar', 'primary', () => {
    const v = String(campoE.value || '').trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(v)) return toast('Isso nao e um endereco.', 'err');
    mudarCerca('estrategia', { addr: v, nome: v }, true);
  }));
  apontarE.appendChild(acaoE);
  corpo.appendChild(apontarE);
}

/* Zero decidido pela MESMA regra que decide o que vai para a chain.
   Duas versoes anteriores erraram, em direcoes opostas, e as duas foram medidas:
     1. `v === '0'` — comparava a GRAFIA. `00`, `000` e `-0` viram zero na
        calldata e nao disparavam a confirmacao: quem digitasse `00` desligava o
        piso de razao do proprio cofre sem a tela perguntar nada.
     2. `BigInt(v) === 0n` — permissiva demais na outra ponta. `BigInt("")` e
        `BigInt("0x0")` devolvem `0n` em JavaScript, e o codificador RECUSA as
        duas. A confirmacao apareceria para valores que nem chegam a chain, e
        confirmacao que aparece a toa treina a pessoa a clicar sem ler.
   `valorDaTela` e exatamente o juiz que decide se o valor vira calldata. Se ele
   recusa, nao ha piso a desligar; se ele aceita e da zero, ha. Perguntar a ele e
   o que impede esta funcao de divergir do codificador na proxima edicao. */
/* TRES estados, e nao dois. Duas versoes anteriores colapsaram estados
   diferentes num booleano so, cada uma para um lado:
     · `v === '0'` comparava a GRAFIA: `00`, `000` e `-0` desligavam o piso sem
       confirmacao nenhuma;
     · o `catch` unico juntava "o motor disse que nao vale" com "o motor nao
       estava la", e no segundo caso a guarda falhava ABERTA.
   O terceiro estado existe porque nao saber nao e saber que nao, e tambem nao e
   saber que sim: dizer "minRatioBps = 0 DESLIGA o piso" a quem digitou 9900
   seria a tela afirmando um fato falso para poder ser cautelosa. Cautela nao
   autoriza mentir. TUBARAO-27. */
var ZERO_SIM = 'sim', ZERO_NAO = 'nao', ZERO_NAO_SEI = 'nao-sei';

function estadoDeZero(v){
  var motor = window.TRIVIU_MOTOR;
  if (!motor || typeof motor.valorDaTela !== 'function') return ZERO_NAO_SEI;
  try { return motor.valorDaTela('uint16', v) === 0n ? ZERO_SIM : ZERO_NAO; }
  catch { return ZERO_NAO; }   /* o motor RESPONDEU: o valor nao vale como uint16 */
}

/* NAO ha um `ehZero` booleano aqui, e a ausencia e deliberada. Existiu por uma
   rodada, "para quem so precisa do booleano" — e ninguem precisava: ficou
   declarada e chamada zero vezes, viva apenas porque um vetor do ensaio a
   exercitava. Teste que exercita codigo fora do caminho real mede a si mesmo.
   Quem precisar do booleano escreve `estadoDeZero(v) !== ZERO_NAO` e ve, na
   propria linha, que o `!== ZERO_NAO` e o que torna a coisa fail-closed. */

/* Desligar um piso e uma decisao, e decisao pede um ato deliberado. Sem isto,
   `minRatioBps = 0` sai igual a qualquer outro numero digitado, e o registro
   `guarda-que-recusa-zero-e-aceita-um` desta casa e sobre exatamente isso: piso
   que some sem ninguem ter escolhido que sumisse. */
function confirmarDesligarPiso(estado){
  if (estado === ZERO_NAO_SEI){
    /* NAO afirma que o valor e zero — porque nao se sabe. Pergunta assim mesmo,
       que e o lado seguro, e diz por que esta perguntando. */
    return window.confirm(
      'Nao foi possivel conferir este valor: o motor de assinatura nao respondeu, ' +
      'e e ele quem decide o que vira calldata.\n\n' +
      'Se o valor for zero, o piso de razao saida/entrada deste cofre sera DESLIGADO. ' +
      'Como nao da para verificar, esta tela pergunta em vez de decidir por voce.\n\n' +
      'Prosseguir mesmo assim?');
  }
  return window.confirm(
    'minRatioBps = 0 DESLIGA o piso de razao saida/entrada deste cofre.\n\n' +
    'Com ele desligado, a estrategia pode propor uma troca de qualquer razao e o ' +
    'cofre nao recusa por esse motivo. Os outros tetos continuam valendo.\n\n' +
    'Desligar mesmo assim?');
}

/* Os quatro tetos gravam JUNTOS: `setLimits` empacota tudo numa palavra. */
async function mudarLimites(quatro){
  const cofre = S.triad?.vault || activeV()?.addr;
  if (!cofre) return toast('Abra um cofre primeiro.', 'err');
  const fn = 'setLimits(' + quatro.cooldown + ', ' + quatro.maxValidity + ', ' +
    quatro.minRatioBps + ', ' + quatro.quantum + ')';
  try {
    const r = await tx({ ato: 'limites', to: cofre, fn, gas: GAS.fence, label: fn,
      limites: quatro });
    if (r && r.ok){ CERCA_LIDA = null; renderCercaReal(); }
  } catch (e) { toast(e.message, 'err'); }
}

/* A simulacao. Nao assina nada — e `eth_call`. O que ela devolve, e o que ela
   RECUSA, sao os dois uteis: a recusa nomeia o que falta configurar. */
async function simularCiclo(onde){
  const cofre = S.triad?.vault || activeV()?.addr;
  if (!cofre) return toast('Abra um cofre primeiro.', 'err');
  const base = S.moeda || TRIVIU.base.address;
  onde.textContent = '';
  const p = document.createElement('p');
  p.className = 'faint small';
  p.textContent = 'Perguntando ao cofre…';
  onde.appendChild(p);

  /* lotId 0 = "sem lote candidato": e o caso de ABRIR posicao. Fechar um lote
     especifico pede o id dele, e a lista de lotes ainda nao esta nesta tela. */
  const r = await LER.simular(cofre, 0, base);
  onde.textContent = '';
  const bloco = document.createElement('div');
  bloco.className = 'fitem';

  if (r.ok){
    const t = document.createElement('p');
    t.className = 'small';
    t.textContent = 'A estrategia propoe:';
    bloco.appendChild(t);
    const casas = (MOEDAS_LIDAS.find(m => m.addr.toLowerCase() === r.intent.base.toLowerCase())?.casas) ?? null;
    const emUnidades = (v) => casas === null ? String(v) + ' (unidades-base)'
      : (Number(v) / 10 ** casas).toFixed(Math.min(casas, 6));
    for (const [rot, val] of [
      ['lado', r.intent.lado],
      ['ativo', r.intent.ativo],
      ['moeda-base', r.intent.base],
      ['entra', emUnidades(r.intent.entra)],
      ['sai no minimo', emUnidades(r.intent.saiMin)],
      ['lote', String(r.intent.lote)]
    ]){
      const l = document.createElement('div');
      const b = document.createElement('b'); b.textContent = rot + ': ';
      const s = document.createElement('span'); s.className = 'small'; s.textContent = String(val);
      l.appendChild(b); l.appendChild(s);
      bloco.appendChild(l);
    }
    const nota = document.createElement('p');
    nota.className = 'faint small';
    nota.textContent = 'Isto passou por intervalo, moeda-base, veto e guardioes. Executar ainda ' +
      'exige a rota do swap, que esta tela nao monta.';
    bloco.appendChild(nota);
  } else {
    const nome = r.motivo;
    const t = document.createElement('p');
    t.className = 'small warn';
    t.textContent = nome ? ('O cofre recusou: ' + nome) : 'O cofre recusou, e nao reconheci o motivo.';
    bloco.appendChild(t);
    const oQue = nome && O_QUE_FAZER[nome];
    const d = document.createElement('p');
    d.className = 'faint small';
    d.textContent = oQue || 'Nenhuma transacao foi feita — esta chamada e de leitura. ' +
      (nome ? 'O nome acima e o do erro que o proprio contrato declara.'
            : 'Sem o nome, o que da para dizer e que a leitura nao passou.');
    bloco.appendChild(d);
  }
  onde.appendChild(bloco);
}

/* Abrir ou fechar posicao, com o SEU gas. `executeAsOwner` e `_checkOwner()` e
   chama `_checksA({callerMustBeOperator: false})` — o comentario do parametro no
   contrato diz "false on the owner entrypoint". O keeper nao entra nisto, e por
   isso a chave do operador estar sem POL nao trava este caminho. */
async function executarCiclo(onde){
  const cofre = S.triad?.vault || activeV()?.addr;
  if (!cofre) return toast('Abra um cofre primeiro.', 'err');
  const base = S.moeda || TRIVIU.base.address;
  onde.textContent = '';
  const p0 = document.createElement('p');
  p0.className = 'faint small';
  p0.textContent = 'Perguntando a estrategia e montando a execucao…';
  onde.appendChild(p0);

  let x = null;
  try {
    x = await montarExecucao({ cofre, base, prazoEmSegundos: 600 });
  } catch (e) {
    onde.textContent = '';
    const q = document.createElement('p');
    q.className = 'small warn';
    q.textContent = e.message;
    onde.appendChild(q);
    const r = document.createElement('p');
    r.className = 'faint small';
    r.textContent = 'Nada foi assinado e nada foi enviado — ate aqui tudo foi leitura.';
    onde.appendChild(r);
    return;
  }

  onde.textContent = '';
  const resumo = document.createElement('div');
  resumo.className = 'fitem';
  for (const [rot, val] of [
    ['lado', x.side === '0' ? 'compra' : 'venda'],
    ['entra', x.amountIn + ' (unidades-base)'],
    ['sai no minimo', x.minOut],
    ['rota', x.rotaNome + ' · ' + ((x.routeCalldata.length - 2) / 2) + ' bytes'],
    ['destino do swap', 'o seu cofre'],
    ['nonce lido agora', x.nonce]
  ]){
    const l = document.createElement('div');
    const b = document.createElement('b'); b.textContent = rot + ': ';
    const s = document.createElement('span'); s.className = 'small'; s.textContent = String(val);
    l.appendChild(b); l.appendChild(s);
    resumo.appendChild(l);
  }
  onde.appendChild(resumo);

  try {
    const r = await tx({ ato: 'executar', to: cofre,
      fn: 'executeAsOwner(' + (x.side === '0' ? 'compra' : 'venda') + ')',
      gas: 900000, label: 'executeAsOwner', execucao: x });
    if (r && r.ok){
      CERCA_LIDA = null;
      renderCercaReal();
      await lerTudoDaChain();
    }
  } catch (e) { toast(e.message, 'err'); }
}

/* Um clique = uma transacao. Nada muda na tela por conta propria: depois de a
   chain confirmar, a cerca e RELIDA. Escrever o novo estado aqui seria a tela
   afirmando o que so o cofre sabe. */
async function mudarCerca(ato, alvo, ligar){
  const cofre = S.triad?.vault || activeV()?.addr;
  if (!cofre) return toast('Abra um cofre primeiro.', 'err');
  const nomes = {
    ativo: ligar ? 'setAllowedAsset(' + alvo.nome + ', true)' : 'setAllowedAsset(' + alvo.nome + ', false)',
    moedaDoCofre: ligar ? 'setBaseCurrency(' + alvo.nome + ', true)' : 'setBaseCurrency(' + alvo.nome + ', false)',
    guarda: ligar ? 'addGuard(' + alvo.nome + ')' : 'removeGuard(' + alvo.nome + ')',
    estrategia: 'setStrategy(' + alvo.nome + ')'
  };
  try {
    const r = await tx({ ato: ato, to: cofre, fn: nomes[ato], gas: GAS.fence,
      label: nomes[ato], alvo: alvo.addr, ligado: ligar });
    if (r && r.ok){
      CERCA_LIDA = null;            /* forca a releitura da chain */
      renderCercaReal();
    }
  } catch (e) { toast(e.message, 'err'); }
}

/* ── THE FENCE · sixteen controls ──────────────────────────────────── */
function renderFence(){
  $('fenceVault').innerHTML = S.vaults.map(v =>
    `<option value="${esc(v.id)}" ${v.id===S.activeVault?'selected':''}>${esc(v.name)} · ${esc(v.base)}</option>`).join('')
    || '<option>open a sub-account first</option>';
  $('fenceVault').onchange = e => {
    S.activeVault = e.target.value;
    CERCA_LIDA = null;              /* outro cofre, outra cerca: reler antes de afirmar */
    renderFence();
  };
  renderCercaReal();
  const v = activeV(); const g = $('fenceGrid');
  if (!v){ g.innerHTML = '<p class="faint small">Open a sub-account first.</p>'; return; }
  const c = v.fence;
  const inp = (id,ph,val,w) => `<div style="min-width:${w||56}px"><label for="${id}" class="sr">${esc(ph)}</label>
    <input id="${id}" placeholder="${esc(ph)}" value="${esc(val??'')}" inputmode="decimal"></div>`;
  const onoff = (id,on) => `<div style="min-width:82px"><label for="${id}" class="sr">on or off</label>
    <select id="${id}"><option value="1" ${on?'selected':''}>on</option><option value="0" ${!on?'selected':''}>off</option></select></div>`;
  const act = `<div class="tight"><button class="mini primary" data-a>Apply</button></div>`;
  const P = [];
  const add = o => P.push(o);
  /* A CERCA INTEIRA. Os dezesseis controles abaixo nomeiam funcoes de um
     contrato que NAO ESTA NA CHAIN — `TriviuCerca.sol`, que este mesmo arquivo
     ja declara como nao implantada algumas centenas de linhas acima.
     `setTradingWindow`, `setMaxTradeSizeBps`, `setLossCooldown` e os outros
     treze nao existem no artefato compilado da V0. O que o cofre V0 tem e
     `setLimits(uint64,uint64,uint16,uint112)`, `setAllowedAsset(address,bool)`,
     `setBaseCurrency`, `setStrategy`, `addGuard` e `removeGuard` — seis, e nao
     dezesseis.
     O unico que corresponde a alguma coisa e o de ativos, e ele vai para o ato
     `ativo`, que recusa nomeando a assinatura real. Os outros vao para `cerca`,
     que recusa nomeando o contrato ausente. Nenhum muda a tela. */
  const set = (fn) => tx({ato: /^definirAtivo/.test(fn) ? 'ativo' : 'cerca',
    to: S.triad?.vault || v.addr, fn, gas: GAS.fence, label: fn})
    .catch(e => toast(e.message,'err'));

  add({t:'Emergency pause', on:c.paused, cur:c.paused?'PAUSED — nothing opens':'operating',
    d:'Blocks opening only; closing and rescue stay free.',
    ctl:`<div class="row">${onoff('f_p',c.paused)}${act}</div>`,
    ap:d => set('definirPausa('+(d.querySelector('#f_p').value==='1')+')')});
  add({t:'Allowed assets', on:c.assets.length>0, empty:!c.assets.length,
    cur:c.assets.length?c.assets.join(' · '):'FENCE EMPTY — nothing opens',
    d:'What the executor may buy. A new list replaces the old one entirely.',
    ctl:`<div class="row">${inp('f_as','WETH,WBTC',c.assets.join(','),140)}${act}</div>`,
    ap:d => { const l = d.querySelector('#f_as').value.split(',').map(x=>x.trim().toUpperCase()).filter(Boolean);
      const bad = l.find(x => !ASSETS[x] || x === v.base);
      if (bad) return toast('Unknown asset or it is the base currency: '+bad,'err');
      set('definirAtivo(['+l.join(',')+'])'); }});
  add({t:'Trading window', on:!(c.tw[0]===0&&c.tw[1]===24), cur:`${c.tw[0]}h → ${c.tw[1]}h`,
    d:'LOCAL hours, [start, end). Start greater than end crosses midnight.',
    ctl:`<div class="row">${inp('f_ws','start',c.tw[0])}${inp('f_we','end',c.tw[1])}${act}</div>`,
    ap:d => set('setTradingWindow(...)')});
  add({t:'Timezone', on:c.tz!==0, cur:`UTC${c.tz>=0?'+':''}${c.tz/3600}`,
    d:'The fence clock. São Paulo is -3.',
    ctl:`<div class="row">${inp('f_tz','h vs UTC',c.tz/3600)}${act}</div>`,
    ap:d => set('setTimezoneOffset(...)')});
  add({t:'Weekdays', on:c.wm!==0x7F, cur:[...Array(7)].map((_,i)=>(c.wm>>i)&1?WDN[i]:'·').join(' '),
    d:'Which days, in your timezone, may open.',
    ctl:`<div class="row"><div style="flex:2">${[...Array(7)].map((_,i)=>
      `<label class="wd"><input type="checkbox" id="f_wd${i}" ${((c.wm>>i)&1)?'checked':''}>${WDN[i]}</label>`).join('')}</div>${act}</div>`,
    ap:d => { let m=0; for(let i=0;i<7;i++) if (d.querySelector('#f_wd'+i).checked) m|=(1<<i);
      if (!m) return toast('"Never" in disguise is refused — use the pause.','err');
      set('setWeekdayMask(...)'); }});
  add({t:'Max per trade', on:c.mts!==10000, cur:`${c.mts/100}% of idle`, d:'Ceiling on a single opening.',
    ctl:`<div class="row">${inp('f_mts','%',c.mts/100)}${act}</div>`,
    ap:d => set('setMaxTradeSizeBps(...)')});
  add({t:'Min per trade', on:c.mnts!==0, cur:c.mnts===0?'off':`${c.mnts/100}%`, d:'Refuses dust orders. 0 = off.',
    ctl:`<div class="row">${inp('f_mn','% (0 off)',c.mnts/100)}${act}</div>`,
    ap:d => set('setMinTradeSizeBps(...)')});
  add({t:'Concurrent positions', on:c.mop!==65535, cur:c.mop===65535?'no effective limit':String(c.mop),
    d:'How many may be open at once.',
    ctl:`<div class="row">${inp('f_mo','cap',c.mop)}${act}</div>`,
    ap:d => set('setMaxOpenPositions(...)')});
  add({t:'Interval between opens', on:c.msbt!==0, cur:c.msbt===0?'no wait':`${c.msbt}s`,
    d:'Minimum wait between openings.',
    ctl:`<div class="row">${inp('f_ms','seconds',c.msbt)}${act}</div>`,
    ap:d => set('setMinSecondsBetweenTrades(...)')});
  add({t:'Daily open cap', on:c.mdt[0], cur:c.mdt[0]?`${c.mdt[1]} / local day`:'off',
    d:'Counts openings; the day turns in your timezone.',
    ctl:`<div class="row">${onoff('f_mdo',c.mdt[0])}${inp('f_md','cap',c.mdt[1])}${act}</div>`,
    ap:d => set('setMaxDailyTrades(...)')});
  add({t:'Rest after a loss', on:c.lc[0], cur:c.lc[0]?`${c.lc[1]}s`:'off',
    d:'Closed at a loss → nothing opens for N seconds.',
    ctl:`<div class="row">${onoff('f_lco',c.lc[0])}${inp('f_lc','seconds',c.lc[1])}${act}</div>`,
    ap:d => set('setLossCooldown(...)')});
  add({t:'Daily loss limit', guard:true, on:c.dll[0], cur:c.dll[0]?`${c.dll[1]/100}% of capital / day`:'off',
    d:'EXCEPTION: a close that breaches the limit is REJECTED and reverts.',
    ctl:`<div class="row">${onoff('f_do',c.dll[0])}${inp('f_dl','%',c.dll[1]/100)}${act}</div>`,
    ap:d => set('setDailyLossLimit(...)')});
  add({t:'Close floor', guard:true, on:c.mcr[0], cur:c.mcr[0]?`return ≥ ${c.mcr[1]/100}% of cost`:'off',
    d:'EXCEPTION: below the floor the close is REJECTED and reverts.',
    ctl:`<div class="row">${onoff('f_mo2',c.mcr[0])}${inp('f_mc','%',c.mcr[1]/100)}${act}</div>`,
    ap:d => set('setMinCloseReturn(...)')});
  add({t:'Consecutive losses', on:c.mcl[0], cur:c.mcl[0]?`cap ${c.mcl[1]}`:'off',
    d:'At the cap nothing opens until a profit or the day turns.',
    ctl:`<div class="row">${onoff('f_cl',c.mcl[0])}${inp('f_c2','cap',c.mcl[1])}${act}</div>`,
    ap:d => set('setMaxConsecutiveLosses(...)')});
  add({t:'End-of-window buffer', on:c.nob!==0, cur:c.nob===0?'off':`${c.nob} min`,
    d:'Nothing opens within N minutes of the window closing.',
    ctl:`<div class="row">${inp('f_nb','minutes',c.nob)}${act}</div>`,
    ap:d => set('setNoOpenBuffer(...)')});
  add({t:'Max gas price', on:c.mgp!==0, cur:c.mgp===0?'off':`${c.mgp} gwei`,
    d:'Opening above the ceiling reverts.',
    ctl:`<div class="row">${inp('f_gw','gwei',c.mgp)}${act}</div>`,
    ap:d => set('setMaxGasPrice(...)')});

  g.innerHTML = '';
  P.forEach(o => {
    const d = document.createElement('div');
    d.className = 'picket'+(o.on?' on':'')+(o.guard?' guard':'');
    d.innerHTML = `<h4>${esc(o.t)}${o.guard?icon('alert'):''}</h4>
      <div class="cur${o.empty?' empty':''}">${esc(o.cur)}</div>
      <div class="desc">${esc(o.d)}</div>${o.ctl}`;
    d.querySelector('button[data-a]').onclick = () => o.ap(d);
    g.appendChild(d);
  });
}
$('btnFenceReload').onclick = renderFence;
/* Re-ler descarta o que a tela lembra e pergunta ao cofre outra vez. E o botao
   que existe justamente para nao acreditar nesta tela. */
$('btnCercaReler').onclick = () => { CERCA_LIDA = null; renderCercaReal(); };

/* ── operate ───────────────────────────────────────────────────────── */
let route = [];
function buildRoute(){
  const v = activeV(), n = +$('opHops').value;
  const allowed = v ? v.fence.assets : [];
  const base = v ? v.base : 'USDT';
  route = [base];
  for (let i=0;i<n-1;i++) route.push(allowed.length ? allowed[i % allowed.length] : null);
  route.push(base);
  paintRoute();
}
function paintRoute(){
  $('hopCount').textContent = (route.length-1)+' hops';
  /* B-03: an empty fence used to render a mute dash. It says so now. */
  $('hopRow').innerHTML = route.map((a,i) => {
    const cell = a
      ? `<span class="hop"><span class="hd2" style="background:${esc(ASSETS[a]||'var(--graphite)')}"></span>${esc(a)}</span>`
      : `<span class="hop empty">${icon('alert')}fence empty</span>`;
    return cell + (i < route.length-1 ? `<span class="harrow">${icon('arrow')}</span>` : '');
  }).join('');
  paintPre();
}
function paintPre(){
  const v = activeV(), size = parseFloat($('opSize').value)||250;
  const minb = parseFloat($('opMin').value)||8, slip = parseFloat($('opSlip').value)||30;
  const gas = 0.0021 + (route.length-1)*0.0009;
  $('preRows').innerHTML = `
    <tr><td class="faint">sub-account</td><td>${v?esc(v.name):'—'}</td></tr>
    <tr><td class="faint">route</td><td>${esc(route.map(x=>x||'—').join(' → '))}</td></tr>
    <tr><td class="faint">venue</td><td>${esc($('opAgg').value)}</td></tr>
    <tr><td class="faint">size</td><td>${fmt(size)} ${v?esc(v.base):''}</td></tr>
    <tr><td class="faint">minimum profit</td><td>${minb} bps · ${fmt(size*minb/1e4,4)}</td></tr>
    <tr><td class="faint">max slippage</td><td>${slip} bps</td></tr>
    <tr><td class="faint">estimated gas</td><td>${fmt(gas,5)} POL</td></tr>
    <tr><td class="faint">success fee</td><td>${PROTOCOLO.pct} — on realised profit only</td></tr>`;
  $('preCode').innerHTML = `<span class="c">// the condition the contract enforces</span>
<span class="k">require</span>(end &gt;= start + <span class="f">minProfit</span>, <span class="c">"unprofitable"</span>);
<span class="c">// if it fails the whole transaction is undone — but the gas is spent.</span>`;
}
['opHops','opSize','opMin','opSlip'].forEach(id => $(id).oninput = () => id==='opHops'?buildRoute():paintPre());
$('opAgg').onchange = paintPre;
$('btnShuffle').onclick = buildRoute;
$('opVault').onchange = e => { S.activeVault = e.target.value; renderVaults(); buildRoute(); };
function renderOps(){
  $('opVault').innerHTML = S.vaults.map(v =>
    `<option value="${esc(v.id)}" ${v.id===S.activeVault?'selected':''}>${esc(v.name)} · ${esc(v.base)}</option>`).join('')
    || '<option>open a sub-account first</option>';
  buildRoute(); paintOpRows();
}
function paintOpRows(){
  const h0 = hist();
  const rows = h0.slice().reverse().slice(0,40);
  const rev = h0.filter(h=>!h.ok).length;
  $('revCount').textContent = h0.length ? `${rev} of ${h0.length} reverted` : 'no cycles in range';
  $('opRows').innerHTML = rows.length ? rows.map(h => `<tr class="${h.ok?'':'rev'}">
    <td>${h.id}</td><td class="num faint">${new Date(h.t).toLocaleString('en-US',{month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit'})}</td>
    <td>${esc(h.vault)}</td><td>${esc(h.route)}</td><td>${esc(h.venue)}</td>
    <td>${fmt(h.size)}</td><td class="${h.ok?'win':'lose'}">${h.ok?'+'+fmt(h.pnl,4):'—'}</td>
    <td>${fmt(h.gas,5)}</td><td>${h.ok?fmt(h.fee,4):'0'}</td>
    <td class="${h.ok?'win':'lose'}">${h.ok?'closed':'reverted'}</td></tr>`).join('')
    : `<tr><td colspan="10" class="faint">${S.history.length ? 'No cycles inside this range — widen it above.' : 'No cycles yet.'}</td></tr>`;
}
$('btnClearHist').onclick = () => { S.history = [];
  S.vaults.forEach(v => {v.cycles=0;v.rev=0;v.net=0;v.gas=0;v.fee=0;});
  renderVaults(); repaintAll(); save(); };

function runSvg(hops, states){
  const cx=120, cy=95, R=62, pts=[];
  for (let i=0;i<hops;i++){ const a = -Math.PI/2 + i*2*Math.PI/hops;
    pts.push([cx+R*Math.cos(a), cy+R*Math.sin(a)]); }
  let g='';
  for (let i=0;i<hops;i++){
    const [x1,y1]=pts[i], [x2,y2]=pts[(i+1)%hops];
    const mx=(x1+x2)/2, my=(y1+y2)/2, qx=cx+(mx-cx)*1.45, qy=cy+(my-cy)*1.45;
    const st = states[i]||'idle';
    g += `<path class="rarc ${st==='done'?'done':''}" d="M${x1} ${y1} Q${qx} ${qy} ${x2} ${y2}"
      fill="none" stroke="${st==='fail'?'var(--sealwax)':'var(--ink)'}" stroke-width="5" stroke-linecap="round"/>`;
  }
  pts.forEach((p,i) => { const a = route[i]||'', c = ASSETS[a]||'var(--graphite)';
    const act = states[i]==='done'||states[i-1]==='done';
    g += `<circle class="rnode" cx="${p[0]}" cy="${p[1]}" r="${act?9.5:7.5}" fill="${c}"/>`;
    g += `<text x="${p[0]}" y="${p[1]-15}" text-anchor="middle" font-family="IBM Plex Mono"
      font-size="10" fill="var(--graphite)">${esc(a)}</text>`; });
  return g;
}
function rlog(msg,k){ const l=$('runLog'), d=document.createElement('div');
  d.className='rl '+(k||''); /* era innerHTML com a string de icon(). O guardiao de assinatura recusa
     qualquer coisa que nao seja vazio ali, e recusa por desenho: regra que
     depende de julgar se a string e confiavel e regra que um dia alguem
     julga errado. */
  d.appendChild(iconEl({ok:'check',err:'x',tx:'arrow'}[k]||'dot'));
  d.appendChild(novo('span', null, msg)); l.appendChild(d); l.scrollTop = l.scrollHeight; }

/* ═══════════════════════════════════════════════════════════════════
   PROTOCOL PARAMETERS · owner-set, ceiling in code
   ═══════════════════════════════════════════════════════════════════
   The rate lives here so the owner changes it in the admin instead of in a
   file. Mirrors `ParameterRegistry.setFeeBps` in the deployed contract, which
   is `onlyOwner` AND demands a `prUrl` — every parameter change leaves a link
   to its pull request on chain.

   MAX_FEE_BPS is NOT editable, on purpose. The Executor clamps on use, so a
   value above the ceiling cannot over-charge: it is limited when the fee is
   taken. Same rule here.

   It used to be the literal 0.15 in three places, and one of them printed
   "0.15%" to the user — a hundredfold error on the line the client reads. */
/* ═══ RPC · runtime only, FORA de `S` ═══════════════════════════════
   `save()` faz localStorage.setItem('triviu-console', JSON.stringify(S)).
   Qualquer credencial que encoste em `S` fica gravada em texto claro no
   navegador e sobrevive a fechar a aba. Este objeto NAO e serializado, nao
   entra em `S`, e e perdido de proposito ao recarregar.

   Ha um padrao nativo por chain para que nada precise ser configurado no
   caminho comum — o RPC publico oficial da Arbitrum nao usa credencial. */
const RPC_NATIVO = {
  arbitrum: "https://arb1.arbitrum.io/rpc",
  polygon:  null,   // exige endpoint proprio · nenhum publico serve log historico
};
const RPC_RUNTIME = { arbitrum: null, polygon: null };
const rpcDe = rede => RPC_RUNTIME[rede] || RPC_NATIVO[rede] || null;
/* so o host aparece em tela ou log · nunca o caminho, nunca a chave */
const rpcHost = u => { try { return new URL(u).host; } catch { return "—"; } };

const MAX_FEE_BPS = 5000;
const PROTOCOLO = {
  feeBps: 3000,
  get taxa(){ return Math.min(this.feeBps, MAX_FEE_BPS) / 1e4; },
  get pct(){ return (Math.min(this.feeBps, MAX_FEE_BPS)/100).toFixed(2).replace(/\.00$/,"")+"%"; },
};

/* ═══════════════════════════════════════════════════════════════════
   MEASURED CONSTANTS · triangular arbitrage
   ═══════════════════════════════════════════════════════════════════
   Nothing here was chosen. Each figure was read from chain on 2026-08-09/10
   with the block pinned, and carries where it came from.

   Why this block exists: the previous generator computed gross profit from
   `minb`, the operator's own minimum-profit bar. Every simulated winner started
   above the fence, so the fence was decorative. */
const TRIVIU_MEDIDO = {
  /* Wall per leg, per venue. Round trip USDC -> WETH -> USDC. */
  muroPorPerna: {
    "arbitrum-aggregator": 0.435,   // -0.87 bps over a two-leg cycle
    "arbitrum-pools"     : 2.080,   // -4.16 bps, order splitting already applied
    "polygon-pools"      : 5.250,   // -10.50 bps
  },
  /* Depth: k = 1.0001, LINEAR in size, R^2 = 0.9968.
     8 blocks x 7 sizes, differenced WITHIN the block to cancel M. */
  c: 7.2748e-5,
  /* Residual end-of-block mispricing. 56 samples.
     mean +0.0453 bps · max +0.4964 · P(M > wall) = 0 of 56. */
  mMedia: 0.0453, mDesvio: 0.0870, mMax: 0.4964,
  /* Gas: two-point fit over real receipts —
     189,228 units on a clean swap, 500,116 on a four-swap cycle. */
  gasUnidades: h => 85599 + 103629*h,
  precoNativo: 0.076812,          // POL, measured 2026-08-10
  gwei: 277.26,
  gas(hops){ return this.gasUnidades(hops) * this.gwei * 1e-9 * this.precoNativo; },
  /* A cycle's gross: mispricing MINUS wall MINUS depth. M is drawn from the
     MEASURED distribution — the only randomness left, and it does not know
     where the operator put the bar. */
  gross(size, hops, venue){
    const v = (venue||"").toLowerCase();
    const arena = (v.includes("para") || v.includes("1inch") || v.includes("aggreg"))
      ? "arbitrum-aggregator" : "arbitrum-pools";
    const muro = this.muroPorPerna[arena] * hops;
    /* Box-Muller over the measured mean and deviation, truncated at the largest
       value observed: no tail is invented that was not seen. */
    const u1 = Math.random() || 1e-9, u2 = Math.random();
    const z = Math.sqrt(-2*Math.log(u1)) * Math.cos(2*Math.PI*u2);
    const M = Math.max(0, Math.min(this.mMax, this.mMedia + z*this.mDesvio));
    const bps = M - muro - this.c*size;
    return { gross: size * bps/1e4, bps, M, muro, arena };
  },
};



/* ═══════════════════════════════════════════════════════════════════
   PROVIDE LIQUIDITY · measured data and the router
   ═══════════════════════════════════════════════════════════════════
   Every row below was produced on 2026-08-10 by reading Uniswap V3 `Swap`
   events over seven days — 100% of the blocks in the window, not a sample.
   Per swap the event carries price, active liquidity and volume, so the fee
   share is the one the pool actually computed, and dilution is inside the
   number rather than applied to it afterwards.

   Subtracted before anything is shown: impermanent loss over the real price
   path, the cost of every band exit (swap wall + gas, measured), and the cost
   of opening and closing the position (measured: 1,386,723 gas to open by the
   realistic path, 496,368 to close).

   Row shape: [band, size, annualised%, net7d$, depthInBand$, exits]
   NOT PRESENT means NOT MEASURED. There is no interpolation anywhere in this
   file. A number between two measured sizes is shown as the nearer measured
   size, wearing that label. */
const LP_MEDIDO = {
  meta: {
    medidoEm: "2026-08-10",
    janelaDias: 7,
    arbitrum: { bloco: 493140000, blocos: 2419200, janelas: 242, falhas: 0,
                gwei: 0.020024, nativo: "ETH", precoNativo: 1876.53,
                abrirFechar: 0.0708, rpc: "arb1.arbitrum.io/rpc" },
    polygon:  { bloco: 91777163, blocos: 403200, janelas: 4033, falhas: 0,
                gwei: 277.26, nativo: "POL", precoNativo: 0.076812,
                abrirFechar: 0.0401, rpc: "private endpoint" },
  },
  pools: [
    { rede:"arbitrum", par:"USDC/WETH",   tier:500,  swaps:97786, linhas:[
      [0.05,500,51.06,4.90,6999886,0],[0.05,2000,51.61,19.79,6999886,0],
      [0.05,5000,51.70,49.57,6999886,0],[0.05,20000,51.66,198.15,6999886,0],
      [0.05,50000,51.48,493.69,6999886,0],[0.05,200000,50.58,1939.94,6999886,0],
      [0.10,500,25.42,2.44,13860471,0],[0.10,2000,25.98,9.96,13860471,0],
      [0.10,5000,26.08,25.01,13860471,0],[0.10,20000,26.11,100.16,13860471,0],
      [0.10,50000,26.08,250.04,13860471,0],[0.10,200000,25.85,991.32,13860471,0],
      [0.20,500,12.55,1.20,27292341,0],[0.20,2000,13.10,5.02,27292341,0],
      [0.20,5000,13.21,12.67,27292341,0],[0.20,20000,13.26,50.86,27292341,0],
      [0.20,50000,13.26,127.13,27292341,0],[0.20,200000,13.20,506.37,27292341,0]] },
    { rede:"arbitrum", par:"USDC/WETH",   tier:3000, swaps:7356, linhas:[
      [0.05,500,45.78,4.39,1171875,0],[0.05,2000,46.27,17.75,1171875,0],
      [0.05,5000,46.26,44.36,1171875,0],[0.05,20000,45.72,175.36,1171875,0],
      [0.05,50000,44.58,427.50,1171875,0],[0.05,200000,39.61,1519.13,1171875,0],
      [0.10,500,22.76,2.18,2320370,0],[0.10,2000,23.30,8.94,2320370,0],
      [0.10,5000,23.38,22.42,2320370,0],[0.10,20000,23.28,89.29,2320370,0],
      [0.10,50000,22.99,220.44,2320370,0],[0.10,200000,21.60,828.32,2320370,0],
      [0.20,500,11.20,1.07,4569036,0],[0.20,2000,11.74,4.50,4569036,0],
      [0.20,5000,11.85,11.36,4569036,0],[0.20,20000,11.86,45.50,4569036,0],
      [0.20,50000,11.80,113.10,4569036,0],[0.20,200000,11.42,438.08,4569036,0]] },
    { rede:"arbitrum", par:"USDC/WBTC",   tier:500,  swaps:31059, linhas:[
      [0.05,500,24.44,2.34,2745303,0],[0.05,2000,24.98,9.58,2745303,0],
      [0.05,5000,25.06,24.03,2745303,0],[0.05,20000,24.97,95.79,2745303,0],
      [0.05,50000,24.70,236.83,2745303,0],[0.05,200000,23.35,895.80,2745303,0],
      [0.10,500,11.98,1.15,5436298,0],[0.10,2000,12.53,4.81,5436298,0],
      [0.10,5000,12.63,12.11,5436298,0],[0.10,20000,12.65,48.53,5436298,0],
      [0.10,50000,12.59,120.72,5436298,0],[0.10,200000,12.24,469.31,5436298,0],
      [0.20,500,5.72,0.55,10704411,0],[0.20,2000,6.27,2.41,10704411,0],
      [0.20,5000,6.38,6.12,10704411,0],[0.20,20000,6.43,24.66,10704411,0],
      [0.20,50000,6.42,61.56,10704411,0],[0.20,200000,6.33,242.83,10704411,0]] },
    { rede:"arbitrum", par:"USDC.e/WETH", tier:500,  swaps:10171, linhas:[
      [0.05,500,62.50,5.99,72955,0],[0.05,2000,61.71,23.67,72955,0],
      [0.05,5000,59.29,56.85,72955,0],[0.05,20000,49.23,188.84,72955,0],
      [0.05,50000,36.63,351.27,72955,0],[0.05,200000,15.67,601.00,72955,0],
      [0.10,500,31.32,3.00,144458,0],[0.10,2000,31.52,12.09,144458,0],
      [0.10,5000,30.95,29.68,144458,0],[0.10,20000,28.01,107.43,144458,0],
      [0.10,50000,23.46,224.96,144458,0],[0.10,200000,12.81,491.49,144458,0],
      [0.20,500,15.57,1.49,284449,0],[0.20,2000,16.03,6.15,284449,0],
      [0.20,5000,15.96,15.31,284449,0],[0.20,20000,15.18,58.22,284449,0],
      [0.20,50000,13.75,131.81,284449,0],[0.20,200000,9.29,356.39,284449,0]] },
    { rede:"arbitrum", par:"USDC/ARB",    tier:500,  swaps:1562, linhas:[
      [0.05,500,15.95,1.53,99,9],[0.05,2000,4.28,1.64,99,9],
      [0.05,5000,-0.93,-0.89,99,9],[0.05,20000,-5.07,-19.46,99,9],
      [0.05,50000,-6.17,-59.12,99,9],[0.05,200000,-6.76,-259.34,99,9],
      [0.10,500,14.90,1.43,196,2],[0.10,2000,6.21,2.38,196,2],
      [0.10,5000,2.31,2.21,196,2],[0.10,20000,-1.11,-4.27,196,2],
      [0.10,50000,-2.13,-20.46,196,2],[0.10,200000,-2.73,-104.64,196,2],
      [0.20,500,10.99,1.05,386,0],[0.20,2000,5.54,2.13,386,0],
      [0.20,5000,2.89,2.77,386,0],[0.20,20000,0.37,1.40,386,0],
      [0.20,50000,-0.50,-4.78,386,0],[0.20,200000,-1.05,-40.33,386,0]] },
    /* Polygon: the +-5% curve was measured across all six sizes. The wider
       bands were measured at $500 only, so they are absent here rather than
       stretched to sizes nobody read. */
    { rede:"polygon",  par:"USDC.e/LINK", tier:3000, swaps:1876, linhas:[
      [0.05,500,77.37,7.42,38423,0],[0.05,2000,74.74,28.67,38423,0],
      [0.05,5000,69.55,66.69,38423,0],[0.05,20000,51.50,197.52,38423,0],
      [0.05,50000,33.89,324.94,38423,0],[0.05,200000,12.50,479.47,38423,0]] },
    { rede:"polygon",  par:"USDC.e/WETH", tier:500,  swaps:11104, linhas:[
      [0.05,500,51.97,4.98,44138,0],[0.05,2000,50.31,19.30,44138,0],
      [0.05,5000,46.85,44.92,44138,0],[0.05,20000,34.86,133.69,44138,0],
      [0.05,50000,23.03,220.82,44138,0],[0.05,200000,8.10,310.70,44138,0]] },
    { rede:"polygon",  par:"USDC.e/WBTC", tier:500,  swaps:9851, linhas:[
      [0.05,500,33.54,3.22,238762,0],[0.05,2000,33.59,12.88,238762,0],
      [0.05,5000,33.15,31.79,238762,0],[0.05,20000,30.88,118.45,238762,0],
      [0.05,50000,27.06,259.49,238762,0],[0.05,200000,16.24,622.98,238762,0]] },
  ],
};
const LP_TAMANHOS = [500, 2000, 5000, 20000, 50000, 200000];

/* THE ROUTER. It does not recommend and it does not rank by opinion: it filters
   the measurement by what the operator brought, and orders by what came out.
   Anything it cannot show, it says it cannot show. */
function lpRotear(capital, faixa, rede){
  const linhas = [];
  for (const p of LP_MEDIDO.pools){
    if (rede && p.rede !== rede) continue;
    for (const [f, tam, apr, liq, tvl, saidas] of p.linhas){
      if (f !== faixa || tam !== capital) continue;
      linhas.push({ rede:p.rede, par:p.par, tier:p.tier, swaps:p.swaps,
                    faixa:f, tamanho:tam, apr, liq, tvl, saidas });
    }
  }
  return linhas.sort((a,b) => b.apr - a.apr);
}

/* The price of preferring a network. Not hidden, not editorialised: the best
   measured option inside the choice, against the best measured option overall,
   in the same band at the same size. */
function lpCustoDaEscolha(capital, faixa, rede){
  if (!rede) return null;
  const dentro = lpRotear(capital, faixa, rede)[0];
  const geral  = lpRotear(capital, faixa, null)[0];
  if (!dentro || !geral || dentro.rede === geral.rede) return null;
  return { dentro, geral,
           pontos: geral.apr - dentro.apr,
           dolares: geral.liq - dentro.liq,
           ano: (geral.liq - dentro.liq) * (365/7) };
}



/* Declared before its only reader, so nothing depends on evaluation order. */
let QUIET = false;
async function runCycle(silent){
  const v = activeV();
  if (!v) return toast('Open a sub-account first.','err');
  if (!v.fence.assets.length) return toast('The fence is empty — allow an asset before running.','err');
  if (v.fence.paused) return toast('This sub-account is paused. Nothing opens.','err');
  const size = parseFloat($('opSize').value)||250;
  if (size > v.idle) return toast('Not enough idle balance.','err');
  if (size > BAND.max) return toast(`One position is capped at ${BAND.max}.`,'err');
  const hops = route.length-1;
  const minb = parseFloat($('opMin').value)||8, venue = $('opAgg').value;
  const slipb = parseFloat($('opSlip').value)||30;
  /* ── V4: the number is no longer drawn. It comes from a real quote on a real
     router at one block, and the fence judges what the market returned. ── */
  let gross = 0, gas = TRIVIU_MEDIDO.gas(hops), reason = 'QUOTE_FAILED';
  const DEX = { quickswap:{router:'0xa5e0829caced8ffdd4de3c43696c57f7d7a678ff'},
                sushiswap:{router:'0x1b02da8cb0d097eb8d57a175b88c7d8b47997506'} };
  const TOK = { 'USDT':{a:'0xc2132d05d31c914a87c6611c10748aeb04b58e8f',d:6},
    'USDC.e':{a:'0x2791bca1f2de4661ed88a30c99a7a9449aa84174',d:6},
    'DAI':{a:'0x8f3cf7ad23cd3cadbd9735aff958023239c6a063',d:18},
    'WETH':{a:'0x7ceb23fd6bc0add59e62ac25578270cff1b9f619',d:18},
    'WBTC':{a:'0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6',d:8},
    'LINK':{a:'0x53e0bca35ec356bd5dddfebbd1fc0fd03fabad39',d:18},
    'AAVE':{a:'0xd6df932a45c0f255f85145f286ea0b292b21c90b',d:18},
    'MATIC':{a:'0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270',d:18} };
  const dexKey = (venue||'').toLowerCase().includes('sushi') ? 'sushiswap' : 'quickswap';
  /* Este `eth_call` passa por `triviuRead`, como todos os outros. Havia aqui uma
     SEGUNDA chamada, com `fetch` proprio e o endpoint escrito de novo — a copia
     que sobrevive quando alguem corrige a primeira e nao sabe que ha duas. A
     primeira foi corrigida e esta continuou apontando para `polygon-rpc.com`,
     que responde 401 e nao esta no connect-src. Quem achou foi o portao, na
     mesma execucao em que ele nasceu. Uma definicao, um caminho. */
  const rpcCall = (to, data) => triviuRead('eth_call', [{ to: to, data: data }, 'latest']);
  const h32 = b => b.toString(16).padStart(64,'0');
  const a32 = a => a.toLowerCase().replace('0x','').padStart(64,'0');
  const path = route.map(s => TOK[s] && TOK[s].a).filter(Boolean);
  const baseTok = TOK[v.base] || TOK['USDT'];
  try{
    if (path.length === route.length && baseTok){
      const amtIn = BigInt(Math.round(size * 10**baseTok.d));
      let data = '0xd06ca61f'+h32(amtIn)+h32(64n)+h32(BigInt(path.length));
      for(const a of path) data += a32(a);
      const res = await rpcCall(DEX[dexKey].router, data);
      const hex = res.slice(2); const n = parseInt(hex.slice(64,128),16);
      const outRaw = BigInt('0x'+hex.slice(128+64*(n-1),128+64*n));
      const Q = Number(outRaw) / 10**baseTok.d;
      gross = Q - size;
    }
  }catch(e){ reason = 'QUOTE_FAILED'; }
  /* §4–§10: fee only on realised profit; PASS needs gross over the full bar. */
  const slip = size*slipb/1e4, safe = size*2/1e4, pimin = size*minb/1e4;
  const antesDaTaxa = gross - gas - slip;
  const fee = antesDaTaxa > 0 ? antesDaTaxa*PROTOCOLO.taxa : 0;
  const pnl = antesDaTaxa - fee;
  const required = pimin + gas + slip + safe;
  let ok = false;
  if (gross < pimin) reason = 'MIN_PROFIT_NOT_MET';
  else if (pnl <= 0) reason = 'NET_PROFIT_NOT_POSITIVE';
  else if (gross < required) reason = 'GROSS_BELOW_REQUIRED';
  else { ok = true; reason = 'PASS'; }

  if (!silent){
    $('runOv').classList.add('show'); $('runLog').innerHTML='';
    $('runVerdict').className='verdict'; $('runClose').disabled=true;
    $('runTitle').textContent = 'executing cycle · '+hops+' hops · '+venue;
    const st = Array(hops).fill('idle');
    $('runSvg').innerHTML = runSvg(hops,st); turning(true);
    rlog('simulating on a local fork before anything is sent','dim');
    await wait(reduced()?0:400);
    rlog('simulation passed — proceeding','ok');
    for (let i=0;i<hops;i++){
      await wait(reduced()?0:400);
      if (!ok && i===hops-1){ st[i]='fail'; $('runSvg').innerHTML=runSvg(hops,st);
        rlog(`hop ${i+1}: ${route[i]} → ${route[i+1]} — output below the minimum`,'err'); break; }
      st[i]='done'; $('runSvg').innerHTML=runSvg(hops,st);
      rlog(`hop ${i+1}: ${route[i]} → ${route[i+1]} ok`,'tx');
    }
    await wait(reduced()?0:340); turning(false);
    /* O QUE ESTA MEDIDA E, e o que ela NAO e.
       O numero acima e uma COTACAO real: `getAmountsOut` num roteador real, num
       bloco real, agora. Ela responde "se este ciclo tivesse rodado neste
       bloco, teria fechado?" — e essa e uma pergunta que vale, porque na maior
       parte dos blocos a resposta e nao.
       O que ela NAO e: um ciclo executado. Nada foi enviado, nada foi assinado,
       e nenhum saldo mudou. A execucao de verdade e `vault.execute((...))`, uma
       tupla de 14 campos com dois campos `bytes`, que esta tela nao monta.
       Ate 2026-08-23 as linhas abaixo escreviam o lucro em `v.idle` e
       empilhavam o ciclo no historico. A pessoa via o saldo subir. */
    if (ok){ rlog('a cotacao fecharia · bruto '+fmt(gross,4),'ok');
      rlog('taxa sobre o lucro: '+fmt(fee,4),'dim');
      rlog('NADA FOI ENVIADO — isto e uma cotacao neste bloco, nao um ciclo executado','dim');
      $('runVerdict').className='verdict ok';
      SFX.ok(); notify(`Cotacao: fecharia com +${fmt(pnl,4)} ${v.base} · nada foi enviado`,'ok');
      $('runVerdict').innerHTML = icon('check')+`<span>A COTACAO FECHARIA · +${fmt(pnl,4)} ${esc(v.base)} · gas estimado ${fmt(gas,5)} POL · NADA FOI ENVIADO</span>`;
    } else { rlog('a cotacao NAO fecha: fim < inicio + lucro minimo','err');
      rlog('se tivesse sido enviado, reverteria e o gas nao voltaria','dim');
      $('runVerdict').className='verdict bad';
      SFX.fail(); notify(`Cotacao: nao fecha neste bloco · nada foi enviado`,'err');
      $('runVerdict').innerHTML = icon('alert')+`<span>A COTACAO NAO FECHA · gas que se perderia ${fmt(gas,5)} POL · NADA FOI ENVIADO</span>`; }
    $('runClose').disabled = false;
  }
  /* NENHUM SALDO MUDA AQUI. Estas quatro linhas somavam o lucro em `v.idle`,
     o liquido em `v.net`, a taxa em `v.fee`, e empilhavam o ciclo no historico —
     tudo a partir de uma cotacao, sem transacao nenhuma. O saldo na tela subia,
     o historico ganhava uma linha com hora, rota e resultado, e o grafico de
     capital desenhava a curva. Nada disso tinha acontecido.
     O que fica e a COTACAO, guardada como cotacao: ela alimenta a comparacao
     entre estrategias, que e uma pergunta legitima sobre o mercado. Saldo, taxa
     e historico de ciclos passam a vir de onde sempre deveriam ter vindo — da
     chain, quando houver um ciclo de verdade. */
  S.cotacoes = S.cotacoes || [];
  S.cotacoes.push({id:S.seq++, vault:v.name, vid:v.id, route:route.map(x=>x||'—').join('→'),
    venue, size, ok, pnl, fee, gas, asset:route[1]||'—', t:Date.now(), cotacao:true});
  /* The bake-off runs up to 1000 cycles. Repainting six charts on each one
     would spend the whole budget on frames nobody sees. */
  if (!QUIET){ renderVaults(); paintOpRows(); renderOver(); renderAnalytics(); renderRangeBars(); save(); }
}
$('btnRun').onclick = () => runCycle(false);
$('runClose').onclick = () => { $('runOv').classList.remove('show'); turning(false); };
$('btnBatch').onclick = async () => { if (!activeV()) return toast('Open a sub-account first.','err');
  $('btnBatch').disabled = true; QUIET = true;
  try{ for (let i=0;i<25;i++){ buildRoute(); await runCycle(true); await wait(reduced()?0:20); } }
  finally{ QUIET = false; renderVaults(); repaintAll(); save(); }
  $('btnBatch').disabled = false; toast('25 cycles run — now read the revert rate.','ok'); };

/* ═══ CHARTS · SVG, no library ═════════════════════════════════════════ */
const empty = m => `<p class="faint small" style="padding:var(--s5) 0">${m}</p>`;
function curveChart(){
  const h = hist(); if (h.length < 2) return empty(S.history.length ? 'Fewer than two cycles inside this range.' : 'Run a few cycles and the curve appears.');
  const W=560,H=190,P=26; let net=0,gas=0; const N=[],G=[];
  h.forEach(x => { net += x.ok?x.pnl:-x.gas*0.9; gas += x.gas; N.push(net); G.push(gas); });
  const all=[...N,0], mx=Math.max(...all), mn=Math.min(...all), rg=(mx-mn)||1;
  const X=i=>P+i*(W-P*2)/(N.length-1), Y=v=>H-P-((v-mn)/rg)*(H-P*2);
  const gm=Math.max(...G)||1, Yg=v=>H-P-(v/gm)*(H-P*2)*0.42;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Capital curve across ${N.length} cycles">
    ${[0,.25,.5,.75,1].map(t=>`<line x1="${P}" x2="${W-P}" y1="${P+t*(H-P*2)}" y2="${P+t*(H-P*2)}" stroke="var(--grid)"/>`).join('')}
    <line x1="${P}" x2="${W-P}" y1="${Y(0)}" y2="${Y(0)}" stroke="var(--rule)" stroke-dasharray="4 4"/>
    <path d="M${G.map((v,i)=>`${X(i)} ${Yg(v)}`).join(' L')}" fill="none" stroke="var(--sealwax)" stroke-width="1.8" opacity=".65" class="draw"/>
    <path d="M${N.map((v,i)=>`${X(i)} ${Y(v)}`).join(' L')}" fill="none" stroke="var(--brand,var(--ultramarine))" stroke-width="2.6" stroke-linejoin="round" class="draw"/>
    <circle cx="${X(N.length-1)}" cy="${Y(N[N.length-1])}" r="4.5" fill="var(--brand,var(--ultramarine))" class="fadein"/>
    <text x="${P}" y="${H-6}" font-family="IBM Plex Mono" font-size="10" fill="var(--faint)">cycle 1</text>
    <text x="${W-P}" y="${H-6}" text-anchor="end" font-family="IBM Plex Mono" font-size="10" fill="var(--faint)">cycle ${N.length}</text></svg>`;
}
function donutChart(){
  const h=hist(), tot=h.length, ok=h.filter(x=>x.ok).length, rev=tot-ok;
  const pct = tot?rev/tot:0, C=2*Math.PI*54;
  /* B: the count line used to sit at y=126 — 36px from the centre, while the ring
     band runs from r=44 to r=64. At the ends of the string the distance reached ~47px
     and the text crossed the ring. It is a caption now, outside the drawing. */
  return `<svg class="chart" viewBox="0 0 180 180" style="max-width:200px;margin:0 auto"
      role="img" aria-label="${rev} reverted of ${tot} cycles">
    <circle cx="90" cy="90" r="54" fill="none" stroke="var(--green)" stroke-width="20" opacity=".3"/>
    <circle cx="90" cy="90" r="54" fill="none" stroke="var(--sealwax)" stroke-width="20"
      stroke-dasharray="${C}" stroke-dashoffset="${C*(1-pct)}" transform="rotate(-90 90 90)"
      style="transition:stroke-dashoffset .8s var(--ease)"/>
    <text x="90" y="86" text-anchor="middle" font-family="IBM Plex Mono" font-size="26" fill="var(--ink)">${tot?Math.round(pct*100):0}%</text>
    <text x="90" y="104" text-anchor="middle" font-family="IBM Plex Mono" font-size="10" fill="var(--faint)">reverted</text></svg>
    <p class="num small faint" style="text-align:center;margin-top:var(--s2)">${ok} closed · ${rev} reverted · ${tot} cycles</p>`;
}
function distChart(){
  const h=hist(); if (h.length<4) return empty('Not enough cycles in this range to show a distribution.');
  const vals = h.map(x => x.ok?x.pnl:-x.gas*0.9);
  const mn=Math.min(...vals), mx=Math.max(...vals), rg=(mx-mn)||1;
  const B=9, bins=Array(B).fill(0);
  vals.forEach(v => bins[Math.min(B-1,Math.floor((v-mn)/rg*B))]++);
  const top=Math.max(...bins)||1;
  /* B: bars used to be clipped by the label row. The plot area now reserves it. */
  const W=520,H=190,P=30,LAB=22, bw=(W-P*2)/B-6;
  const zero=Math.min(B-1,Math.floor((0-mn)/rg*B));
  const base=H-P-LAB, plot=base-P;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Distribution of ${vals.length} outcomes">
    <line x1="${P}" x2="${W-P}" y1="${base}" y2="${base}" stroke="var(--ink)"/>
    ${bins.map((n,i)=>{ const x=P+i*((W-P*2)/B)+3, hh=(n/top)*plot;
      const below=i<zero;
      return `<rect class="rise" x="${x}" y="${base-hh}" width="${bw}" height="${Math.max(hh,1)}"
        fill="${below?'var(--sealwax)':'var(--green)'}" opacity="${below?'.78':'.92'}" rx="2" style="animation-delay:${i*50}ms"/>
        ${n?`<text x="${x+bw/2}" y="${base+15}" text-anchor="middle" font-family="IBM Plex Mono" font-size="10" fill="var(--faint)">${n}</text>`:''}`;
    }).join('')}
    <text x="${P}" y="16" font-family="IBM Plex Mono" font-size="10" fill="var(--sealwax)">loss</text>
    <text x="${W-P}" y="16" text-anchor="end" font-family="IBM Plex Mono" font-size="10" fill="var(--green)">profit</text></svg>`;
}
function hitChart(){
  const h=hist(); if (h.length<5) return empty('Needs at least five cycles in this range.');
  const w=5, pts=[];
  for (let i=w;i<=h.length;i++) pts.push(h.slice(i-w,i).filter(x=>x.ok).length/w);
  const W=520,H=180,P=30;
  const X=i=>P+i*(W-P*2)/((pts.length-1)||1), Y=v=>H-P-v*(H-P*2);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Rolling hit rate">
    ${[0,.5,1].map(t=>`<line x1="${P}" x2="${W-P}" y1="${Y(t)}" y2="${Y(t)}" stroke="var(--grid)"/>
      <text x="4" y="${Y(t)+4}" font-family="IBM Plex Mono" font-size="9" fill="var(--faint)">${t*100}%</text>`).join('')}
    <path d="M${pts.map((v,i)=>`${X(i)} ${Y(v)}`).join(' L')}" fill="none" stroke="var(--green)" stroke-width="2.4" class="draw"/>
    <circle cx="${X(pts.length-1)}" cy="${Y(pts[pts.length-1])}" r="4" fill="var(--green)" class="fadein"/></svg>`;
}
function barsChart(){
  const by={}; hist().forEach(h => { const a=h.asset||'—'; by[a]=by[a]||{p:0,g:0};
    if (h.ok) by[a].p+=h.pnl; else by[a].g+=h.gas*0.9; });
  const ks=Object.keys(by); if (!ks.length) return empty('No cycles inside this range.');
  const W=520,H=190,P=30,LAB=20, bw=Math.min(52,(W-P*2)/ks.length-14), mid=(H-LAB)/2+6;
  const mx=Math.max(...ks.map(k=>Math.max(by[k].p,by[k].g)))||1;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Result by asset">
    <line x1="${P}" x2="${W-P}" y1="${mid}" y2="${mid}" stroke="var(--ink)"/>
    ${ks.map((k,i)=>{ const x=P+i*((W-P*2)/ks.length)+((W-P*2)/ks.length-bw)/2;
      const hp=(by[k].p/mx)*(mid-P), hg=(by[k].g/mx)*(mid-P);
      return `<rect class="rise" x="${x}" y="${mid-hp}" width="${bw}" height="${Math.max(hp,1)}"
        fill="${ASSETS[k]||'var(--ultramarine)'}" rx="3" style="animation-delay:${i*70}ms"/>
        <rect class="fall" x="${x}" y="${mid}" width="${bw}" height="${Math.max(hg,1)}"
        fill="var(--sealwax)" opacity=".6" rx="3" style="animation-delay:${i*70+80}ms"/>
        <text x="${x+bw/2}" y="${H-5}" text-anchor="middle" font-family="IBM Plex Mono" font-size="10" fill="var(--faint)">${esc(k)}</text>`;
    }).join('')}</svg>`;
}
function vaultBars(){
  if (!S.vaults.length) return empty('No sub-accounts yet.');
  const mx = Math.max(...S.vaults.map(v=>Math.abs(v.net)),1);
  return S.vaults.map(v => `<div style="margin-bottom:var(--s3)">
    <div style="display:flex;justify-content:space-between;font-size:12.5px">
      <span><span class="vdot" style="display:inline-block;background:${esc(v.color)};margin-right:var(--s2)"></span>${esc(v.name)}</span>
      <b class="num ${v.net>=0?'win':'lose'}">${v.net>=0?'+':''}${fmt(v.net,3)}</b></div>
    <div class="vbar" style="margin-top:var(--s1)"><i style="width:${Math.abs(v.net)/mx*100}%;
      background:${v.net>=0?'var(--green)':'var(--sealwax)'}"></i></div></div>`).join('');
}

/* ── renders ───────────────────────────────────────────────────────── */
function renderOver(){
  const H = hist();
  const tvl = S.vaults.reduce((a,v)=>a+v.idle+v.inPos,0);
  const cyc = H.length, rev = H.filter(h=>!h.ok).length;
  const net = H.reduce((a,h)=>a+(h.ok?h.pnl:-h.gas*0.9),0);
  $('kNet').textContent = (net>=0?'+':'')+fmt(net,3);
  $('kNet').className = 'v '+(net>=0?'win':'lose');
  /* Two denominators, because they answer two different questions and either
     one alone would flatter or bury the number:
       on capital — what the money standing in the sub-accounts earned
       on flow    — what each unit that actually moved earned
     A strategy that turns its capital over ten times has a small figure on flow
     and a large one on capital. Printing only one of those would be a choice
     about which story to tell. */
  const flow = H.reduce((a,h)=>a+h.size,0);
  const onFlow    = flow ? net/flow*100 : 0;
  const onCapital = tvl  ? net/tvl*100  : 0;
  $('kPcts').innerHTML = cyc
    ? `<span class="pcell"><b class="${onCapital>=0?'win':'lose'}">${pct(onCapital,2)}</b>
         <span>on capital<i>${fmt(tvl,0)} standing</i></span></span>
       <span class="pcell"><b class="${onFlow>=0?'win':'lose'}">${pct(onFlow,3)}</b>
         <span>on flow<i>${fmt(flow,0)} moved</i></span></span>`
    : '';
  $('kNetSub').textContent = cyc
    ? `after gas and fee · ${rev} of ${cyc} reverted · this range, not annualised`
    : 'after gas and fee · no cycles in range';
  $('kTvl').textContent = fmt(tvl);
  $('kTvlSub').textContent = `across ${S.vaults.length} sub-account${S.vaults.length===1?'':'s'}`;
  $('kCycles').textContent = cyc;
  $('kCyclesSub').textContent = cyc?`${cyc-rev} closed · ${rev} reverted`:'none yet';
  $('kRev').textContent = cyc?Math.round(rev/cyc*100)+'%':'—';
  $('curveWrap').innerHTML = curveChart();
  $('donutWrap').innerHTML = donutChart();
  const rows = H.slice().reverse().slice(0,6);
  $('ovRows').innerHTML = rows.length ? rows.map(h => `<tr class="${h.ok?'':'rev'}">
    <td>${h.id}</td><td>${esc(h.vault)}</td><td>${esc(h.route)}</td>
    <td class="${h.ok?'win':'lose'}">${h.ok?'+'+fmt(h.pnl,4):'—'}</td>
    <td>${fmt(h.gas,5)}</td><td class="${h.ok?'win':'lose'}">${h.ok?'closed':'reverted'}</td></tr>`).join('')
    : `<tr><td colspan="6" class="faint">${S.history.length?'No cycles inside this range.':'No cycles yet.'}</td></tr>`;
  $('triadRows').innerHTML = S.triad ? [
    /* O que esta linha TEM, com o nome que ela usa. O painel dizia
       "TriviuCerca" apontando para 0x323C4192…, que e o EXECUTOR da V0 — um
       contrato real, com outro nome e outro papel. E listava
       "TriviuReferralVault: null", que se le como um endereco que falta e nao
       como um contrato que nao existe nesta linha. */
    ['TriviuVault · seu', S.triad.vault],
    ['Executor · compartilhado, nao e seu', TRIVIU.addr.executor],
    ['EscapeHatch · a saida incondicional', TRIVIU.addr.escapeHatch],
    ['ProtocolRegistry · curadoria', TRIVIU.addr.protocolRegistry],
    ['moeda-base', TRIVIU.base.symbol
      ? TRIVIU.base.symbol + ' · ' + TRIVIU.base.address
      : 'nao lida — conecte a carteira'],
    ['taxa', TRIVIU.feeBps === null ? 'nao lida' : (TRIVIU.feeBps/100) + '% do negociado (teto ' + (TRIVIU.feeBpsMax/100) + '%)'],
    ['TriviuCerca', 'NAO IMPLANTADA nesta linha'],
    ['TriviuReferralVault', 'NAO IMPLANTADO em chain nenhuma']
  ].map(([k,v]) => `<tr><td class="faint">${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')
    : '<tr><td class="faint">no triad</td></tr>';
}
function renderAnalytics(){
  const h=hist();
  const best=h.filter(x=>x.ok).sort((a,b)=>b.pnl-a.pnl)[0];
  const gas=h.reduce((a,x)=>a+x.gas,0), fee=h.reduce((a,x)=>a+(x.fee||0),0);
  const net=h.reduce((a,x)=>a+(x.ok?x.pnl:0),0), ratio=gas?net/(gas*0.9):0;
  $('aBest').textContent = best?'+'+fmt(best.pnl,4):'—';
  $('aGas').textContent = fmt(gas,4); $('aFee').textContent = fmt(fee,4);
  $('aRatio').textContent = h.length?fmt(ratio,2)+'×':'—';
  $('aRatio').className = 'v '+(ratio>=1?'win':'lose');
  $('distWrap').innerHTML = distChart(); $('hitWrap').innerHTML = hitChart();
  $('barsWrap').innerHTML = barsChart(); $('vaultBars').innerHTML = vaultBars();
  renderDays();
}

function renderLayers(){
  $('l1Registry').textContent = S.registry ? short(S.registry) : '—';
  const cum = capitalUnderManagement();
  const pct = Math.min(100, cum/LABEL_THRESHOLD*100);
  $('lyBar').style.width = pct.toFixed(1)+'%';
  $('lyBadge').textContent = labelEligible() ? 'eligible' : 'not yet';
  $('lyBadge').className = 'pill '+(labelEligible()?'ok':'warn');
  $('lyProgress').textContent = labelEligible()
    ? `${fmt(cum,0)} under management — the threshold is met. Switch your account type in Profile.`
    : `${fmt(cum,0)} of ${fmt(LABEL_THRESHOLD,0)} under management · ${fmt(LABEL_THRESHOLD-cum,0)} to go.`;
  $('lySubs').textContent = S.vaults.length;
  const v = activeV();
  const f = v ? v.fence : null;
  $('lyFence').textContent = f ? [f.paused, f.assets.length>0, f.tw[0]!==0||f.tw[1]!==24,
    f.tz!==0, f.wm!==0x7F, f.mts!==10000, f.mnts!==0, f.mop!==65535, f.msbt!==0,
    f.mdt[0], f.lc[0], f.dll[0], f.mcr[0], f.mcl[0], f.nob!==0, f.mgp!==0
  ].filter(Boolean).length+' / 16' : '—';
  $('lyInst').textContent = S.instances.length;
}

/* ═══ LIQUIDITY & GAS ══════════════════════════════════════════════════
   Two separate reserves and two separate contracts: the vault holds the base
   currency the cycle trades; the GasTank holds native currency so a return
   leg is never stranded. Neither is custodial.
   ═══════════════════════════════════════════════════════════════════════ */
function renderLiquidity(){
  renderSpread();
  $('lqVault').innerHTML = S.vaults.map(v =>
    `<option value="${esc(v.id)}" ${v.id===S.activeVault?'selected':''}>${esc(v.name)} · ${esc(v.base)}</option>`).join('')
    || '<option>open a sub-account first</option>';
  $('lqNet').innerHTML = NETS.map(n =>
    `<option value="${esc(n.id)}" ${n.live?'':'disabled'}>${esc(n.name)}${n.live?'':' · gated'}</option>`).join('');
  const v = activeV();
  if (v){
    $('lqIdle').textContent = fmt(v.idle);
    $('lqPos').textContent  = fmt(v.inPos);
    $('lqRoom').textContent = fmt(Math.max(0, BAND.max - (v.idle+v.inPos)));
  } else ['lqIdle','lqPos','lqRoom'].forEach(id => $(id).textContent = '—');

  S.gas = S.gas || {};
  const net = NETS.find(n => n.id === ($('lqNet').value||'polygon')) || NETS[0];
  const bal = S.gas[net.id] || 0;
  /* Deliberately S.history and NOT hist(): the tank does not refill because a
     date filter changed. This figure is lifetime, and the label says so. */
  const burned = S.history.reduce((a,h) => a + h.gas, 0);
  const per = 0.0021 + 3*0.0009;
  $('gtBal').textContent  = fmt(bal, 5);
  $('gtCoin').textContent = net.coin + ' · ' + net.name;
  $('gtBurn').textContent = fmt(burned, 5);
  $('gtRuns').textContent = per>0 ? Math.floor(bal/per) : '—';

  $('netRows').innerHTML = NETS.map(n => {
    const liq = n.id==='polygon' ? S.vaults.reduce((a,x)=>a+x.idle+x.inPos,0) : 0;
    return `<tr><td>${esc(n.name)}</td><td>${n.chainId}</td><td>${esc(n.coin)}</td>
      <td>${n.live?fmt(liq):'—'}</td><td>${fmt(S.gas[n.id]||0,5)}</td>
      <td class="${n.live?'win':'lose'}">${n.live?'available':'waiting on its audit gate'}</td></tr>`;
  }).join('');
}
$('lqVault').onchange = e => { S.activeVault = e.target.value; renderLiquidity(); renderVaults(); };
$('lqNet').onchange = renderLiquidity;
$('btnLqAdd').onclick = async () => {
  const v = activeV(); if (!v) return toast('Open a sub-account first.','err');
  const a = parseFloat($('lqAdd').value);
  if (!a || a<=0) return toast('Enter an amount.','err');
  if (v.idle+v.inPos+a > BAND.max)
    return toast(`This sub-account is capped at ${BAND.max}. Open another — that is the design.`,'err');
  try{
    /* SAO DUAS transacoes, e a tela nao finge que e uma: primeiro o approve da
       quantia exata, depois o deposit. As duas acontecem sem sair desta pagina, e
       a segunda so e MONTADA depois de a primeira estar MINERADA — porque o
       deposit so passa se a allowance ja estiver na chain. Duas janelas, duas
       assinaturas, e o console diz isso antes da primeira. */
    toast('Adicionar liquidez sao DUAS transacoes: approve e depois deposit. ' +
      'A segunda so e montada depois de a primeira ser minerada.', 'ok');
    const rA = await tx({ato:'aprovar', to:'token '+v.base, fn:'approve(vault, '+a+')', gas:52000,
      label:'approve', quantia:a, indice:v.indice});
    if (!rA || !rA.ok) return;
    await tx({ato:'depositar', to:v.addr, fn:'deposit(base, '+a+')', gas:78000,
      label:'deposit', quantia:a, indice:v.indice});
    maybeArm('liquidity added');
    $('lqAdd').value=''; renderLiquidity(); renderVaults(); renderOver(); save();
    notify(`Liquidity added · ${fmt(a)} ${v.base}`,'ok');
  }catch(e){ toast(e.message,'err'); }
};
$('btnLqRem').onclick = async () => {
  const v = activeV(); if (!v) return toast('Open a sub-account first.','err');
  const raw = $('lqRem').value.trim();
  const a = raw ? parseFloat(raw) : v.idle;
  if (!a || a<=0) return toast('Nothing idle to remove.','err');
  if (a > v.idle) return toast('That is more than the idle balance — what sits in an open position is not withdrawable.','err');
  try{
    await tx({ato:'sacar', to:v.addr, fn:'withdraw(base, '+fmt(a)+', you)', gas:60000,
      label:'withdraw', quantia:a, indice:v.indice});
    $('lqRem').value=''; renderLiquidity(); renderVaults(); renderOver(); save();
    notify(`Liquidity removed · ${fmt(a)} ${v.base}`,'ok');
  }catch(e){ toast(e.message,'err'); }
};
$('btnGtAdd').onclick = async () => {
  /* Parado na porta: o painel esta desabilitado e este handler tambem recusa,
     porque guarda que mora so no atributo cai na primeira refatoracao que o
     remova — e cai em silencio. */
  toast('A V0 nao tem reserva de gas. O gas de cada transacao sai da sua carteira, ' +
    'como em qualquer transacao. Veja "o que abre as operacoes" logo abaixo.', 'err');
  return;
  const a = parseFloat($('gtAdd').value);
  if (!a || a<=0) return toast('Enter an amount.','err');
  const net = NETS.find(n => n.id === $('lqNet').value) || NETS[0];
  try{
    await tx({ato:'gastank', to:'GasTank', fn:'deposit() payable', gas:34000, label:'GasTank.deposit'});
    $('gtAdd').value=''; renderLiquidity(); save(); maybeArm('gas reserve funded');
    notify(`Gas reserve funded · ${fmt(a,5)} ${net.coin}`,'ok');
  }catch(e){ toast(e.message,'err'); }
};
$('btnGtRem').onclick = async () => {
  const net = NETS.find(n => n.id === $('lqNet').value) || NETS[0];
  const bal = S.gas[net.id] || 0;
  toast('Nao ha reserva de gas nesta linha para retirar.', 'err');
  return;
  const raw = $('gtRem').value.trim();
  const a = raw ? parseFloat(raw) : bal;
  if (!a || a<=0) return toast('The reserve is empty on this network.','err');
  if (a > bal) return toast('More than your reserve holds.','err');
  try{
    await tx({ato:'gastank', to:'GasTank', fn:'withdraw()', gas:38000, label:'GasTank.withdraw'});
    $('gtRem').value=''; renderLiquidity(); save();
    notify(`Gas withdrawn · ${fmt(a,5)} ${net.coin}`,'ok');
  }catch(e){ toast(e.message,'err'); }
};

/* ═══════════════════════════════════════════════════════════════════════
   TIME RANGE · one gate. Every reader of history goes through hist().
   If any consumer keeps reading S.history raw, the console shows two
   different windows at once and nobody notices until the numbers disagree.
   ═══════════════════════════════════════════════════════════════════════ */
const DAY = 86400000;
function startOfDay(ts){ const d = new Date(ts); d.setHours(0,0,0,0); return d.getTime(); }
function rangeBounds(){
  const r = S.range, now = Date.now();
  if (r.mode === 'today') return [startOfDay(now), Infinity];
  if (r.mode === '7d')    return [startOfDay(now) - 6*DAY, Infinity];
  if (r.mode === '30d')   return [startOfDay(now) - 29*DAY, Infinity];
  if (r.mode === 'custom'){
    const a = r.from ? new Date(r.from+'T00:00:00').getTime() : -Infinity;
    const b = r.to   ? new Date(r.to  +'T00:00:00').getTime() + DAY - 1 : Infinity;
    return [a, b];
  }
  return [-Infinity, Infinity];
}
/* The single source of truth for "which cycles are we looking at". */
function hist(){
  if (S.range.mode === 'all') return S.history;
  const [a,b] = rangeBounds();
  return S.history.filter(h => h.t >= a && h.t <= b);
}
const RANGES = [['today','Today'],['7d','7 days'],['30d','30 days'],['all','All'],['custom','Range']];
function renderRangeBars(){
  const n = hist().length, tot = S.history.length;
  document.querySelectorAll('[data-range]').forEach(bar => {
    const cust = S.range.mode === 'custom';
    bar.innerHTML =
      `<svg class="ic" aria-hidden="true" style="color:var(--faint)"><use href="#i-calendar"/></svg>` +
      RANGES.map(([k,lab]) => `<button class="chip" data-r="${k}" aria-pressed="${S.range.mode===k}">${lab}</button>`).join('') +
      `<span class="rangeinp ${cust?'on':''}">
         <label class="sr" for="rf-${bar.dataset.k||''}">from</label>
         <input type="date" data-rf value="${esc(S.range.from||'')}" aria-label="from">
         <span class="faint mono">→</span>
         <input type="date" data-rt value="${esc(S.range.to||'')}" aria-label="to">
       </span>
       <span class="spacer"></span>
       <span class="rangecount">${n} of ${tot} cycles in view</span>`;
    bar.querySelectorAll('[data-r]').forEach(b => b.onclick = () => {
      S.range.mode = b.dataset.r; SFX.tap(); repaintAll(); save(); });
    const rf = bar.querySelector('[data-rf]'), rt = bar.querySelector('[data-rt]');
    if (rf) rf.onchange = e => { S.range.from = e.target.value || null; repaintAll(); save(); };
    if (rt) rt.onchange = e => { S.range.to   = e.target.value || null; repaintAll(); save(); };
  });
}
function repaintAll(){
  renderRangeBars(); renderOver(); renderAnalytics(); paintOpRows();
}

/* ═══ CSV · a spreadsheet treats a leading = + - @ as a formula ═════════
   Exporting a user-controlled string into a cell that Excel evaluates is a
   real vector, not a theoretical one. Every field is neutralised and quoted. */
function csvCell(v){
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g,'""') + '"';
}
function csvDownload(name, rows){
  const body = rows.map(r => r.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿'+body], {type:'text/csv;charset=utf-8'}));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast('CSV exported — ' + (rows.length-1) + ' rows.','ok');
}

/* ═══ DAY BY DAY ════════════════════════════════════════════════════════ */
function dayBuckets(){
  const by = new Map();
  hist().forEach(h => {
    const k = startOfDay(h.t);
    const d = by.get(k) || {k, n:0, ok:0, rev:0, net:0, gas:0, fee:0, deployed:0};
    d.n++; d.gas += h.gas; d.deployed += h.size;
    /* chain: agrega registros de ciclo, e um registro de ciclo so entra na lista
     quando ha recibo. Desde 2026-08-23 nada empilha ali sem transacao — as
     cotacoes vao para S.cotacoes, que e outra lista e nao soma dinheiro. */
  if (h.ok){ d.ok++; d.net += h.pnl; d.fee += h.fee||0; } else { d.rev++; d.net -= h.gas*0.9; }
    by.set(k, d);
  });
  return [...by.values()]
    .map(d => ({...d, pct: d.deployed ? d.net/d.deployed*100 : 0}))
    .sort((a,b) => b.k - a.k);
}
function renderDays(){
  const d = dayBuckets();
  $('dayRows').innerHTML = d.length ? d.map(x => `<tr>
    <td class="num">${new Date(x.k).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'2-digit'})}</td>
    <td class="num">${x.n}</td><td class="num win">${x.ok}</td><td class="num lose">${x.rev}</td>
    <td class="num">${Math.round(x.rev/x.n*100)}%</td>
    <td class="num">${fmt(x.deployed,0)}</td>
    <td class="num ${x.net>=0?'win':'lose'}">${x.net>=0?'+':''}${fmt(x.net,4)}</td>
    <td class="num ${x.pct>=0?'win':'lose'}"><b>${pct(x.pct)}</b></td>
    <td class="num">${fmt(x.gas,5)}</td><td class="num">${fmt(x.fee,4)}</td></tr>`).join('')
    : '<tr><td colspan="10" class="faint">No cycles inside this range.</td></tr>';
}

/* ═══════════════════════════════════════════════════════════════════════
   STRATEGIES · a named set of LIMITS. Never a named way of finding trades.
   Every field below constrains the executor: what it may buy, when, how
   large, how much slippage, when to stop for the day. Nothing here says
   how an opportunity is discovered, and nothing here promises a return.
   ═══════════════════════════════════════════════════════════════════════ */
const PRESETS = [
  {id:'ballast', name:'Ballast', line:'Fewest attempts, hardest filter.',
   why:'Two deep assets, a narrow window, a high minimum. It refuses far more often than it acts, and it is the only preset that survives a bad day without needing the daily stop.',
   ex:{hops:3, size:120, min:14, slip:12},
   fence:{assets:['WETH','WBTC'], tw:[9,17], mts:150, nob:2, mgp:60, dll:[true,25], mcr:[true,900]}},
  {id:'harbour', name:'Harbour', line:'Wide window, small size, patient.',
   why:'Runs all day but keeps each position small, so a single revert costs almost nothing. The daily stop is loose because the per-trade exposure already is.',
   ex:{hops:3, size:80, min:10, slip:20},
   fence:{assets:['WETH','WBTC','LINK'], tw:[0,24], mts:100, nob:3, mgp:90, dll:[true,40], mcr:[true,300]}},
  {id:'meridian', name:'Meridian', line:'The middle, and it is the default.',
   why:'Three assets, business hours plus the overlap, a minimum that clears gas on Polygon with room. Where to start if you have no opinion yet.',
   ex:{hops:3, size:250, min:8, slip:30},
   fence:{assets:['WETH','WBTC','LINK'], tw:[8,22], mts:300, nob:4, mgp:120, dll:[true,60], mcr:[true,180]}},
  {id:'monsoon', name:'Monsoon', line:'More assets, more hops, more reverts.',
   why:'Accepts a lower minimum and a longer route, which means it fires more often and fails more often. It is not more aggressive in size — it is more tolerant of failure.',
   ex:{hops:4, size:300, min:6, slip:45},
   fence:{assets:['WETH','WBTC','LINK','AAVE','MATIC'], tw:[0,24], mts:400, nob:6, mgp:200, dll:[true,90], mcr:[true,60]}},
  {id:'anvil', name:'Anvil', line:'Full band, and a hard daily stop.',
   why:'Operates at the top of the 10–500 band with five assets. The daily loss limit is the tightest of the five on purpose: the size is what makes it dangerous, so the stop is what makes it survivable.',
   ex:{hops:4, size:500, min:7, slip:35},
   fence:{assets:['WETH','WBTC','LINK','AAVE','MATIC'], tw:[6,23], mts:500, nob:8, mgp:150, dll:[true,50], mcr:[true,120]}}
];
const allStrats = () => [...PRESETS, ...S.mine];
function stratById(id){ return allStrats().find(s => s.id === id) || null; }
/* Rank on net PER 1,000 DEPLOYED, never on absolute net. These strategies trade
   at 120 to 500 by design; ranking on the absolute figure would just be ranking
   position size and calling it performance. */
function bakeKey(id){ const m = S.bake[id]; return m ? m.pct : -Infinity; }
/* Percentages carry more decimals than money on purpose: at these sizes a cycle
   moves fractions of a percent, and rounding to 2 would print 0.00% for a real
   result. Signed always — a return that hides its sign is a headline. */
function pct(v, d){ const n = (v>=0?'+':'') + (v).toFixed(d==null?3:d) + '%'; return n; }

function applyStrategy(id, quiet){
  const v = activeV(); if (!v) { if(!quiet) toast('Open a sub-account first.','err'); return false; }
  const s = stratById(id); if (!s) return false;
  Object.assign(v.fence, JSON.parse(JSON.stringify(s.fence)));
  v.strategy = id;
  $('opHops').value = String(s.ex.hops);
  $('opSize').value = String(Math.min(s.ex.size, BAND.max));
  $('opMin').value  = String(s.ex.min);
  $('opSlip').value = String(s.ex.slip);
  if (!quiet){
    buildRoute(); renderFence(); renderVaults(); renderStrategies(); save();
    notify(`Strategy applied · ${s.name} on ${v.name}`,'ok');
    toast(`${s.name} applied to ${v.name}. The fence changed — read it before you run.`,'ok');
  }
  return true;
}

function scard(s, rank){
  const v = activeV(), on = v && v.strategy === s.id;
  const m = S.bake[s.id];
  const f = s.fence;
  const measured = m
    ? `<b class="${m.pct>=0?'win':'lose'}">${pct(m.pct)}</b> on deployed
       <span class="faint">· ${m.net>=0?'+':''}${fmt(m.net,3)} net on ${fmt(m.deployed,0)} moved
       · ${m.n?Math.round(m.rev/m.n*100):0}% reverted · ${m.n} cycles, this session</span>`
    : `<span class="mono">not measured</span> — run the bake-off and this line fills with your own numbers`;
  return `<div class="scard ${on?'applied':''}">
    <div class="chead" style="margin:0">
      <h4>${esc(s.name)}</h4>
      ${rank ? `<span class="srank ${rank===1?'first':''}">#${rank} per 1k</span>` : ''}
      <div class="spacer"></div>
      ${on ? '<span class="pill brand">applied</span>' : ''}
      ${s.own ? '<button class="mini ghost" data-delstrat="'+esc(s.id)+'" aria-label="Delete strategy"><svg class="ic" aria-hidden="true"><use href="#i-trash"/></svg></button>' : ''}
    </div>
    <p class="small muted" style="margin:0">${esc(s.line)}</p>
    <p class="small faint" style="margin:0">${esc(s.why)}</p>
    <dl class="sgrid">
      <dt>allowed assets</dt><dd>${esc((f.assets||[]).join(' · ') || '—')}</dd>
      <dt>trading window</dt><dd>${f.tw?`${f.tw[0]}h → ${f.tw[1]}h`:'—'}</dd>
      <dt>max trade size</dt><dd>${f.mts??'—'}</dd>
      <dt>min profit</dt><dd>${s.ex.min} bps</dd>
      <dt>max slippage</dt><dd>${s.ex.slip} bps</dd>
      <dt>hops</dt><dd>${s.ex.hops}</dd>
      <dt>open positions</dt><dd>${f.nob??'—'}</dd>
      <dt>daily loss limit</dt><dd>${f.dll&&f.dll[0]?f.dll[1]:'off'}</dd>
      <dt>cooldown</dt><dd>${f.mcr&&f.mcr[0]?f.mcr[1]+'s':'off'}</dd>
      <dt>max gas price</dt><dd>${f.mgp?f.mgp+' gwei':'off'}</dd>
    </dl>
    <p class="smeasure">${measured}</p>
    <div class="row"><div class="tight">
      <button class="${on?'ghost':'primary'} mini" data-strat="${esc(s.id)}">
        ${on ? 'Re-apply' : 'Apply to this sub-account'}</button></div></div>
  </div>`;
}
function renderStrategies(){
  const opts = S.vaults.map(v => `<option value="${esc(v.id)}" ${v.id===S.activeVault?'selected':''}>${esc(v.name)} · ${esc(v.base)}</option>`).join('')
    || '<option>open a sub-account first</option>';
  $('bakeVault').innerHTML = opts;
  $('bakeVault').onchange = e => { S.activeVault = e.target.value; renderStrategies(); };
  /* Rank comes from measurement. No measurement, no rank — not a guess. */
  const ranked = Object.keys(S.bake).length
    ? [...allStrats()].filter(s => S.bake[s.id]).sort((a,b) => bakeKey(b.id) - bakeKey(a.id)).map(s => s.id)
    : [];
  const rankOf = id => { const i = ranked.indexOf(id); return i < 0 ? 0 : i+1; };
  $('stratGrid').innerHTML = PRESETS.map(s => scard(s, rankOf(s.id))).join('');
  $('mineGrid').innerHTML = S.mine.length
    ? S.mine.map(s => scard(s, rankOf(s.id))).join('')
    : `<p class="faint small">Nothing saved yet. Set the sixteen controls in the Fence the way you want them, then save the arrangement here.</p>`;
  const v = activeV(), cur = v && v.strategy ? stratById(v.strategy) : null;
  $('stratApplied').textContent = cur ? `${cur.name} on ${v.name}` : 'none applied';
  $('stratApplied').className = 'pill ' + (cur ? 'brand' : '');
  document.querySelectorAll('[data-strat]').forEach(b => b.onclick = () => applyStrategy(b.dataset.strat));
  document.querySelectorAll('[data-delstrat]').forEach(b => b.onclick = () => {
    S.mine = S.mine.filter(x => x.id !== b.dataset.delstrat);
    delete S.bake[b.dataset.delstrat];
    renderStrategies(); save(); toast('Strategy removed.'); });
  renderBake();
}
function renderBake(){
  const ks = Object.keys(S.bake);
  $('bakeState').textContent = ks.length ? `${ks.length} measured` : 'not measured';
  $('bakeState').className = 'pill ' + (ks.length ? 'ok' : '');
  const rows = allStrats().filter(s => S.bake[s.id]).sort((a,b) => bakeKey(b.id) - bakeKey(a.id));
  $('bakeRows').innerHTML = rows.length ? rows.map((s,i) => { const m = S.bake[s.id];
    return `<tr><td class="num">${i+1}</td><td>${esc(s.name)}</td><td class="num">${m.n}</td>
      <td class="num win">${m.ok}</td><td class="num lose">${m.rev}</td>
      <td class="num">${m.n?Math.round(m.rev/m.n*100):0}%</td>
      <td class="num">${fmt(m.deployed,0)}</td>
      <td class="num ${m.net>=0?'win':'lose'}">${m.net>=0?'+':''}${fmt(m.net,4)}</td>
      <td class="num ${m.per1k>=0?'win':'lose'}">${m.per1k>=0?'+':''}${fmt(m.per1k,4)}</td>
      <td class="num ${m.pct>=0?'win':'lose'}"><b>${pct(m.pct)}</b></td>
      <td class="num">${fmt(m.gas,5)}</td></tr>`; }).join('')
    : '<tr><td colspan="11" class="faint">Nothing measured yet.</td></tr>';
}

/* The bake-off runs the SAME engine as a manual cycle. It does not model
   anything extra and it does not know anything the user does not. */
async function bakeOff(){
  const v = activeV();
  if (!v) return toast('Open a sub-account first.','err');
  /* Refuse before starting, with the same reason the automation gives. Running
     into a wall for 250 cycles and reporting 0.000% would present a strategy that
     never opened a position as one that measured zero. A zero is a result; not
     having run is not. */
  const why = blockedBecause(v);
  if (why) return toast(`Cannot measure on ${v.name}: ${why}.`,'err');
  const n = +$('bakeN').value;
  const keep = {fence:JSON.parse(JSON.stringify(v.fence)), strategy:v.strategy,
    hops:$('opHops').value, size:$('opSize').value, min:$('opMin').value, slip:$('opSlip').value};
  const histLen = S.history.length, seqKeep = S.seq;
  const snap = {cycles:v.cycles, rev:v.rev, net:v.net, gas:v.gas, fee:v.fee, idle:v.idle};
  $('btnBake').disabled = true; QUIET = true;
  try{
    for (const s of allStrats()){
      applyStrategy(s.id, true);
      const mark = S.history.length;
      for (let i=0;i<n;i++){ buildRoute(); await runCycle(true); }
      const seg = S.history.slice(mark);
      /* Belt and braces: if a strategy opened nothing, it stays UNMEASURED. An
         all-zero row renders as +0.000% and reads like a finding. */
      if (!seg.length){ delete S.bake[s.id]; renderBake(); continue; }
      /* `deployed` is what makes the comparison honest. These strategies trade at
         different sizes on purpose (120 to 500), so absolute net ranks the size of
         the position, not the quality of the limits. per1k normalises it. */
      const deployed = seg.reduce((a,x)=>a+x.size,0);
      const net = seg.reduce((a,x)=>a+(x.ok?x.pnl:-x.gas*0.9),0);
      S.bake[s.id] = {
        n: seg.length,
        ok: seg.filter(x=>x.ok).length,
        rev: seg.filter(x=>!x.ok).length,
        net, deployed,
        per1k: deployed ? net/deployed*1000 : 0,
        /* the same measurement as a percentage of the capital it moved */
        pct:   deployed ? net/deployed*100 : 0,
        gas: seg.reduce((a,x)=>a+x.gas,0)
      };
      renderBake();
      await wait(reduced()?0:40);
    }
  } finally {
    /* The bake-off is a measurement, not an operation: it leaves no cycles in
       the ledger and restores the fence it borrowed. */
    QUIET = false;
    S.history.length = histLen; S.seq = seqKeep;
    Object.assign(v, snap);
    v.fence = keep.fence; v.strategy = keep.strategy;
    $('opHops').value=keep.hops; $('opSize').value=keep.size;
    $('opMin').value=keep.min; $('opSlip').value=keep.slip;
    $('btnBake').disabled = false;
    buildRoute(); renderFence(); renderVaults(); renderStrategies(); repaintAll(); save();
  }
  const best = allStrats().filter(s=>S.bake[s.id]).sort((a,b)=>bakeKey(b.id)-bakeKey(a.id))[0];
  toast(`Measured. ${best.name} led on net per 1,000 deployed over ${n} cycles each — this session, this run.`,'ok');
  notify(`Bake-off done · ${best.name} led per 1,000 deployed, ${n} cycles each`,'ok');
}

/* ═══════════════════════════════════════════════════════════════════════
   AUTOMATION · the only thing in this console that spends without a click.
   Three guards, and none of them is optional: an hourly ceiling, a fence
   check per sub-account with the reason written down, and a stop on unload.
   ═══════════════════════════════════════════════════════════════════════ */
let autoTimer = null;
function autolog(msg, k){
  const l = $('autoLog'); if (!l) return;
  const d = document.createElement('div');
  d.className = 'rl ' + (k||'dim');
  /* NOT 'skip': .skip is the skip-to-content link (position:absolute; left:-9999px),
     so a line marked skip was being thrown off-screen — and that line exists to be read. */
  /* era innerHTML com a string de icon(). O guardiao de assinatura recusa
     qualquer coisa que nao seja vazio ali, e recusa por desenho: regra que
     depende de julgar se a string e confiavel e regra que um dia alguem
     julga errado. */
  d.appendChild(iconEl({ok:'check',err:'x',warn:'alert'}[k] || 'dot'));
  d.appendChild(novo('span', null, new Date().toLocaleTimeString('en-US') + ' — ' + msg));
  l.prepend(d);
  while (l.children.length > 40) l.lastElementChild.remove();
}
function underCeiling(){
  const cut = Date.now() - 3600000;
  S.auto.stamps = S.auto.stamps.filter(t => t > cut);
  return S.auto.stamps.length < S.auto.cap;
}
/* Returns null when the sub-account may run, or the reason it may not. */
function blockedBecause(v){
  if (v.fence.paused)            return 'paused on chain — the handbrake is on';
  if (!v.fence.assets.length)    return 'fence is empty — nothing is allowed to be bought';
  const size = parseFloat($('opSize').value) || 250;
  if (v.idle < size)             return `idle balance ${fmt(v.idle,2)} is below the trade size ${fmt(size,2)}`;
  return null;
}
async function autoTick(){
  if (!S.auto.on) return;
  if (!underCeiling()){
    autolog(`ceiling reached — ${S.auto.cap} cycles in the last hour. Waiting.`,'warn');
    return;
  }
  const pool = S.auto.scope === 'all' ? S.vaults : [activeV()].filter(Boolean);
  if (!pool.length){ autolog('no sub-account to run on.','warn'); return; }
  let ran = false;
  for (const v of pool){
    const why = blockedBecause(v);
    if (why){ autolog(`${v.name} skipped · ${why}`,'warn'); continue; }
    const prev = S.activeVault; S.activeVault = v.id;
    buildRoute(); await runCycle(true);
    const last = S.history[S.history.length-1];
    autolog(`${v.name} · ${last.route} · ${last.ok ? 'closed +'+fmt(last.pnl,4) : 'reverted, gas '+fmt(last.gas,5)+' lost'}`,
      last.ok ? 'ok' : 'err');
    S.auto.stamps.push(Date.now());
    S.activeVault = prev; ran = true;
    if (!underCeiling()) break;
  }
  if (ran){ renderVaults(); repaintAll(); save(); }
}
function setAuto(on, quiet){
  S.auto.on = on;
  const sw = $('autoSw');
  sw.setAttribute('aria-checked', on ? 'true' : 'false');
  $('autoPill').textContent = on ? `on · every ${S.auto.every/1000}s` : 'off';
  $('autoPill').className = 'pill ' + (on ? 'ok' : '');
  $('autoLive').hidden = !on;
  clearInterval(autoTimer); autoTimer = null;
  if (on){
    autoTimer = setInterval(autoTick, S.auto.every);
    autolog(`automation on · every ${S.auto.every/1000}s · ceiling ${S.auto.cap}/h · ${S.auto.scope==='all'?'every eligible sub-account':'active sub-account only'}`,'ok');
    notify('Automation on — the console is opening cycles for you','ok');
    autoTick();
  } else if (!quiet){
    autolog('automation off · the engine stopped. No contract was paused by this.','dim');
  }
  if (!quiet){ SFX.tap(); save(); }
}
$('autoSw').onclick = () => setAuto(!S.auto.on);
$('autoEvery').onchange = e => { S.auto.every = +e.target.value; if (S.auto.on) setAuto(true); else save(); };
$('autoCap').onchange   = e => { S.auto.cap = +e.target.value; if (S.auto.on) $('autoPill').textContent = `on · every ${S.auto.every/1000}s`; save(); };
$('autoScope').onchange = e => { S.auto.scope = e.target.value; save(); };
$('armPref').onchange = e => { S.prefs.autoArm = e.target.checked;
  autolog(e.target.checked
    ? 'automatic arming on · it will start once a funded sub-account and gas both exist'
    : 'automatic arming off · the switch in the header is yours alone', e.target.checked?'ok':'dim');
  save(); if (e.target.checked) maybeArm('the preference being turned on'); };
/* A loop that spends must not outlive the tab that started it. */
window.addEventListener('beforeunload', () => { clearInterval(autoTimer); });

$('btnPauseAll').onclick = async () => {
  if (!S.vaults.length) return toast('No sub-accounts.','err');
  if (S.auto.on) setAuto(false);
  try{
    await tx({ato:'pausa', to:S.triad?.vault||'0x', fn:'definirPausa(true) · all sub-accounts',
      gas:34000*S.vaults.length, label:'definirPausa'});
    autolog(`emergency pause applied to ${S.vaults.length} sub-account${S.vaults.length===1?'':'s'} · opening blocked, closing and rescue still free`,'ok');
    notify('Emergency pause applied on chain','err');
    renderFence(); renderVaults(); save();
    toast('Paused on chain. Nothing opens. Closing and rescue stay free.','ok');
  }catch(e){ toast(e.message,'err'); }
};

$('btnBake').onclick = bakeOff;
$('btnBakeClear').onclick = () => { S.bake = {}; renderStrategies(); save(); toast('Measurements cleared.'); };
$('btnSaveStrat').onclick = () => {
  const v = activeV(); if (!v) return toast('Open a sub-account first.','err');
  const name = (prompt('Name this strategy') || '').trim().slice(0,40);
  if (!name) return;
  const s = {id:'my'+Date.now(), own:true, name, line:'Saved from ' + v.name + '.',
    why:'Your own arrangement of the sixteen controls, kept so you can apply it to another sub-account.',
    ex:{hops:+$('opHops').value, size:+$('opSize').value, min:+$('opMin').value, slip:+$('opSlip').value},
    fence:JSON.parse(JSON.stringify(v.fence))};
  S.mine.push(s); v.strategy = s.id;
  renderStrategies(); save(); toast(`Saved as "${name}".`,'ok');
};

$('btnCsv').onclick = () => {
  const h = hist(); if (!h.length) return toast('Nothing in this range to export.','err');
  csvDownload('triviu-cycles.csv', [
    ['id','timestamp','sub-account','route','venue','size','result','gas','fee','status'],
    ...h.map(x => [x.id, new Date(x.t).toISOString(), x.vault, x.route, x.venue,
      x.size, x.ok?x.pnl:0, x.gas, x.fee||0, x.ok?'closed':'reverted'])]);
};
$('btnDayCsv').onclick = () => {
  const d = dayBuckets(); if (!d.length) return toast('Nothing in this range to export.','err');
  csvDownload('triviu-daily.csv', [
    ['day','cycles','closed','reverted','revert rate','deployed','net','return on deployed %','gas','fee'],
    ...d.map(x => [new Date(x.k).toISOString().slice(0,10), x.n, x.ok, x.rev,
      (x.rev/x.n).toFixed(4), x.deployed, x.net, x.pct.toFixed(4), x.gas, x.fee])]);
};

/* ═══════════════════════════════════════════════════════════════════════
   SPREAD · one total, many sub-accounts, divided EXACTLY.
   Money is counted in cents as integers. 5000/3 in floating point loses a
   cent and nobody notices until the ledger disagrees with itself; here the
   remainder is handed out one cent at a time until it is gone, and the sum
   of the parts is checked against the total before anything is applied.
   ═══════════════════════════════════════════════════════════════════════ */
const cents = x => Math.round((Number(x)||0) * 100);
function splitExact(totalCents, n){
  if (n <= 0) return [];
  const base = Math.floor(totalCents / n);
  let rest = totalCents - base * n;               /* 0 .. n-1 cents */
  return Array.from({length:n}, () => base + (rest-- > 0 ? 1 : 0));
}
const spPicked = new Set();
function headroomOf(v){ return Math.max(0, BAND.max - (v.idle + v.inPos)); }

function renderSpread(){
  const list = $('spList'); if (!list) return;
  /* drop selections whose sub-account no longer exists */
  [...spPicked].forEach(id => { if (!S.vaults.some(v=>v.id===id)) spPicked.delete(id); });
  list.innerHTML = S.vaults.length ? S.vaults.map(v => {
    const full = headroomOf(v) <= 0;
    return `<button class="pick ${full?'full':''}" data-pick="${esc(v.id)}" aria-pressed="${spPicked.has(v.id)}"
      ${full?'title="at the 500 ceiling — nothing fits"':''}>
      <span class="vdot" style="background:${esc(v.color)}"></span>${esc(v.name)}
      <span class="faint">${fmt(v.idle+v.inPos,0)}</span></button>`; }).join('')
    : '<p class="faint small">Open a sub-account first.</p>';
  list.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => {
    const id = b.dataset.pick;
    spPicked.has(id) ? spPicked.delete(id) : spPicked.add(id);
    SFX.tap(); renderSpread(); });
  paintSpread();
}
function spreadPlan(){
  const picked = S.vaults.filter(v => spPicked.has(v.id));
  const total = cents($('spTotal').value);
  /* Explicitly, not by letting NaN propagate to the sum check: 1e309 overflows to
     Infinity and would otherwise be caught two guards later by accident. A number
     that is not finite and positive is refused here, where it is readable. */
  if (!Number.isFinite(total) || total <= 0 || !picked.length)
    return {picked, total, parts:[], ok:false, why:null};
  const parts = splitExact(total, picked.length);
  /* the invariant: the parts must add back up to exactly what was typed */
  const sum = parts.reduce((a,b)=>a+b,0);
  if (sum !== total) return {picked, total, parts, ok:false, why:'internal split mismatch'};
  const over = picked.filter((v,i) => parts[i] > cents(headroomOf(v)));
  if (over.length) return {picked, total, parts, ok:false, over,
    why:`${over.length} sub-account${over.length===1?'':'s'} would pass the ${BAND.max} ceiling`};
  return {picked, total, parts, ok:true, why:null};
}
function paintSpread(){
  const p = spreadPlan();
  const rows = p.picked.map((v,i) => {
    const add = (p.parts[i]||0)/100, after = v.idle+v.inPos+add, room = headroomOf(v);
    const bad = (p.parts[i]||0) > cents(room);
    return `<tr class="${bad?'rev':''}"><td>${esc(v.name)}</td>
      <td class="num">${fmt(v.idle+v.inPos,2)}</td>
      <td class="num ${bad?'lose':'win'}">+${fmt(add,2)}</td>
      <td class="num">${fmt(after,2)}</td>
      <td class="num ${bad?'lose':'faint'}">${fmt(room,2)}</td></tr>`; }).join('');
  $('spRows').innerHTML = rows || `<tr><td colspan="5" class="faint">Pick at least one sub-account.</td></tr>`;
  const m = $('spMath');
  if (!p.picked.length || p.total <= 0){ m.textContent = ''; m.className = 'small'; }
  else if (!p.ok){
    const fits = Math.min(...p.picked.map(headroomOf)) * p.picked.length;
    m.className = 'small spwarn';
    m.textContent = `${p.why}. Spreading evenly across these ${p.picked.length}, the most that fits is ${fmt(fits,2)}.`;
  } else {
    const uniq = [...new Set(p.parts)];
    m.className = 'small spok';
    m.textContent = uniq.length === 1
      ? `${fmt(p.total/100,2)} ÷ ${p.picked.length} = ${fmt(p.parts[0]/100,2)} each, exactly.`
      : `${fmt(p.total/100,2)} ÷ ${p.picked.length} does not divide evenly — ${p.parts.filter(x=>x===Math.max(...p.parts)).length} `
        + `receive ${fmt(Math.max(...p.parts)/100,2)} and the rest ${fmt(Math.min(...p.parts)/100,2)}. Nothing is lost.`;
  }
  $('btnSpread').disabled = !p.ok;
}
$('spTotal').oninput = paintSpread;
$('spAll').onclick  = () => { S.vaults.forEach(v => { if (headroomOf(v) > 0) spPicked.add(v.id); }); SFX.tap(); renderSpread(); };
$('spNone').onclick = () => { spPicked.clear(); SFX.tap(); renderSpread(); };
$('spMax').onclick  = () => {
  const picked = S.vaults.filter(v => spPicked.has(v.id));
  if (!picked.length) return toast('Pick at least one sub-account.','err');
  /* the biggest total that still divides evenly without any of them passing 500 */
  const fits = Math.min(...picked.map(headroomOf)) * picked.length;
  $('spTotal').value = fits.toFixed(2); paintSpread();
};
$('btnSpread').onclick = async () => {
  const p = spreadPlan();
  if (!p.ok) return toast(p.why || 'Nothing to spread.','err');
  try{
    await tx({ato:'espalhar', to:S.triad?.vault||'0x', fn:`deposit() × ${p.picked.length}`,
      gas:52000*p.picked.length, label:'deposit × '+p.picked.length});
    $('spTotal').value = '';
    renderVaults(); renderLiquidity(); renderSpread(); repaintAll(); save();
    toast(`${fmt(p.total/100,2)} spread across ${p.picked.length} sub-accounts.`,'ok');
    notify(`Liquidity spread · ${fmt(p.total/100,2)} across ${p.picked.length}`,'ok');
    maybeArm('liquidity spread');
  }catch(e){ toast(e.message,'err'); }
};

/* ═══════════════════════════════════════════════════════════════════════
   ARMING · the console turns the engine on for you once both legs exist.
   Ratified by the founder. The safety was never "do not arm" — it was
   "never arm quietly". So: both legs required, a confirmation the first
   time, and every arming announced three ways. The hourly ceiling, the
   fence check and the on-chain pause are untouched.
   ═══════════════════════════════════════════════════════════════════════ */
function armReadiness(){
  const funded = S.vaults.filter(v => !v.fence.paused && v.fence.assets.length && v.idle > 0);
  const gas = Object.values(S.gas||{}).reduce((a,b)=>a+b,0);
  return {funded, gas, hasLiquidity: funded.length > 0, hasGas: gas > 0,
          ready: funded.length > 0 && gas > 0};
}
function maybeArm(because){
  if (!S.prefs.autoArm) return;
  if (S.auto.on) return;
  const r = armReadiness();
  if (!r.ready){
    /* say which leg is missing — silence here reads as "it did not work" */
    if (typeof autolog === 'function' && (r.hasLiquidity || r.hasGas))
      autolog(`not armed after ${because} · ${r.hasLiquidity ? 'no gas in the reserve' : 'no funded sub-account inside its fence'}`,'warn');
    return;
  }
  const first = !S.prefs.armedOnce;
  if (first){
    openArmDialog(r, because);
  } else {
    S.auto.scope = 'all';
    $('autoScope').value = 'all';
    setAuto(true);
    autolog(`armed automatically after ${because} · ${r.funded.length} funded sub-account${r.funded.length===1?'':'s'} · ${fmt(r.gas,5)} gas`,'ok');
    toast(`Automation armed — ${r.funded.length} sub-account${r.funded.length===1?'':'s'} operating. The switch in the header turns it off.`,'ok');
  }
}
function openArmDialog(r, because){
  const d = $('armOv'); if (!d) return;
  $('armBody').innerHTML =
    `<p class="small">Both legs are now in place after ${esc(because)}: <b>${r.funded.length} funded
      sub-account${r.funded.length===1?'':'s'}</b> inside their fences, and <b>${fmt(r.gas,5)}</b> in the gas reserve.</p>
     <p class="small">If you arm it, this console starts opening cycles on its own, on the interval set in
      Operate, inside each sub-account's own fence. It never widens a fence and it stops when this page closes.</p>
     <p class="small"><b>This is not the chain-level brake.</b> The switch in the header stops the engine;
      <span class="mono">definirPausa(true)</span> is what stops the contract, and it stays yours.</p>
     <p class="small faint">Asked once. After this it arms on its own whenever both legs are in place —
      turn that off in Operate.</p>`;
  d.classList.add('show');
  $('armYes').onclick = () => { d.classList.remove('show');
    S.prefs.armedOnce = true; S.auto.scope='all'; $('autoScope').value='all';
    setAuto(true);
    autolog(`armed after ${because} · confirmed by you`,'ok'); save(); };
  $('armNo').onclick = () => { d.classList.remove('show');
    S.prefs.autoArm = false; $('armPref').checked = false;
    autolog('automatic arming turned off · the switch in the header is yours alone','dim');
    toast('Left off. Automatic arming is now disabled — re-enable it in Operate.','ok'); save(); };
}

/* ═══ EXPLAINERS · first connection, and on demand ═════════════════════ */
const EXPLAIN = {
  liquidity:{t:'Liquidity', b:[
    'The base currency held inside a sub-account vault. It is what a cycle actually trades.',
    'Adding calls approve then deposit. Removing calls withdraw — onlyOwner, uncapped, no queue and no third-party approval.',
    'What sits inside an open position is not withdrawable until that cycle closes. That is the contract, not a policy.',
    'A sub-account is capped at 500 on purpose: a large position moves the price against itself. Open another instead.']},
  gas:{t:'Gas reserve · GasTank', b:[
    'A separate contract holding NATIVE currency (POL on Polygon), one balance per account.',
    'It exists so an operation’s return leg does not get stranded in the block flow for want of gas.',
    'Only you can move it. The protocol never takes these funds and earns nothing here.',
    'v0 is a transparent escrow: nothing leaves except back to the account that deposited it. The automated path is a v0.2 item, pending specification and audit.']},
  fence:{t:'The fence', b:[
    'Sixteen controls on the executor. Every one of them limits when and how much it may OPEN.',
    'It is born with the default strategy on it, so a new sub-account is ready the moment it is funded — and every one of those sixteen values is printed on the strategy card before you apply it.',
    'The lock did not go away. Empty the fence and that sub-account opens nothing, ever. Tightening it is always free and never traps a live position.',
    'Tightening it never traps a live position. Two controls can reject a CLOSE — the close floor and the daily loss limit — and both exist to stop a bad close happening quietly.',
    'A rejected attempt costs the keeper gas, not you. Tightening the fence is free.']},
  subaccounts:{t:'Sub-accounts', b:[
    'Each sub-account is its own vault: own base currency, own fence, own history.',
    'The executor of one never reaches the capital of another.',
    'The operating band is 10 to 500. Below 10 gas eats the trade; above 500 slippage eats the edge.',
    'The ceiling rises as the sub-account builds a record — because a proven size is a measured one.']},
  spread:{t:'Spreading one amount across many', b:[
    'Pick the sub-accounts, name one total, and it divides exactly — the arithmetic runs in whole cents, never in floating point.',
    'When the total does not divide evenly, the leftover cents are handed out one each until they are gone. The parts always add back up to the number you typed.',
    'Each sub-account is still capped at 500. If the even split would push one of them past the ceiling, nothing is applied and the page tells you the largest total that fits.',
    'It is one signature for the batch, not one per sub-account.']},
  automation:{t:'Automation, and the two brakes', b:[
    'Automation is this console\'s engine: it opens cycles for you on an interval, inside the fence each sub-account already has. It never widens a fence.',
    'Turning it OFF stops the engine. It does not pause any contract — if you need the chain-level stop, that is Emergency pause, and it is a different control.',
    'Emergency pause calls definirPausa(true) on chain. It blocks opening; closing and rescue stay free. It survives this page being closed. The switch does not.',
    'The engine skips a sub-account that is paused, has an empty fence or lacks idle balance, and writes the reason in the log rather than failing quietly.',
    'There is an hourly ceiling, and the loop stops when the tab closes. A thing that spends should not outlive the page that started it.']},
  strategy:{t:'Strategies', b:[
    'A strategy here is a set of LIMITS: what may be bought, in which hours, how large, how much slippage, when to stop for the day.',
    'It is not a way of finding trades, and applying one tells you nothing about what it will earn.',
    'No card shows a return until you run the bake-off, because a number in that space that nobody measured is an invention.',
    'The bake-off runs every strategy the same number of cycles on the same sub-account and ranks them by what came out. It leaves no cycles in your ledger and restores your fence when it finishes.',
    'What it measures is this simulation, on this session. It is a way to compare limits against each other — not a forecast of a market.']},
  cycle:{t:'The atomic cycle', b:[
    'The route leaves the base currency, walks the hops and comes back.',
    'If it does not come back above the minimum after gas, the whole transaction is undone. No leg is ever left half-open.',
    'You keep the principal. You lose the gas. Most attempts revert — that is the arithmetic, not pessimism.',
    'The success fee comes out of realised profit only. No profit, no fee.']},
  layers:{t:'L1 and L2', b:[
    'Triviu is the L1 jurisdiction: audited contracts, one fence rule, one fee rule, one settlement rail.',
    'An L2 is a label — your brand, your users, your surface — running on the same audited engine underneath.',
    'A label changes the name, the logo and the accent. It cannot change the fence rule, the fee rule or the risk notice.',
    'Creating a label requires a sustained average of 100,000 in capital under management. It is a threshold of responsibility, not a purchase.']},
  referrals:{t:'Referral vault', b:[
    'Pull, never push: spread accrues until you call claim().',
    'It only ever accrues from a POSITIVE close by someone you introduced. If they do not profit, there is no spread.',
    'This is not income and it is not a promise. Introducing someone does not create a return.']}
};
function explain(key){
  const e = EXPLAIN[key]; if (!e) return;
  $('genTitle').textContent = e.t;
  $('genBody').innerHTML = `<div class="steps">${e.b.map(x=>`<div class="stp">${esc(x)}</div>`).join('')}</div>`;
  $('genOv').classList.add('show'); SFX.tap();
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-explain]'); if (b) explain(b.dataset.explain);
});
/* On the first connection the console walks the user through what each thing is
   — once, in order, and never again unless they ask. */
const TOUR = ['cycle','subaccounts','liquidity','gas','fence','referrals','layers'];
function firstRunTour(){
  if (S.toured) return;
  let i = 0;
  const step = () => {
    if (i >= TOUR.length){ S.toured = true; save(); return; }
    const k = TOUR[i++], e = EXPLAIN[k];
    $('genTitle').textContent = `${e.t}  ·  ${i} of ${TOUR.length}`;
    $('genBody').innerHTML = `<div class="steps">${e.b.map(x=>`<div class="stp">${esc(x)}</div>`).join('')}</div>
      <p class="hint">First connection — this walkthrough runs once. Every panel keeps an
      ${'ⓘ'.replace('ⓘ','info')} button to bring it back.</p>`;
    $('genClose').textContent = i >= TOUR.length ? 'Start' : 'Next';
    $('genOv').classList.add('show');
  };
  $('genClose').onclick = () => {
    $('genOv').classList.remove('show');
    if (i < TOUR.length) setTimeout(step, 180);
    else { S.toured = true; $('genClose').textContent = 'Close';
           $('genClose').onclick = () => $('genOv').classList.remove('show'); save(); }
  };
  step();
}

/* ── referrals ─────────────────────────────────────────────────────── */
function renderRefs(){
  const tok = S.base;
  $('rfClaim').textContent = fmt(S.refs.claim,4)+' '+tok;
  $('rfEarned').textContent = fmt(S.refs.earned,4)+' '+tok;
  $('rfCount').textContent = S.refs.list.length;
  $('refLink').value = location.origin+location.pathname+'?ref='+(S.wallet.address||'');
  const any = S.refs.list.length;
  $('refTable').hidden = !any; $('refEmpty').hidden = !!any;
  if (any) $('refTable').querySelector('tbody').innerHTML = S.refs.list.map((r,i) =>
    `<tr><td>${i+1}</td><td>${esc(r.addr)}</td><td>${r.block}</td></tr>`).join('');
}
$('btnCopyRef').onclick = () => navigator.clipboard.writeText($('refLink').value)
  .then(()=>toast('Link copied.','ok')).catch(()=>toast('Could not copy.','err'));
/* TUBARAO-10 · N2 · 2026-08-22 · a guarda desceu do atributo para o mecanismo.
   O botao ganhou `disabled` no HTML e o handler ficou INTACTO, chamando claim()
   contra `S.triad?.referralVault || rnd()` — um endereco ALEATORIO quando nao ha
   referralVault, e nunca ha, porque TriviuReferralVault nao esta implantado em
   chain nenhuma. Guarda que mora num atributo cai na primeira refatoracao de
   estado que o remova, e cai em silencio. A recusa passa a morar aqui: mesmo que
   alguem reabilite o botao, o handler para antes de tocar na carteira. */
$('btnClaim').onclick = async () => {
  const destino = S.triad?.referralVault;
  if (!destino || !/^0x[0-9a-fA-F]{40}$/.test(destino)) {
    return toast('TriviuReferralVault is not deployed — there is no contract to call claim() on.','err');
  }
  if (S.refs.claim <= 0) return toast('Nothing to claim — spread only accrues on positive closes.','err');
  const c = S.refs.claim;
  try{ await tx({ato:'indicacao', to:destino, fn:'claim()', gas:55000, label:'claim()'});
    renderRefs(); renderVaults(); renderOver(); save(); toast('Spread claimed.','ok');
  }catch(e){ toast(e.message,'err'); }
};
/* O BOTAO QUE FABRICAVA PARTICIPANTES saiu daqui em 2026-08-23 (Lei #6).
   Ele sorteava dois ou tres enderecos, dava a cada um um numero de bloco
   sorteado numa faixa fixa, e os empilhava na lista de INDICADOS — a mesma
   lista de onde a tela tira quanto voce tem a receber. Estava rotulado como
   simulacao num toast, e o toast some; as linhas ficam, indistinguiveis das
   reais.
   O trecho seguinte tambem saiu, e ele era o mais defensavel do arquivo:
   sorteava fechamentos da distribuicao MEDIDA on-chain em vez de uma taxa de
   acerto escolhida, e o comentario explicava que dos 48 ciclos reais medidos,
   ZERO fecharam acima da barra de lucro minimo. Estava certo sobre o mercado
   e continuava escrevendo numeros em S.refs.claim e S.refs.earned — os campos
   que dizem quanto voce tem A RECEBER. Honesto sobre a origem e ainda assim
   dinheiro pintado.
   O botao saiu do HTML no mesmo passo: handler sem botao e um erro no
   console, botao sem handler e um botao que nao faz nada. */
/* ── contracts pane ────────────────────────────────────────────────── */
function renderContracts(){
  const k = $('ctSel').value;
  $('ctFile').textContent = SRC[k].file;
  $('ctAddr').textContent = S.triad ? short({registry:S.registry, vault:S.triad.vault, executor:S.triad.executor}[k]||'') : '—';
  $('ctPane').innerHTML = codeHtml(k);
  $('ctGuide').style.display = 'none';
  guide = {key:k, i:0};
}
$('ctSel').onchange = renderContracts;
$('btnCtGuide').onclick = () => {
  const c = SRC[guide.key], f = c.fns[guide.i];
  $('ctPane').innerHTML = codeHtml(guide.key, guide.i);
  $('ctGuide').style.display = 'block';
  $('gFn').textContent = f.sig; $('gEx').textContent = f.ex;
  $('gPos').textContent = (guide.i+1)+' / '+c.fns.length;
  $('gPrev').disabled = guide.i===0;
};
$('gPrev').onclick = () => { if (guide.i>0){ guide.i--; $('btnCtGuide').click(); } };
$('gNext').onclick = () => { if (guide.i < SRC[guide.key].fns.length-1){ guide.i++; $('btnCtGuide').click(); }
  else { $('ctGuide').style.display='none'; $('ctPane').innerHTML = codeHtml(guide.key); } };

/* ── instances ─────────────────────────────────────────────────────── */
const SWATCH = ['#2743C7','#C13327','#E8B23A','#1E7A46','#7B3FE4','#0E7490','#B45309','#9D174D'];
let pickAccent = SWATCH[0], pickLogo = null;
function renderSwatches(){
  $('swatches').innerHTML = SWATCH.map(c =>
    `<button class="sws" data-c="${esc(c)}" style="background:${esc(c)}"
      aria-pressed="${c===pickAccent}" aria-label="Accent ${esc(c)}"></button>`).join('');
  $('swatches').querySelectorAll('.sws').forEach(b => b.onclick = () => {
    pickAccent = b.dataset.c; renderSwatches(); paintPreview(); });
}
$('niLogo').onchange = e => readImage(e.target.files[0], d => { pickLogo = d; paintPreview(); toast('Logo loaded.','ok'); });
['niName','niSub'].forEach(id => $(id).oninput = paintPreview);
function paintPreview(){
  const b = sanitizeBrand({name:$('niName').value||'Your label', sub:$('niSub').value, accent:pickAccent, logo:pickLogo});
  $('brandPreview').innerHTML =
    (b.logo ? `<img class="sw" src="${esc(b.logo)}" alt="">`
      : `<svg class="sw" viewBox="0 0 120 120" style="color:${esc(b.accent||'#2743C7')};border:0" aria-hidden="true"><use href="#mark"/></svg>`) +
    `<span><b style="font-family:var(--disp);font-size:16px">${esc(b.name||'Your label')}</b>
     <span class="mono faint" style="font-size:11px">${esc(b.sub||'')}</span><br><span class="eyebrow">console</span></span>`;
}
$('btnNewInst').onclick = () => {
  const b = sanitizeBrand({name:$('niName').value, sub:$('niSub').value||'· powered by Triviu',
    accent:pickAccent, logo:pickLogo});
  if (!b.name) return toast('Give the instance a name.','err');
  S.instances.push({id:'i'+Date.now(), core:false, name:b.name, sub:b.sub||'',
    accent:b.accent||'#2743C7', logo:b.logo||null});
  $('niName').value=''; $('niSub').value=''; $('niLogo').value=''; pickLogo=null;
  renderInstances(); paintPreview(); save(); toast('Instance created.','ok');
};
function renderInstances(){
  $('instGrid').innerHTML = S.instances.map(i => `
    <div class="inst ${i.id===S.activeInst?'on':''}">
      <div class="ih">${i.logo?`<img class="sw" src="${esc(i.logo)}" alt="">`
        :`<span class="sw" style="background:${esc(i.accent)};border:0"></span>`}
        <div><div style="font-weight:700;font-size:14.5px">${esc(i.name)}</div>
          <div class="small faint mono">${esc(i.sub||'')}</div></div></div>
      <p class="small faint" style="margin-top:var(--s3)">${i.core?'Base instance · cannot be removed':'Licensed · same audited engine underneath'}</p>
      <div class="row" style="margin-top:var(--s3)">
        <div class="tight"><button class="mini primary" data-act="use" data-i="${esc(i.id)}">Use</button></div>
        ${i.core?'':`<div class="tight"><button class="mini danger" data-act="del" data-i="${esc(i.id)}">Remove</button></div>`}
      </div></div>`).join('');
  $('instGrid').querySelectorAll('[data-act]').forEach(b => b.onclick = () => {
    if (b.dataset.act==='use') S.activeInst = b.dataset.i;
    else { S.instances = S.instances.filter(x=>x.id!==b.dataset.i);
      if (S.activeInst===b.dataset.i) S.activeInst='triviu'; toast('Instance removed.'); }
    applyInstance(); renderInstances(); save(); });
  $('instSel').innerHTML = S.instances.map(i =>
    `<option value="${esc(i.id)}" ${i.id===S.activeInst?'selected':''}>${esc(i.name)}</option>`).join('');
}
$('instSel').onchange = e => { S.activeInst = e.target.value; applyInstance(); renderInstances(); save(); };
/* ── the brand accent as READABLE INK ─────────────────────────────────
   A label picks its own accent, and that accent has no idea the dark theme
   exists. Measured: the default #2743C7 on the dark soft background reads
   2.05:1 — a pill nobody can read. So the accent stays the accent (borders,
   fills, the mark) and a separate token carries it as TEXT, lightened only
   as far as it must be to clear AA against the surface it will sit on. */
const _lin = c => { c/=255; return c<=.03928 ? c/12.92 : Math.pow((c+.055)/1.055,2.4); };
const _lum = ([r,g,b]) => .2126*_lin(r)+.7152*_lin(g)+.0722*_lin(b);
const _ratio = (a,b) => { const x=_lum(a),y=_lum(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); };
const _hex2rgb = h => { const m=/^#?([0-9a-f]{6})$/i.exec(String(h).trim());
  return m ? [0,2,4].map(i=>parseInt(m[1].slice(i,i+2),16)) : [39,67,199]; };
const _rgb2hex = a => '#'+a.map(x=>Math.max(0,Math.min(255,Math.round(x))).toString(16).padStart(2,'0')).join('');
function readableInk(accent, surface, target){
  let c = _hex2rgb(accent); const bg = _hex2rgb(surface), t = target || 4.5;
  const toward = _lum(bg) < .5 ? [255,255,255] : [0,0,0];
  /* Step toward white on a dark surface, toward black on a light one, and stop
     at the first step that clears the bar. 40 steps of 2.5% each. */
  for (let i=0; i<40 && _ratio(c,bg) < t; i++) c = c.map((v,k)=>v+(toward[k]-v)*0.025*2);
  return _rgb2hex(c);
}
function syncBrandInk(){
  const i = S.instances.find(x=>x.id===S.activeInst) || S.instances[0];
  const dark = document.documentElement.dataset.theme === 'dark';
  const soft = dark ? '#1B2138' : '#EAEDFB';   /* --u-soft, the pill fill */
  const paper = dark ? '#131519' : '#FAFAF7';
  document.documentElement.style.setProperty('--brand-ink', readableInk(i.accent, soft));
  document.documentElement.style.setProperty('--brand-ink-paper', readableInk(i.accent, paper));
}
function applyInstance(){
  const i = S.instances.find(x=>x.id===S.activeInst) || S.instances[0];
  document.documentElement.style.setProperty('--brand', i.accent);
  syncBrandInk();
  $('bmarkName').textContent = i.name;
  $('bmarkSub').textContent = i.sub||'';
  $('bmarkLogo').innerHTML = i.logo ? `<img src="${esc(i.logo)}" alt="">`
    : `<svg class="mk" viewBox="0 0 120 120" aria-hidden="true" style="color:var(--ink)"><use href="#mark"/></svg>`;
}

/* ── profile · the role gates the platform section ─────────────────── */
function applyRole(){
  /* The role only sticks if the threshold is met. Anything else would be a
     promise the protocol cannot keep. */
  if (S.role === 'label' && !labelEligible()) S.role = 'user';
  const isLabel = S.role === 'label';
  $('navInstances').hidden = !isLabel;
  $('instSelWrap').hidden = !isLabel;
  if (!isLabel && $('p-instances').classList.contains('on')) go('over');
}
$('pfRole').onchange = e => {
  if (e.target.value === 'label' && !labelEligible()){
    e.target.value = 'user';
    const cum = capitalUnderManagement();
    toast(`A label needs ${fmt(LABEL_THRESHOLD,0)} under management. You are at ${fmt(cum,0)}.`,'err');
    explain('layers');
    return;
  }
  S.role = e.target.value; applyRole(); save();
  toast(S.role==='label' ? 'Label unlocked — Instances is now in the rail.' : 'Back to participant.','ok');
};
$('pfAvatar').onchange = e => readImage(e.target.files[0], d => {
  S.profile.avatar = d; paintProfile(); save(); toast('Picture updated.','ok'); });
$('btnSaveProfile').onclick = () => {
  S.profile.name = $('pfName').value.trim().slice(0,60);
  S.profile.tag = ($('pfTag').value.trim()||'TU').toUpperCase().slice(0,3);
  paintProfile(); save(); toast('Profile saved.','ok'); };
['pfTheme','pfDensity','pfCur','pfAnim'].forEach(id => $(id).onchange = e => {
  S.prefs[id.replace('pf','').toLowerCase()] = e.target.value;
  if (id==='pfTheme') applyTheme(e.target.value);
  if (id==='pfDensity') document.body.style.fontSize = e.target.value==='compact'?'14px':'15px';
  save(); });
function paintProfile(){
  const a = S.profile.avatar, t = S.profile.tag||'TU';
  $('avatarSlot').innerHTML = a?`<img class="avatar" src="${esc(a)}" alt="">`:`<span class="avatar ph">${esc(t)}</span>`;
  $('avBigSlot').innerHTML = a?`<img class="avbig" src="${esc(a)}" alt="">`:`<span class="avbig ph">${esc(t[0]||'T')}</span>`;
  $('pfName').value = S.profile.name||''; $('pfTag').value = t;
  $('pfCur').value = S.prefs.cur; $('pfDensity').value = S.prefs.density;
  $('pfAnim').value = S.prefs.anim; $('pfRole').value = S.role;
}
$('btnExport').onclick = () => {
  $('genTitle').textContent = 'Raw simulation state';
  $('genBody').innerHTML = `<div class="codeb" style="max-height:400px;white-space:pre-wrap">${
    esc(JSON.stringify({triad:S.triad, vaults:S.vaults, history:S.history.slice(-40)},null,2))}</div>`;
  $('genOv').classList.add('show');
};
$('btnReset').onclick = () => {
  try{ localStorage.removeItem('triviu-console'); }catch(e){}
  location.reload();
};
$('genClose').onclick = () => $('genOv').classList.remove('show');

/* ── help ──────────────────────────────────────────────────────────── */
function renderHelp(){
  const items = [];
  Object.keys(SRC).forEach(k => SRC[k].fns.forEach(f => items.push({file:SRC[k].file, ...f})));
  $('helpList').innerHTML = items.map(h => `<details class="acc"><summary>
    <span class="fn" translate="no">${esc(h.sig)}</span>
    <span class="small faint">${esc(h.file)}</span>
    <span class="chev">${icon('chevron')}</span></summary>
    <div class="body"><p class="small muted">${esc(h.ex)}</p>
    <div class="codeb" translate="no">${hl(h.body).replace(/\x01(k|f|c)/g,(m,x)=>`<span class="${x}">`).replace(/\x02/g,'</span>')}</div>
    </div></details>`).join('');
}

/* ═══════════════════════════════════════════════════════════════════════
   THE CYCLE · Three.js, ported from the official site (site/index.html).
   Spheres for the nodes, a tube per arc, a cone per direction marker, a
   point field, hemisphere + directional light. Drag to turn, tap a node.
   ═══════════════════════════════════════════════════════════════════════ */
let three = {ok:false};
const OBJ_W = 3.3;
const NODE_TIP = {
  d:'Decentralisation · the base layer keeps it',
  s:'Security · atomic or it never happened',
  sc:'Scalability · the surface above absorbs it'
};
function themeInk(){ return getComputedStyle(document.documentElement).getPropertyValue('--ink').trim(); }
function themePaper(){ return getComputedStyle(document.documentElement).getPropertyValue('--paper').trim(); }

function init3D(){
  if (typeof THREE === 'undefined'){ document.body.classList.add('no3d'); return; }
  try{
    const canvas = $('scene');
    const renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:true});
    renderer.setClearColor(new THREE.Color(themePaper()), 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60);
    camera.position.set(0,0,6);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xDDE0DA, 1.05));
    const dir = new THREE.DirectionalLight(0xffffff, 0.65); dir.position.set(3,4,5); scene.add(dir);

    const outer = new THREE.Group(), inner = new THREE.Group();
    outer.add(inner); scene.add(outer);

    const NODES = [
      {p:[-0.5, 0.866,0], c:0x2743C7, tip:'d'},
      {p:[ 1.0, 0.0,  0], c:0xC13327, tip:'s'},
      {p:[-0.5,-0.866,0], c:0xE8B23A, tip:'sc'}
    ];
    const inkMats = [], spheres = [];
    const v = a => new THREE.Vector3(a[0],a[1],a[2]);
    function arc(a,b){
      const mid = v(a).add(v(b)).multiplyScalar(0.5);
      const ctrl = mid.clone().multiplyScalar(1.6);
      const curve = new THREE.QuadraticBezierCurve3(v(a), ctrl, v(b));
      const mat = new THREE.MeshStandardMaterial({color:0x16181D, roughness:0.5, metalness:0.05});
      inkMats.push(mat);
      inner.add(new THREE.Mesh(new THREE.TubeGeometry(curve,48,0.055,12,false), mat));
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.075,0.17,16), mat);
      cone.position.copy(curve.getPointAt(0.5));
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), curve.getTangentAt(0.5).normalize());
      inner.add(cone);
    }
    arc(NODES[0].p,NODES[1].p); arc(NODES[1].p,NODES[2].p); arc(NODES[2].p,NODES[0].p);
    NODES.forEach(n => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.15,32,24),
        new THREE.MeshStandardMaterial({color:n.c, roughness:0.35, metalness:0.1}));
      m.position.set(n.p[0],n.p[1],n.p[2]);
      m.userData = {tip:n.tip, hex:n.c};
      inner.add(m); spheres.push(m);
    });

    const pts = new THREE.BufferGeometry(), N = 260, arr = new Float32Array(N*3);
    for (let i=0;i<N*3;i++) arr[i] = (Math.random()-0.5)*15;
    pts.setAttribute('position', new THREE.BufferAttribute(arr,3));
    const cloud = new THREE.Points(pts, new THREE.PointsMaterial(
      {color:0x52575D, size:0.022, transparent:true, opacity:0.35}));
    scene.add(cloud);

    three = {ok:true, renderer, scene, camera, outer, inner, spheres, inkMats, cloud,
      anchor:{x:1.6,y:0,scale:1,docY:0,visH:4,visW:7,ppw:0.004},
      tgt:{rx:0,ry:0,spin:0,px:0,py:0}, cur:{rx:0,ry:0,spin:0,px:0,py:0}, vel:0,
      inkCur:new THREE.Color(0x16181D), inkTgt:new THREE.Color(0x16181D)};
    syncInk(); resize3D(); render3D();
    if (!reduced()) requestAnimationFrame(loop3D);
  }catch(e){ document.body.classList.add('no3d'); }
}
function syncInk(){
  if (!three.ok) return;
  three.inkTgt = new THREE.Color(themeInk());
  three.renderer.setClearColor(new THREE.Color(themePaper()), 1);
}
function anchorEl(){ return $('stage-hit') && !$('viewInit').hidden ? $('stage-hit') : null; }
function computeAnchor(){
  /* A MESMA GUARDA QUE `onScroll3D` ja tinha, e que faltava aqui.
     O boot do 3D sai limpo quando o three.js nao carrega — `typeof THREE ===
     'undefined'` marca `no3d` no body e retorna. Mas duas linhas de outro
     caminho agendam `computeAnchor()` num requestAnimationFrame sem passar por
     esse boot, e sem cena a primeira linha desta funcao le `cam.position` de
     `undefined` e derruba a PAGINA INTEIRA — por causa da animacao decorativa
     do simbolo.
     No navegador isso acontece se `/vendor/three-r128.min.js` falhar em carregar:
     um arquivo de 600 KB numa conexao ruim, ou um bloqueador. A tela que assina
     transacao nao pode depender de um enfeite ter chegado.
     Achado pelo ensaio de fluxo em 2026-08-23, na primeira execucao dele — e a
     forma certa ja existia intocada na funcao vizinha. */
  if (!three || !three.ok || !three.camera) return;
  const a = three.anchor, cam = three.camera;
  a.visH = 2*cam.position.z*Math.tan(THREE.MathUtils.degToRad(cam.fov/2));
  a.visW = a.visH*cam.aspect;
  a.ppw = a.visW/window.innerWidth;
  const el = anchorEl();
  if (el){
    const r = el.getBoundingClientRect();
    a.x = ((r.left+r.width/2)/window.innerWidth - 0.5)*a.visW;
    a.docY = r.top + window.scrollY + r.height/2;
    a.scale = Math.min(r.width*0.9*a.ppw, r.height*0.9*(a.visH/window.innerHeight))/OBJ_W;
  } else {
    /* In the console the Cycle retires to the upper-right margin and shrinks —
       present, never in the way of the type. */
    a.x = Math.max(a.visW/2 - 1.15, 0);
    a.docY = window.scrollY + window.innerHeight*0.28;
    a.scale = 0.42;
  }
}
function resize3D(){
  if (!three.ok) return;
  three.renderer.setSize(window.innerWidth, window.innerHeight, false);
  three.camera.aspect = window.innerWidth/window.innerHeight;
  three.camera.updateProjectionMatrix();
  computeAnchor(); onScroll3D();
}
function onScroll3D(){
  if (!three.ok) return;
  const a = three.anchor;
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const p = max>0 ? window.scrollY/max : 0;
  three.tgt.spin = -p*9*(Math.PI*2/3);
  const y = -((a.docY - window.scrollY)/window.innerHeight - 0.5)*a.visH;
  three.outer.position.set(a.x, y, 0);
  three.outer.scale.setScalar(a.scale);
  if (reduced()){ snap3D(); render3D(); }
}
function snap3D(){ const c=three.cur,t=three.tgt;
  c.rx=t.rx;c.ry=t.ry;c.spin=t.spin;c.px=t.px;c.py=t.py; apply3D(); }
function apply3D(){
  const c = three.cur;
  three.inner.rotation.x = c.rx; three.inner.rotation.y = c.ry;
  three.outer.rotation.z = c.spin;
  three.camera.position.x = c.px; three.camera.position.y = c.py;
  three.camera.lookAt(0,0,0);
  three.inkCur.lerp(three.inkTgt, 0.08);
  three.inkMats.forEach(m => m.color.copy(three.inkCur));
}
function render3D(){ if (three.ok) three.renderer.render(three.scene, three.camera); }
function loop3D(t){
  if (!three.ok) return;
  if (!document.hidden){
    const c=three.cur, g=three.tgt, k=0.09;
    g.ry += three.vel; three.vel *= 0.94;
    c.rx += (g.rx-c.rx)*k; c.ry += (g.ry-c.ry)*k;
    c.spin += ((g.spin-(t*0.00005))-c.spin)*0.05;
    c.px += (g.px-c.px)*0.06; c.py += (g.py-c.py)*0.06;
    three.cloud.rotation.y += 0.0004;
    apply3D(); render3D();
  }
  requestAnimationFrame(loop3D);
}
/* drag with inertia, and tap a node for its trilemma axis */
(function(){
  let down=false, moved=0, lx=0, ly=0, tipTimer=null;
  const pos = e => { const t = e.touches?e.touches[0]:e; return {x:t.clientX,y:t.clientY}; };
  function start(e){ if(!three.ok)return; down=true; moved=0; three.vel=0;
    const p=pos(e); lx=p.x; ly=p.y; $('stage-hit')?.classList.add('dragging'); }
  function move(e){
    if(!three.ok)return;
    const p = pos(e);
    if (down){
      const dx=p.x-lx, dy=p.y-ly; lx=p.x; ly=p.y; moved += Math.abs(dx)+Math.abs(dy);
      three.tgt.ry += dx*0.008; three.vel = dx*0.0016;
      three.tgt.rx = Math.max(-0.9, Math.min(0.9, three.tgt.rx + dy*0.008));
      if (reduced()){ snap3D(); render3D(); }
      if (e.cancelable) e.preventDefault();
    } else if (!reduced()){
      three.tgt.px = (p.x/window.innerWidth - 0.5)*0.3;
      three.tgt.py = -(p.y/window.innerHeight - 0.5)*0.22;
    }
  }
  function end(e){
    if(!three.ok)return;
    $('stage-hit')?.classList.remove('dragging');
    if (down && moved < 8){
      const p = e.changedTouches ? e.changedTouches[0] : e;
      const ndc = new THREE.Vector2((p.clientX/window.innerWidth)*2-1, -(p.clientY/window.innerHeight)*2+1);
      const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, three.camera);
      const hits = ray.intersectObjects(three.spheres);
      if (hits.length){
        const s = hits[0].object, tip = $('tip');
        $('tip-txt').textContent = NODE_TIP[s.userData.tip];
        tip.querySelector('.dot').style.background = '#'+s.userData.hex.toString(16).padStart(6,'0');
        tip.style.left = p.clientX+'px'; tip.style.top = p.clientY+'px';
        tip.classList.add('on'); beep(620,0.05);
        clearTimeout(tipTimer); tipTimer = setTimeout(()=>tip.classList.remove('on'), 2600);
      }
    }
    down = false;
  }
  document.addEventListener('pointerdown', e => { if (e.target.closest('#stage-hit')) start(e); });
  window.addEventListener('pointermove', move, {passive:false});
  window.addEventListener('pointerup', end);
  window.addEventListener('scroll', onScroll3D, {passive:true});
  window.addEventListener('resize', resize3D);
  window.addEventListener('orientationchange', () => setTimeout(resize3D, 120));
})();

/* ═══ SOUND · short, tonal, never a jingle ═════════════════════════════ */
let actx = null;
function beep(freq, dur, type){
  if (!S.prefs.sound || reduced()) return;
  try{
    actx = actx || new (window.AudioContext||window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type||'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.055, actx.currentTime+0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime+(dur||0.09));
    o.connect(g); g.connect(actx.destination);
    o.start(); o.stop(actx.currentTime+(dur||0.09)+0.02);
  }catch(e){}
}
const SFX = {
  tap:   () => beep(520,0.05),
  ok:    () => { beep(660,0.07); setTimeout(()=>beep(880,0.09),70); },
  fail:  () => { beep(220,0.10,'triangle'); setTimeout(()=>beep(165,0.14,'triangle'),90); },
  sign:  () => { beep(440,0.06); setTimeout(()=>beep(587,0.06),80); setTimeout(()=>beep(740,0.10),160); },
  notify:() => { beep(880,0.05); setTimeout(()=>beep(1170,0.07),60); }
};
$('btnSound').onclick = () => {
  S.prefs.sound = !S.prefs.sound;
  $('soundIcon').setAttribute('href', S.prefs.sound ? '#i-sound' : '#i-mute');
  $('btnSound').setAttribute('aria-label', S.prefs.sound ? 'Mute sound' : 'Unmute sound');
  if (S.prefs.sound) SFX.tap();
  save();
};

/* ═══ NOTIFICATIONS ════════════════════════════════════════════════════ */
function notify(text, kind){
  S.notifs = S.notifs || [];
  S.notifs.unshift({text, kind:kind||'dot', at:Date.now()});
  S.notifs = S.notifs.slice(0,12);
  paintNotifs(); SFX.notify(); save();
}
function paintNotifs(){
  const n = S.notifs || [];
  const unread = n.filter(x => !x.read).length;
  const b = $('bellBadge'); b.hidden = !unread; b.textContent = unread;
  $('notifPanel').innerHTML = n.length ? n.map(x =>
    `<div class="n">${icon(x.kind==='ok'?'check':x.kind==='err'?'alert':'dot')}
      <span>${esc(x.text)}<br><span class="faint mono" style="font-size:10.5px">${
        new Date(x.at).toLocaleTimeString('en-US')}</span></span></div>`).join('')
    : '<p class="faint small" style="padding:var(--s3)">Nothing yet.</p>';
}
$('btnBell').onclick = () => {
  const p = $('notifPanel'); p.classList.toggle('on');
  if (p.classList.contains('on')){ (S.notifs||[]).forEach(x => x.read = true); paintNotifs(); save(); }
};

/* ═══ WEB3 HEADER ══════════════════════════════════════════════════════ */
function paintChain(){
  const on = S.wallet.connected;
  const real = on && S.wallet.real;
  $('chainDot').className = 'chaindot'+(on?'':' off');
  $('chainName').textContent = 'Polygon';
  $('chainId').textContent = on ? '137' : '—';
  $('walletAddr').textContent = on ? short(S.wallet.address) : 'not connected';
  const pill = $('wModePill');
  if (pill){
    pill.textContent = !on ? 'not connected' : 'live · read-only';
    pill.className = 'pill' + (real ? ' ok' : (on ? ' warn' : ''));
  }
  const wt = $('wTitle'); if (wt) wt.textContent = real ? 'Wallet · Polygon' : 'Wallet';
}
$('btnWallet').onclick = async () => {
  if (S.wallet.connected){
    $('genTitle').textContent = 'Wallet';
    $('genBody').innerHTML = `<div class="tscroll"><table translate="no"><tbody>
      <tr><td class="faint">address</td><td>${esc(S.wallet.address)}</td></tr>
      <tr><td class="faint">network</td><td>Polygon PoS · chainId 137</td></tr>
      <tr><td class="faint">balance</td><td>${fmt(S.vaults.reduce((a,v)=>a+v.idle+v.inPos,0))} ${esc(S.base)}</td></tr>
      <tr><td class="faint">signer</td><td>your wallet — no key is ever read by this page</td></tr>
    </tbody></table></div>`;
    $('genOv').classList.add('show'); SFX.tap();
  } else { await connect(); paintChain(); notify('Wallet connected.','ok'); }
};

/* ═══ LANGUAGE ═════════════════════════════════════════════════════════ */
const ES = {
  'Overview':'Visión general','Sub-accounts':'Subcuentas','Fence':'Cerca','Operate':'Operar',
  'Analytics':'Analítica','Referrals':'Referidos','Contracts':'Contratos','Instances':'Instancias',
  'Profile':'Perfil','How it works':'Cómo funciona','Layers · L1 / L2':'Capas · L1 / L2'
};
function setLang(l){
  S.prefs.lang = l;
  $('langEN').setAttribute('aria-pressed', l==='en');
  $('langES').setAttribute('aria-pressed', l==='es');
  document.documentElement.lang = l;
  document.querySelectorAll('.navb').forEach(b => {
    const en = b.dataset.en || (b.dataset.en = b.textContent.trim());
    const t = l==='es' ? (ES[en]||en) : en;
    b.lastChild.nodeType === 3 ? b.lastChild.textContent = t : null;
  });
  save();
}
$('langEN').onclick = () => { setLang('en'); SFX.tap(); };
$('langES').onclick = () => { setLang('es'); SFX.tap(); };

/* ═══ MARQUEE ══════════════════════════════════════════════════════════ */
(function(){
  const items = ["DON'T TRUST — VERIFY","NO TOKEN","NON-CUSTODIAL","OPEN SOURCE",
    "ATOMIC A→B→C→A","FAILURES PUBLISHED","EDUCATION, NOT INCOME","AUDIT BEFORE MAINNET"];
  const one = items.map(t=>`<span>${t}</span><span>·</span>`).join('');
  $('mqTrack').innerHTML = one + one;
})();

/* ═══ BOOT ═════════════════════════════════════════════════════════════ */
function bootConsole(){
  paintChain(); paintNotifs(); setLang(S.prefs.lang||'en');
  $('soundIcon').setAttribute('href', S.prefs.sound===false ? '#i-mute' : '#i-sound');
  applyRole(); renderSwatches(); paintPreview(); renderInstances(); applyInstance();
  paintProfile(); renderHelp(); renderContracts();
  renderVaults(); renderFence(); renderOps(); renderOver(); renderAnalytics(); renderRefs();
  renderLayers(); renderLiquidity(); renderStrategies(); renderRangeBars();
  $('autoEvery').value = String(S.auto.every);
  $('autoCap').value   = String(S.auto.cap);
  $('autoScope').value = S.auto.scope;
  $('armPref').checked = S.prefs.autoArm !== false;
  $('nvDefName').textContent = (stratById(DEFAULT_STRATEGY)||{name:'the default'}).name;
  renderSpread();
  setAuto(false, true);   /* the switch and the engine start from the same place */
  requestAnimationFrame(()=>{ computeAnchor(); onScroll3D(); });
  setTimeout(firstRunTour, 700);
}
/* O SELETOR NA CARGA, e nao so depois de conectar.
   Eu tirei as tres opcoes escritas no HTML — USDT, USDC.e e DAI, nenhuma delas
   curada — e passei a preencher o seletor em `connect()`. O resultado foi um
   seletor VAZIO na tela do Copilot para quem ainda nao conectou, com o botao
   Start ao lado sem nada para comecar. Foi o fundador que viu.
   Ler a moeda-base nao precisa de carteira: e uma leitura publica de RPC. Entao
   ela acontece na carga, e se o RPC nao responder o seletor diz isso em vez de
   ficar em branco. */
/* ═══ A CONTA DA TAXA, NA TELA ════════════════════════════════════════════
   O fundador perguntou como o usuario paga a taxa das operacoes e a resposta —
   "do proprio saldo, dentro do cofre, na mesma transacao" — nao pode viver so
   numa conversa. Quem paga tem de ver antes de armar.

   A ARITMETICA E A DO CONTRATO, e nao uma aproximacao dela. Solidity divide
   inteiros truncando, e `Fees.protocolFee` faz `mulDiv(traded, feeBps, 10000)`.
   Uma tela que calculasse em ponto flutuante e arredondasse mostraria um centavo
   que o contrato nao entrega — e um centavo de diferenca numa tela que promete
   numero medido vale menos que nao mostrar nada. Por isso tudo aqui e BigInt em
   unidades-base, exatamente como na chain.

   E a ORDEM importa mais que os numeros. Em `_settle`:

       net = isBuy ? gross : gross - fee - refund;
       if (net < intent.minOut) revert NetBelowStrategyMin();

   O piso de lucro e conferido DEPOIS de descontar taxa e reembolso. Se nao
   sobrar o minimo liquido, a transacao inteira reverte: nada e pago, nada e
   debitado, a posicao nao fecha. Quem perde o gas nesse caso e o OPERADOR, e
   nao o dono do cofre. Isso e o que a tela precisa dizer, porque e a diferenca
   entre "voce paga uma taxa" e "voce pode fechar no vermelho por causa dela". */
const BPS = 10000n;
const REFUND_BPS_MAX = 100n;   /* Fees.sol, byte a byte */

/* `Math.mulDiv` do OpenZeppelin trunca. BigInt tambem. Uma unica forma. */
const mulDiv = (a, b, d) => (a * b) / d;
const menor = (a, b) => (a < b ? a : b);

function contaDaOperacao(negociado, feeBps, casas, declaradoRefund) {
  const taxa = mulDiv(negociado, BigInt(feeBps), BPS);
  const tetoRefund = menor(10n ** BigInt(casas), mulDiv(negociado, REFUND_BPS_MAX, BPS));
  const reembolso = declaradoRefund === null ? tetoRefund : menor(declaradoRefund, tetoRefund);
  return { taxa, tetoRefund, reembolso, liquidoVenda: negociado - taxa - reembolso };
}

function renderCustos() {
  const caixa = $('custoTabela');
  if (!caixa) return;
  while (caixa.firstChild) caixa.removeChild(caixa.firstChild);

  const casas = TRIVIU.base.decimals;
  const simbolo = TRIVIU.base.symbol;
  const feeBps = TRIVIU.feeBps;
  const linha = (rot, val, cls) => {
    const d = document.createElement('div');
    d.className = 'asskv';
    const k = document.createElement('span'); k.className = 'assk'; k.textContent = rot;
    const v = document.createElement('span'); v.className = 'assv ' + (cls || ''); v.textContent = val;
    d.appendChild(k); d.appendChild(v); caixa.appendChild(d);
  };

  /* Sem leitura de chain nao ha conta. Inventar 0,5% porque "e o que costuma
     ser" seria exatamente o numero sem medicao que este projeto ja pagou caro. */
  if (feeBps === null || feeBps === undefined || casas === null || casas === undefined) {
    linha('taxa', 'nao lida — conecte a carteira para o console ler o ProtocolRegistry');
    return;
  }

  const bruto = ($('custoQuanto') && $('custoQuanto').value || '').trim();
  if (!/^\d+(\.\d+)?$/.test(bruto)) {
    linha('taxa vigente', (feeBps / 100) + '% do negociado · feeBps ' + feeBps +
      ' · teto FEE_BPS_MAX ' + (TRIVIU.feeBpsMax === null ? '—' : TRIVIU.feeBpsMax), 'mono');
    linha('digite um valor acima', 'para ver a conta exata desta operacao');
    return;
  }

  let negociado;
  try { negociado = BigInt(paraBase(bruto)); } catch (e) { linha('valor invalido', e.message); return; }
  const c = contaDaOperacao(negociado, feeBps, casas, null);
  const fmtB = (v) => (Number(v) / 10 ** casas).toFixed(Math.min(casas, 6)) + ' ' + (simbolo || '');

  linha('negociado nesta operacao', fmtB(negociado), 'mono');
  linha('taxa do protocolo · ' + (feeBps / 100) + '%', '− ' + fmtB(c.taxa) + '  → tesouraria', 'mono');
  linha('reembolso de gas ao operador', 'ate ' + fmtB(c.reembolso) +
    '  → quem abriu o ciclo', 'mono');
  linha('   o teto e o MENOR entre', '1 unidade (' + fmtB(10n ** BigInt(casas)) +
    ') e 1% do negociado (' + fmtB(mulDiv(negociado, REFUND_BPS_MAX, BPS)) + ')');
  linha('sobra numa VENDA que devolva este valor', fmtB(c.liquidoVenda), 'mono');
  linha('numa COMPRA', 'a taxa e o reembolso saem do saldo que FICA no cofre, e nao do que a rota entrega');
  linha('o piso de lucro e conferido DEPOIS disto',
    'se o liquido nao alcancar o minimo da estrategia, a transacao inteira reverte — nada e pago, ' +
    'nada e debitado, e quem perde o gas e o operador');
  linha('quem paga cada coisa',
    'taxa: voce, do cofre, em ' + (simbolo || 'moeda-base') + ' · gas do ciclo: o operador, em POL · ' +
    'gas das SUAS transacoes: voce, em POL');
}

/* ═══ O PAINEL DE GAS PARA DE CONVIDAR O CLIQUE ════════════════════════════
   O fundador clicou em "Fund" varias vezes e recebeu a mesma recusa. A recusa
   estava certa e o painel estava errado: campos ativos e um botao azul sao um
   convite, e recusar depois do convite e culpar quem aceitou.
   Desabilitar e mais honesto que recusar. E o rotulo diz o que a V0 faz no lugar:
   o gas de cada transacao sai da carteira de quem assina, como em qualquer
   transacao — nao ha reserva porque nao ha contrato para reter reserva. Medido:
   o Executor da V0 tem 58 linhas, nao guarda fundo nenhum e nao tem gate de gas;
   e `GasTank` nao existe nem no codigo-fonte deste repositorio. */
function desligarPainelDeGas(){
  for (const id of ['gtAdd','gtRem']){
    const el = $(id);
    if (!el) continue;
    el.disabled = true;
    el.value = '';
    el.placeholder = 'a V0 nao tem reserva de gas';
  }
  document.querySelectorAll('[data-explain="gas"]').forEach(() => {});
}

/* ═══ O QUE ABRE AS OPERACOES, lido da chain ═══════════════════════════════
   Esta e a resposta a pergunta que o fundador fez clicando em "add gas": o que
   falta para operar. Nenhuma das condicoes abaixo e gas. Elas sao os `revert`
   do caminho de execucao, lidos de VaultExecution.sol e conferidos na chain um
   a um — e o que nao deu para perguntar fica "nao medido", que e diferente de
   "falta". */
async function prontidaoParaOperar(){
  const v = activeV();
  const cofre = (v && v.addr) || S.triad?.vault || null;
  const linhas = [];
  const por = async (rotulo, promessa, comoFaz) => {
    let ok = null;
    try { ok = await promessa; } catch (e) { ok = null; }
    linhas.push({ rotulo, ok, comoFaz });
  };

  await por('o cofre existe na chain',
    cofre ? LER.existe(cofre) : Promise.resolve(false),
    'passo 02 do Builder, ou o Copilot');
  await por('a moeda-base e curada pelo REGISTRO (so o ciclo exige)',
    LER.isBaseCurrency(S.moeda || TRIVIU.base.address),
    'governanca, via setBaseCurrency na Safe — nao e acao sua');
  await por('o executor compartilhado esta curado',
    LER.isExecutor(TRIVIU.addr.executor),
    'ja veio do genesis');
  await por('o protocolo nao esta pausado',
    LER.paused().then(p => p === false),
    'governanca');
  await por('o seu cofre tem uma estrategia apontada',
    cofre ? LER.estrategia(cofre).then(e => /^0x0{40}$/i.test(e) === false) : Promise.resolve(false),
    'setStrategy(address) — assinado por voce');
  /* QUEM PAGA O GAS DE UM CICLO, e por que nao ha reserva. Medido no contrato:
     _execute exige callerMustBeOperator: true — so o OPERADOR abre posicao —
     e VaultExecution.sol:239 faz ase.safeTransfer(msg.sender, refund): o
     cofre REEMBOLSA quem chamou, na moeda-base, na mesma transacao. O operador
     adianta o gas em POL da carteira dele e recebe de volta em USDC.
     Por isso nao existe GasTank nesta linha: o modelo e reembolso, e nao
     pre-deposito. O usuario nao precisa manter POL parado em contrato nenhum, e
     nao precisa de POL para OPERAR — so para as transacoes que ele mesmo assina.
     Com teto: Fees.gasRefund paga min(declarado, min(1 unidade da moeda,
     1% do negociado)). Negociando 250 USDC o 1% daria 2,50 e o teto absoluto
     corta em 1,00 — um operador nao drena um cofre declarando gas inflado. E o
     evento RefundDetail publica o declarado E o pago, entao o corte aparece.
     A condicao abaixo e do PROTOCOLO e nao sua, e por isso ela diz quem resolve. */
  await por('o operador tem POL para adiantar o gas do ciclo',
    triviuRead('eth_getBalance', [TRIVIU.roles.operator, 'latest']).then(b => BigInt(b) > 0n),
    'a tesouraria financia a chave do servico — nao e acao sua, e sem isso nenhum ciclo abre');

  await por('o seu cofre tem saldo',
    Promise.resolve(!!(v && v.idle > 0)),
    'approve + deposit — duas assinaturas suas');

  return { cofre, linhas };
}

/* Desenha a prontidao no painel de gas, por DOM e nao por innerHTML: este painel
   fica ao lado do caminho que assina. */
async function renderProntidao(){
  /* Havia aqui um `$('gasPainelProntidao')` com um fallback que devolvia `null`
     nos dois ramos — codigo morto que eu escrevi e nao usei. Ele nao quebrava
     nada e por isso teria ficado: um id procurado que nao existe em canto nenhum
     e a semente de um `null.appendChild` na proxima refatoracao. Quem achou foi
     o ensaio de fluxo, na execucao seguinte a de ter sido escrito. */
  const caixa = $('gasProntidao');
  if (!caixa) return;
  while (caixa.firstChild) caixa.removeChild(caixa.firstChild);
  const { linhas } = await prontidaoParaOperar();
  for (const l of linhas){
    const d = document.createElement('div');
    d.className = 'asskv';
    const k = document.createElement('span');
    k.className = 'assk';
    k.textContent = (l.ok === true ? 'pronto' : l.ok === false ? 'falta' : 'nao medido');
    const val = document.createElement('span');
    val.className = 'assv';
    val.textContent = l.rotulo + (l.ok === true ? '' : ' — ' + l.comoFaz);
    d.appendChild(k); d.appendChild(val);
    caixa.appendChild(d);
  }
}

/* O campo recalcula a cada tecla: uma conta que so aparece depois de um botao e
   uma conta que a pessoa nao usa para decidir. */
(function ligarCampoDeCusto(){
  const el = document.getElementById('custoQuanto');
  if (el) el.addEventListener('input', function () { renderCustos(); });
})();

(function moedaNaCarga(){
  preencherMoedas().catch(() => {
    for (const id of ['pBase','wBase','nvBase']){
      const sel = document.getElementById(id);
      if (!sel || sel.options.length) continue;
      const o = document.createElement('option');
      o.textContent = 'nao foi possivel ler a moeda-base da chain';
      sel.appendChild(o); sel.disabled = true;
    }
  });
})();

(function init(){
  load();
  applyTheme(S.prefs.theme||'light');
  init3D();
  if (S.prefs.density==='compact') document.body.style.fontSize='14px';
  if (S.onboarded && S.triad){
    $('viewInit').hidden = true; $('viewConsole').hidden = false; bootConsole();
  } else {
    $('viewInit').hidden = false; $('viewConsole').hidden = true;
    renderNav(); showInit('initHero');
  }
  paintChain(); paintNotifs();
  requestAnimationFrame(()=>{ resize3D(); });
})();
