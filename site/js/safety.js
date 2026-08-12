
const RPC="https://polygon.drpc.org";
const SEL="4c1dc25a";
const ROUTER="0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff";
const QFAC="0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32";
const WMATIC="0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270";
const CHK="0x00000000000000000000000000000000DeaDBeef";
const CODE="0x608060405260043610610020575f3560e01c80634c1dc25a1461002b575f80fd5b3661002757005b5f80fd5b61003e610039366004610309565b610064565b604080519485526020850193909352918301521515606082015260800160405180910390f35b6040516370a0823160e01b815230600482015234905f908190819081906001600160a01b038b16906370a0823190602401602060405180830381865afa1580156100b0573d5f803e3d5ffd5b505050506040513d601f19601f820116820180604052508101906100d49190610394565b90508a6001600160a01b031663b6f9de95345f8c8c30426040518763ffffffff1660e01b815260040161010b9594939291906103f0565b5f604051808303818588803b158015610122575f80fd5b505af1158015610134573d5f803e3d5ffd5b50506040516370a0823160e01b81523060048201528493506001600160a01b038e1692506370a082319150602401602060405180830381865afa15801561017d573d5f803e3d5ffd5b505050506040513d601f19601f820116820180604052508101906101a19190610394565b6101ab9190610426565b60405163095ea7b360e01b81526001600160a01b038d8116600483015260248201839052919550908b169063095ea7b3906044016020604051808303815f875af11580156101fb573d5f803e3d5ffd5b505050506040513d601f19601f8201168201806040525081019061021f919061044b565b5060405163791ac94760e01b815247906001600160a01b038d169063791ac947906102589088905f908d908d9030904290600401610471565b5f604051808303815f87803b15801561026f575f80fd5b505af1158015610281573d5f803e3d5ffd5b5050505080476102919190610426565b93506001925050509650965096509692505050565b80356001600160a01b03811681146102bc575f80fd5b919050565b5f8083601f8401126102d1575f80fd5b50813567ffffffffffffffff8111156102e8575f80fd5b6020830191508360208260051b8501011115610302575f80fd5b9250929050565b5f805f805f806080878903121561031e575f80fd5b610327876102a6565b9550610335602088016102a6565b9450604087013567ffffffffffffffff80821115610351575f80fd5b61035d8a838b016102c1565b90965094506060890135915080821115610375575f80fd5b5061038289828a016102c1565b979a9699509497509295939492505050565b5f602082840312156103a4575f80fd5b5051919050565b8183525f60208085019450825f5b858110156103e5576001600160a01b036103d2836102a6565b16875295820195908201906001016103b9565b509495945050505050565b858152608060208201525f6104096080830186886103ab565b6001600160a01b0394909416604083015250606001529392505050565b8181038181111561044557634e487b7160e01b5f52601160045260245ffd5b92915050565b5f6020828403121561045b575f80fd5b8151801515811461046a575f80fd5b9392505050565b86815285602082015260a060408201525f61049060a0830186886103ab565b6001600160a01b03949094166060830152506080015294935050505056fea2646970667358221220b6a1bb6933f8ff0183d80e493648167ffd5fb433b8d753ec2734951b034651a164736f6c63430008180033";
// Quote tokens we can price + route through: addr -> [usdPrice, decimals]
const QUOTES={
  "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270":[0.2,18], // WMATIC
  "0x2791bca1f2de4661ed88a30c99a7a9449aa84174":[1,6],    // USDC.e
  "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359":[1,6],    // USDC
  "0xc2132d05d31c914a87c6611c10748aeb04b58e8f":[1,6],    // USDT
  "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619":[1900,18],// WETH
  "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063":[1,18],   // DAI
};
let rid=0;
const rpc=(m,p)=>fetch(RPC,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:++rid,method:m,params:p})}).then(r=>r.json());
const word=a=>a.replace("0x","").toLowerCase().padStart(64,"0");
const ec=(to,data)=>rpc("eth_call",[{to,data},"latest"]).then(r=>r.result||"0x");
const isAddr=a=>/^0x[0-9a-fA-F]{40}$/.test(a);
const nonZero=w=>w&&w!=="0x"&&!/^0x0+$/.test(w);

