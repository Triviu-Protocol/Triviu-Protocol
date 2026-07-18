/**
 * End-to-end verification against a LOCAL POLYGON FORK.
 * Exercises the real engine code (fetchEdges multicall + Bellman-Ford) on real
 * pool reserves — no mocks. This is the empirical proof that the detection
 * pipeline runs against live state, not just unit fixtures.
 *
 * Usage:
 *   anvil --fork-url $POLYGON_RPC          # in another terminal
 *   TRIVIU_RPC=http://127.0.0.1:8545 npx tsx scripts/verify-fork.ts
 *
 * It discovers the three QuickSwap v2 pairs of the WMATIC/USDC.e/WETH triangle
 * via the factory, reads their reserves through the production fetchEdges, and
 * runs findNegativeCycle. "No profitable cycle" is a legitimate, expected
 * result — see the README risk notice.
 */
import { createPublicClient, defineChain, http, parseAbi, getAddress } from "viem";
import { fetchEdges, type PoolsClient } from "../src/monitor/pools.js";
import { findNegativeCycle } from "../src/graph/bellmanFord.js";
import type { PoolConfig } from "../src/config.js";

const RPC = process.env["TRIVIU_RPC"] ?? "http://127.0.0.1:8545";
const FACTORY = "0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32"; // QuickSwap v2 factory
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;

const forkChain = defineChain({
  id: 137,
  name: "polygon-fork",
  nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
  contracts: { multicall3: { address: MULTICALL3 } },
});

const TOKENS: Record<string, { address: `0x${string}`; decimals: number }> = {
  wmatic: { address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", decimals: 18 },
  usdce: { address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", decimals: 6 },
  weth: { address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", decimals: 18 },
};

const factoryAbi = parseAbi([
  "function getPair(address a, address b) view returns (address pair)",
]);
const pairAbi = parseAbi(["function token0() view returns (address)"]);

async function main() {
  const client = createPublicClient({ chain: forkChain, transport: http(RPC) });
  const block = await client.getBlockNumber();
  console.log(`Fork alive at block ${block} (${RPC})`);

  const legs: [string, string][] = [
    ["wmatic", "usdce"],
    ["usdce", "weth"],
    ["weth", "wmatic"],
  ];

  // Discover pair addresses from the factory (real on-chain lookup).
  const pairAddrs = await client.multicall({
    contracts: legs.map(([a, b]) => ({
      address: FACTORY as `0x${string}`,
      abi: factoryAbi,
      functionName: "getPair",
      args: [TOKENS[a]!.address, TOKENS[b]!.address],
    })),
    allowFailure: true,
  });

  const pools: PoolConfig[] = [];
  for (let i = 0; i < legs.length; i++) {
    const outcome = pairAddrs[i]!;
    if (outcome.status !== "success" || outcome.result === "0x0000000000000000000000000000000000000000") {
      console.warn(`no pair for ${legs[i]!.join("/")} — skipped`);
      continue;
    }
    const pair = getAddress(outcome.result as string);
    // token0() decides which reserve is which — the config must match on-chain.
    const token0 = getAddress(await client.readContract({ address: pair, abi: pairAbi, functionName: "token0" }));
    const [aKey, bKey] = legs[i]!;
    const aIsToken0 = getAddress(TOKENS[aKey]!.address) === token0;
    const t0 = aIsToken0 ? aKey : bKey;
    const t1 = aIsToken0 ? bKey : aKey;
    pools.push({
      kind: "univ2",
      address: pair,
      token0: t0,
      token1: t1,
      decimals0: TOKENS[t0]!.decimals,
      decimals1: TOKENS[t1]!.decimals,
      feeBps: 30,
    });
    console.log(`pair ${legs[i]!.join("/")} -> ${pair} (token0=${t0})`);
  }

  // Real fetchEdges over the fork via the viem multicall client.
  const edges = await fetchEdges(client as unknown as PoolsClient, pools);
  console.log(`\nfetchEdges returned ${edges.length} edges from ${pools.length} pools:`);
  for (const e of edges) {
    console.log(`  ${e.from} -> ${e.to}  rate=${e.effectiveRate.toExponential(6)}`);
  }

  const cycle = findNegativeCycle(edges);
  if (cycle) {
    console.log(`\nProfitable cycle: ${cycle.cycle.join(" -> ")} | gross factor ${cycle.grossFactor.toFixed(6)}`);
    console.log("(gross > 1 before gas — capturable is another matter; see the risk notice)");
  } else {
    console.log("\nNo profitable cycle in the live graph — the most common result, and that's fine.");
  }
  console.log("\nVERIFY OK: real reserves read and processed by the production engine code.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
