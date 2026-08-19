
const $=id=>document.getElementById(id);
const reduce=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
/* theme toggle — user choice wins over prefers-color-scheme, persisted */
const SUN='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const MOON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
function curTheme(){const s=localStorage.getItem("triviu-theme");if(s)return s;return window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}
function applyTheme(t){document.documentElement.setAttribute("data-theme",t);const b=document.getElementById("theme");if(b)b.innerHTML=t==="dark"?SUN:MOON;}
applyTheme(curTheme());
document.getElementById("theme").addEventListener("click",()=>{const next=document.documentElement.getAttribute("data-theme")==="dark"?"light":"dark";localStorage.setItem("triviu-theme",next);applyTheme(next);});
const CX=60,CY=60,REST=38,FEE=0.997;
const PAL=["#2743C7","#C13327","#E8B23A","#1E7A46","#52575D"];
// Real tokens, verified on-chain 2026-07-19 (getCode). Re-verify on each explorer before any on-chain use.
const CHAINS={
  polygon:{name:"Polygon",gas:0.05,router:"QuickSwap",stables:["USDC","USDT","DAI"],inter:["WETH","WMATIC","WBTC","LINK"]},
  arbitrum:{name:"Arbitrum",gas:0.02,router:"SushiSwap",stables:["USDC","USDT","DAI"],inter:["WETH","ARB","WBTC","GMX"]},
  bsc:{name:"BSC",gas:0.10,router:"PancakeSwap",stables:["USDT","USDC","DAI","BUSD"],inter:["WBNB","CAKE","ETH","BTCB"]},
};
let CH="polygon",STABLE="USDC",HOPS=3,PRICES=[],preset="win",N=0,WINS=0;

function amountOut(x,rin,rout){const a=x*FEE;return a*rout/(rin+a);}
const fmt=(n,d=2)=>n.toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d});
function tokens(){const c=CHAINS[CH];return [STABLE,...c.inter.slice(0,HOPS-1)];}
function state(){return {V:+$("V").value,L:+$("L").value,gas:+$("g").value,feeR:+$("f").value/100,prices:PRICES.slice()};}
function compute(s){
  let amt=s.V;const amts=[s.V];for(let i=0;i<s.prices.length;i++){amt=amountOut(amt,s.L,s.L*s.prices[i]);amts.push(amt);}
  const a=amt,prod=s.prices.reduce((x,y)=>x*y,1),reverts=a<s.V+1e-9,gross=a-s.V,fee=gross>0?gross*s.feeR:0;
  const net=reverts?-s.gas:gross-fee-s.gas; // revert unwinds the swaps — you only lose gas
  return {a,prod,gross,fee,net,reverts,amts};
}
/* preset markets */
function winningPrices(){ // solve the equal per-pool price that yields a small, believable positive net at the CURRENT N/V/L/gas/fee — so a win exists at ANY hop count (slippage grows with N, so this needs a bigger edge for more hops: the honest cost of multi-hop)
  const V=+$("V").value,L=+$("L").value,gas=+$("g").value,feeR=+$("f").value/100;
  const targetNet=V*0.005; // aim ~ +0.5% of V, net of fee and gas
  let lo=1,hi=1.6; // product multiplier bounds; per-price = mid^(1/N)
  for(let i=0;i<44;i++){const mid=(lo+hi)/2,per=Math.pow(mid,1/HOPS);
    let amt=V;for(let k=0;k<HOPS;k++)amt=amountOut(amt,L,L*per);
    const gross=amt-V,fee=gross>0?gross*feeR:0,net=gross-fee-gas;
    if(net<targetNet)lo=mid;else hi=mid;}
  return Array(HOPS).fill(Math.min(1.10,Math.max(0.90,Math.pow((lo+hi)/2,1/HOPS))));
}
function fairPrices(){return Array(HOPS).fill(1);}
function randomPrices(){return Array.from({length:HOPS},()=>Math.max(0.9,Math.min(1.1,1+gauss()*0.012)));}
function applyPreset(p){preset=p;PRICES = p==="win"?winningPrices():p==="fair"?fairPrices():randomPrices();
  ["pWin","pFair","pRand"].forEach(id=>$(id).classList.toggle("on",$(id).dataset.preset===p));}

