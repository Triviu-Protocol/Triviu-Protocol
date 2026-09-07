const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const state={env:'demo',network:'polygon',running:true,tick:0};
const networks={polygon:{name:'Polygon',code:'POL'},arbitrum:{name:'Arbitrum',code:'ARB'},bsc:{name:'BNB Smart Chain',code:'BNB'}};
const controls={density:$('#density'),minimum:$('#minimum'),slippage:$('#slippage'),quoteAge:$('#quoteAge'),guards:$('#guards')};
function update(){const density=+controls.density.value,minimum=+controls.minimum.value,slippage=+controls.slippage.value,age=+controls.quoteAge.value,guards=+controls.guards.value,cost=Math.round(slippage*.62+density*.13+age*.08),margin=minimum-cost,score=Math.max(18,Math.min(99,100-Math.abs(35-density)*.35-slippage*.45-age*.28+(guards-4)*3)),pass=margin>=0&&guards>=4&&age<=25&&state.env!=='real',net=networks[state.network];$('#densityValue').textContent=density+'%';$('#minimumValue').textContent=minimum+' bps';$('#slippageValue').textContent=slippage+' bps';$('#quoteAgeValue').textContent=age+'s';$('#guardsValue').textContent=guards+'/8';$('#score').textContent=Math.round(score);$('#cost').textContent=cost+' bps';$('#margin').textContent=(margin>0?'+':'')+margin+' bps';$('#metricEnv').textContent=state.env.toUpperCase();$('#metricNetwork').textContent=net.name.toUpperCase();$('#networkValue').textContent=net.code;$('#envValue').textContent=state.env==='real'?'LOCKED':state.env.toUpperCase();$('#workspaceEyebrow').textContent=(state.env==='demo'?'DEMO · '+net.name.toUpperCase()+' · SYNTHETIC DATA':state.env==='testnet'?'TESTNET · '+net.name.toUpperCase()+' · NO ECONOMIC VALUE':'REAL CAPITAL · LOCKED');const decision=$('#decision');decision.classList.toggle('reject',!pass);$('#decisionBadge').textContent=pass?'PASS · '+state.env.toUpperCase():'REJECT';$('#decisionTitle').textContent=state.env==='real'?'Real capital unavailable in this preview':pass?'Configuration coherent for demonstration':'Hypothesis rejected by the guardrails';$('#decisionCopy').textContent=state.env==='real'?'Integration depends on contracts, audit, sources and homologation.':pass?'The hypothesis clears the estimated cost and keeps enough guardrails.':'Review margin, quote age or the number of guardrails.'}
$$('input[type=range],select').forEach(el=>el.addEventListener('input',()=>{if(el.id==='network')state.network=el.value;update()}));
$$('[data-env]').forEach(button=>button.addEventListener('click',()=>{state.env=button.dataset.env;$$('[data-env]').forEach(x=>x.classList.toggle('active',x===button));update()}));
$('#reset').addEventListener('click',()=>{controls.density.value=35;controls.minimum.value=18;controls.slippage.value=12;controls.quoteAge.value=12;controls.guards.value=6;$('#network').value='polygon';state.network='polygon';state.env='demo';$$('[data-env]').forEach(x=>x.classList.toggle('active',x.dataset.env==='demo'));update()});
function stream(){if(!state.running)return;state.tick++;const net=networks[state.network],types=['quote.received','guard.check','route.preview','context.refresh'],type=types[state.tick%types.length],blocked=state.tick%5===0||state.env==='real',time=new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}),row=document.createElement('div');row.className='stream-row';row.innerHTML=`<time>${time}</time><span class="chain">${net.code} · #${(18420110+state.tick).toLocaleString('pt-BR')}</span><b>${type}</b><span class="stream-state ${blocked?'blocked':''}">${blocked?'BLOCKED':'DEMO'}</span>`;$('#streamList').prepend(row);while($('#streamList').children.length>12)$('#streamList').lastElementChild.remove()}
for(let i=0;i<7;i++)stream();const timer=setInterval(stream,1800);$('#streamToggle').addEventListener('click',()=>{state.running=!state.running;$('#streamToggle').textContent=state.running?'Pause':'Resume'});
const menuButton=$('#menuButton'),drawer=$('#drawer');menuButton.addEventListener('click',()=>{const open=drawer.classList.toggle('open');menuButton.setAttribute('aria-expanded',String(open));menuButton.textContent=open?'×':'☰'});$$('a',drawer).forEach(a=>a.addEventListener('click',()=>{drawer.classList.remove('open');menuButton.setAttribute('aria-expanded','false');menuButton.textContent='☰'}));document.addEventListener('keydown',e=>{if(e.key==='Escape'){drawer.classList.remove('open');menuButton.setAttribute('aria-expanded','false');menuButton.textContent='☰'}});
if(matchMedia('(pointer:fine)').matches)document.addEventListener('pointermove',e=>{document.documentElement.style.setProperty('--mx',e.clientX+'px');document.documentElement.style.setProperty('--my',e.clientY+'px')});document.addEventListener('visibilitychange',()=>{state.running=!document.hidden;$('#streamToggle').textContent=state.running?'Pause':'Resume'});update();

/* ═══ §8 · comparacao de cenarios, historico e exportacao ═══════════════════
   O V5 nao tinha nenhuma das tres. Sem comparar duas rodadas, uma bancada e um
   painel de leitura, nao um laboratorio. Tudo fica neste navegador. */
