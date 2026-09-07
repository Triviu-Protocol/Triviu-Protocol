const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
const money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2}).format(Math.abs(value));
const signedMoney=value=>(value<0?'−':value>0?'+':'')+money(value);
const pct=value=>(value<0?'−':'')+Math.abs(value).toFixed(2)+'%';
const titles={home:'Home',community:'Community',wallet:'Wallet',strategies:'Strategies',simulator:'Create strategy',referral:'Referrals',orders:'Lots',settings:'Settings'};
const defaults={capital:1000,edge:.8,poolFee:.9,slippage:.15,gas:2.5,performanceFee:50,minimumProfit:.25,quoteAge:4,maxQuoteAge:12,amountOutMin:1002.5};
let feedTimer=null,feedPaused=false,customizing=false;

function safeGet(key,fallback){try{return localStorage.getItem(key)??fallback}catch(error){return fallback}}
function safeSet(key,value){try{localStorage.setItem(key,value)}catch(error){}}
const environmentMeta={
  demo:{label:'DEMO',title:'Demo always available',summary:'synthetic data, no wallet, no capital',notice:'This interface connects no wallet, requests no signature and sends no transaction.',side:'No custody<br>No signature<br>No real execution'},
  testnet:{label:'TESTNET',title:'Testnet validation',summary:'tokens with no economic value, simulated contracts',notice:'This build demonstrates the Testnet flow locally. No RPC or real wallet is connected.',side:'Valueless tokens<br>Local flow<br>Simulated contracts'},
  real:{label:'CAPITAL REAL',title:'Real capital locked',summary:'awaiting audit, contracts and eligibility',notice:'The production environment is visible so the experience can be reviewed, but it stays locked and moves no assets.',side:'Access locked<br>No transactions<br>Awaiting audit'}
};
let currentEnvironment='demo';
function applyEnvironment(value,announce=false){
  const env=environmentMeta[value]||environmentMeta.demo;currentEnvironment=value in environmentMeta?value:'demo';document.body.dataset.environment=currentEnvironment;
  $$('[data-environment]').forEach(btn=>btn.classList.toggle('active',btn.dataset.environment===currentEnvironment));
  $('#environmentBadge').textContent=env.label;$('#mobileEnvironment').textContent='TRIVIU · '+env.label;$('#environmentTitle').textContent=env.title;$('#environmentSummary').textContent=env.summary;$('#environmentNoticeTitle').textContent=env.label+(currentEnvironment==='demo'?' · SYNTHETIC DATA':'');$('#environmentNoticeCopy').textContent=env.notice;$('#sidebarEnvironment').textContent='READ-ONLY · '+env.label;$('#sidebarEnvironmentCopy').innerHTML=env.side;$('#ledgerEnvironment').textContent=env.label;$('#postEnvironment').textContent=env.label;
  const state=protocolStates[document.body.dataset.protocolState||'ready']||protocolStates.ready;$('#topProtocolStatus').textContent=(currentEnvironment==='real'?'LOCKED':state.top.replace('DEMO',env.label));
  safeSet('triviu-environment',currentEnvironment);renderCommunity();updateShareCard();if(announce)toast(currentEnvironment==='demo'?'Demo enabled — simulator available':currentEnvironment==='testnet'?'Demonstration testnet enabled':'Real capital stays locked in this build');
}
$$('[data-environment]').forEach(btn=>btn.addEventListener('click',()=>applyEnvironment(btn.dataset.environment,true)));
function detectedPlatform(){return /Android/i.test(navigator.userAgent)?'samsung':/iPhone|iPad|iPod/i.test(navigator.userAgent)?'ios':'ios'}
function applyPlatform(value){document.body.dataset.platform=value==='auto'?detectedPlatform():value;safeSet('triviu-platform',value)}
const chainMeta={polygon:{name:'Polygon',code:'POL',color:'#8247e5',explorer:'PolygonScan'},arbitrum:{name:'Arbitrum',code:'ARB',color:'#28a0f0',explorer:'Arbiscan'},bsc:{name:'BNB Smart Chain',code:'BNB',color:'#f3ba2f',explorer:'BscScan'}};
const chainNames=Object.fromEntries(Object.entries(chainMeta).map(([key,value])=>[key,value.name]));
function applyChain(value){const chain=chainMeta[value]||chainMeta.polygon;document.body.dataset.chain=value;document.documentElement.style.setProperty('--chain',chain.color);$$('.chain-sync').forEach(select=>select.value=value);$('#activeChainLabel').textContent=chain.name;$$('.card-chain').forEach(el=>el.textContent=chain.name.toUpperCase());$$('[data-chain-label]').forEach(el=>el.textContent=chain.name);$$('[data-chain-code]').forEach(el=>el.textContent=chain.code);$$('[data-onboard-chain]').forEach(btn=>btn.classList.toggle('active',btn.dataset.onboardChain===value));safeSet('triviu-chain',value);if(typeof updateShareCard==='function')updateShareCard()}

let onboardingStep=0;
function showOnboardingStep(step){onboardingStep=Math.max(0,Math.min(3,step));$$('.onboard-step').forEach(el=>el.classList.toggle('active',Number(el.dataset.step)===onboardingStep));$$('.onboard-progress i').forEach((el,index)=>el.classList.toggle('on',index<=onboardingStep))}
function finishOnboarding(){$('#onboarding').classList.add('done');safeSet('triviu-onboarded','true');navigate('home');toast('Demonstration console unlocked')}
$$('[data-onboard-next]').forEach(btn=>btn.addEventListener('click',()=>showOnboardingStep(onboardingStep+1)));$$('[data-onboard-back]').forEach(btn=>btn.addEventListener('click',()=>showOnboardingStep(onboardingStep-1)));$$('[data-onboard-skip],[data-onboard-finish]').forEach(btn=>btn.addEventListener('click',finishOnboarding));$$('[data-onboard-chain]').forEach(btn=>btn.addEventListener('click',()=>applyChain(btn.dataset.onboardChain)));

function navigate(screen){
  $$('.screen').forEach(el=>el.classList.toggle('active',el.id==='screen-'+screen));
  $$('[data-screen]').forEach(btn=>btn.classList.toggle('active',btn.dataset.screen===screen));
  $('#desktopTitle').textContent=titles[screen]||'TRIVIU';$('#mobileTitle').textContent=titles[screen]||'TRIVIU';
  try{scrollTo({top:0,behavior:'smooth'})}catch(error){scrollTo(0,0)}
}
$$('[data-screen]').forEach(btn=>btn.addEventListener('click',()=>navigate(btn.dataset.screen)));

function applyExperience(value){document.body.dataset.experience=value;$$('[data-experience-mode]').forEach(btn=>btn.classList.toggle('active',btn.dataset.experienceMode===value));$('#experienceSelect').value=value;safeSet('triviu-experience',value);if(value==='essential'&&customizing)setCustomize(false)}
$$('[data-experience-mode]').forEach(btn=>btn.addEventListener('click',()=>applyExperience(btn.dataset.experienceMode)));$('#experienceSelect').addEventListener('change',event=>applyExperience(event.target.value));
const protocolStates={
  ready:{title:'Console ready',copy:'Demo vault synced with synthetic data.',chip:'READY · DEMO',tone:'acc',top:'READY · DEMO'},
  disconnected:{title:'Wallet disconnected',copy:'Connect an eligible wallet to read the vault identity.',chip:'DISCONNECTED',tone:'',top:'DISCONNECTED'},
  'no-vault':{title:'Vault not created',copy:'This wallet has no vault on this network.',chip:'NO VAULT',tone:'',top:'NO VAULT'},
  empty:{title:'No strategies',copy:'The vault exists but has no saved strategies yet.',chip:'EMPTY',tone:'',top:'NO STRATEGIES'},
  loading:{title:'Reading the chain',copy:'Reading blocks, events and contracts on the selected network.',chip:'SYNCING',tone:'amber',top:'SYNCING'},
  'wrong-network':{title:'Wrong network',copy:'The wallet is on a different network from the one selected here.',chip:'WRONG NETWORK',tone:'red',top:'WRONG NETWORK'},
  pending:{title:'Transaction pending',copy:'The interface would wait for confirmations before updating state.',chip:'PENDING',tone:'amber',top:'PENDING'},
  confirmed:{title:'Transaction confirmed',copy:'The illustrative event reached the minimum confirmations.',chip:'CONFIRMED · DEMO',tone:'acc',top:'CONFIRMED · DEMO'},
  rejected:{title:'Transaction rejected',copy:'The request was refused and no change was applied.',chip:'REJECTED',tone:'red',top:'REJECTED'},
  rpc:{title:'RPC unavailable',copy:'The network could not be read; previous data is preserved.',chip:'RPC OFFLINE',tone:'red',top:'RPC OFFLINE'},
  stale:{title:'Stale data',copy:'The last update passed the limit set by the console.',chip:'STALE DATA',tone:'amber',top:'STALE DATA'}
};
function applyProtocolState(value){const state=protocolStates[value]||protocolStates.ready,env=environmentMeta[currentEnvironment]||environmentMeta.demo;document.body.dataset.protocolState=value;$('#protocolStateBanner').dataset.state=value;$('#protocolStateTitle').textContent=currentEnvironment==='real'?'Real capital locked':state.title;$('#protocolStateCopy').textContent=currentEnvironment==='real'?env.notice:state.copy;$('#protocolStateSelect').value=value;$('#statePreviewTitle').textContent=state.title;$('#statePreviewCopy').textContent=state.copy;$('#statePreviewChip').textContent=state.chip.replace('DEMO',env.label);$('#statePreviewChip').className='chip '+state.tone;$('#topProtocolStatus').textContent=currentEnvironment==='real'?'LOCKED':state.top.replace('DEMO',env.label);$('#homeVaultState').textContent=currentEnvironment==='real'?'LOCKED':value==='ready'?'ESTIMATED':state.chip;$('#homeVaultState').className='chip '+(currentEnvironment==='real'?'amber':value==='ready'?'acc':state.tone);safeSet('triviu-protocol-state',value)}
$('#protocolStateSelect').addEventListener('change',event=>applyProtocolState(event.target.value));$('#protocolStateAction').addEventListener('click',()=>{const value=$('#protocolStateBanner').dataset.state,state=protocolStates[value];openSheet(`<h3>${state.title}</h3><p>${state.copy}</p><div class="kv"><span>Source</span><b>STATE LAB · LOCAL</b></div><div class="kv"><span>Execution</span><b>DISABLED</b></div><button class="btn primary s-8c97caa1" data-act="close|nav:settings">Open the lab</button>`)});
function setAccessibility(type,on){const map={contrast:['contrastSwitch','data-contrast','triviu-contrast'],text:['textSizeSwitch','data-text','triviu-text-size']},[id,attribute,key]=map[type];document.body.toggleAttribute(attribute,on);$('#'+id).classList.toggle('on',on);$('#'+id).setAttribute('aria-pressed',String(on));safeSet(key,String(on))}
$('#contrastSwitch').addEventListener('click',()=>setAccessibility('contrast',!document.body.hasAttribute('data-contrast')));$('#textSizeSwitch').addEventListener('click',()=>setAccessibility('text',!document.body.hasAttribute('data-text')));