/* N-gon mark */
function angle(k){return -Math.PI/2 + k*2*Math.PI/HOPS;}
function priceToDist(pr){return REST+(pr-1)*140;}
function nodePos(k){const d=priceToDist(PRICES[k]),ang=angle(k);return[CX+Math.cos(ang)*d,CY+Math.sin(ang)*d];}
function bez(p0,pc,p1,t){const u=1-t;return[u*u*p0[0]+2*u*t*pc[0]+t*t*p1[0],u*u*p0[1]+2*u*t*pc[1]+t*t*p1[1]];}
function ctrl(p0,p1){const m=[(p0[0]+p1[0])/2,(p0[1]+p1[1])/2];return[m[0]+(m[0]-CX)*0.5,m[1]+(m[1]-CY)*0.5];}
function arcOf(k){const A=nodePos(k),B=nodePos((k+1)%HOPS),c=ctrl(A,B);return{A,B,c,d:`M${A[0]} ${A[1]} Q${c[0]} ${c[1]} ${B[0]} ${B[1]}`};}
function buildMark(){
  const tk=tokens();
  $("arcs").innerHTML=Array.from({length:HOPS},(_,k)=>`<path class="arc flow" id="arc${k}"/>`).join("");
  $("nodes").innerHTML=tk.map((t,k)=>`<g class="nodeg" data-k="${k}"><circle class="node-ring" r="12"/>`+
    `<circle class="node" r="8" fill="${PAL[k%PAL.length]}" tabindex="0" role="slider" aria-label="${t} pool price" aria-valuemin="0.90" aria-valuemax="1.10" aria-valuenow="1"></circle>`+
    `<text class="tokl" text-anchor="middle">${t}</text></g>`).join("");
  document.querySelectorAll(".nodeg").forEach(g=>{const k=+g.dataset.k,circle=g.querySelector(".node");
    circle.addEventListener("pointerdown",e=>startDrag(e,g,k));
    circle.addEventListener("keydown",e=>{const st=e.shiftKey?0.01:0.002;
      if(e.key==="ArrowRight"||e.key==="ArrowUp"){setPrice(k,PRICES[k]+st);e.preventDefault();}
      if(e.key==="ArrowLeft"||e.key==="ArrowDown"){setPrice(k,PRICES[k]-st);e.preventDefault();}});});
  $("cap").textContent=tk.join(" → ")+" → "+STABLE+" · example pools on "+CHAINS[CH].name+" ("+CHAINS[CH].router+")";
  drawMark();
}
function startDrag(e,g,k){e.preventDefault();g.classList.add("dragging");const svg=$("run").closest(".markwrap").querySelector("svg");
  const ang=angle(k),ux=Math.cos(ang),uy=Math.sin(ang);
  const move=ev=>{const pt=svgPoint(svg,ev);let d=(pt[0]-CX)*ux+(pt[1]-CY)*uy;d=Math.max(24,Math.min(52,d));setPrice(k,1+(d-REST)/140);};
  const up=()=>{g.classList.remove("dragging");document.removeEventListener("pointermove",move);document.removeEventListener("pointerup",up);};
  document.addEventListener("pointermove",move);document.addEventListener("pointerup",up);}
