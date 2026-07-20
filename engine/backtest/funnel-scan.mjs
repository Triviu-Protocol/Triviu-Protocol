import { readFileSync } from "node:fs";
const RPC="https://polygon.drpc.org";
const j=JSON.parse(readFileSync("./out/HoneypotChecker.sol/HoneypotChecker.json","utf8"));
const CODE=j.deployedBytecode.object, SEL=j.methodIdentifiers["check(address,address)"];
const ROUTER="0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff",CHK="0x00000000000000000000000000000000DeaDBeef";
const QFAC="0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32",SFAC="0xc35DADB65012eC5796536bD9864eD8773aBc74C4",V3FAC="0x1F98431c8aD98523631AE4a59f267346ea31F984";
const WMATIC="0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270";
const Q={[WMATIC]:[0.2,18],"0x2791bca1f2de4661ed88a30c99a7a9449aa84174":[1,6],"0x3c499c542cef5e3811e1192ce70d8cc03d5c3359":[1,6],"0xc2132d05d31c914a87c6611c10748aeb04b58e8f":[1,6],"0x7ceb23fd6bc0add59e62ac25578270cff1b9f619":[1900,18],"0x8f3cf7ad23cd3cadbd9735aff958023239c6a063":[1,18]};
const p32=a=>a.replace("0x","").toLowerCase().padStart(64,"0"),padA=a=>"000000000000000000000000"+a.replace("0x","").toLowerCase(),addr=w=>"0x"+w.slice(26);
let id=0;const rpc=(m,p)=>fetch(RPC,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:++id,method:m,params:p})}).then(r=>r.json());
const ec=(to,data)=>rpc("eth_call",[{to,data},"latest"]).then(r=>r.result||"0x").catch(()=>"0x");
async function honeypot(token){const v=5n*10n**17n;const r=await rpc("eth_call",[{from:CHK,to:CHK,data:"0x"+SEL+p32(ROUTER)+p32(token),value:"0x"+v.toString(16)},"latest",{[CHK]:{code:CODE,balance:"0x"+(v*4n).toString(16)}}]);if(r.error)return false;const w=i=>BigInt("0x"+r.result.slice(2+i*64,2+(i+1)*64));return w(0)>0n && Number(w(2)*10000n/w(0))/100>=90;}
async function venuesFor(token,quote){
  let n=0;
  const qp=await ec(QFAC,"0xe6a43905"+padA(token)+padA(quote)); if(qp!=="0x"&&qp.slice(26)!=="0".repeat(40))n++;
  const sp=await ec(SFAC,"0xe6a43905"+padA(token)+padA(quote)); if(sp!=="0x"&&sp.slice(26)!=="0".repeat(40))n++;
  for(const fee of [100,500,3000]){const p=await ec(V3FAC,"0x1698ee82"+padA(token)+padA(quote)+p32("0x"+fee.toString(16)));if(p!=="0x"&&p.slice(26)!=="0".repeat(40))n++;}
  return n;
}
const L=BigInt(await ec(QFAC,"0x574f2ba3"));
let nNew=0,nLiq=0,nSafe=0,nMulti=0; const safeMulti=[];
for(let k=0;k<400 && nSafe<25;k++){
  const pair=addr(await ec(QFAC,"0x1e3dd18b"+p32("0x"+(L-1n-BigInt(k)).toString(16))));
  const t0=addr(await ec(pair,"0x0dfe1681")).toLowerCase(),t1=addr(await ec(pair,"0xd21220a7")).toLowerCase();
  const q0=Q[t0],q1=Q[t1]; if(!q0&&!q1)continue; nNew++;
  const rd=await ec(pair,"0x0902f1ac"); if(rd.length<130)continue;
  const r0=BigInt("0x"+rd.slice(2,66)),r1=BigInt("0x"+rd.slice(66,130));
  const [price,dec]=q0?q0:q1; const liq=Number(q0?r0:r1)/10**dec*price; if(liq<500)continue; nLiq++;
  const token=q0?t1:t0, quote=q0?t0:t1;
  if(!(await honeypot(token)))continue; nSafe++;
  const v=await venuesFor(token,quote);
  if(v>=2){nMulti++;safeMulti.push({token,venues:v,liq:Math.round(liq)});}
}
console.log(`\n=== FUNIL (arb atomico na cesta SAFE) ===`);
console.log(`novos (com quote)      : ${nNew}`);
console.log(`+ liquidez >= $500     : ${nLiq}`);
console.log(`+ SAFE (honeypot-sim)  : ${nSafe}`);
console.log(`+ em >=2 venues (arb!) : ${nMulti}`);
if(safeMulti.length)safeMulti.forEach(s=>console.log(`   ${s.token} · ${s.venues} venues · $${s.liq}`));
console.log(`\nVeredito: arb ATOMICO precisa do token em >=2 venues. ${nMulti} de ${nSafe} SAFE qualificam.`);