function toast(message){const el=document.createElement('div');el.className='toast';el.textContent=message;$('#toastStack').appendChild(el);setTimeout(()=>el.remove(),3100)}
function openSheet(html){$('#sheetBody').innerHTML=html;$('#veil').classList.add('open');$('#sheet').classList.add('open')}
function closeSheet(){$('#veil').classList.remove('open');$('#sheet').classList.remove('open')}
$('#veil').addEventListener('click',closeSheet);document.addEventListener('keydown',event=>{if(event.key==='Escape')closeSheet()});

const escapeHTML=value=>String(value).replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
function readJSON(key,fallback){try{const value=JSON.parse(safeGet(key,'null'));return value??fallback}catch(error){return fallback}}
const communityCreators=[
  {id:'maya',initials:'MN',name:'Maya Node',handle:'@mayanode',detail:'Guarded mandates',following:true},
  {id:'atlas',initials:'AT',name:'Atlas Route',handle:'@atlasroute',detail:'Routes and evidence',following:true},
  {id:'lumen',initials:'LU',name:'Lumen Labs',handle:'@lumenlabs',detail:'Stable strategies',following:false}
];
const seedStrategies=[
  {id:'tri-guard-v12',name:'Triangular Guarded v1.2',author:'Maya Node',handle:'@mayanode',environment:'demo',result:'+4.84%',drawdown:'−1.18%',age:'42 dias',followers:128,share:20,scope:'3 hops · 8 guards · Polygon'},
  {id:'stable-route-v08',name:'Stable Route v0.8',author:'Atlas Route',handle:'@atlasroute',environment:'demo',result:'+2.16%',drawdown:'−0.46%',age:'68 dias',followers:84,share:10,scope:'Stablecoins · quote age · Arbitrum'},
  {id:'balanced-density-v03',name:'Balanced Density v0.3',author:'Lumen Labs',handle:'@lumenlabs',environment:'testnet',result:'+1.42%',drawdown:'−0.72%',age:'19 dias',followers:31,share:15,scope:'Densidade 35% · BNB Chain'}
];
const seedPosts=[
  {id:'seed-1',author:'Maya Node',handle:'@mayanode',initials:'MN',kind:'strategy',environment:'demo',time:'18 min ago',text:'Published version 1.2 of Triangular Guarded. The change lowers the maximum density and records the cost of each route before the decision.',likes:24,liked:false,comments:[{author:'Atlas Route',text:'Good change. The previous version history stays comparable.'}],proof:{label:'VERSION',value:'1.2',meta:'HASH 0xA9…31'}},
  {id:'seed-2',author:'Atlas Route',handle:'@atlasroute',initials:'AT',kind:'risk',environment:'demo',time:'47 min ago',text:'Risk record: a result without drawdown, gas and reverted operations should not enter the ranking as complete evidence.',likes:39,liked:true,comments:[],proof:{label:'RISCO',value:'MDD −0.46%',meta:'DEMO · SYNTHETIC'}},
  {id:'seed-3',author:'TRIVIU Protocol',handle:'@triviu',initials:'TV',kind:'analysis',environment:'testnet',time:'2 h ago',text:'The Testnet environment stays separate from Demo. Metrics, posts and strategies are never promoted automatically between environments.',likes:61,liked:false,comments:[],proof:{label:'AMBIENTE',value:'TESTNET',meta:'READ-ONLY · V5.4'}}
];
let communityFilter='all';
let communityPosts=readJSON('triviu-community-posts',seedPosts);
let followedCreators=new Set(readJSON('triviu-followed-creators',communityCreators.filter(item=>item.following).map(item=>item.id)));
let watchedStrategies=new Set(readJSON('triviu-watched-strategies',['tri-guard-v12']));
let userStrategies=readJSON('triviu-community-strategies',[]);
function persistCommunity(){safeSet('triviu-community-posts',JSON.stringify(communityPosts));safeSet('triviu-followed-creators',JSON.stringify([...followedCreators]));safeSet('triviu-watched-strategies',JSON.stringify([...watchedStrategies]));safeSet('triviu-community-strategies',JSON.stringify(userStrategies))}
function creatorIdByHandle(handle){const creator=communityCreators.find(item=>item.handle===handle);return creator?.id}
function renderCreators(){
  $('#creatorList').innerHTML=communityCreators.map(item=>`<div class="creator-row"><div class="profile-avatar">${item.initials}</div><div class="creator-meta"><b>${escapeHTML(item.name)} <span class="verified">◆</span></b><span>${escapeHTML(item.handle)} · ${escapeHTML(item.detail)}</span></div><button class="btn follow-btn ${followedCreators.has(item.id)?'following':''}" data-follow="${item.id}">${followedCreators.has(item.id)?'Following':'Follow'}</button></div>`).join('');
  $$('[data-follow]',$('#creatorList')).forEach(btn=>btn.addEventListener('click',()=>{const id=btn.dataset.follow;followedCreators.has(id)?followedCreators.delete(id):followedCreators.add(id);persistCommunity();renderCommunity();toast(followedCreators.has(id)?'Author added to your feed':'Author removed from your feed')}));
}
function renderCommunityStrategies(){
  const strategies=[...userStrategies,...seedStrategies].filter(item=>item.environment===currentEnvironment);
  $('#communityStrategies').innerHTML=strategies.length?strategies.map(item=>`<article class="community-strategy"><div class="strategy-author"><span>${escapeHTML(item.handle)} · ${item.environment.toUpperCase()}</span><span class="chip">v${escapeHTML(String(item.version||item.name.match(/v([\d.]+)/)?.[1]||'1.0'))}</span></div><h3>${escapeHTML(item.name)}</h3><p>${escapeHTML(item.scope)}</p><div class="strategy-score"><div><span>Net result*</span><b>${escapeHTML(item.result)}</b></div><div><span>Drawdown</span><b>${escapeHTML(item.drawdown)}</b></div><div><span>Author share</span><b>${item.share}%</b></div></div><div class="strategy-actions"><button class="btn ${watchedStrategies.has(item.id)?'watching':''}" data-watch-strategy="${item.id}">${watchedStrategies.has(item.id)?'Acompanhando':'Acompanhar'}</button><button class="btn primary" data-analyze-strategy="${item.id}">Analisar</button></div><div class="widget-sub s-fe3c94c1">${item.followers||0} acompanhando · ${escapeHTML(item.age)} · *dados ${item.environment==='demo'?'synthetic':'de teste'}</div></article>`).join(''):`<article class="panel"><div class="widget-title">No strategy in this environment</div><div class="widget-sub">Demo, Testnet and Real capital keep independent catalogues.</div></article>`;
  $$('[data-watch-strategy]').forEach(btn=>btn.addEventListener('click',()=>{const id=btn.dataset.watchStrategy;watchedStrategies.has(id)?watchedStrategies.delete(id):watchedStrategies.add(id);persistCommunity();renderCommunityStrategies();updateCommunityCounters();toast(watchedStrategies.has(id)?'Strategy added to your watchlist':'Strategy removed from your watchlist')}));
  $$('[data-analyze-strategy]').forEach(btn=>btn.addEventListener('click',()=>{const item=[...userStrategies,...seedStrategies].find(strategy=>strategy.id===btn.dataset.analyzeStrategy);if(!item)return;openSheet(`<h3>${escapeHTML(item.name)}</h3><p>${escapeHTML(item.scope)}. Watching this strategy is read-only and activates no operation.</p><div class="kv"><span>Author</span><b>${escapeHTML(item.handle)}</b></div><div class="kv"><span>Environment</span><b>${item.environment.toUpperCase()}</b></div><div class="kv"><span>Author share</span><b>${item.share}% OF THE USER SHARE</b></div><div class="kv"><span>Version</span><b>IMMUTABLE · DEMO</b></div><button class="btn primary s-8c97caa1" data-act="close|nav:simulator">Simulate parameters</button>`)}));
}
function postVisible(post){if(post.environment!==currentEnvironment)return false;if(communityFilter==='risk')return post.kind==='risk';if(communityFilter==='following'){const id=creatorIdByHandle(post.handle);return post.handle==='@triviu-user'||(id&&followedCreators.has(id))}return true}
function renderPosts(){
  const posts=communityPosts.filter(postVisible);
  $('#communityFeed').innerHTML=posts.length?posts.map(post=>`<article class="post-card" data-post="${post.id}"><div class="post-head"><div class="profile-avatar">${escapeHTML(post.initials)}</div><div class="post-author"><b>${escapeHTML(post.author)} ${post.handle==='@triviu'?'<span class="verified">◆</span>':''}</b><span>${escapeHTML(post.handle)} · ${escapeHTML(post.time)} · ${post.environment.toUpperCase()}</span></div><span class="chip">${escapeHTML(post.kind.toUpperCase())}</span></div><div class="post-body">${escapeHTML(post.text)}</div>${post.proof?`<div class="post-proof"><div><span>${escapeHTML(post.proof.label)}</span><b>${escapeHTML(post.proof.value)}</b></div><div><span>ORIGEM</span><b>${post.environment.toUpperCase()}</b></div><div><span>EVIDENCE</span><b>${escapeHTML(post.proof.meta)}</b></div></div>`:''}<div class="post-actions"><button class="${post.liked?'active':''}" data-like>♡ ${post.likes}</button><button data-comment>Comment · ${post.comments.length}</button><button data-share-post>Share</button><button class="post-menu" data-report>Report</button></div><div class="comment-box"><div class="comment-entry"><input maxlength="180" placeholder="Reply with respect…" aria-label="Write a comment"><button class="btn primary" data-send-comment>Send</button></div><div class="comment-list">${post.comments.map(comment=>`<div class="comment"><b>${escapeHTML(comment.author)}</b> ${escapeHTML(comment.text)}</div>`).join('')}</div></div></article>`).join(''):`<article class="panel"><div class="widget-title">The feed is empty</div><div class="widget-sub">Publish the first content in this environment, or change the filter.</div></article>`;
  $$('.post-card').forEach(card=>{const post=communityPosts.find(item=>item.id===card.dataset.post);$('[data-like]',card).addEventListener('click',()=>{post.liked=!post.liked;post.likes+=post.liked?1:-1;persistCommunity();renderPosts()});$('[data-comment]',card).addEventListener('click',()=>$('.comment-box',card).classList.toggle('open'));$('[data-send-comment]',card).addEventListener('click',()=>{const input=$('.comment-entry input',card),value=input.value.trim();if(!value)return toast('Write a comment');post.comments.push({author:'You',text:value});persistCommunity();renderPosts();toast('Comment published locally')});$('.comment-entry input',card).addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();$('[data-send-comment]',card).click()}});$('[data-share-post]',card).addEventListener('click',async()=>{const text=`${post.author} no TRIVIU Commons: ${post.text} · ${post.environment.toUpperCase()}`;try{if(navigator.share)await navigator.share({title:'TRIVIU Commons',text});else await copyValue(text,'Post copied')}catch(error){if(error.name!=='AbortError')toast('Sharing cancelled')}});$('[data-report]',card).addEventListener('click',()=>openSheet(`<h3>Report this post?</h3><p>A report in this demonstration stays in this browser only. In production it would go to a moderation queue.</p><button class="btn primary s-8c97caa1" data-act="close|toast:Demonstration report filed">File report</button>`))});
}
function updateCommunityCounters(){$('#followingCount').textContent=followedCreators.size;$('#watchingCount').textContent=watchedStrategies.size;$('#myPostCount').textContent=communityPosts.filter(post=>post.handle==='@triviu-user').length}
function renderCommunity(){if(!$('#communityFeed'))return;renderCreators();renderCommunityStrategies();renderPosts();updateCommunityCounters();$('#postEnvironment').textContent=(environmentMeta[currentEnvironment]||environmentMeta.demo).label}
$('#postText').addEventListener('input',event=>$('#postCount').textContent=event.target.value.length+'/420');
$('#focusComposer').addEventListener('click',()=>{$('#postText').focus();$('#communityComposer').scrollIntoView({behavior:'smooth',block:'center'})});
$('#publishPost').addEventListener('click',()=>{const input=$('#postText'),text=input.value.trim();if(!text)return toast('Write something before publishing');if(currentEnvironment==='real')return toast('Real-capital posts are blocked in this version');communityPosts.unshift({id:'post-'+Date.now(),author:'You',handle:'@triviu-user',initials:'TG',kind:$('#postKind').value,environment:currentEnvironment,time:'now',text,likes:0,liked:false,comments:[],proof:$('#postKind').value==='result'?{label:'RESULT',value:'DEMO',meta:'NO ON-CHAIN PROOF'}:null});input.value='';$('#postCount').textContent='0/420';persistCommunity();renderCommunity();toast('Post added to the Commons')});
$$('[data-community-filter]').forEach(btn=>btn.addEventListener('click',()=>{communityFilter=btn.dataset.communityFilter;$$('[data-community-filter]').forEach(item=>item.classList.toggle('active',item===btn));$('[data-community-section="feed"]').style.display=communityFilter==='strategies'?'none':'';$('#communityComposer').style.display=communityFilter==='strategies'?'none':'';$('[data-community-section="strategies"]').style.display=communityFilter==='risk'||communityFilter==='following'?'none':'';renderPosts()}));