function svgPoint(svg,e){const pt=svg.createSVGPoint();pt.x=e.clientX;pt.y=e.clientY;const p=pt.matrixTransform(svg.getScreenCTM().inverse());return[p.x,p.y];}
function setPrice(k,pr){PRICES[k]=Math.max(0.90,Math.min(1.10,pr));preset="custom";["pWin","pFair","pRand"].forEach(id=>$(id).classList.remove("on"));sound("drag");refresh(false);}
function drawMark(){
  for(let k=0;k<HOPS;k++){$("arc"+k).setAttribute("d",arcOf(k).d);}
  document.querySelectorAll(".nodeg").forEach(g=>{const k=+g.dataset.k,[x,y]=nodePos(k);g.setAttribute("transform",`translate(${x} ${y})`);
    const ang=angle(k);g.querySelector(".tokl").setAttribute("x",Math.cos(ang)*15);g.querySelector(".tokl").setAttribute("y",Math.sin(ang)*15+3);
    g.querySelector(".node").setAttribute("aria-valuenow",PRICES[k].toFixed(4));});
}
/* refresh + verdict */
function refresh(fromRun){
  const s=state(),r=compute(s);const tk=tokens();
  $("vV").textContent=s.V.toLocaleString("en-US");$("vL").textContent=s.L.toLocaleString("en-US");$("vg").textContent=s.gas.toFixed(2);$("vf").textContent=(s.feeR*100).toFixed(0)+"%";
  $("wallLbl").firstChild.textContent=`Fee wall (0.997^${HOPS}) `;$("oWall").textContent=Math.pow(FEE,HOPS).toFixed(4);
  $("backLbl").textContent=STABLE;
  $("oProd").textContent=r.prod.toFixed(4);$("oBack").textContent=fmt(r.a)+" "+STABLE;
  $("oGross").textContent=(r.gross>=0?"+":"")+fmt(r.gross)+" "+STABLE;$("oFee").textContent="−"+fmt(r.fee)+" "+STABLE;$("oGas").textContent="−"+fmt(s.gas)+" "+STABLE;
  $("oNet").textContent=(r.net>=0?"+":"")+fmt(r.net)+" "+STABLE;$("oNet").style.color=r.net>0?"var(--verde)":(r.net<0?"var(--lacre)":"var(--grafite)");
  drawMark();if(!fromRun)setVerdict(r);return r;
}
function setVerdict(r){const vd=$("verdict");
  if(r.reverts){vd.className="verdict v-revert";vd.textContent="Reverts · you pay gas, get nothing";
    $("explain").textContent="The cycle doesn't return the principal, so the on-chain condition fails and the whole transaction reverts. Your principal is intact — you only paid gas. The most common outcome.";}
  else if(r.net>0){vd.className="verdict v-profit";vd.innerHTML="Profit after fees + gas <span class='rare'>RARE</span>";
    $("explain").textContent="A win exists — and adding hops raises the fee wall (0.997^N). In a real block a searcher likely takes it first. The exception, not the expectation.";}
  else{vd.className="verdict v-loss";vd.textContent="Settles, but net negative";
    $("explain").textContent="It returns more than principal, so it wouldn't revert on a zero floor — but after gas and the fee you end up behind.";}
}
/* run animation */
let runGen=0;
function run(sample){const gen=++runGen;const r=refresh(true);const dot=$("dot"),base=6; // ++runGen supersedes any in-flight run (rapid preset clicks resolve to the LAST one)
  const radius=amt=>base*Math.max(0.28,Math.sqrt(Math.max(amt,0)/r.amts[0]));
  if(reduce){finish(r,sample);return;}
  $("run").disabled=true;dot.style.opacity=1;sound("whoosh");let hop=0;
  (function anim(){const ad=arcOf(hop);const r0=radius(r.amts[hop]),r1=radius(r.amts[hop+1]);const dur=Math.max(240,340-HOPS*20);let t0=null;
    function frame(ts){if(gen!==runGen)return; // a newer run took over — abort this one silently
      if(!t0)t0=ts;const t=Math.min(1,(ts-t0)/dur);const p=bez(ad.A,ad.c,ad.B,t);dot.setAttribute("cx",p[0]);dot.setAttribute("cy",p[1]);dot.setAttribute("r",r0+(r1-r0)*t);
      if(t<1)requestAnimationFrame(frame);else{sound("hop");hop++;if(hop<HOPS)anim();else{if(gen!==runGen)return;dot.style.opacity=0;finish(r,sample);$("run").disabled=false;}}}
    requestAnimationFrame(frame);})();
}
function finish(r,sample){setVerdict(r);sound(r.reverts?"revert":(r.net>0?"profit":"neg"));
  if(sample){N++;if(r.net>0)WINS++;const pct=N?Math.round(WINS/N*100):0;$("tN").textContent=N;$("tWin").textContent=WINS;$("tPct").textContent=pct+"%";$("tBar").style.width=pct+"%";}
}
/* tooltips */
const TIPS={product:"Every pool price multiplied. It must beat 1/0.997^N (the fee wall for N hops) to break even — before slippage and gas.",
 feewall:"Each hop charges 0.3%. N hops compound to 0.997^N — more hops means a taller wall to beat, not more chances.",
 back:"What you'd hold in your stablecoin after the whole cycle. Below your input means a loss.",
 gross:"Back minus what you put in, before fee and gas.",fee:"A cut of profit only (never your principal), capped at half.",
 gas:"Paid on every attempt — including the ones that revert. Higher on BSC, lower on Arbitrum.",
 net:"What you actually keep. On a revert you lose only gas; principal is returned. Red means behind.",
 volume:"How much you commit per cycle. Bigger means more slippage.",depth:"How deep the pool is. Deeper means less slippage.",
 comp:"How much of every edge the searchers and the priority-fee auction take. 0% is you alone (the pure math); ~85% is the documented reality — and it decides your long run."};
