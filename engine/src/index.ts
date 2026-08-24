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
import { buildTriangularCycleLegs } from "./build/steps.js";
import { simulateCycle, type SimulationClient } from "./simulate/anvilFork.js";
import { submitDecision, submitCycle, MAINNET_CHAIN_ID } from "./submit/tx.js";
import { aviso, falha, info } from "./seguranca/saida.js";

async function main() {
  info("Triviu engine v0 — educational mode. dry_run is the default.");

  const paramsPath = process.env["TRIVIU_PARAMS"] ?? "config/params.toml";
  let params;
  try {
    params = loadParams(paramsPath);
  } catch (err) {
    /* A varredura mediu que este caminho é limpo hoje — `loadParams` só produz
       erro de toml e de arquivo, nunca de viem. Usa o mesmo caminho assim
       mesmo: deixar um `String(err)` cru aqui obrigaria o portão a abrir uma
       exceção para ele, e portão com exceção é portão que morre. */
    falha(err);
    /* `aviso`, não `info`: isto era `console.error` e vai para o stderr. Trocar
       o fluxo mudaria o comportamento de quem redireciona a saída. */
    aviso("Copy config/params.example.toml to config/params.toml and adjust (sim/README.md).");
    process.exit(1);
  }

  const chainId = params.network.chainId;
  if (chainId === MAINNET_CHAIN_ID && process.env["TRIVIU_I_ACCEPT_THE_RISK"] !== "yes") {
    aviso(
      "Refusing mainnet: set TRIVIU_I_ACCEPT_THE_RISK=yes only after reading " +
        "the RISK NOTICE in the README and validating the route on a fork (sim/README.md)."
    );
    process.exit(1);
  }

  if (params.pools.length === 0) {
    info("No [[pools]] configured — nothing to monitor. Add pools to config/params.toml.");
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
  info(`Graph: ${edges.length} edges from ${params.pools.length} pools.`);

  // Stage 2 — detect.
  const found = findNegativeCycle(edges);
  if (!found) {
    info("No profitable cycle in the current graph — the most common result, and that's fine.");
    return;
  }
  info(
    "Candidate cycle:",
    found.cycle.join(" → "),
    "| gross factor:",
    found.grossFactor.toFixed(6)
  );

  // Floating-point PREVIEW of the whitepaper §3 condition (gas still unknown).
  // The BINDING check is the contract's require, exercised by the simulation.
  const principal = Number(params.execution.principalWei) / 1e18;
  const preview = meetsExecutionCondition({
    principal,
    grossFactor: found.grossFactor,
    gasCostInA: 0,
    minProfit: Number(params.execution.minProfitWei) / 1e18,
  });
  info("Execution-condition preview (before gas):", preview);

  // Stage 3 — simulate on the fork, when there is something to simulate against.
  if (!params.contracts.executor) {
    info("contracts.executor not configured — detection-only mode ends here (deploy comes after the audit gates).");
    return;
  }
  if (!params.router.univ2) {
    info("router.univ2 not configured — cannot build swap legs. Add it to params.toml.");
    return;
  }

  const path = found.cycle.map((symbol) => {
    const address = params.assets[symbol];
    if (!address) throw new Error(`cycle token "${symbol}" missing from [assets] in params.toml`);
    return address;
  });

  const sender = process.env["TRIVIU_SENDER"];
  if (!sender || !/^0x[0-9a-fA-F]{40}$/.test(sender)) {
    info(
      "TRIVIU_SENDER not set — skipping simulation. Set it to an address that has " +
        "balance and allowance on the fork (anvil can impersonate any address)."
    );
    return;
  }

  // A parallel-pool 2-cycle (A→B→A) is a legitimate detector result but not a
  // triangular route — skip it instead of crashing the run.
  if (path.length < 4) {
    info(`Detected cycle is not triangular (${path.length - 1} hops) — skipping, not submitting.`);
    return;
  }

  // v0 LIMITATION: the shipped path builds single-router, all-UniV2 legs. The
  // executor's UniV3 adapter and per-hop routing exist but are reached only by
  // explicit callers; carrying pool/dex/fee per hop from the detector is a
  // scheduled engine item (audit finding C1).
  const asset = path[0]!;
  const legs = buildTriangularCycleLegs({
    router: params.router.univ2,
    path,
  });

  const sim = await simulateCycle(publicClient as unknown as SimulationClient, {
    executor: params.contracts.executor,
    account: sender as `0x${string}`,
    asset,
    principal: params.execution.principalWei,
    minProfit: params.execution.minProfitWei,
    legs,
  });
  info("Fork simulation:", sim);

  // Stage 4 — submit, only through the gate.
  const decision = submitDecision({
    dryRun: params.execution.dryRun,
    chainId,
    simulationOk: sim.ok,
    env: process.env,
  });
  info("Submission gate:", decision.reason);
  if (!decision.allowed) return;

  const txHash = await submitCycle({
    rpcUrl: params.network.rpcUrl,
    chainId,
    executor: params.contracts.executor,
    asset,
    principal: params.execution.principalWei,
    minProfit: params.execution.minProfitWei,
    legs,
    env: process.env,
  });
  info("Submitted:", txHash, "— the dashboard will show it either way, revert included.");
}

main().catch((err) => {
  /* O SINK do motor. `fetchEdges` (a primeira chamada de rede) e `submitCycle`
     (a única que gasta) não têm `catch` próprio: os erros deles chegam aqui.
     Medido: a exceção de `submitCycle` sai com 19 linhas e a `URL:` do RPC
     inteira. `console.error(err)` cru publicava isso.

     Não pus `try/catch` em cada chamada: elas PROPAGAM para cá, e redigir no
     sink fecha as duas de uma vez. Consertar sete lugares onde há um é como o
     defeito volta. */
  falha(err);
  process.exit(1);
});
