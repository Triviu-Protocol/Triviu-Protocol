
/* ═══════════════════════════════════════════════════════════════════════
   TRIVIU · CONSOLE — simulation. Wallet, chain, contracts and events live
   in memory. No network call is made. No key is read, asked for or touched.
   ═══════════════════════════════════════════════════════════════════════ */
const $ = id => document.getElementById(id);
/* Escapes for ATTRIBUTE context. Without the quote characters a value can
   close the attribute and inject a handler. */
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const icon = (n,c) => `<svg class="ic ${c||''}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const rnd = () => '0x' + Array.from({length:40},() => '0123456789abcdef'[Math.floor(Math.random()*16)]).join('');
const short = a => a ? a.slice(0,6)+'…'+a.slice(-4) : '—';
const fmt = (n,d=2) => Number(n).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const wait = ms => new Promise(r => setTimeout(r,ms));
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches || S.prefs.anim === 'off';

const BAND = {min:10, max:500};
const ASSETS = {WETH:'#2743C7', WBTC:'#E8B23A', LINK:'#1E7A46', AAVE:'#C13327', MATIC:'#7B3FE4'};
const WDN = ['sun','mon','tue','wed','thu','fri','sat'];
const GAS = {register:95000, triad:2600000, fence:130000};
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

/* The `/` branch is for a same-origin relative path. A PROTOCOL-RELATIVE url —
   //evil.com/x.svg — also starts with a slash, so it matched and the logo of
   every page in the console loaded from a host the label chose. The lookahead
   rejects the second slash: a relative path is one slash, never two. */
const LOGO_URL_RE  = /^(https?:\/\/|\/(?!\/))[^\s"'<>]+$/;
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

function save(){ try{ localStorage.setItem('triviu-console', JSON.stringify(S)); }catch(e){} }
function load(){
  try{ const r = localStorage.getItem('triviu-console'); if (r) Object.assign(S, JSON.parse(r)); }catch(e){}
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
      rej(new Error('Signature rejected in the wallet (simulated).')); };
  });
}
function turning(on){ document.querySelectorAll('.mk,.mkbig').forEach(m => m.classList.toggle('turning', on)); }
async function tx({to,fn,gas,label,apply,log}){
  log?.(label+' — confirm in the wallet');
  await walletConfirm({to,fn,gas});
  turning(true);
  const h = '0x'+Array.from({length:64},()=>'0123456789abcdef'[Math.floor(Math.random()*16)]).join('');
  log?.('sent: '+h,'tx');
  await wait(reduced()?60:700);
  apply?.();
  turning(false); SFX.sign();
  log?.('confirmed · gas '+gas.toLocaleString('en-US')+' (simulated)','ok');
  return {hash:h, gas};
}
async function connect(){
  if (S.wallet.connected) return;
  await wait(reduced()?40:320);
  S.wallet = {connected:true, address:rnd()};
  S.registry = rnd();
  save();
}

/* ═══ THE CONTRACTS · shown, commented, always available ═══════════════ */
const SRC = {
 registry:{file:'TriviuRegistry.sol', fns:[
  {sig:'register()', ex:'Writes you into the protocol. There is no sponsor field on this call and no reward for bringing anyone — the referral vault pays only on realised profit of people who already chose to be here.', body:
`function register() external {
    if (users[msg.sender].registered) revert AlreadyRegistered();
    users[msg.sender] = User(true, uint40(block.timestamp));
    emit Registered(msg.sender);
}`},
  {sig:'deployTriad(address baseToken)', ex:'The heart of the deploy: one click, three contracts, all owned by you. The registry creates them and steps away — it holds no balance, cannot withdraw, cannot pause. There is no admin in the path.', body:
`function deployTriad(address baseToken) external
    returns (address vault, address executor, address referralVault)
{
    if (!users[msg.sender].registered)  revert NotRegistered();
    if (!config.isBaseToken(baseToken)) revert TokenNotAllowedAsBase();

    // ONE transaction, THREE contracts — owner is msg.sender in all three.
    vault         = factory.deployVault(msg.sender, baseToken);
    executor      = factory.deployExecutor(msg.sender, vault);
    referralVault = factory.deployReferralVault(msg.sender, baseToken);

    emit TriadDeployed(msg.sender, baseToken, vault, executor, referralVault);
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
  {sig:'rescuePosition(uint256 posId, address token)', ex:'If everything else has stopped — keeper offline, route gone — you still recover the asset of any position, straight to your wallet.', body:
`function rescuePosition(uint256 posId, address token) external onlyOwner {
    // Emergency exit: sends the position token DIRECTLY to the owner,
    // no swap, no keeper, no route, no quote.
    Position storage p = positions[posId];
    if (!p.open) revert PositionNotOpen();
    p.open = false;
    IERC20(token).transfer(owner, p.amount);
    emit PositionRescued(posId, token, p.amount);
}`}]},
 executor:{file:'TriviuExecutor.sol', fns:[
  {sig:'setAllowedAssets(address[] assets)', ex:'The asset fence. A new list erases the old one entirely — it never appends. An empty list is a locked executor, and that is the state it is born in: the default is not to be able to.', body:
`function setAllowedAssets(address[] calldata assets) external onlyOwner {
    for (uint256 i; i < allowed.length; ++i) isAllowed[allowed[i]] = false;
    delete allowed;
    for (uint256 i; i < assets.length; ++i) {
        if (assets[i] == address(baseToken)) revert BaseTokenNotTradable();
        allowed.push(assets[i]);
        isAllowed[assets[i]] = true;
    }
    emit AllowedAssetsSet(assets);
}`},
  {sig:'openPosition(address asset, uint256 amount)', ex:'The keeper’s only door. Twelve conditions are checked before a single token moves, and any one of them rejecting reverts the whole transaction. The gas of a failed attempt is the keeper’s, not yours — which is why tightening the fence costs you nothing.', body:
`function openPosition(address asset, uint256 amount) external onlyKeeper {
    if (paused)                        revert Paused();
    if (!isAllowed[asset])             revert AssetNotAllowed();
    if (!_insideTradingWindow())       revert OutsideWindow();
    if (!_weekdayAllowed())            revert WeekdayBlocked();
    if (_withinCloseBuffer())          revert TooCloseToWindowEnd();
    if (amount > _maxTradeSize())      revert AboveMaxTradeSize();
    if (amount < _minTradeSize())      revert BelowMinTradeSize();
    if (openCount >= maxOpenPositions) revert TooManyOpenPositions();
    if (block.timestamp < lastOpenAt + minSecondsBetweenTrades)
                                       revert CoolingDown();
    if (lossCooldownOn && block.timestamp < lastLossAt + lossCooldown)
                                       revert RestingAfterLoss();
    if (maxGasPrice != 0 && tx.gasprice > maxGasPrice)
                                       revert GasTooExpensive();
    if (maxConsecutiveLossesOn && consecutiveLosses >= maxConsecutiveLosses)
                                       revert TooManyConsecutiveLosses();

    uint256 posId = vault.openFor(asset, amount);
    lastOpenAt = block.timestamp; ++openCount;
    emit PositionOpened(posId, asset, amount);
}`},
  {sig:'closePosition(uint256 posId)', ex:'Closing is free by default — the fence exists to block opening, not leaving. The only two rules that can reject a close are the close floor and the daily loss limit, and both exist to stop a bad close happening quietly.', body:
`function closePosition(uint256 posId) external onlyKeeper {
    uint256 cost     = positions[posId].cost;
    uint256 proceeds = vault.closeFor(posId);

    // Two exceptions, and only two, can reject a close.
    if (minCloseReturnOn &&
        proceeds < cost * minCloseReturnBps / 10_000)
        revert BelowMinCloseReturn();          // 1 · close floor

    if (dailyLossLimitOn &&
        _lossToday(cost, proceeds) > _dailyLossCap())
        revert DailyLossLimitHit();            // 2 · daily loss limit

    if (proceeds < cost) { lastLossAt = block.timestamp; ++consecutiveLosses; }
    else consecutiveLosses = 0;
    --openCount;
    emit PositionClosed(posId, cost, proceeds);
}`},
  {sig:'setPaused(bool p)', ex:'The handbrake, and only the owner has it. Pausing blocks new openings and touches neither closing nor rescue — no state of this contract can trap your money inside it.', body:
`function setPaused(bool p) external onlyOwner {
    // Pause blocks OPENING. Closing and rescue stay free, always.
    paused = p;
    emit PausedSet(p);
}`}]}
};
const KW = /\b(function|external|internal|view|returns|address|uint256|uint40|bool|calldata|storage|revert|if|else|for|emit|onlyOwner|onlyKeeper|indexed|event|delete|memory)\b/g;
const FN = /\b(register|deployTriad|deposit|withdraw|rescuePosition|setAllowedAssets|openPosition|closePosition|setPaused|transferFrom|transfer|isBaseToken|deployVault|deployExecutor|deployReferralVault|openFor|closeFor)\b/g;
const hl = s => esc(s).replace(/\/\/[^\n]*/g, m => `\x01c${m}\x02`).replace(KW,'\x01k$1\x02').replace(FN,'\x01f$1\x02');
function codeHtml(key, spot){
  return SRC[key].fns.map((f,i) => {
    const b = hl(f.body).replace(/\x01(k|f|c)/g,(m,x)=>`<span class="${x}">`).replace(/\x02/g,'</span>');
    return `<span class="fnblk${spot===i?' spot':''}" id="fn_${i}">${b}</span>`;
  }).join('\n\n');
}