let tipOpen=null;function closeTip(){$("tipPop").classList.remove("on");if(tipOpen)tipOpen.setAttribute("aria-expanded","false");tipOpen=null;}
function openTip(btn){const pop=$("tipPop");if(tipOpen===btn){closeTip();return;}pop.textContent=TIPS[btn.dataset.tip]||"";pop.classList.add("on");
  const rc=btn.getBoundingClientRect();pop.style.left="0";pop.style.top="0";const pw=pop.offsetWidth;let x=rc.left;if(x+pw>window.innerWidth-10)x=window.innerWidth-pw-10;
  pop.style.left=Math.max(10,x)+"px";pop.style.top=(rc.bottom+8)+"px";btn.setAttribute("aria-expanded","true");tipOpen=btn;}
function wireTips(){document.querySelectorAll(".tip").forEach(b=>{b.setAttribute("aria-expanded","false");
  b.addEventListener("click",e=>{e.stopPropagation();openTip(b);});b.addEventListener("focus",()=>openTip(b));});}
document.addEventListener("click",closeTip);document.addEventListener("keydown",e=>{if(e.key==="Escape")closeTip();});
/* sound */
let AC=null,muted=localStorage.getItem("triviu-mute")==="1",lastDrag=0;
function updateMuteBtn(){const spk=`<svg class="bic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"/>`;
  $("mute").innerHTML=muted?spk+`<line x1="16" y1="9" x2="21" y2="15"/><line x1="21" y1="9" x2="16" y2="15"/></svg>Muted`:spk+`<path d="M16.5 8.5a5 5 0 0 1 0 7"/></svg>Sound`;$("mute").setAttribute("aria-pressed",String(muted));}
