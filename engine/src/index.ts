/**
 * Triviu — off-chain engine (v0, skeleton).
 * Pipeline: monitor pools → detect cycles (Bellman–Ford) → SIMULATE on a fork
 * → (optional and deliberate) submit.
 *
 * Honesty rules baked into the code:
 *  - dry_run is the default: this program does NOT send transactions unless
 *    you explicitly configure it to.
 *  - Mainnet requires the environment variable TRIVIU_I_ACCEPT_THE_RISK=yes,
 *    which you should only set after reading the RISK NOTICE in the README
 *    and running on a fork.
 */
import { fetchEdges } from "./monitor/pools.js";
import { findNegativeCycle, meetsExecutionCondition } from "./graph/bellmanFord.js";
import { simulateCycle } from "./simulate/anvilFork.js";

const MAINNET_CHAIN_ID = 137;

async function main() {
  console.log("Triviu engine v0 — educational mode. dry_run is the default.");

  // TODO: load engine/config/params.toml (chainId, rpc, whitelists, minProfit)
  const chainId: number = 31337; // local fork by default
  const dryRun = true;

  if (chainId === MAINNET_CHAIN_ID && process.env.TRIVIU_I_ACCEPT_THE_RISK !== "yes") {
    console.error(
      "Refusing mainnet: set TRIVIU_I_ACCEPT_THE_RISK=yes only after reading " +
        "the RISK NOTICE in the README and validating the route on a fork (sim/README.md)."
    );
    process.exit(1);
  }

  const edges = await fetchEdges();
  const found = findNegativeCycle(edges);

  if (!found) {
    console.log("No profitable cycle in the current graph — the most common result, and that's fine.");
    return;
  }

  console.log("Candidate cycle:", found.cycle.join(" → "), "| gross factor:", found.grossFactor.toFixed(6));

  const executable = meetsExecutionCondition({
    principal: 0,      // TODO: volume calibrated via simulation
    grossFactor: found.grossFactor,
    gasCostInA: 0,     // TODO: gas estimate converted into asset A
    minProfit: 0,      // TODO: from params.toml / Registry
  });

  const sim = await simulateCycle();
  console.log("Fork simulation:", sim, "| execution condition:", executable);

  if (dryRun) {
    console.log("dry_run=true — exiting without sending anything. That's how you learn.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