function encodePath(path){ let o=word("0x"+path.length.toString(16)); for(const a of path)o+=word(a); return o; }
function encodeCheck(router,token,buyPath,sellPath){
  const buyEnc=encodePath(buyPath);
  const offBuy=128, offSell=128+buyEnc.length/2;
  return "0x"+SEL+word(router)+word(token)+word("0x"+offBuy.toString(16))+word("0x"+offSell.toString(16))+buyEnc+encodePath(sellPath);
}

async function check(token){
  // 1. find the token's deepest quote pool on QuickSwap
  let best=null;
  for(const [q,[price,dec]] of Object.entries(QUOTES)){
    if(q===token) continue;
    const pr=await ec(QFAC,"0xe6a43905"+word(token)+word(q));
    const pair="0x"+pr.slice(26);
    if(!nonZero(pr)||/^0x0+$/.test(pair)) continue;
    const bal=await ec(q,"0x70a08231"+word(pair));
    const liqUSD=Number(BigInt(bal))/10**dec*price;
    if(!best||liqUSD>best.liqUSD) best={quote:q,pair,liqUSD};
  }
  if(!best) return {verdict:"unknown", reason:"No pool found against a known quote token (WMATIC/USDC/USDT/WETH/DAI) on QuickSwap."};
  // 2. build the route: native → WMATIC → [quote] → token, and back
  const q=best.quote;
  const buyPath = q===WMATIC ? [WMATIC,token] : [WMATIC,q,token];
  const sellPath = q===WMATIC ? [token,WMATIC] : [token,q,WMATIC];
  // 3. buy → sell simulation via state override (no transaction sent)
  const v=5n*10n**17n;
  const sim=await rpc("eth_call",[{from:CHK,to:CHK,data:encodeCheck(ROUTER,token,buyPath,sellPath),value:"0x"+v.toString(16)},"latest",{[CHK]:{code:CODE,balance:"0x"+(v*4n).toString(16)}}]);
  let sellable=false, recovery=0;
  if(!sim.error && sim.result && sim.result.length>=194){
    const w=i=>BigInt("0x"+sim.result.slice(2+i*64,2+(i+1)*64));
    sellable=true; recovery=w(0)>0n?Number(w(2)*10000n/w(0))/100:0;
  }
  // 4. contract red-flags (heuristic: selector present in bytecode + live owner)
  const bc=((await rpc("eth_getCode",[token,"latest"])).result||"0x").toLowerCase();
  const flags=[];
  if(bc.includes("40c10f19"))flags.push("mint");
  if(bc.includes("8456cb59"))flags.push("pause");
  if(bc.includes("f9f92be4")||bc.includes("fe575a87"))flags.push("blacklist");
  const ow=await rpc("eth_call",[{to:token,data:"0x8da5cb5b"},"latest"]);
  if(!ow.error && ow.result && ow.result.length>=66){ const owner="0x"+ow.result.slice(26); if(!/^0x0+$/.test(owner)) flags.push("owner-active"); }
  // 5. transfer TAX = how much worse than the route's fee-only cost. This removes the
  // route-length bias: a 2-hop route naturally loses more to fees than a 1-hop one.
  const swaps=(buyPath.length-1)+(sellPath.length-1);
  const expected=Math.pow(0.997,swaps)*100;
  const tax=sellable?Math.max(0,expected-recovery):0;
  // 6. risk score 0–100
  const liqUSD=best.liqUSD; let score;
  if(!sellable){ score=0; }
  else{
    score=100; score-=Math.round(tax*3);
    if(liqUSD<2000)score-=20; else if(liqUSD<10000)score-=10;
    if(flags.includes("owner-active"))score-=12;
    if(flags.includes("mint"))score-=12;
    if(flags.includes("pause"))score-=10;
    if(flags.includes("blacklist"))score-=15;
    score=Math.max(0,Math.min(100,score));
  }
  // 7. verdict from the score
  let verdict, reason;
  if(!sellable){ verdict="trap"; reason="You can buy this token but the SELL reverts — a classic honeypot. Do not buy."; }
  else if(score<45){ verdict="trap"; reason=`Risk ${score}/100 — red flags stack up${flags.length?" ("+flags.join(", ")+")":""}. Treat as unsafe.`; }
  else if(score<75){ verdict="caution"; reason=`Risk ${score}/100 — sellable, but ${flags.length?flags.join(", ")+"; ":""}${tax>1?"~"+tax.toFixed(1)+"% transfer tax; ":""}${liqUSD<10000?"thin liquidity; ":""}size down.`; }
  else{ verdict="safe"; reason=`Risk ${score}/100 — buy and sell both work, only ~${tax.toFixed(1)}% tax over normal fees, no major red flags.`; }
  return {verdict, reason, pair:best.pair, liqUSD, sellable, recovery, tax, score, flags};
}

