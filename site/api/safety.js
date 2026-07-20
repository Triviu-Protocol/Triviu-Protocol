// Triviu · public token-safety API — GET /api/safety?token=0x…
//
// The same check the /safety page runs, as a JSON endpoint anyone can integrate.
// It simulates a real buy → sell round trip on-chain via an eth_call state-override
// (never sends a transaction, moves no funds), plus contract red-flags, and returns
// a 0–100 risk score with a verdict. A heuristic screen, not a guarantee.
//
// Response: { verdict, score, sellable, tax, liquidityUsd, flags, quote, reason }

const RPC = process.env.SAFETY_RPC || "https://polygon.drpc.org";
const SEL = "4c1dc25a";
const ROUTER = "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff";
const QFAC = "0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32";
const WMATIC = "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270";
const CHK = "0x00000000000000000000000000000000DeaDBeef";
const CODE = "0x608060405260043610610020575f3560e01c80634c1dc25a1461002b575f80fd5b3661002757005b5f80fd5b61003e610039366004610309565b610064565b604080519485526020850193909352918301521515606082015260800160405180910390f35b6040516370a0823160e01b815230600482015234905f908190819081906001600160a01b038b16906370a0823190602401602060405180830381865afa1580156100b0573d5f803e3d5ffd5b505050506040513d601f19601f820116820180604052508101906100d49190610394565b90508a6001600160a01b031663b6f9de95345f8c8c30426040518763ffffffff1660e01b815260040161010b9594939291906103f0565b5f604051808303818588803b158015610122575f80fd5b505af1158015610134573d5f803e3d5ffd5b50506040516370a0823160e01b81523060048201528493506001600160a01b038e1692506370a082319150602401602060405180830381865afa15801561017d573d5f803e3d5ffd5b505050506040513d601f19601f820116820180604052508101906101a19190610394565b6101ab9190610426565b60405163095ea7b360e01b81526001600160a01b038d8116600483015260248201839052919550908b169063095ea7b3906044016020604051808303815f875af11580156101fb573d5f803e3d5ffd5b505050506040513d601f19601f8201168201806040525081019061021f919061044b565b5060405163791ac94760e01b815247906001600160a01b038d169063791ac947906102589088905f908d908d9030904290600401610471565b5f604051808303815f87803b15801561026f575f80fd5b505af1158015610281573d5f803e3d5ffd5b5050505080476102919190610426565b93506001925050509650965096509692505050565b80356001600160a01b03811681146102bc575f80fd5b919050565b5f8083601f8401126102d1575f80fd5b50813567ffffffffffffffff8111156102e8575f80fd5b6020830191508360208260051b8501011115610302575f80fd5b9250929050565b5f805f805f806080878903121561031e575f80fd5b610327876102a6565b9550610335602088016102a6565b9450604087013567ffffffffffffffff80821115610351575f80fd5b61035d8a838b016102c1565b90965094506060890135915080821115610375575f80fd5b5061038289828a016102c1565b979a9699509497509295939492505050565b5f602082840312156103a4575f80fd5b5051919050565b8183525f60208085019450825f5b858110156103e5576001600160a01b036103d2836102a6565b16875295820195908201906001016103b9565b509495945050505050565b858152608060208201525f6104096080830186886103ab565b6001600160a01b0394909416604083015250606001529392505050565b8181038181111561044557634e487b7160e01b5f52601160045260245ffd5b92915050565b5f6020828403121561045b575f80fd5b8151801515811461046a575f80fd5b9392505050565b86815285602082015260a060408201525f61049060a0830186886103ab565b6001600160a01b03949094166060830152506080015294935050505056fea2646970667358221220b6a1bb6933f8ff0183d80e493648167ffd5fb433b8d753ec2734951b034651a164736f6c63430008180033";
const QUOTES = {
  "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270": [0.2, 18], "0x2791bca1f2de4661ed88a30c99a7a9449aa84174": [1, 6],
  "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359": [1, 6], "0xc2132d05d31c914a87c6611c10748aeb04b58e8f": [1, 6],
  "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619": [1900, 18], "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063": [1, 18],
};