$$('[data-evidence]').forEach(btn=>btn.addEventListener('click',()=>openSheet(`<h3>Evidence · ${btn.dataset.evidence}</h3><p>Illustrative record showing how the interface organises the decision. It carries no pool quote, signature or real transaction.</p><div class="kv"><span>Source</span><b>LOCAL · SYNTHETIC</b></div><div class="kv"><span>Execution</span><b>DISABLED</b></div><div class="kv"><span>Custody</span><b>NONE</b></div><div class="kv"><span>Rule</span><b>ALL GATES MUST PASS</b></div><button class="btn primary s-8c97caa1" data-act="close">Close</button>`)));
$$('[data-strategy]').forEach(btn=>btn.addEventListener('click',()=>openSheet(`<h3>${btn.dataset.strategy}</h3><p>Illustrative mandate for a vault strategy. The strategy proposes routes read-only and moves no assets.</p><div class="kv"><span>Chain scope</span><b>POLYGON · ARBITRUM · BNB</b></div><div class="kv"><span>Guards</span><b>8 MAX</b></div><div class="kv"><span>Execution</span><b>DISABLED</b></div><div class="kv"><span>Contract</span><b>NOT CONNECTED</b></div><button class="btn primary s-8c97caa1" data-act="close|nav:simulator">Use as a base</button>`)));
$$('[data-order]').forEach(btn=>btn.addEventListener('click',()=>openSheet(`<h3>${btn.dataset.order}</h3><p>Illustrative preview of the lot. A real implementation must validate contract, network, price, balance, mandate and eligibility before allowing a purchase.</p><div class="kv"><span>Contrato</span><b>DEMO ONLY</b></div><div class="kv"><span>Compatibility</span><b>PENDING</b></div><div class="kv"><span>Settlement</span><b>DISABLED</b></div><button class="btn s-8c97caa1" disabled>Purchase unavailable</button><button class="btn primary s-b0e04d5f" data-act="close">Close analysis</button>`)));

function referralRules(){return `<h3>How does the referral node work?</h3><p>The example fees are associated with the node and split by the model below. No published contract implements this layer today, and this build calls no contract and moves no assets.</p><div class="kv"><span>Level 1 · you</span><b>25%</b></div><div class="kv"><span>Level 2 · sponsor</span><b>15%</b></div><div class="kv"><span>Level 3 · next level</span><b>10%</b></div><div class="kv"><span>Protocol treasury</span><b>RESTANTE</b></div><div class="safety-note s-269633e5"><div><b>REGRA DEMONSTRATIVA</b> · Percentages and eligibility must be read from a published, audited contract.</div></div><button class="btn primary s-8c97caa1" data-act="close">Got it</button>`}
$('#referralDetails').addEventListener('click',()=>openSheet(referralRules()));
$('#viewReferralHistory').addEventListener('click',()=>openSheet(`<h3>Node history</h3><p>Synthetic events arranged to demonstrate traceability.</p><div class="kv"><span>Today · distribution</span><b>$18.20</b></div><div class="kv"><span>Yesterday · distribution</span><b>$42.60</b></div><div class="kv"><span>02 Sep · distribution</span><b>$27.19</b></div><div class="kv"><span>Source</span><b>LOCAL · DEMO</b></div><button class="btn primary s-8c97caa1" data-act="close">Close</button>`));
function simulateReferralSettlement(){safeSet('triviu-referral-settled','true');$('#pendingReferral').textContent='$0.00';openSheet(`<h3>Simulated distribution</h3><p>The local scenario split the amount across the node levels. No wallet, signature or transaction was used.</p><div class="kv"><span>Scenario value</span><b>$87.99</b></div><div class="kv"><span>Your level</span><b>$22.00</b></div><div class="kv"><span>State</span><b>DEMO COMPLETE</b></div><button class="btn primary s-8c97caa1" data-act="close">Done</button>`);toast('Illustrative distribution complete')}
$('#settleReferral').addEventListener('click',()=>openSheet(`<h3>Settle pending amount?</h3><p>This action only simulates the distribution function inside this HTML. No contract is called.</p><div class="kv"><span>Aguardando</span><b>$87.99</b></div><div class="kv"><span>Network</span><b>${chainNames[safeGet('triviu-chain','polygon')]}</b></div><button class="btn primary s-8c97caa1" data-act="settle">Simulate distribution</button><button class="btn s-b0e04d5f" data-act="close">Cancel</button>`));

async function copyValue(value,message){try{await navigator.clipboard.writeText(value);toast(message)}catch(error){toast('Could not copy in this browser')}}
$('#copyReferralCode').addEventListener('click',()=>copyValue($('#referralCode').textContent,'Demonstration link copied'));
$('#shareInvite').addEventListener('click',async()=>{const text='Discover the TRIVIU protocol: '+$('#referralCode').textContent+' · Connected strategies. Autonomy in motion.';try{if(navigator.share)await navigator.share({title:'TRIVIU',text});else await copyValue(text,'Invite copied for sharing')}catch(error){if(error.name!=='AbortError')toast('Sharing cancelled')}});