function sound(name){if(muted||reduce)return;if(name==="drag"){const now=performance.now();if(now-lastDrag<30)return;lastDrag=now;}
  try{AC=AC||new (window.AudioContext||window.webkitAudioContext)();}catch(e){return;}if(AC.state==="suspended")AC.resume();
  const t=AC.currentTime,master=AC.createGain();master.gain.value=0.5;const lp=AC.createBiquadFilter();lp.type="lowpass";lp.frequency.value=4000;lp.Q.value=0.7;master.connect(lp);lp.connect(AC.destination);
  const tone=(ty,f0,f1,peak,a,d,s,r,at)=>{const o=AC.createOscillator(),g=AC.createGain();o.type=ty;o.frequency.setValueAtTime(f0,at);if(f1!==f0)o.frequency.linearRampToValueAtTime(f1,at+(a+d+r)/1000);
    g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(peak,at+a/1000);g.gain.linearRampToValueAtTime(peak*s,at+(a+d)/1000);g.gain.linearRampToValueAtTime(0,at+(a+d+r)/1000);o.connect(g);g.connect(master);o.start(at);o.stop(at+(a+d+r)/1000+0.02);};
  if(name==="drag")tone("sine",880,880,0.035,1,8,0,20,t);else if(name==="whoosh")tone("triangle",200,560,0.06,30,150,0.2,200,t);
  else if(name==="hop")tone("sine",520,520,0.03,1,40,0,40,t);else if(name==="profit"){tone("sine",528,528,0.07,5,120,0.3,240,t);tone("sine",660,660,0.07,5,120,0.3,240,t+0.12);}
  else if(name==="revert")tone("sine",130,92,0.08,2,90,0,180,t);else if(name==="neg")tone("sine",300,300,0.05,5,60,0.2,160,t);}