const ICON={
  safe:'<svg viewBox="0 0 24 24" fill="none" stroke="var(--verde)" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>',
  caution:'<svg viewBox="0 0 24 24" fill="none" stroke="var(--acafrao-texto)" stroke-width="2"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>',
  trap:'<svg viewBox="0 0 24 24" fill="none" stroke="var(--lacre)" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>',
  unknown:'<svg viewBox="0 0 24 24" fill="none" stroke="var(--grafite)" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01"/></svg>'};
const TITLE={safe:"SAFE to sell",caution:"CAUTION",trap:"TRAP — do not buy",unknown:"Can't check"};

const $=id=>document.getElementById(id);
async function run(){
  const token=$("addr").value.trim().toLowerCase();
  if(!isAddr(token)){ $("addr").focus(); $("addr").style.borderColor="var(--lacre)"; return; }
  $("addr").style.borderColor="";
  $("go").disabled=true; $("go").innerHTML='<span class="spin"></span>';
  $("card").classList.add("show");
  $("verdict").className="verdict"; $("vicon").innerHTML=ICON.unknown; $("vt").textContent="Checking…"; $("vs").textContent="Simulating a buy and a sell on-chain."; $("checks").innerHTML="";
  try{
    const r=await check(token);
    $("verdict").className="verdict v-"+r.verdict;
    $("vicon").innerHTML=ICON[r.verdict]; $("vt").textContent=TITLE[r.verdict]; $("vs").textContent=r.reason;
    const rows=[["Token",`<a href="https://polygonscan.com/token/${token}" target="_blank" rel="noreferrer">${token.slice(0,10)}…${token.slice(-6)}</a>`]];
    if(r.pair){
      if(r.score!==undefined) rows.push(["Risk score", `<b>${r.score} / 100</b>`]);
      rows.push(["Sell works?", r.sellable?"yes — sell did not revert":"NO — sell reverts (honeypot)"]);
      rows.push(["Transfer tax", r.sellable?(r.tax<0.5?"none (~0%)":"~"+r.tax.toFixed(1)+"%"):"—"]);
      rows.push(["Contract flags", r.flags&&r.flags.length?r.flags.join(" · "):"none detected"]);
      rows.push(["Liquidity", "≈ $"+Math.round(r.liqUSD).toLocaleString()]);
    }
    $("checks").innerHTML=rows.map(([k,v])=>`<div class="chk"><span class="k">${k}</span><span class="v">${v}</span></div>`).join("");
  }catch(e){
    $("verdict").className="verdict"; $("vicon").innerHTML=ICON.unknown; $("vt").textContent="Check failed"; $("vs").textContent="Couldn't reach the chain. Try again.";
  }
  $("go").disabled=false; $("go").textContent="Check";
}
$("go").addEventListener("click",run);
$("addr").addEventListener("keydown",e=>{if(e.key==="Enter")run();});
document.querySelectorAll("[data-fill]").forEach(a=>a.addEventListener("click",()=>{$("addr").value=a.dataset.fill;run();}));

const SUN='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const MOON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
function curTheme(){const s=localStorage.getItem("triviu-theme");if(s)return s;return window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}
function applyTheme(t){document.documentElement.setAttribute("data-theme",t);const b=$("theme");if(b)b.innerHTML=t==="dark"?SUN:MOON;}
applyTheme(curTheme());
$("theme").addEventListener("click",function(){const n=document.documentElement.getAttribute("data-theme")==="dark"?"light":"dark";localStorage.setItem("triviu-theme",n);applyTheme(n);});