const shareResults={
  strategy:{label:'STRATEGY RESULT',value:'+4.84%',amount:'+$128.41'},
  node:{label:'NODE RESULT',value:'+25.00%',amount:'+$310.00'},
  vault:{label:'VAULT RESULT',value:'+1.06%',amount:'+$128.41'}
};
let shareCodeVisible=false;
function shareConfig(){const result=shareResults[$('#shareType').value],chain=chainMeta[safeGet('triviu-chain','polygon')]||chainMeta.polygon,display=$('#shareDisplay').value,environment=environmentMeta[currentEnvironment]||environmentMeta.demo;return {...result,period:$('#sharePeriod').value,format:$('#shareFormat').value,theme:$('#shareTheme').value,display,primary:display==='amount'?result.amount:result.value,secondary:display==='both'?result.amount:'',codeVisible:shareCodeVisible,chain,environment}}
function updateShareCard(){const config=shareConfig(),card=$('#shareCard');$('#shareCardLabel').textContent=config.label;$('#shareCardValue').textContent=config.primary;$('#shareCardAmount').textContent=config.secondary;$('#shareCardPeriod').textContent=config.period;$('#shareCardChain').textContent=config.chain.name.toUpperCase();$('#shareCardEnvironment').textContent=config.environment.label;$('#shareCardDisclaimer').textContent=currentEnvironment==='demo'?'Synthetic data. Past results do not guarantee future results.':currentEnvironment==='testnet'?'Tokens with no economic value. Test results do not guarantee future results.':'Real capital unavailable in this demonstration build.';card.dataset.format=config.format;card.dataset.theme=config.theme;card.dataset.display=config.display;card.classList.toggle('hide-amount',config.display!=='both');card.classList.toggle('show-code',config.codeVisible)}
function toggleShareCode(button){shareCodeVisible=!shareCodeVisible;button.classList.toggle('on',shareCodeVisible);button.setAttribute('aria-pressed',String(shareCodeVisible));updateShareCard()}
$('#shareCodeSwitch').addEventListener('click',event=>toggleShareCode(event.currentTarget));$$('#shareType,#sharePeriod,#shareFormat,#shareTheme,#shareDisplay').forEach(el=>el.addEventListener('change',updateShareCard));
$('#openShareStudio').addEventListener('click',()=>$('#shareStudio').scrollIntoView({behavior:'smooth',block:'start'}));
function shareCaption(){const c=shareConfig(),metric=c.display==='both'?`${c.value} (${c.amount})`:c.primary;return `TRIVIU · ${c.label}: ${metric} · ${c.period} · ${c.chain.name} · ${c.environment.label}. ${currentEnvironment==='demo'?'Synthetic data':currentEnvironment==='testnet'?'Tokens with no economic value':'Real capital unavailable'}; past results do not guarantee future results.${c.codeVisible?' Code: TVU-8F3C':''}`}
function roundedRect(ctx,x,y,width,height,radius){const r=Math.min(radius,width/2,height/2);ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+width,y,x+width,y+height,r);ctx.arcTo(x+width,y+height,x,y+height,r);ctx.arcTo(x,y+height,x,y,r);ctx.arcTo(x,y,x+width,y,r);ctx.closePath()}
function drawShareTriangle(ctx,x,y,size,color){ctx.save();ctx.translate(x,y);ctx.strokeStyle=color;ctx.lineWidth=Math.max(6,size*.035);ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();const S=size/320,H=296/320;ctx.moveTo(75*S,168*S);ctx.lineTo(160*S,20*S);ctx.lineTo(245*S,168*S);ctx.lineTo(104*S,168*S);ctx.stroke();ctx.fillStyle=color;[[75,168,9],[160,20,9],[245,168,9],[104,168,4.5]].forEach(([px,py,r])=>{ctx.beginPath();ctx.arc(px*S,py*S,r*S,0,Math.PI*2);ctx.fill()});ctx.restore()}
function renderShareCanvas(){const config=shareConfig(),sizes={feed:[1080,1350],story:[1080,1920],square:[1080,1080]},[width,height]=sizes[config.format],canvas=$('#shareCanvas'),ctx=canvas.getContext('2d'),uiAccent=getComputedStyle(document.documentElement).getPropertyValue('--acc').trim()||'#6E8AFF',minimal=config.theme==='minimal',accent=minimal?'#111111':uiAccent,text=minimal?'#111111':'#ECEDEAfff',muted=minimal?'#5f5f5f':'#9a9a9a';canvas.width=width;canvas.height=height;const bg=ctx.createLinearGradient(0,0,width,height);if(minimal){bg.addColorStop(0,'#f7f7f2');bg.addColorStop(1,'#e9e9e2')}else if(config.theme==='accent'){bg.addColorStop(0,uiAccent);bg.addColorStop(.46,'#111111');bg.addColorStop(1,'#030303')}else{bg.addColorStop(0,'#202020');bg.addColorStop(.48,'#131519');bg.addColorStop(1,'#030303')}ctx.fillStyle=bg;ctx.fillRect(0,0,width,height);ctx.strokeStyle=accent+'55';ctx.lineWidth=3;ctx.beginPath();ctx.arc(width*.98,height*.18,width*.36,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.arc(width*.92,height*.94,width*.5,0,Math.PI*2);ctx.stroke();const pad=82;ctx.fillStyle=text;ctx.font='800 42px system-ui';ctx.fillText('TRIVIU',pad,105);ctx.fillStyle=muted;ctx.font='700 22px ui-monospace,monospace';ctx.fillText('PROTOCOL CONSOLE',pad,143);ctx.save();ctx.textAlign='right';ctx.fillStyle=currentEnvironment==='demo'?'#ffc866':'#A8AEB7';ctx.font='800 26px "IBM Plex Mono",ui-monospace,monospace';ctx.fillText(currentEnvironment==='demo'?'SYNTHETIC SCENARIO · NOT A REAL RESULT':currentEnvironment==='testnet'?'TESTNET · NO ECONOMIC VALUE':'CAPITAL REAL LOCKED',width-pad,143);ctx.restore();drawShareTriangle(ctx,width-250,58,150,accent);const centerY=height*.49;ctx.fillStyle=muted;ctx.font='700 25px ui-monospace,monospace';ctx.fillText(config.label,pad,centerY-110);ctx.fillStyle=accent;ctx.font=`900 ${config.format==='story'?150:130}px ui-monospace,monospace`;ctx.fillText(config.primary,pad,centerY+30);if(config.secondary){ctx.fillStyle=text;ctx.font='750 38px ui-monospace,monospace';ctx.fillText(config.secondary,pad,centerY+92)}ctx.strokeStyle=minimal?'#ccccca':'#333333';ctx.beginPath();ctx.moveTo(pad,height-235);ctx.lineTo(width-pad,height-235);ctx.stroke();ctx.fillStyle=muted;ctx.font='650 25px system-ui';ctx.fillText(config.period,pad,height-183);ctx.textAlign='right';ctx.fillText(config.chain.name.toUpperCase()+' · '+config.environment.label,width-pad,height-183);ctx.textAlign='left';ctx.font='700 20px ui-monospace,monospace';ctx.fillText('PROOF · AWAITING INDEXER',pad,height-139);ctx.font='500 22px system-ui';ctx.fillText('Connected strategies. Autonomy in motion.',pad,height-94,700);ctx.fillText(currentEnvironment==='demo'?'Synthetic data. Past results do not guarantee future results.':currentEnvironment==='testnet'?'Tokens with no economic value. Test results do not guarantee future results.':'Real capital unavailable in this build.',pad,height-57);if(config.codeVisible){ctx.fillStyle=accent;ctx.textAlign='right';ctx.font='700 23px ui-monospace,monospace';ctx.fillText('TVU-8F3C',width-pad,height-94);ctx.textAlign='left'}return canvas}
function shareBlob(){return new Promise(resolve=>renderShareCanvas().toBlob(resolve,'image/png',1))}
$('#copyShareText').addEventListener('click',()=>copyValue(shareCaption(),'Caption copied'));
$('#downloadShareCard').addEventListener('click',async()=>{const blob=await shareBlob();if(!blob)return toast('Could not generate the PNG');const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='triviu-resultado-'+shareConfig().format+'.png';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('PNG card generated at high resolution')});
$('#shareResult').addEventListener('click',async()=>{const blob=await shareBlob(),text=shareCaption();try{if(navigator.share&&blob){const file=new File([blob],'triviu-resultado.png',{type:'image/png'});if(!navigator.canShare||navigator.canShare({files:[file]})){await navigator.share({title:'My TRIVIU result',text,files:[file]});return}}if(navigator.share){await navigator.share({title:'My TRIVIU result',text});return}await copyValue(text,'Caption copied; save the PNG to post')}catch(error){if(error.name!=='AbortError')toast('Your browser did not finish sharing')}});

function setPrivacy(on){document.body.classList.toggle('privacy',on);$$('.privacy-toggle').forEach(btn=>btn.setAttribute('aria-pressed',String(on)));$('#privacySwitch').classList.toggle('on',on);$('#privacySwitch').setAttribute('aria-pressed',String(on));safeSet('triviu-privacy',String(on))}
$$('.privacy-toggle').forEach(btn=>btn.addEventListener('click',()=>setPrivacy(!document.body.classList.contains('privacy'))));$('#privacySwitch').addEventListener('click',()=>setPrivacy(!document.body.classList.contains('privacy')));


/* A11Y-02 · escolha da tinta por contraste medido, nao por limiar de luminancia.
   O limiar antigo (>.32 -> preto) deixava branco em ~2.8:1 numa faixa inteira de
   acentos — inclusive no proprio Ultramar da marca. */
function contrastRatio(a,b){const L=h=>{const c=h.replace('#','');const v=[0,2,4].map(i=>parseInt(c.slice(i,i+2),16)/255)
  .map(x=>x<=.03928?x/12.92:Math.pow((x+.055)/1.055,2.4));return .2126*v[0]+.7152*v[1]+.0722*v[2]};
  const la=L(a),lb=L(b);return (Math.max(la,lb)+.05)/(Math.min(la,lb)+.05)}
function contrastPick(bg){const ink='#131519',white='#FFFFFF';
  return contrastRatio(ink,bg)>=contrastRatio(white,bg)?ink:white}
function luminance(hex){const c=hex.replace('#','');const channels=[0,2,4].map(i=>parseInt(c.slice(i,i+2),16)/255).map(v=>v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4));return .2126*channels[0]+.7152*channels[1]+.0722*channels[2]}
const accents=['#6E8AFF','#37e6c3','#6E8AFF','#c79bff','#ff8a5c','#ff6fb2','#f5d90a','#4ade80','#67e8f9','#fda4af','#e2e8f0','#ffb020'];
function applyAccent(color){document.documentElement.style.setProperty('--acc',color);document.documentElement.style.setProperty('--acc-ink',contrastPick(color));$('#colorPicker').value=color;$$('.swatch').forEach(el=>el.classList.toggle('active',el.dataset.color.toLowerCase()===color.toLowerCase()));safeSet('triviu-accent',color)}
function renderSwatches(){$('#swatches').innerHTML=accents.map(color=>`<button class="swatch s-a311ec3a" data-color="${color}" aria-label="Use colour ${color}"></button>`).join('');$$('.swatch').forEach(btn=>btn.addEventListener('click',()=>applyAccent(btn.dataset.color)))}
$('#colorPicker').addEventListener('input',event=>applyAccent(event.target.value));
$$('.chain-sync').forEach(select=>select.addEventListener('change',event=>applyChain(event.target.value)));
$$('[data-card-style]').forEach(btn=>btn.addEventListener('click',()=>{$('#premiumCard').dataset.card=btn.dataset.cardStyle;$$('[data-card-style]').forEach(el=>el.classList.toggle('active',el===btn));safeSet('triviu-card-style',btn.dataset.cardStyle)}));