/* long run */
function clampP(p){return Math.max(0.9,Math.min(1.1,p));}
function project(){const s=state();const cap=Math.max(10,+$("lrCap").value||1000),pd=Math.max(1,+$("lrPd").value||1),days=Math.max(1,+$("lrDays").value||1);
  let Nc=Math.round(pd*days);Nc=Math.max(1,Math.min(1500,Nc));
  const comp=Math.max(0,Math.min(1,(+$("lrComp").value||0)/100)),pWin=1-comp,keep=1-comp;
  const TR=150,SAMP=60,step=Math.max(1,Math.floor(Nc/SAMP));const idx=[];for(let i=0;i<=Nc;i+=step)idx.push(i);if(idx[idx.length-1]!==Nc)idx.push(Nc);
  const bal=new Array(TR).fill(cap),rec=idx.map(()=>new Float64Array(TR));let si=0;
  for(let c=0;c<=Nc;c++){if(idx[si]===c){for(let t=0;t<TR;t++)rec[si][t]=bal[t];si++;}if(c===Nc)break;
    for(let t=0;t<TR;t++){if(bal[t]<=s.gas)continue;const V=Math.min(s.V,bal[t]);
      const mk={V,L:s.L,gas:s.gas,feeR:s.feeR,prices:Array.from({length:HOPS},()=>clampP(1+gauss()*0.012))};const r=compute(mk);let ch;
      if(r.reverts)ch=-s.gas;else if(Math.random()<pWin){const kept=(r.a-mk.V)*keep;ch=kept-(kept>0?kept*s.feeR:0)-s.gas;}else ch=-s.gas;
      bal[t]=Math.max(0,bal[t]+ch);}}
  const mean=[],p10=[],p90=[];for(let i=0;i<rec.length;i++){const a=Array.from(rec[i]).sort((x,y)=>x-y);mean.push(a.reduce((s2,v)=>s2+v,0)/TR);p10.push(a[Math.floor(0.1*TR)]);p90.push(a[Math.floor(0.9*TR)]);}
  const ahead=Array.from(bal).filter(v=>v>cap).length,pah=Math.round(ahead/TR*100),finalMean=mean[mean.length-1],pct=(finalMean-cap)/cap*100;
  drawLR(idx,mean,p10,p90,cap,Nc);
  $("lrBal").innerHTML=`Expected balance after ${Nc.toLocaleString("en-US")} cycles: <span class="${finalMean<cap?'bal-abaixo':'bal-acima'}">${fmt(finalMean)} ${STABLE}</span> (${pct>=0?'+':''}${pct.toFixed(1)}%)`;
  $("lrPah").textContent=`Chance you end ahead: ${pah}% — and it falls the longer you go.`;
}
function drawLR(idx,mean,p10,p90,cap,Nc){const W=480,H=220,pl=8,pr=8,pt=14,pb=22,iw=W-pl-pr,ih=H-pt-pb;
  const all=p10.concat(p90).concat([cap]);let lo=Math.min(...all),hi=Math.max(...all);const pad=(hi-lo)*0.12||cap*0.1;lo-=pad;hi+=pad;lo=Math.max(0,lo);
  const X=i=>pl+iw*(idx[i]/Nc),Y=v=>pt+ih*(1-(v-lo)/(hi-lo));const path=arr=>arr.map((v,i)=>`${i?'L':'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(" ");
  const band=p90.map((v,i)=>`${i?'L':'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(" ")+" "+p10.slice().reverse().map((v,i)=>`L${X(p10.length-1-i).toFixed(1)} ${Y(v).toFixed(1)}`).join(" ")+" Z";const y0=Y(cap);
  $("lrchart").innerHTML=`<path d="${band}" fill="var(--acafrao)" opacity="0.14"/><line x1="${pl}" y1="${y0.toFixed(1)}" x2="${W-pr}" y2="${y0.toFixed(1)}" stroke="var(--grafite)" stroke-width="1" stroke-dasharray="3 3"/>`+
    `<text x="${W-pr}" y="${(y0-4).toFixed(1)}" text-anchor="end" font-family="var(--fm)" font-size="9" fill="var(--grafite)">start ${fmt(cap,0)}</text>`+
    `<path d="${path(p90)}" fill="none" stroke="var(--acafrao)" stroke-width="0.8" opacity="0.6"/><path d="${path(p10)}" fill="none" stroke="var(--grafite)" stroke-width="0.8" opacity="0.4"/>`+
    `<path d="${path(mean)}" fill="none" stroke="${mean[mean.length-1]<cap?'var(--lacre)':'var(--tinta)'}" stroke-width="2.4"/>`+
    `<text x="${pl}" y="${H-6}" font-family="var(--fm)" font-size="9" fill="var(--grafite)">0</text><text x="${W-pr}" y="${H-6}" text-anchor="end" font-family="var(--fm)" font-size="9" fill="var(--grafite)">${Nc.toLocaleString('en-US')} cycles · expected + luck band</text>`;
}
function gauss(){let u=0,v=0;while(u===0)u=Math.random();while(v===0)v=Math.random();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}
/* selectors + init */
function fillSelect(el,arr,val){el.innerHTML=arr.map(o=>`<option value="${o.v||o}"${(o.v||o)===val?" selected":""}>${o.t||o}</option>`).join("");}
function onChainChange(){CH=$("chain").value;const st=CHAINS[CH].stables;if(!st.includes(STABLE))STABLE=st[0];$("g").value=CHAINS[CH].gas;
  fillSelect($("stable"),st,STABLE);applyPreset(preset==="custom"?"win":preset);buildMark();wireTips();refresh(false);project();}
function rebuild(){applyPreset(preset==="custom"?"win":preset);buildMark();wireTips();refresh(false);project();}
["V","L","g","f"].forEach(id=>$(id).addEventListener("input",()=>refresh(false)));
$("run").addEventListener("click",()=>run(false));
["pWin","pFair","pRand"].forEach(id=>$(id).addEventListener("click",()=>{applyPreset($(id).dataset.preset);run($(id).dataset.preset==="rand");}));
$("mute").addEventListener("click",()=>{muted=!muted;localStorage.setItem("triviu-mute",muted?"1":"0");updateMuteBtn();});
$("chain").addEventListener("change",onChainChange);
$("stable").addEventListener("change",()=>{STABLE=$("stable").value;buildMark();wireTips();refresh(false);project();});
$("hops").addEventListener("change",()=>{HOPS=+$("hops").value;rebuild();});
$("project").addEventListener("click",project);
$("lrComp").addEventListener("input",()=>{$("lrCv").textContent=$("lrComp").value+"%";});
$("lrComp").addEventListener("change",project);
fillSelect($("chain"),Object.keys(CHAINS).map(k=>({v:k,t:CHAINS[k].name})),CH);
fillSelect($("stable"),CHAINS[CH].stables,STABLE);
applyPreset("win");buildMark();wireTips();updateMuteBtn();refresh(false);project();
