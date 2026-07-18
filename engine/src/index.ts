/**
 * Triviu — off-chain engine (v0).
 * Pipeline (§9.2): load params → monitor pools → detect cycles (Bellman–Ford)
 * → simulate on a fork → (optional and deliberate) submit.
 *
 * Honesty rules baked into the code:
 *  - dry_run is the default: this program does NOT send transactions unless
 *    you explicitly configure it to.
 *  - Mainnet requires the environment variable TRIVIU_I_ACCEPT_THE_RISK=yes,
 *    which you should only set after reading the RISK NOTICE in the README
 *    and running on a fork.
 *  - Every stage below says what it did and what it refused to do.
 */
import { createPublicClient, defineChain, http } from "viem";
import { loadParams } from "./config.js";

/** Canonical Multicall3, deployed at the same address across EVM chains. */
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;
import { fetchEdges, type PoolsClient } from "./monitor/pools.js";
import { findNegativeCycle, meetsExecutionCondition } from "./graph/bellmanFord.js";
import { buildTriangularCycleSteps } from "./build/steps.js";
import { simulateCycle, type SimulationClient } from "./simulate/anvilFork.js";
import { submitDecision, submitCycle, MAINNET_CHAIN_ID } from "./submit/tx.js";

async function main() {
  console.log("Triviu engine v0 — educational mode. dry_run is the default.");

  const paramsPath = process.env["TRIVIU_PARAMS"] ?? "config/params.toml";
  let params;
  try {
    params = loadParams(paramsPath);
  } catch (err) {
    console.error(String(err));
    console.error("Copy config/params.example.toml to config/params.toml and adjust (sim/README.md).");
    process.exit(1);
  }

  const chainId = params.network.chainId;
  if (chainId === MAINNET_CHAIN_ID && process.env["TRIVIU_I_ACCEPT_THE_RISK"] !== "yes") {
    console.error(
      "Refusing mainnet: set TRIVIU_I_ACCEPT_THE_RISK=yes only after reading " +
        "the RISK NOTICE in the README and validating the route on a fork (sim/README.md)."
    );
    process.exit(1);
  }

  if (params.pools.length === 0) {
    console.log("No [[pools]] configured — nothing to monitor. Add pools to config/params.toml.");
    return;
  }

  // The chain object carries the Multicall3 address fetchEdges relies on;
  // without it, viem's multicall throws "multicallAddress is required".
  const chain = defineChain({
    id: chainId,
    name: `configured-${chainId}`,
    nativeCurrency: { name: "native", symbol: "NATIVE", decimals: 18 },
    rpcUrls: { default: { http: [params.network.rpcUrl] } },
    contracts: { multicall3: { address: MULTICALL3 } },
  });
  const publicClient = createPublicClient({ chain, transport: http(params.network.rpcUrl) });

  // Stage 1 — monitor: one multicall, both directions of every pool.
  const edges = await fetchEdges(publicClient as unknown as PoolsClient, params.pools);
  console.log(`Graph: ${edges.length} edges from ${params.pools.length} pools.`);

  // Stage 2 — detect.
  const found = findNegativeCycle(edges);
  if (!found) {
    console.log("No profitable cycle in the current graph — the most common result, and that's fine.");
    return;
  }
  console.log(
    "Candidate cycle:",
    found.cycle.join(" → "),
    "| gross factor:",
    found.grossFactor.toFixed(6)
  );

  // Floating-point PREVIEW of the litepaper §3 condition (gas still unknown).
  // The BINDING check is the contract's require, exercised by the simulation.
  const principal = Number(params.execution.principalWei) / 1e18;
  const preview = meetsExecutionCondition({
    principal,
    grossFactor: found.grossFactor,
    gasCostInA: 0,
    minProfit: Number(params.execution.minProfitWei) / 1e18,
  });
  console.log("Execution-condition preview (before gas):", preview);

  // Stage 3 — simulate on the fork, when there is something to simulate against.
  if (!params.contracts.executor) {
    console.log("contracts.executor not configured — detection-only mode ends here (deploy comes after the audit gates).");
    return;
  }
  if (!params.router.univ2) {
    console.log("router.univ2 not configured — cannot build swap steps. Add it to params.toml.");
    return;
  }

  const path = found.cycle.map((symbol) => {
    const address = params.assets[symbol];
    if (!address) throw new Error(`cycle token "${symbol}" missing from [assets] in params.toml`);
    return address;
  });

  const sender = process.env["TRIVIU_SENDER"];
  if (!sender || !/^0x[0-9a-fA-F]{40}$/.test(sender)) {
    console.log(
      "TRIVIU_SENDER not set — skipping simulation. Set it to an address that has " +
        "balance and allowance on the fork (anvil can impersonate any address)."
    );
    return;
  }

  const asset = path[0]!;
  const steps = buildTriangularCycleSteps({
    router: params.router.univ2,
    executor: params.contracts.executor,
    path,
    amountIn: params.execution.principalWei,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 600),
  });

  const sim = await simulateCycle(publicClient as unknown as SimulationClient, {
    executor: params.contracts.executor,
    account: sender as `0x${string}`,
    asset,
    principal: params.execution.principalWei,
    minProfit: params.execution.minProfitWei,
    steps,
  });
  console.log("Fork simulation:", sim);

  // Stage 4 — submit, only through the gate.
  const decision = submitDecision({
    dryRun: params.execution.dryRun,
    chainId,
    simulationOk: sim.ok,
    env: process.env,
  });
  console.log("Submission gate:", decision.reason);
  if (!decision.allowed) return;

  const txHash = await submitCycle({
    rpcUrl: params.network.rpcUrl,
    chainId,
    executor: params.contracts.executor,
    asset,
    principal: params.execution.principalWei,
    minProfit: params.execution.minProfitWei,
    steps,
    env: process.env,
  });
  console.log("Submitted:", txHash, "— the dashboard will show it either way, revert included.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