function inputNumber(id){return Number($('#'+id).value)}
function updateSimulator(){
  const capital=inputNumber('capital'),edge=inputNumber('edge'),poolFee=inputNumber('poolFee'),slippage=inputNumber('slippage'),gas=inputNumber('gas'),minimumProfit=inputNumber('minimumProfit'),quoteAge=inputNumber('quoteAge'),maxQuoteAge=inputNumber('maxQuoteAge'),amountOutMin=inputNumber('amountOutMin');
  const visibility=$('#strategyVisibility').value,authorShare=visibility==='community'?inputNumber('authorShare'):0,performanceFee=50;
  const gross=capital*edge/100,poolCost=capital*poolFee/100,slippageCost=capital*slippage/100,eligible=gross-poolCost-slippageCost-gas,performanceCost=Math.max(0,eligible)*performanceFee/100,userShare=eligible-performanceCost,authorCost=Math.max(0,userShare)*authorShare/100,net=userShare-authorCost,roi=capital?net/capital*100:0,minimum=capital*minimumProfit/100,amountOut=capital*(1+edge/100);
  const netGate=net>=minimum,outGate=amountOut>=amountOutMin,ageGate=quoteAge<=maxQuoteAge,pass=netGate&&outGate&&ageGate;
  $('#capitalOut').textContent='$'+capital.toLocaleString('en-US');$('#edgeOut').textContent=edge.toFixed(2)+'%';$('#poolFeeOut').textContent=poolFee.toFixed(2)+'%';$('#slippageOut').textContent=slippage.toFixed(2)+'%';$('#gasOut').textContent=money(gas);$('#performanceFeeOut').textContent='50%';$('#authorShareOut').textContent=authorShare.toFixed(0)+'%';$('#minimumProfitOut').textContent=minimumProfit.toFixed(2)+'%';$('#quoteAgeOut').textContent=quoteAge+'s';$('#maxQuoteAgeOut').textContent=maxQuoteAge+'s';$('#amountOutMinOut').textContent=amountOutMin.toFixed(2);
  $('#grossResult').textContent=money(gross);$('#poolCost').textContent='−'+money(poolCost);$('#slippageCost').textContent='−'+money(slippageCost);$('#gasCost').textContent='−'+money(gas);$('#eligibleResult').textContent=signedMoney(eligible);$('#performanceCost').textContent=performanceCost?'−'+money(performanceCost):money(0);$('#userShareResult').textContent=signedMoney(userShare);$('#authorShareResult').textContent=authorCost?'−'+money(authorCost):money(0);$('#netResult').textContent=signedMoney(net);$('#roiResult').textContent=pct(roi);$('#amountOutResult').textContent=amountOut.toFixed(2);$('#minimumResult').textContent=money(minimum);
  $('#decisionState').textContent=pass?'PASS':'REJECT';$('#decisionState').className='state '+(pass?'quoted':'reject');$('#decisionBox').className='decision '+(pass?'pass':'reject');
  [['gateNet',netGate],['gateOut',outGate],['gateAge',ageGate]].forEach(([id,ok])=>{const el=$('#'+id);el.className='gate '+(ok?'ok':'bad');$('i',el).textContent=ok?'✓':'×'});
  $('#homeNet').textContent=signedMoney(net);$('#homeNet').className='metric-value private-value'+(net>0?' positive':'');$('#commandNet').textContent=signedMoney(net);$('#commandNet').style.color=net>0?'var(--acc)':'var(--red)';$('#homeRoi').textContent=pct(roi);$('#homeDecision').textContent=pass?'PASS':'REJECT';$('#homeDecision').style.color=pass?'var(--acc)':'var(--red)';$('#homeAge').textContent=quoteAge+'s';$('#homeMaxAge').textContent=maxQuoteAge+'s';$('#routeState').textContent=pass?'PASS':'REJECT';$('#routeState').className='state '+(pass?'quoted':'reject');$('#routeEdge').textContent=edge.toFixed(2)+'%';$('#routeFees').textContent=poolFee.toFixed(2)+'%';$('#routeSlip').textContent=slippage.toFixed(2)+'%';$('#routeGas').textContent=money(gas);
}
Object.keys(defaults).forEach(id=>$('#'+id).addEventListener('input',updateSimulator));$('#resetSimulator').addEventListener('click',()=>{Object.entries(defaults).forEach(([id,value])=>$('#'+id).value=value);updateSimulator();toast('Demonstration scenario restored')});
$('#strategyVisibility').addEventListener('change',event=>{const community=event.target.value==='community';$('#authorShare').disabled=!community;$('#publishStrategy').disabled=!community;updateSimulator();toast(community?'Strategy ready for local publishing':'Strategy set to private')});
$('#authorShare').addEventListener('input',updateSimulator);
$('#maxAllocation').addEventListener('input',event=>$('#maxAllocationOut').textContent=event.target.value+'%');$('#cooldown').addEventListener('input',event=>$('#cooldownOut').textContent=event.target.value+' min');
$('#saveStrategy').addEventListener('click',()=>{openSheet(`<h3>Draft saved locally</h3><p>The current parameters were recorded in this browser only. No contract was published and no strategy was activated.</p><div class="kv"><span>Environment</span><b>${environmentMeta[currentEnvironment].label}</b></div><div class="kv"><span>Network</span><b>${chainNames[safeGet('triviu-chain','polygon')]}</b></div><div class="kv"><span>State</span><b>DRAFT</b></div><div class="kv"><span>Execution</span><b>DISABLED</b></div><button class="btn primary s-8c97caa1" data-act="close|nav:strategies">View strategies</button>`);safeSet('triviu-strategy-draft','true')});
$('#publishStrategy').addEventListener('click',()=>{
  if(currentEnvironment==='real')return toast('Publishing with real capital is blocked in this version');
  if($('#strategyVisibility').value!=='community')return toast('Set the strategy to Community');
  const now=Date.now(),share=inputNumber('authorShare'),capital=inputNumber('capital'),edge=inputNumber('edge'),poolFee=inputNumber('poolFee'),slippage=inputNumber('slippage'),gas=inputNumber('gas'),eligible=capital*edge/100-capital*poolFee/100-capital*slippage/100-gas,userShare=eligible-Math.max(0,eligible)*.5,authorCost=Math.max(0,userShare)*share/100,net=userShare-authorCost;
  const item={id:'user-strategy-'+now,name:'My strategy v1.0',author:'You',handle:'@triviu-user',environment:currentEnvironment,result:pct(capital?net/capital*100:0),drawdown:'not measured',age:'now',followers:0,share,scope:`Densidade ${$('#maxAllocation').value}% · ${chainNames[safeGet('triviu-chain','polygon')]} · quote age ${$('#maxQuoteAge').value}s`,version:'1.0'};
  userStrategies.unshift(item);communityPosts.unshift({id:'strategy-post-'+now,author:'You',handle:'@triviu-user',initials:'TG',kind:'strategy',environment:currentEnvironment,time:'now',text:`I published ${item.name} with an author share of ${share}% of the user's economic half.`,likes:0,liked:false,comments:[],proof:{label:'VERSION',value:'1.0',meta:'LOCAL SETUP · NO EXECUTION'}});persistCommunity();renderCommunity();navigate('community');toast('Strategy published locally in the Commons');
});

