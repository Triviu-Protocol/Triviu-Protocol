/**
 * Pipeline step 3 (§9.2): simulate the assembled cycle on a local Polygon
 * fork BEFORE anything is submitted. Project rule: no route reaches any
 * network without passing through here first (sim/README.md).
 *
 * Typical usage: `anvil --fork-url $POLYGON_RPC`, point params.toml's
 * rpc_url at http://127.0.0.1:8545, and make sure the simulating account has
 * balance and allowance on the fork (anvil lets you impersonate and mint).
 *
 * What the result means, honestly:
 *  - ok=true  → the exact call would NOT revert at the simulated block, and
 *    gasUsed is the fork's estimate. The on-chain minProfit require already
 *    passed inside the simulation — profit ≥ minProfit at that state.
 *  - ok=false → the revert reason is reported verbatim. Reverting is the
 *    protocol working, not the protocol failing.
 */
import { triviuExecutorAbi } from "../abi.js";
import type { Leg } from "../build/steps.js";

export interface SimulationCallArgs {
  address: `0x${string}`;
  abi: typeof triviuExecutorAbi;
  functionName: "executeCycle";
  args: readonly [`0x${string}`, bigint, bigint, readonly Leg[]];
  account: `0x${string}`;
}

/** The slice of a viem PublicClient the simulator needs — injectable in tests. */
export interface SimulationClient {
  simulateContract(args: SimulationCallArgs): Promise<unknown>;
  estimateContractGas?(args: SimulationCallArgs): Promise<bigint>;
}

export interface CycleSimulationRequest {
  executor: `0x${string}`;
  /** msg.sender of the simulated call — needs balance + allowance on the fork. */
  account: `0x${string}`;
  asset: `0x${string}`;
  principal: bigint;
  minProfit: bigint;
  legs: readonly Leg[];
}

export interface SimulationResult {
  ok: boolean;
  gasUsed?: bigint;
  reason?: string;
}

/** Digs the most specific message out of a viem revert error chain. */
function explainRevert(err: unknown): string {
  if (typeof err === "object" && err !== null) {
    const e = err as { shortMessage?: unknown; message?: unknown; cause?: unknown };
    if (typeof e.shortMessage === "string") return e.shortMessage;
    if (e.cause !== undefined) {
      const nested = explainRevert(e.cause);
      if (nested !== "unknown revert") return nested;
    }
    if (typeof e.message === "string") return e.message;
  }
  return "unknown revert";
}

export async function simulateCycle(
  client: SimulationClient,
  req: CycleSimulationRequest
): Promise<SimulationResult> {
  const call: SimulationCallArgs = {
    address: req.executor,
    abi: triviuExecutorAbi,
    functionName: "executeCycle",
    args: [req.asset, req.principal, req.minProfit, req.legs],
    account: req.account,
  };

  try {
    await client.simulateContract(call);
  } catch (err) {
    return { ok: false, reason: explainRevert(err) };
  }
  // The route is valid. A gas-estimation hiccup must NOT be reported as a
  // revert — keep the two calls separate so a successful sim is never masked.
  if (!client.estimateContractGas) return { ok: true };
  try {
    return { ok: true, gasUsed: await client.estimateContractGas(call) };
  } catch {
    return { ok: true };
  }
}