let rid = 0;
const rpc = (m, p) => fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++rid, method: m, params: p }) }).then((r) => r.json());
const word = (a) => a.replace("0x", "").toLowerCase().padStart(64, "0");
const ec = (to, data) => rpc("eth_call", [{ to, data }, "latest"]).then((r) => r.result || "0x");
const nz = (w) => w && w !== "0x" && !/^0x0+$/.test(w);
const encPath = (p) => { let o = word("0x" + p.length.toString(16)); for (const a of p) o += word(a); return o; };
const encCheck = (t, b, s) => { const B = encPath(b); return "0x" + SEL + word(ROUTER) + word(t) + word("0x80") + word("0x" + (128 + B.length / 2).toString(16)) + B + encPath(s); };

async function check(token) {
  let best = null;
  for (const [q, [price, dec]] of Object.entries(QUOTES)) {
    if (q === token) continue;
    const p = await ec(QFAC, "0xe6a43905" + word(token) + word(q));
    const pair = "0x" + p.slice(26);
    if (!nz(p) || /^0x0+$/.test(pair)) continue;
    const bal = await ec(q, "0x70a08231" + word(pair));
    const liq = (Number(BigInt(bal)) / 10 ** dec) * price;
    if (!best || liq > best.liq) best = { q, liq };
  }
  if (!best) return { verdict: "unknown", reason: "No pool found against a known quote token on QuickSwap." };
  const q = best.q, buy = q === WMATIC ? [WMATIC, token] : [WMATIC, q, token], sell = q === WMATIC ? [token, WMATIC] : [token, q, WMATIC];
  const v = 5n * 10n ** 17n;
  const sim = await rpc("eth_call", [{ from: CHK, to: CHK, data: encCheck(token, buy, sell), value: "0x" + v.toString(16) }, "latest", { [CHK]: { code: CODE, balance: "0x" + (v * 4n).toString(16) } }]);
  let sellable = false, recovery = 0;
  if (!sim.error && sim.result && sim.result.length >= 194) { const w = (i) => BigInt("0x" + sim.result.slice(2 + i * 64, 2 + (i + 1) * 64)); sellable = true; recovery = w(0) > 0n ? Number((w(2) * 10000n) / w(0)) / 100 : 0; }
  const bc = ((await rpc("eth_getCode", [token, "latest"])).result || "0x").toLowerCase();
  const flags = [];
  if (bc.includes("40c10f19")) flags.push("mint");
  if (bc.includes("8456cb59")) flags.push("pause");
  if (bc.includes("f9f92be4") || bc.includes("fe575a87")) flags.push("blacklist");
  const ow = await rpc("eth_call", [{ to: token, data: "0x8da5cb5b" }, "latest"]);
  if (!ow.error && ow.result && ow.result.length >= 66) { const owner = "0x" + ow.result.slice(26); if (!/^0x0+$/.test(owner)) flags.push("owner-active"); }
  const swaps = (buy.length - 1) + (sell.length - 1), expected = Math.pow(0.997, swaps) * 100, tax = sellable ? Math.max(0, expected - recovery) : 0;
  const liq = best.liq;
  let score;
  if (!sellable) score = 0;
  else { score = 100 - Math.round(tax * 3); if (liq < 2000) score -= 20; else if (liq < 10000) score -= 10; if (flags.includes("owner-active")) score -= 12; if (flags.includes("mint")) score -= 12; if (flags.includes("pause")) score -= 10; if (flags.includes("blacklist")) score -= 15; score = Math.max(0, Math.min(100, score)); }
  const verdict = !sellable ? "trap" : score < 45 ? "trap" : score < 75 ? "caution" : "safe";
  const reason = !sellable ? "Buy works but the sell reverts — a honeypot." : verdict === "trap" ? "Red flags stack up; treat as unsafe." : verdict === "caution" ? "Sellable, but tax/flags/thin liquidity — size down." : "Buy and sell both work; no major red flags.";
  return { verdict, score, sellable, tax: Math.round(tax * 10) / 10, liquidityUsd: Math.round(liq), flags, quote: q, reason };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=30");
  const token = String((req.query && req.query.token) || "").toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(token)) {
    res.status(400).json({ error: "pass ?token=0x… (a 40-hex Polygon token address)" });
    return;
  }
  try {
    const r = await check(token);
    res.status(200).json({ token, chain: "polygon", ...r, disclaimer: "Heuristic on-chain screen, not a guarantee. The owner can change the rules later. Don't trust — verify." });
  } catch (e) {
    res.status(502).json({ error: "check failed — could not reach the chain" });
  }
}