(function(){
  "use strict";
  var KEY='triviu-labs-registro';
  var registro=[];
  try{ registro=JSON.parse(localStorage.getItem(KEY)||'[]'); }catch(e){ registro=[]; }

  /* N2-01 · o registro vem de localStorage, e localStorage nao e estado interno.
     Na escrita todo numerico passa por + ou parseInt; t, env, net e verdict sao
     string e iam para innerHTML sem escapar. Mesma forma do escapeHTML do
     Console, para haver uma defesa so nas duas superficies. */
  var esc=function(v){return String(v).replace(/[&<>'"]/g,function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c];});};
  var num=function(v){var n=Number(v);return Number.isFinite(n)?n:0;};

  function leituraAtual(){
    return {
      t:new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit'}),
      env:state.env, net:networks[state.network].code,
      density:+controls.density.value, minimum:+controls.minimum.value,
      slippage:+controls.slippage.value, age:+controls.quoteAge.value,
      guards:+controls.guards.value,
      cost:parseInt($('#cost').textContent,10),
      margin:parseInt($('#margin').textContent,10),
      score:parseInt($('#score').textContent,10),
      verdict:$('#decisionBadge').textContent.trim()
    };
  }
  function persistir(){ try{ localStorage.setItem(KEY,JSON.stringify(registro.slice(0,40))); }catch(e){} }

  function delta(atual,anterior){
    if(!anterior) return '<span class="delta-zero">baseline</span>';
    var d=num(atual.margin)-num(anterior.margin);
    if(d===0) return '<span class="delta-zero">= margin</span>';
    return '<span class="'+(d>0?'delta-up':'delta-down')+'">'+(d>0?'+':'')+d+' bps margin</span>';
  }
  function pintar(){
    var corpo=$('#registroCorpo'), vazio=$('#registroVazio');
    corpo.innerHTML=registro.map(function(r,i){
      var ok=/PASS/.test(String(r.verdict));
      return '<tr><td>'+(registro.length-i)+'</td><td>'+esc(r.t)+'</td><td>'+
        esc(String(r.env).toUpperCase())+
        '</td><td>'+esc(r.net)+'</td><td>'+num(r.density)+'%</td><td>'+num(r.minimum)+
        '</td><td>'+num(r.slippage)+'</td><td>'+num(r.age)+'s</td><td>'+num(r.guards)+
        '/8</td><td>'+num(r.cost)+' bps</td><td>'+
        (num(r.margin)>0?'+':'')+num(r.margin)+' bps</td><td class="'+(ok?'ok':'bad')+'">'+
        esc(r.verdict)+'</td><td>'+delta(r,registro[i+1])+'</td></tr>';
    }).join('');
    vazio.hidden=registro.length>0;
    $('#registroEyebrow').textContent=registro.length
      ? registro.length+' SNAPSHOT'+(registro.length>1?'S':'')+' · NEWEST FIRST'
      : 'NO SNAPSHOT YET';
  }

  $('#snapshot').addEventListener('click',function(){
    registro.unshift(leituraAtual()); persistir(); pintar();
  });
  $('#limparRegistro').addEventListener('click',function(){
    registro=[]; persistir(); pintar();
  });
  $('#exportar').addEventListener('click',function(){
    if(!registro.length){ $('#registroEyebrow').textContent='NOTHING TO EXPORT'; return; }
    var cab=['n','time','environment','network','density_pct','minimum_bps','slippage_bps',
             'quote_age_s','guards','cost_bps','margin_bps','coherence','verdict'];
    var linhas=registro.map(function(r,i){
      return [registro.length-i,r.t,r.env,r.net,r.density,r.minimum,r.slippage,
              r.age,r.guards,r.cost,r.margin,r.score,r.verdict].join(',');
    });
    /* O cabecalho do arquivo diz o que o arquivo e. Sem isso, um CSV de
       parametros pode ser lido depois como evidencia de resultado. */
    var texto=['# TRIVIU Labs — experiment record',
      '# Generated '+new Date().toISOString(),
      '# SYNTHETIC CONFIGURATION DATA. These rows record interface parameters and the',
      '# verdict the local bench computed from them. They are not market data, not a',
      '# backtest, and not evidence of any result. No RPC, wallet or contract was used.',
      '',cab.join(','),].concat(linhas).join('\n');
    var blob=new Blob([texto],{type:'text/csv;charset=utf-8'});
    var a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download='triviu-labs-experiments-'+new Date().toISOString().slice(0,10)+'.csv';
    a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); },1500);
    $('#registroEyebrow').textContent=registro.length+' SNAPSHOT(S) · EXPORTED';
  });
  pintar();
})();

/* ═══ §8 · Testnet exige selecao consciente ════════════════════════════════ */
(function(){
  "use strict";
  var caixa=document.createElement('div');
  caixa.className='confirm-testnet'; caixa.hidden=true; caixa.id='confirmTestnet';
  caixa.innerHTML='<div><b>Testnet is a separate context.</b> Its catalogue, figures and '+
    'states do not carry over from Demo, and nothing here connects to a test network — '+
    'the switch changes presentation only. Confirm to continue.</div>'+
    '<div class="hero-actions"><button class="btn primary" id="confirmSim">Enter Testnet</button>'+
    '<button class="btn ghost" id="confirmNao">Stay in Demo</button></div>';
  $('#envSwitch').after(caixa);

  var pedido=null;
  document.addEventListener('click',function(e){
    var b=e.target.closest('[data-needs-confirm]');
    if(!b) return;
    if(state.env===b.dataset.env) return;
    e.stopImmediatePropagation(); e.preventDefault();
    pedido=b.dataset.env; caixa.hidden=false; $('#confirmSim').focus();
  },true);
  $('#confirmSim').addEventListener('click',function(){
    if(!pedido) return;
    state.env=pedido;
    $$('[data-env]').forEach(function(x){ x.classList.toggle('active',x.dataset.env===pedido); });
    caixa.hidden=true; pedido=null; update();
  });
  $('#confirmNao').addEventListener('click',function(){ caixa.hidden=true; pedido=null; });
})();