/* ═══ INITIATION ═══════════════════════════════════════════════════════ */
const STEPS = ['Networks &amp; cost','Register','Deploy the triad','Addresses','Open the console'];
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
  $('stepNav').innerHTML = STEPS.map((s,i) =>
    `<button class="stepbtn" data-step="${i}" ${i===step?'aria-current="step"':''}>
      <span class="n">0${i}</span>${s}<span class="st">${stepDone[i]?icon('check'):''}</span></button>`).join('');
  $('stepNav').querySelectorAll('.stepbtn').forEach(b => b.onclick = () => renderStep(+b.dataset.step));
}
const term = (msg,cls) => {
  const b = $('termBody'); if (!b) return;
  const e = b.querySelector('.faint'); if (e) e.remove();
  const d = document.createElement('div'); d.className = 'ln '+(cls||'');
  d.innerHTML = icon({ok:'check',err:'x',tx:'arrow'}[cls]||'dot')+'<span></span>';
  d.lastElementChild.textContent = msg;
  b.appendChild(d); b.scrollTop = b.scrollHeight;
};
function shell(o){
  return `<div class="codehead"><span class="file" translate="no">${esc(o.file)}</span>
    <span class="pill warn">simulated</span>
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
  <div class="calldata" id="calldataLine" translate="no"><b>calldata</b> · ${o.calldata||'—'}</div>
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
const calldataFor = fn => '0x' + Array.from({length:8},(_,i)=>'0123456789abcdef'[(fn.charCodeAt(i%fn.length)+i)%16]).join('')
  + '0'.repeat(56);

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
        ~${GAS.triad.toLocaleString('en-US')} (three contracts, one transaction) · fence
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

  if (n === 1){
    pane.innerHTML = shell({file:'TriviuRegistry.sol', key:'registry', btn:'Register', hint:'1 transaction',
      addr:S.registry?short(S.registry)+' (simulated)':'generated on connect',
      calldata:calldataFor('register')});
    wireGuide('registry');
    $('btnAction').onclick = async () => {
      const b = $('btnAction'); b.disabled = true;
      try{
        if (!S.wallet.connected){ term('connecting the simulated wallet'); await connect();
          term('connected: '+short(S.wallet.address),'ok'); renderStep(1); return; }
        await tx({to:S.registry, fn:'register()', gas:GAS.register, label:'register()', log:term});
        stepDone[1]=1; renderStep(2);
      }catch(e){ term(e.message,'err'); toast(e.message,'err'); }
      finally{ b.disabled = false; }
    };
    return;
  }

  if (n === 2){
    pane.innerHTML = shell({file:'TriviuRegistry.sol → TriviuFactory', key:'registry',
      btn:'Deploy the triad', hint:'1 transaction · three contracts are born',
      addr:S.registry?short(S.registry)+' (simulated)':'—',
      form:`<div><label for="wBase">Base currency of your vault</label><select id="wBase">
        <option>USDT</option><option>USDC.e</option><option>DAI</option></select></div>`,
      calldata:calldataFor('deployTriad')});
    wireGuide('registry');
    $('wBase').onchange = e => { S.base = e.target.value; };
    $('btnAction').onclick = async () => {
      const b = $('btnAction'); b.disabled = true;
      try{
        if (!S.wallet.connected) throw new Error('Connect the wallet in step 01 first.');
        if (!stepDone[1]) throw new Error('Register first — deployTriad would revert with NotRegistered.');
        await tx({to:S.registry, fn:'deployTriad('+S.base+')', gas:GAS.triad,
          label:'deployTriad('+S.base+')', log:term,
          apply:() => { S.triad = {vault:rnd(), executor:rnd(), referralVault:rnd()};
            S.vaults = [{id:'v1', name:'Main', base:S.base, color:'#2743C7', addr:S.triad.vault,
              idle:250, inPos:0, fence:newFence(), positions:[], nextPos:1,
              cycles:0, rev:0, net:0, gas:0, fee:0}];
            S.activeVault = 'v1'; }});
        term('TriviuVault:         '+S.triad.vault,'ok');
        term('TriviuExecutor:      '+S.triad.executor,'ok');
        term('TriviuReferralVault: '+S.triad.referralVault,'ok');
        stepDone[2]=1; save(); renderStep(3);
      }catch(e){ term(e.message,'err'); toast(e.message,'err'); }
      finally{ b.disabled = false; }
    };
    return;
  }

  if (n === 3){
    const rows = S.triad
      ? [['TriviuVault — your strongbox',S.triad.vault],
         ['TriviuExecutor — the robot and your fence',S.triad.executor],
         ['TriviuReferralVault — spread from those you introduce',S.triad.referralVault]]
      : [['(deploy the triad in step 02)','']];
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
const P_STAGES = ['Connect','Register','Deploy','Default fence','Console ready'];
function pStages(now,done){
  $('pStages').innerHTML = P_STAGES.map((s,i) =>
    `<span class="pill ${i<done?'ok':(i===now?'brand':'')}">${i<done?icon('check'):''}${esc(s)}</span>`).join('');
}
function pSay(text,cls){
  return new Promise(res => {
    const f = $('pFeed'), first = f.querySelector('.faint'); if (first) f.innerHTML = '';
    const d = document.createElement('div'); d.className = 'pln '+(cls||'');
    d.innerHTML = '<span class="who">copilot '+icon('arrow')+' </span><span class="tt"></span><span class="cursor"></span>';
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
    await pSay('Welcome. I will build your triad and explain every stage. You sign — the wallet, simulated here, will open three times. House rule: do not trust me, verify every hash.');
    await connect();
    await pSay('Wallet connected: '+short(S.wallet.address)+' on simulated Polygon. TriviuRegistry at '+short(S.registry)+' — everything derives from it.','ok');
    pStages(1,1);
    await pSay('Stage 1 of 3 — Registration. I will write you into the TriviuRegistry. Sign when the wallet opens. (signature 1 of 3)');
    await tx({to:S.registry, fn:'register()', gas:GAS.register, label:'register'});
    await pSay('Registered.','ok');
    pStages(2,2);
    await pSay('Stage 2 of 3 — Deploying the triad over '+S.base+'. ONE transaction creates your three contracts: TriviuVault, the strongbox only you deposit into and withdraw from; TriviuExecutor, the robot held inside the fence you control; and TriviuReferralVault, where the spread from anyone you introduce accrues until you claim it. You own all three. (signature 2 of 3)');
    await tx({to:S.registry, fn:'deployTriad('+S.base+')', gas:GAS.triad, label:'deployTriad',
      apply:() => { S.triad = {vault:rnd(), executor:rnd(), referralVault:rnd()};
        S.vaults = [{id:'v1', name:'Main', base:S.base, color:'#2743C7', addr:S.triad.vault,
          idle:250, inPos:0, fence:newFence(), positions:[], nextPos:1,
          cycles:0, rev:0, net:0, gas:0, fee:0}];
        S.activeVault = 'v1'; }});
    await pSay('Triad live (simulated).\n  Vault:         '+S.triad.vault+'\n  Executor:      '+S.triad.executor+'\n  ReferralVault: '+S.triad.referralVault+'\nGuard these — in the real thing they are yours and do not depend on this page.','ok');
    pStages(3,3);
    await pSay('Stage 3 of 3 — The fence. It is born with the default strategy already on it, so the sub-account is ready the moment you fund it. The lock did not go away: empty the fence and that sub-account opens nothing, ever. I will allow the conservative pair, WETH and WBTC; you adjust all sixteen controls afterwards in the console. (signature 3 of 3)');
    await tx({to:S.triad.executor, fn:'setAllowedAssets([WETH,WBTC])', gas:GAS.fence, label:'setAllowedAssets',
      apply:() => { S.vaults[0].fence.assets = ['WETH','WBTC']; }});
    await pSay('Fence set: WETH and WBTC allowed.','ok');
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
function go(p){
  document.querySelectorAll('.navb').forEach(b =>
    b.dataset.p === p ? b.setAttribute('aria-current','page') : b.removeAttribute('aria-current'));
  document.querySelectorAll('.pane').forEach(s => s.classList.toggle('on', s.id === 'p-'+p));
  ({over:renderOver, analytics:renderAnalytics, vaults:renderVaults, fence:renderFence,
    ops:renderOps, refs:renderRefs, contracts:renderContracts, layers:renderLayers,
    liquidity:renderLiquidity, strategy:renderStrategies}[p] || (()=>{}))();
  renderRangeBars();
  SFX.tap();
  window.scrollTo({top:0,behavior:'instant'});
}
$('btnHelpTop').onclick = () => go('help');
$('bmark').onclick = () => go('over');
$('btnTheme').onclick = () => { S.prefs.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(S.prefs.theme); syncInk(); renderOver(); renderAnalytics(); SFX.tap(); save(); };
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
function newVault(name, base, color, seed){
  const v = {id:nextVaultId(),
    name, base, color, addr:rnd(), idle:seed, inPos:0,
    fence:newFence(), positions:[], nextPos:1, cycles:0, rev:0, net:0, gas:0, fee:0,
    strategy:DEFAULT_STRATEGY};
  const d = stratById(DEFAULT_STRATEGY);
  if (d) Object.assign(v.fence, JSON.parse(JSON.stringify(d.fence)));
  return v;
}
$('btnNewVault').onclick = () => {
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
    const v = newVault(nm, $('nvBase').value, $('nvColor').value, seed);
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
    try{ await tx({to:v.addr, fn:'rescuePosition('+p.id+', '+p.asset+')', gas:70000,
      label:'rescuePosition', apply:() => { p.open = false; v.inPos -= p.cost; }});
      renderVaults(); renderOver(); save(); toast('Position rescued to your wallet.','ok');
    }catch(e){ toast(e.message,'err'); }
  });
}
$('btnDep').onclick = () => { const v = activeV(); if (!v) return;
  const a = parseFloat($('vdDep').value); if (!a || a<=0) return toast('Enter an amount.','err');
  if (v.idle+v.inPos+a > BAND.max) return toast(`This sub-account is capped at ${BAND.max}. Open another — that is the design.`,'err');
  v.idle += a; $('vdDep').value=''; renderVaults(); renderOver(); save(); toast('Deposit simulated.','ok'); };
$('btnWd').onclick = () => { const v = activeV(); if (!v) return;
  const a = parseFloat($('vdWd').value); if (!a || a<=0) return toast('Enter an amount.','err');
  if (a > v.idle) return toast('Not enough idle balance.','err');
  v.idle -= a; $('vdWd').value=''; renderVaults(); renderOver(); save(); toast('Withdrawal simulated.','ok'); };
$('btnDelVault').onclick = () => { S.vaults = S.vaults.filter(x => x.id !== S.activeVault);
  S.activeVault = S.vaults[0]?.id || null; renderVaults(); renderOps(); renderOver(); save(); toast('Sub-account closed.'); };

/* ── THE FENCE · sixteen controls ──────────────────────────────────── */
function renderFence(){
  $('fenceVault').innerHTML = S.vaults.map(v =>
    `<option value="${esc(v.id)}" ${v.id===S.activeVault?'selected':''}>${esc(v.name)} · ${esc(v.base)}</option>`).join('')
    || '<option>open a sub-account first</option>';
  $('fenceVault').onchange = e => { S.activeVault = e.target.value; renderFence(); };
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
  const set = (fn,gas,apply) => tx({to:S.triad?.executor||v.addr, fn, gas, label:fn, apply})
    .then(() => { renderFence(); renderVaults(); save(); }).catch(e => toast(e.message,'err'));

  add({t:'Emergency pause', on:c.paused, cur:c.paused?'PAUSED — nothing opens':'operating',
    d:'Blocks opening only; closing and rescue stay free.',
    ctl:`<div class="row">${onoff('f_p',c.paused)}${act}</div>`,
    ap:d => set('setPaused('+(d.querySelector('#f_p').value==='1')+')',34000,
      ()=>{c.paused = d.querySelector('#f_p').value==='1';})});
  add({t:'Allowed assets', on:c.assets.length>0, empty:!c.assets.length,
    cur:c.assets.length?c.assets.join(' · '):'FENCE EMPTY — nothing opens',
    d:'What the executor may buy. A new list replaces the old one entirely.',
    ctl:`<div class="row">${inp('f_as','WETH,WBTC',c.assets.join(','),140)}${act}</div>`,
    ap:d => { const l = d.querySelector('#f_as').value.split(',').map(x=>x.trim().toUpperCase()).filter(Boolean);
      const bad = l.find(x => !ASSETS[x] || x === v.base);
      if (bad) return toast('Unknown asset or it is the base currency: '+bad,'err');
      set('setAllowedAssets(['+l.join(',')+'])',GAS.fence,()=>{c.assets = l;}); }});
  add({t:'Trading window', on:!(c.tw[0]===0&&c.tw[1]===24), cur:`${c.tw[0]}h → ${c.tw[1]}h`,
    d:'LOCAL hours, [start, end). Start greater than end crosses midnight.',
    ctl:`<div class="row">${inp('f_ws','start',c.tw[0])}${inp('f_we','end',c.tw[1])}${act}</div>`,
    ap:d => set('setTradingWindow(...)',36000,()=>{c.tw=[+d.querySelector('#f_ws').value,+d.querySelector('#f_we').value];})});
  add({t:'Timezone', on:c.tz!==0, cur:`UTC${c.tz>=0?'+':''}${c.tz/3600}`,
    d:'The fence clock. São Paulo is -3.',
    ctl:`<div class="row">${inp('f_tz','h vs UTC',c.tz/3600)}${act}</div>`,
    ap:d => set('setTimezoneOffset(...)',34000,()=>{c.tz=Math.round(+d.querySelector('#f_tz').value*3600);})});
  add({t:'Weekdays', on:c.wm!==0x7F, cur:[...Array(7)].map((_,i)=>(c.wm>>i)&1?WDN[i]:'·').join(' '),
    d:'Which days, in your timezone, may open.',
    ctl:`<div class="row"><div style="flex:2">${[...Array(7)].map((_,i)=>
      `<label class="wd"><input type="checkbox" id="f_wd${i}" ${((c.wm>>i)&1)?'checked':''}>${WDN[i]}</label>`).join('')}</div>${act}</div>`,
    ap:d => { let m=0; for(let i=0;i<7;i++) if (d.querySelector('#f_wd'+i).checked) m|=(1<<i);
      if (!m) return toast('"Never" in disguise is refused — use the pause.','err');
      set('setWeekdayMask(...)',34000,()=>{c.wm=m;}); }});
  add({t:'Max per trade', on:c.mts!==10000, cur:`${c.mts/100}% of idle`, d:'Ceiling on a single opening.',
    ctl:`<div class="row">${inp('f_mts','%',c.mts/100)}${act}</div>`,
    ap:d => set('setMaxTradeSizeBps(...)',34000,()=>{c.mts=Math.round(+d.querySelector('#f_mts').value*100);})});
  add({t:'Min per trade', on:c.mnts!==0, cur:c.mnts===0?'off':`${c.mnts/100}%`, d:'Refuses dust orders. 0 = off.',
    ctl:`<div class="row">${inp('f_mn','% (0 off)',c.mnts/100)}${act}</div>`,
    ap:d => set('setMinTradeSizeBps(...)',34000,()=>{c.mnts=Math.round(+d.querySelector('#f_mn').value*100);})});
  add({t:'Concurrent positions', on:c.mop!==65535, cur:c.mop===65535?'no effective limit':String(c.mop),
    d:'How many may be open at once.',
    ctl:`<div class="row">${inp('f_mo','cap',c.mop)}${act}</div>`,
    ap:d => set('setMaxOpenPositions(...)',34000,()=>{c.mop=+d.querySelector('#f_mo').value;})});
  add({t:'Interval between opens', on:c.msbt!==0, cur:c.msbt===0?'no wait':`${c.msbt}s`,
    d:'Minimum wait between openings.',
    ctl:`<div class="row">${inp('f_ms','seconds',c.msbt)}${act}</div>`,
    ap:d => set('setMinSecondsBetweenTrades(...)',34000,()=>{c.msbt=+d.querySelector('#f_ms').value;})});
  add({t:'Daily open cap', on:c.mdt[0], cur:c.mdt[0]?`${c.mdt[1]} / local day`:'off',
    d:'Counts openings; the day turns in your timezone.',
    ctl:`<div class="row">${onoff('f_mdo',c.mdt[0])}${inp('f_md','cap',c.mdt[1])}${act}</div>`,
    ap:d => set('setMaxDailyTrades(...)',36000,()=>{c.mdt=[d.querySelector('#f_mdo').value==='1',+d.querySelector('#f_md').value];})});
  add({t:'Rest after a loss', on:c.lc[0], cur:c.lc[0]?`${c.lc[1]}s`:'off',
    d:'Closed at a loss → nothing opens for N seconds.',
    ctl:`<div class="row">${onoff('f_lco',c.lc[0])}${inp('f_lc','seconds',c.lc[1])}${act}</div>`,
    ap:d => set('setLossCooldown(...)',36000,()=>{c.lc=[d.querySelector('#f_lco').value==='1',+d.querySelector('#f_lc').value];})});
  add({t:'Daily loss limit', guard:true, on:c.dll[0], cur:c.dll[0]?`${c.dll[1]/100}% of capital / day`:'off',
    d:'EXCEPTION: a close that breaches the limit is REJECTED and reverts.',
    ctl:`<div class="row">${onoff('f_do',c.dll[0])}${inp('f_dl','%',c.dll[1]/100)}${act}</div>`,
    ap:d => set('setDailyLossLimit(...)',36000,()=>{c.dll=[d.querySelector('#f_do').value==='1',Math.round(+d.querySelector('#f_dl').value*100)];})});
  add({t:'Close floor', guard:true, on:c.mcr[0], cur:c.mcr[0]?`return ≥ ${c.mcr[1]/100}% of cost`:'off',
    d:'EXCEPTION: below the floor the close is REJECTED and reverts.',
    ctl:`<div class="row">${onoff('f_mo2',c.mcr[0])}${inp('f_mc','%',c.mcr[1]/100)}${act}</div>`,
    ap:d => set('setMinCloseReturn(...)',36000,()=>{c.mcr=[d.querySelector('#f_mo2').value==='1',Math.round(+d.querySelector('#f_mc').value*100)];})});
  add({t:'Consecutive losses', on:c.mcl[0], cur:c.mcl[0]?`cap ${c.mcl[1]}`:'off',
    d:'At the cap nothing opens until a profit or the day turns.',
    ctl:`<div class="row">${onoff('f_cl',c.mcl[0])}${inp('f_c2','cap',c.mcl[1])}${act}</div>`,
    ap:d => set('setMaxConsecutiveLosses(...)',36000,()=>{c.mcl=[d.querySelector('#f_cl').value==='1',+d.querySelector('#f_c2').value];})});
  add({t:'End-of-window buffer', on:c.nob!==0, cur:c.nob===0?'off':`${c.nob} min`,
    d:'Nothing opens within N minutes of the window closing.',
    ctl:`<div class="row">${inp('f_nb','minutes',c.nob)}${act}</div>`,
    ap:d => set('setNoOpenBuffer(...)',34000,()=>{c.nob=+d.querySelector('#f_nb').value;})});
  add({t:'Max gas price', on:c.mgp!==0, cur:c.mgp===0?'off':`${c.mgp} gwei`,
    d:'Opening above the ceiling reverts.',
    ctl:`<div class="row">${inp('f_gw','gwei',c.mgp)}${act}</div>`,
    ap:d => set('setMaxGasPrice(...)',34000,()=>{c.mgp=+d.querySelector('#f_gw').value;})});

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

/* ── operate ───────────────────────────────────────────────────────── */
let route = [];
function buildRoute(){
  const v = activeV(), n = +$('opHops').value;
  const allowed = v ? v.fence.assets : [];
  const base = v ? v.base : 'USDT';
  route = [base];
  for (let i=0;i<n-1;i++) route.push(allowed.length ? allowed[Math.floor(Math.random()*allowed.length)] : null);
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
    <tr><td class="faint">success fee</td><td>0.15% — on realised profit only</td></tr>`;
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
  d.className='rl '+(k||''); d.innerHTML = icon({ok:'check',err:'x',tx:'arrow'}[k]||'dot')+'<span></span>';
  d.lastElementChild.textContent = msg; l.appendChild(d); l.scrollTop = l.scrollHeight; }

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
  const hops = route.length-1, gas = 0.0021+hops*0.0009;
  const minb = parseFloat($('opMin').value)||8, venue = $('opAgg').value;
  const ok = Math.random() > 0.60;
  const gross = ok ? size*((minb/1e4)+Math.random()*0.0022) : 0;
  const fee = ok ? gross*0.15 : 0, pnl = ok ? gross-fee : 0;

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
    if (ok){ rlog('cycle closed · gross '+fmt(gross,4),'ok');
      rlog('success fee (15% of the profit): '+fmt(fee,4),'dim');
      $('runVerdict').className='verdict ok';
      SFX.ok(); notify(`Cycle closed · +${fmt(pnl,4)} ${v.base}`,'ok');
      $('runVerdict').innerHTML = icon('check')+`<span>CLOSED · +${fmt(pnl,4)} ${esc(v.base)} net · gas ${fmt(gas,5)} POL</span>`;
    } else { rlog('revert: end < start + minProfit — the whole transaction is undone','err');
      rlog('principal returned in full · gas is NOT returned','dim');
      $('runVerdict').className='verdict bad';
      SFX.fail(); notify(`Cycle reverted · gas ${fmt(gas,5)} POL lost`,'err');
      $('runVerdict').innerHTML = icon('alert')+`<span>REVERTED · principal intact · gas lost ${fmt(gas,5)} POL</span>`; }
    $('runClose').disabled = false;
  }
  v.cycles++; v.gas += gas;
  if (ok){ v.idle += pnl; v.net += pnl; v.fee += fee; } else { v.rev++; v.net -= gas*0.9; }
  S.history.push({id:S.seq++, vault:v.name, vid:v.id, route:route.map(x=>x||'—').join('→'),
    venue, size, ok, pnl, fee, gas, asset:route[1]||'—', t:Date.now()});
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
    ['TriviuVault', S.triad.vault], ['TriviuExecutor', S.triad.executor],
    ['TriviuReferralVault', S.triad.referralVault], ['base currency', S.base]
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
    await tx({to:'token '+v.base, fn:'approve(vault, '+a+')', gas:52000, label:'approve'});
    await tx({to:v.addr, fn:'deposit('+a+')', gas:78000, label:'deposit', apply:()=>{ v.idle += a; }});
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
    await tx({to:v.addr, fn:'withdraw('+fmt(a)+')', gas:60000, label:'withdraw', apply:()=>{ v.idle -= a; }});
    $('lqRem').value=''; renderLiquidity(); renderVaults(); renderOver(); save();
    notify(`Liquidity removed · ${fmt(a)} ${v.base}`,'ok');
  }catch(e){ toast(e.message,'err'); }
};
$('btnGtAdd').onclick = async () => {
  const a = parseFloat($('gtAdd').value);
  if (!a || a<=0) return toast('Enter an amount.','err');
  const net = NETS.find(n => n.id === $('lqNet').value) || NETS[0];
  try{
    await tx({to:'GasTank', fn:'deposit() payable · '+a+' '+net.coin, gas:34000, label:'GasTank.deposit',
      apply:()=>{ S.gas[net.id] = (S.gas[net.id]||0) + a; }});
    $('gtAdd').value=''; renderLiquidity(); save(); maybeArm('gas reserve funded');
    notify(`Gas reserve funded · ${fmt(a,5)} ${net.coin}`,'ok');
  }catch(e){ toast(e.message,'err'); }
};
$('btnGtRem').onclick = async () => {
  const net = NETS.find(n => n.id === $('lqNet').value) || NETS[0];
  const bal = S.gas[net.id] || 0;
  const raw = $('gtRem').value.trim();
  const a = raw ? parseFloat(raw) : bal;
  if (!a || a<=0) return toast('The reserve is empty on this network.','err');
  if (a > bal) return toast('More than your reserve holds.','err');
  try{
    await tx({to:'GasTank', fn:'withdraw('+a+')', gas:38000, label:'GasTank.withdraw',
      apply:()=>{ S.gas[net.id] = bal - a; }});
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
  d.innerHTML = icon({ok:'check',err:'x',warn:'alert'}[k] || 'dot') + '<span></span>';
  d.lastElementChild.textContent = new Date().toLocaleTimeString('en-US') + ' — ' + msg;
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
    await tx({to:S.triad?.executor||'0x', fn:'setPaused(true) · all sub-accounts', gas:34000*S.vaults.length,
      label:'setPaused', apply:() => S.vaults.forEach(v => { v.fence.paused = true; })});
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
    await tx({to:S.triad?.vault||'0x', fn:`deposit() × ${p.picked.length}`, gas:52000*p.picked.length,
      label:'deposit', apply:() => p.picked.forEach((v,i) => { v.idle += p.parts[i]/100; })});
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
      <span class="mono">setPaused(true)</span> is what stops the contract, and it stays yours.</p>
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
    'Emergency pause calls setPaused(true) on chain. It blocks opening; closing and rescue stay free. It survives this page being closed. The switch does not.',
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
$('btnClaim').onclick = async () => {
  if (S.refs.claim <= 0) return toast('Nothing to claim — spread only accrues on positive closes.','err');
  const c = S.refs.claim;
  try{ await tx({to:S.triad?.referralVault||rnd(), fn:'claim()', gas:55000, label:'claim()',
    apply:()=>{ S.refs.claim = 0; const v = activeV(); if (v) v.idle += c; }});
    renderRefs(); renderVaults(); renderOver(); save(); toast('Spread claimed.','ok');
  }catch(e){ toast(e.message,'err'); }
};
$('btnSimRefs').onclick = async () => {
  toast('Simulating introduced participants…');
  const n = 2+Math.floor(Math.random()*2);
  for (let i=0;i<n;i++){ S.refs.list.push({addr:rnd(), block:64123400+Math.floor(Math.random()*900)});
    renderRefs(); await wait(reduced()?0:260); }
  let wins=0, losses=0;
  for (let i=0;i<6;i++){ await wait(reduced()?0:220);
    if (Math.random()<0.35){ wins++; const sp=(1+Math.random()*8)*0.1;
      S.refs.claim+=sp; S.refs.earned+=sp; } else losses++;
    renderRefs(); }
  save();
  toast(`${wins} positive closes produced spread; ${losses} negative ones produced nothing — that is how it works.`,'ok');
};

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
  $('chainDot').className = 'chaindot'+(on?'':' off');
  $('chainName').textContent = 'Polygon';
  $('chainId').textContent = on ? '137' : '—';
  $('walletAddr').textContent = on ? short(S.wallet.address) : 'not connected';
}
$('btnWallet').onclick = async () => {
  if (S.wallet.connected){
    $('genTitle').textContent = 'Simulated wallet';
    $('genBody').innerHTML = `<div class="tscroll"><table translate="no"><tbody>
      <tr><td class="faint">address</td><td>${esc(S.wallet.address)}</td></tr>
      <tr><td class="faint">network</td><td>Polygon PoS · chainId 137 (simulated)</td></tr>
      <tr><td class="faint">balance</td><td>${fmt(S.vaults.reduce((a,v)=>a+v.idle+v.inPos,0))} ${esc(S.base)}</td></tr>
      <tr><td class="faint">signer</td><td>simulated — no key is ever read</td></tr>
    </tbody></table></div>`;
    $('genOv').classList.add('show'); SFX.tap();
  } else { await connect(); paintChain(); notify('Wallet connected (simulated).','ok'); }
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