function toggleFeed(){const env=environmentMeta[currentEnvironment].label;feedPaused=!feedPaused;$('#pauseFeed').textContent=feedPaused?'Resume':'Pause';$('#feedChip').innerHTML=feedPaused?env+' PAUSED':'<span class="dot"></span>'+env+' FEED';toast(feedPaused?'Demonstration feed paused':'Demonstration feed resumed')}
$('#pauseFeed').addEventListener('click',toggleFeed);feedTimer=setInterval(()=>{if(feedPaused)return;const age=$('#quoteAge');age.value=Math.min(Number(age.max),Number(age.value)+1);updateSimulator()},5000);

function saveLayout(){const order=$$('.widget').map(el=>el.dataset.widget);const hidden=$$('.widget.hidden').map(el=>el.dataset.widget);safeSet('triviu-layout',JSON.stringify({order,hidden}))}
function renderHidden(){const hidden=$$('.widget.hidden');$('#hiddenWidgets').classList.toggle('show',customizing&&hidden.length>0);$('#hiddenWidgets').innerHTML=hidden.map(el=>`<button class="chip" data-restore="${el.dataset.widget}">+ ${el.dataset.title}</button>`).join('');$$('[data-restore]').forEach(btn=>btn.addEventListener('click',()=>{const target=$(`[data-widget="${btn.dataset.restore}"]`);target.classList.remove('hidden');renderHidden();saveLayout()}))}
function setCustomize(on){customizing=on;$$('.widget').forEach(el=>{el.classList.toggle('editing',on);el.draggable=on;const controls=$('.widget-controls',el);if(controls&&!$('[data-widget-grip]',controls)){const grip=document.createElement('button');grip.className='widget-control';grip.dataset.widgetGrip='';grip.textContent='≡';grip.setAttribute('aria-label','Arrastar widget');controls.prepend(grip)}});$('#customize').textContent=on?'Done':'Customise';renderHidden()}
$('#customize').addEventListener('click',()=>setCustomize(!customizing));
$$('.widget').forEach(widget=>{widget.addEventListener('click',event=>{const hide=event.target.closest('[data-hide]'),move=event.target.closest('[data-move]');if(hide){widget.classList.add('hidden');renderHidden();saveLayout()}if(move){const direction=Number(move.dataset.move),sibling=direction<0?widget.previousElementSibling:widget.nextElementSibling;if(!sibling)return;direction<0?widget.parentElement.insertBefore(widget,sibling):widget.parentElement.insertBefore(sibling,widget);saveLayout()}})});
function restoreLayout(){try{const saved=JSON.parse(safeGet('triviu-layout','null'));if(!saved)return;saved.order.forEach(id=>{const el=$(`[data-widget="${id}"]`);if(el)$('#widgetGrid').appendChild(el)});saved.hidden.forEach(id=>{const el=$(`[data-widget="${id}"]`);if(el)el.classList.add('hidden')})}catch(error){}}

let draggedWidget=null;
$('#widgetGrid').addEventListener('dragstart',event=>{if(!customizing)return event.preventDefault();draggedWidget=event.target.closest('.widget');if(draggedWidget)draggedWidget.classList.add('dragging')});
$('#widgetGrid').addEventListener('dragover',event=>{if(!draggedWidget)return;event.preventDefault();const target=event.target.closest('.widget');if(target&&target!==draggedWidget)target.parentElement.insertBefore(draggedWidget,target)});
$('#widgetGrid').addEventListener('dragend',()=>{if(draggedWidget)draggedWidget.classList.remove('dragging');draggedWidget=null;saveLayout()});
let pointerWidget=null,pointerWidgetId=null;
$('#widgetGrid').addEventListener('pointerdown',event=>{if(!customizing||!event.target.closest('[data-widget-grip]'))return;event.preventDefault();pointerWidget=event.target.closest('.widget');pointerWidgetId=event.pointerId;pointerWidget.classList.add('dragging');$('#widgetGrid').setPointerCapture(event.pointerId)});
$('#widgetGrid').addEventListener('pointermove',event=>{if(!pointerWidget||event.pointerId!==pointerWidgetId)return;const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('.widget');if(target&&target!==pointerWidget){const rect=target.getBoundingClientRect(),before=event.clientY<rect.top+rect.height/2;target.parentElement.insertBefore(pointerWidget,before?target:target.nextElementSibling)}});
$('#widgetGrid').addEventListener('pointerup',event=>{if(!pointerWidget||event.pointerId!==pointerWidgetId)return;pointerWidget.classList.remove('dragging');pointerWidget=null;pointerWidgetId=null;saveLayout()});

$('#copyAddress').addEventListener('click',async()=>{try{await navigator.clipboard.writeText('0x8f3C000000000000000000000000000000a91D');toast('Demonstration address copied')}catch(error){toast('Could not copy in this browser')}});
$('#platform').addEventListener('change',event=>applyPlatform(event.target.value));$('#motionSwitch').addEventListener('click',()=>{const on=!document.body.classList.contains('reduced-motion');document.body.classList.toggle('reduced-motion',on);$('#motionSwitch').classList.toggle('on',on);$('#motionSwitch').setAttribute('aria-pressed',String(on));safeSet('triviu-motion',String(on))});

const defaultMenuOrder=['community','strategies','home','referral','wallet','orders','settings'];
const menuLabels={home:'Home',community:'Community',wallet:'Wallet',strategies:'Strategies',referral:'Referrals',orders:'Lots',settings:'Settings'};
let menuOrder=[...defaultMenuOrder],draggedMenuId=null;
function applyMenuOrder(){
  $$('[data-nav-container]').forEach(container=>menuOrder.forEach(id=>{const item=$(`[data-nav-id="${id}"]`,container);if(item)container.appendChild(item)}));
  safeSet('triviu-menu-order',JSON.stringify(menuOrder));renderMenuEditor();
}
function moveMenu(id,direction){const index=menuOrder.indexOf(id),next=index+direction;if(index<0||next<0||next>=menuOrder.length)return;[menuOrder[index],menuOrder[next]]=[menuOrder[next],menuOrder[index]];applyMenuOrder()}
function renderMenuEditor(){
  $('#menuEditor').innerHTML=menuOrder.map(id=>`<div class="menu-item" draggable="true" data-menu-id="${id}"><span class="drag-grip" aria-hidden="true">≡</span><b>${menuLabels[id]}</b><div class="menu-actions"><button data-menu-move="-1" aria-label="Move ${menuLabels[id]} up">↑</button><button data-menu-move="1" aria-label="Move ${menuLabels[id]} down">↓</button></div></div>`).join('');
}
$('#menuEditor').addEventListener('click',event=>{const move=event.target.closest('[data-menu-move]'),item=event.target.closest('[data-menu-id]');if(move&&item)moveMenu(item.dataset.menuId,Number(move.dataset.menuMove))});
$('#menuEditor').addEventListener('dragstart',event=>{const item=event.target.closest('[data-menu-id]');if(!item)return;draggedMenuId=item.dataset.menuId;item.classList.add('dragging')});
$('#menuEditor').addEventListener('dragover',event=>{event.preventDefault();const target=event.target.closest('[data-menu-id]'),dragged=$(`[data-menu-id="${draggedMenuId}"]`,$('#menuEditor'));if(!target||!dragged||target===dragged)return;const before=event.clientY<target.getBoundingClientRect().top+target.offsetHeight/2;target.parentElement.insertBefore(dragged,before?target:target.nextElementSibling)});
$('#menuEditor').addEventListener('dragend',()=>{menuOrder=$$('.menu-item',$('#menuEditor')).map(el=>el.dataset.menuId);draggedMenuId=null;applyMenuOrder()});
let pointerMenu=null,pointerMenuId=null;
$('#menuEditor').addEventListener('pointerdown',event=>{if(!event.target.closest('.drag-grip'))return;event.preventDefault();pointerMenu=event.target.closest('.menu-item');pointerMenuId=event.pointerId;pointerMenu.classList.add('dragging');$('#menuEditor').setPointerCapture(event.pointerId)});
$('#menuEditor').addEventListener('pointermove',event=>{if(!pointerMenu||event.pointerId!==pointerMenuId)return;const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('.menu-item');if(target&&target!==pointerMenu){const before=event.clientY<target.getBoundingClientRect().top+target.offsetHeight/2;target.parentElement.insertBefore(pointerMenu,before?target:target.nextElementSibling)}});
$('#menuEditor').addEventListener('pointerup',event=>{if(!pointerMenu||event.pointerId!==pointerMenuId)return;pointerMenu.classList.remove('dragging');menuOrder=$$('.menu-item',$('#menuEditor')).map(el=>el.dataset.menuId);pointerMenu=null;pointerMenuId=null;applyMenuOrder()});
$('#resetMenu').addEventListener('click',()=>{menuOrder=[...defaultMenuOrder];applyMenuOrder();toast('Menu restored')});

function applyDensity(value){document.body.dataset.density=value;$('#density').value=value;safeSet('triviu-density',value)}
function applyNavSize(value){const sizes=[{side:220,dock:64},{side:250,dock:70},{side:290,dock:82}][Number(value)];document.documentElement.style.setProperty('--sidebar-width',sizes.side+'px');document.documentElement.style.setProperty('--dock-height',sizes.dock+'px');$('#navSize').value=value;safeSet('triviu-nav-size',String(value))}
function applyBackground(value){document.body.dataset.bg=value;$$('.bg-option').forEach(btn=>btn.classList.toggle('active',btn.dataset.bg===value));safeSet('triviu-bg',value)}
$('#density').addEventListener('change',event=>applyDensity(event.target.value));$('#navSize').addEventListener('input',event=>applyNavSize(event.target.value));$$('.bg-option').forEach(btn=>btn.addEventListener('click',()=>applyBackground(btn.dataset.bg)));$('#restartOnboarding').addEventListener('click',()=>{$('#onboarding').classList.remove('done');showOnboardingStep(0)});

renderSwatches();applyAccent(safeGet('triviu-accent','#6E8AFF'));const platformPref=safeGet('triviu-platform','auto');$('#platform').value=platformPref;applyPlatform(platformPref);applyChain(safeGet('triviu-chain','polygon'));applyExperience(safeGet('triviu-experience','essential'));applyEnvironment(safeGet('triviu-environment','demo'));applyProtocolState(safeGet('triviu-protocol-state','ready'));applyDensity(safeGet('triviu-density','comfortable'));applyNavSize(safeGet('triviu-nav-size','1'));applyBackground(safeGet('triviu-bg','black'));setPrivacy(safeGet('triviu-privacy','false')==='true');if(safeGet('triviu-contrast','false')==='true')setAccessibility('contrast',true);if(safeGet('triviu-text-size','false')==='true')setAccessibility('text',true);if(safeGet('triviu-motion','false')==='true')$('#motionSwitch').click();try{const savedOrder=JSON.parse(safeGet('triviu-menu-order','null'));if(Array.isArray(savedOrder)&&savedOrder.length===defaultMenuOrder.length&&new Set(savedOrder).size===defaultMenuOrder.length&&savedOrder.every(id=>defaultMenuOrder.includes(id)))menuOrder=savedOrder}catch(error){}applyMenuOrder();const cardStyle=safeGet('triviu-card-style','obsidian');$('#premiumCard').dataset.card=cardStyle;$$('[data-card-style]').forEach(btn=>btn.classList.toggle('active',btn.dataset.cardStyle===cardStyle));if(safeGet('triviu-onboarded','false')==='true')$('#onboarding').classList.add('done');if(safeGet('triviu-referral-settled','false')==='true')$('#pendingReferral').textContent='$0.00';restoreLayout();renderHidden();renderCommunity();updateShareCard();updateSimulator();


;


/* Review layer: presentation state only. No provider, RPC or transaction APIs. */
const mainContent=$('main');mainContent.id='mainContent';mainContent.tabIndex=-1;
const contextNote=document.createElement('div');contextNote.className='context-note';contextNote.setAttribute('role','status');$('.environment-bar').after(contextNote);
$('#toastStack').setAttribute('role','status');$('#toastStack').setAttribute('aria-live','polite');
$('#protocolStateBanner').setAttribute('aria-live','polite');
const originalNavigate=navigate;
navigate=function(screen){if(!$('#screen-'+screen))return;originalNavigate(screen);$$('[data-screen]').forEach(b=>{if(b.dataset.screen===screen)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});const heading=$('h2',$('#screen-'+screen));if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true})}};
$$('.nav-btn').forEach(b=>b.setAttribute('aria-label',titles[b.dataset.screen]||b.textContent.trim()));
$$('.widget-control').forEach(b=>b.setAttribute('aria-label',b.hasAttribute('data-hide')?'Hide panel':b.dataset.move==='-1'?'Move panel back':'Move panel forward'));
$$('.table-wrap,.micro-ledger,.route-line').forEach((el,i)=>{el.tabIndex=0;el.setAttribute('role','region');el.setAttribute('aria-label','Data region with horizontal scrolling '+(i+1))});
$('.community-tabs').setAttribute('role','group');
function syncPressed(){ $$('[data-environment],[data-community-filter],[data-experience-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.classList.contains('active')))) }
document.addEventListener('click',syncPressed);
let returnFocus=null;
const originalOpenSheet=openSheet,originalCloseSheet=closeSheet;
function inertBackground(on){$$('body > *').forEach(el=>{if(!['sheet','veil','toastStack'].includes(el.id)&&!['SCRIPT','STYLE'].includes(el.tagName))el.inert=on})}
openSheet=function(html){if(!$('#sheet').classList.contains('open'))returnFocus=document.activeElement;originalOpenSheet(html);const h=$('h3',$('#sheet'));if(h){h.id='dialogTitle';$('#sheet').setAttribute('aria-labelledby','dialogTitle')}$('#sheet').setAttribute('aria-label','Console details');$('#sheet').removeAttribute('aria-hidden');$('#sheet').inert=false;inertBackground(true);document.body.style.overflow='hidden';const close=document.createElement('button');close.className='btn sheet-close';close.textContent='Close ×';close.addEventListener('click',closeSheet);$('#sheetBody').prepend(close);close.focus()};
closeSheet=function(){originalCloseSheet();$('#sheet').inert=true;$('#sheet').setAttribute('aria-hidden','true');inertBackground(false);document.body.style.overflow='';if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});returnFocus=null};
$('#sheet').inert=true;$('#sheet').setAttribute('aria-hidden','true');
$('#veil').addEventListener('click',()=>closeSheet());
// Registered V5.4 callbacks retain their original references; use dynamic dispatch.
document.addEventListener('click',event=>{if(event.target.closest('.sheet-close'))closeSheet()});
document.addEventListener('keydown',event=>{const modal=$('#sheet').classList.contains('open')?$('#sheet'):!$('#onboarding').classList.contains('done')?$('#onboarding'):null;if(!modal||event.key!=='Tab')return;const focusable=$$('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',modal).filter(el=>el.getClientRects().length);if(!focusable.length)return;const first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&(document.activeElement===first||!modal.contains(document.activeElement))){event.preventDefault();last.focus()}else if(!event.shiftKey&&(document.activeElement===last||!modal.contains(document.activeElement))){event.preventDefault();first.focus()}});
const originalAccessibility=setAccessibility;
setAccessibility=function(type,on){originalAccessibility(type,on);if(type==='text')document.documentElement.toggleAttribute('data-large-text',on)};
document.documentElement.toggleAttribute('data-large-text',document.body.hasAttribute('data-text'));
const originalProtocolState=applyProtocolState;
applyProtocolState=function(value){value=Object.hasOwn(protocolStates,value)?value:'ready';originalProtocolState(value);const blocked=currentEnvironment==='real',env=environmentMeta[currentEnvironment],copy=blocked?env.notice:'LOCAL PREVIEW · '+protocolStates[value].copy;$('#protocolStateCopy').textContent=copy;$('#statePreviewTitle').textContent=blocked?'Real capital locked':protocolStates[value].title;$('#statePreviewCopy').textContent=copy;$('#statePreviewChip').textContent=blocked?'LOCKED':protocolStates[value].chip.replace('DEMO',env.label);$('#protocolStateBanner').dataset.state=blocked?'wrong-network':value;$('#mainContent').setAttribute('aria-busy',String(value==='loading'&&!blocked))};
function syncContext(){const chain=chainMeta[document.body.dataset.chain]||chainMeta.polygon,env=environmentMeta[currentEnvironment];contextNote.textContent='Selected context: '+chain.name+' · '+env.label+'. No network connection. Balances, routes and history are fixed demonstration examples, not data from this network.';$('#feedChip').textContent=env.label+' · '+(feedPaused?'PAUSED':'LOCAL EXAMPLE');$('#publishPost').disabled=currentEnvironment==='real';$('#publishStrategy').disabled=currentEnvironment==='real'||$('#strategyVisibility').value!=='community';applyProtocolState(document.body.dataset.protocolState||'ready');syncPressed()}
const originalChain=applyChain,originalEnvironment=applyEnvironment;
applyChain=function(value){const valid=Object.hasOwn(chainMeta,value)?value:'polygon';if($('#sheet').classList.contains('open'))closeSheet();originalChain(valid);syncContext()};
applyEnvironment=function(value,announce=false){const valid=Object.hasOwn(environmentMeta,value)?value:'demo';if($('#sheet').classList.contains('open'))closeSheet();originalEnvironment(valid,announce);syncContext()};
$('#strategyVisibility').addEventListener('change',syncContext);
// Custom colours must remain legible against dark panels; preserve the hue picker.
const originalAccent=applyAccent;
applyAccent=function(color){if(!/^#[0-9a-f]{6}$/i.test(color))color='#6E8AFF';let rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));let checked=color;while(luminance(checked)<.24&&rgb.some(v=>v<255)){rgb=rgb.map(v=>Math.min(255,v+8));checked='#'+rgb.map(v=>v.toString(16).padStart(2,'0')).join('')}originalAccent(checked);$('#themeColor').content=getComputedStyle(document.body).getPropertyValue('--bg').trim()};
applyAccent(safeGet('triviu-accent','#6E8AFF'));syncContext();
for(const [surface,key] of [[$('#widgetGrid'),'widget'],[$('#menuEditor'),'menu']])surface.addEventListener('pointercancel',()=>{if(key==='widget'){pointerWidget?.classList.remove('dragging');pointerWidget=null;pointerWidgetId=null;saveLayout()}else{pointerMenu?.classList.remove('dragging');pointerMenu=null;pointerMenuId=null;applyMenuOrder()}});
// Keep Home centred in the five-item mobile dock, independently of sidebar order.
const originalMenu=applyMenuOrder;
applyMenuOrder=function(){originalMenu();const dock=$('.bottom-nav'),items=$$('[data-nav-id]',dock).filter(el=>el.dataset.navId!=='home'),home=$('[data-nav-id="home"]',dock);items.splice(2,0,home);items.forEach(el=>dock.append(el))};applyMenuOrder();


;


/* V5.4.2: mobile settings and explicit information depth. */
const mobileSettings=document.createElement('button');
mobileSettings.className='btn';mobileSettings.id='mobileSettings';mobileSettings.textContent='Settings';mobileSettings.setAttribute('aria-label','Open settings');
mobileSettings.addEventListener('click',()=>navigate('settings'));
$('.mobile-head').append(mobileSettings);
const modeGuide=document.createElement('p');modeGuide.className='section-copy';modeGuide.id='modeGuide';modeGuide.setAttribute('role','status');$('.dashboard-tools').after(modeGuide);
$('#microledger')?.classList.add('pro-only');
$('[data-widget="microledger"]')?.classList.add('pro-only');
$('[data-widget="metrics"]')?.classList.add('pro-only');
const stateLab=$('.state-lab');
const experienceSetting=$('#experienceSelect').closest('.setting');
stateLab.before(experienceSetting);stateLab.classList.add('pro-only');
$$('.formula,.route-summary,.gate-list,.breakdown').forEach(el=>el.classList.add('pro-only'));
const editor=$('#screen-simulator');
const editorIntro=document.createElement('article');editorIntro.className='panel essential-only';
editorIntro.innerHTML='<h3>Strategy editor · Professional</h3><p>The editor gathers parameters, limits and detailed calculations. To read summarised results, stay in Essential.</p><button class="btn primary" id="enterProfessional">Open Professional mode</button>';
editor.prepend(editorIntro);$('.sim-layout',editor)?.classList.add('pro-only');
$('#enterProfessional').addEventListener('click',()=>{applyExperience('professional');navigate('simulator')});
const previousExperience=applyExperience;
applyExperience=function(value){value=value==='professional'?'professional':'essential';previousExperience(value);modeGuide.textContent=value==='essential'?'Essential · overview, summarised results, community and settings.':'Professional · parameters, routes, micro-operations and detailed diagnostics.';syncPressed()};
applyExperience(document.body.dataset.experience);


;


/* hardening · full reset of the local demo (every triviu-* key) */
(function(){var b=document.getElementById('resetAllLocal');if(!b)return;b.addEventListener('click',function(){
  if(!confirm('Erase all local data from this demo? Environment, community, layout, accent, network and onboarding return to their defaults.'))return;
  try{Object.keys(localStorage).filter(function(k){return k.indexOf('triviu')===0}).forEach(function(k){localStorage.removeItem(k)});}catch(e){}
  location.reload();});})();


;


/* ═══ Brand kit (referral) + Community profile ═══ */
(function(){
  "use strict";
  var $=function(i){return document.getElementById(i);};
  function esc(t){var d=document.createElement('div');d.textContent=t==null?'':String(t);return d.innerHTML;}
  function readAcc(){return getComputedStyle(document.documentElement).getPropertyValue('--acc').trim()||'#6E8AFF';}
  function hex2rgb(h){h=h.trim();if(h.indexOf('rgb')===0)return h;h=h.replace('#','');if(h.length===3)h=h.split('').map(function(c){return c+c}).join('');
    var n=parseInt(h,16);return 'rgb('+((n>>16)&255)+','+((n>>8)&255)+','+(n&255)+')';}

  /* — swatches vivos — */
  var SW=[['Action',null],['Ink','#16181D'],['Paper','#FAFAF7'],['Night','#131519'],['Panel','#1B1E23'],['Ultramar','#2743C7'],['Lacre','#C13327'],['Acafrao','#E8B23A'],['Violeta','#7B3FE4'],['Line','#353C46'],['Text','#ECEDEA'],['Muted','#A8AEB7']];
  function paintSwatches(){
    var host=$('bkSwatches'); if(!host)return;
    host.innerHTML=SW.map(function(x){
      var c=x[1]||readAcc();
      return '<div class="bk-sw"><i class="s-a4939a21"></i><span>'+esc(x[0])+'<br>'+esc(hex2rgb(c))+'</span></div>';
    }).join('');
  }
  paintSwatches();
  var accObs=setInterval(paintSwatches,1200);document.addEventListener('visibilitychange',function(){if(document.hidden){clearInterval(accObs);accObs=null}else if(!accObs){accObs=setInterval(paintSwatches,1200)}});
  var cp=$('bkCopyAccent');
  if(cp)cp.addEventListener('click',function(){
    var v=hex2rgb(readAcc());
    (async function(){try{await navigator.clipboard.writeText(v);if(window.toast)toast('Accent copied: '+v);}catch(e){if(window.toast)toast('Could not copy in this browser');}})();
  });
  var dk=$('downloadBrandKit');
  if(dk)dk.addEventListener('click',function(){
    var acc=hex2rgb(readAcc());
    var txt=['TRIVIU · BRAND KIT','','Mark: Triangle Motion — the path never closes.','Rules: never close the triangle · never rotate · never change proportions.','',
      'Cor','  Accent (vivo): '+acc,'  Ink #16181D · Paper #FAFAF7 · Night #131519 · Panel #1B1E23','  Ultramar #2743C7 · Lacre #C13327 · Acafrao #E8B23A · Violeta #7B3FE4','  Text #ECEDEA · Muted #A8AEB7 · Line #353C46','',
      'Tipografia','  Public Sans — headings and interface','  IBM Plex Mono — data, evidence, addresses','',
      'Voz','  Say: synthetic scenario · rejected by rule · non-custodial · verify it yourself',
      '  Do not say: earn · guaranteed income · safe return · easy profit','',
      'Uso','  You publish in your own name. The card shows the environment and never hides that it is synthetic.',
      '  Do not alter the numbers or remove the environment seal.','  Mark CC BY 4.0 · code AGPL-3.0.'].join('\n');
    var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([txt],{type:'text/plain'}));a.download='triviu-brand-kit.txt';a.click();
    setTimeout(function(){URL.revokeObjectURL(a.href)},2000);
    if(window.toast)toast('Brand kit downloaded');
  });

  /* — community profile: photo, name, username, bio (local) — */
  var KEY='triviu-profile';
  var prof={name:'Trader Guest',handle:'guest',bio:'',avatar:''};
  try{var raw=localStorage.getItem(KEY);if(raw)prof=Object.assign(prof,JSON.parse(raw));}catch(e){}
  function initials(n){return (n||'TG').trim().split(/\s+/).slice(0,2).map(function(w){return w[0]||''}).join('').toUpperCase()||'TG';}
  function paintAvatar(el){
    if(!el)return;
    if(prof.avatar&&/^data:image\/(png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(prof.avatar)){el.style.backgroundImage='url("'+prof.avatar+'")';el.textContent='';el.style.color='transparent';}
    else{el.style.backgroundImage='';el.style.color='';el.textContent=initials(prof.name);}
  }
  function paintProfile(){
    var n=$('profileNameOut'),h=$('profileHandleOut'),b=$('profileBioOut');
    if(n)n.textContent=prof.name||'Trader Guest';
    if(h)h.textContent='@'+(prof.handle||'guest');
    if(b)b.textContent=prof.bio||'No bio yet. Say in one line what you watch in the market.';
    paintAvatar($('profileAvatar')); paintAvatar($('composerAvatar'));
  }
  function openForm(open){
    var f=$('profileForm'); if(!f)return;
    f.hidden=!open;
    if(open){
      var a=$('profileNameInput'),b=$('profileHandleInput'),c=$('profileBioInput');
      if(a)a.value=prof.name; if(b)b.value=prof.handle; if(c)c.value=prof.bio;
      if(a)a.focus();
    }
  }
  var eb=$('editProfileBtn'); if(eb)eb.addEventListener('click',function(){openForm($('profileForm').hidden);});
  var ab=$('avatarBtn'); if(ab)ab.addEventListener('click',function(){openForm(true);var f=$('avatarFile');if(f)f.click();});
  var pick=$('profileAvatarPick'); if(pick)pick.addEventListener('click',function(){var f=$('avatarFile');if(f)f.click();});
  var file=$('avatarFile');
  if(file)file.addEventListener('change',function(e){
    var f=e.target.files&&e.target.files[0]; if(!f)return;
    if(f.size>2*1024*1024){if(window.toast)toast('Image too large (max. 2 MB)');return;}
    var rd=new FileReader();
    rd.onload=function(){ prof.avatar=rd.result; paintAvatar($('profileAvatar')); paintAvatar($('composerAvatar')); };
    rd.readAsDataURL(f);
  });
  var clr=$('profileAvatarClear'); if(clr)clr.addEventListener('click',function(){prof.avatar='';paintProfile();});
  var cancel=$('profileCancel'); if(cancel)cancel.addEventListener('click',function(){
    try{var raw=localStorage.getItem(KEY);if(raw)prof=Object.assign({name:'Trader Guest',handle:'guest',bio:'',avatar:''},JSON.parse(raw));}catch(e){}
    paintProfile(); openForm(false);
  });
  var save=$('profileSave');
  if(save)save.addEventListener('click',function(){
    var a=$('profileNameInput'),b=$('profileHandleInput'),c=$('profileBioInput');
    prof.name=(a&&a.value.trim())||'Trader Guest';
    prof.handle=((b&&b.value.trim())||'guest').replace(/[^a-zA-Z0-9_.]/g,'').toLowerCase()||'guest';
    prof.bio=(c&&c.value.trim())||'';
    try{localStorage.setItem(KEY,JSON.stringify(prof));}catch(e){if(window.toast)toast('Could not save in this browser');}
    paintProfile(); openForm(false);
    if(window.toast)toast('Profile updated');
  });
  paintProfile();
})();


;


/* CSP · os onclick viravam handler morto sob script-src 'self'. Delegacao
   resolve para HTML injetado depois, que e o caso de todos eles. */
document.addEventListener('click', function (e) {
  var el = e.target.closest && e.target.closest('[data-act]');
  if (!el) return;
  el.getAttribute('data-act').split('|').forEach(function (a) {
    if (a === 'close') { if (window.closeSheet) closeSheet(); }
    else if (a.indexOf('nav:') === 0) { if (window.navigate) navigate(a.slice(4)); }
    else if (a.indexOf('toast:') === 0) { if (window.toast) toast(a.slice(6)); }
    else if (a === 'settle') { if (window.simulateReferralSettlement) simulateReferralSettlement(); }
  });
});