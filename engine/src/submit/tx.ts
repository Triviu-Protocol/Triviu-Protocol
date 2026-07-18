/**
 * Pipeline step 5 (§9.2): the ONLY place that can send a transaction — and
 * it refuses to, unless every gate opens:
 *
 *   1. dry_run must be explicitly false in params.toml (true is the default);
 *   2. the fork simulation must have returned ok;
 *   3. mainnet (137) additionally requires TRIVIU_I_ACCEPT_THE_RISK=yes;
 *   4. TRIVIU_PRIVATE_KEY must be present in the environment.
 *
 * The private key comes from the environment, is used to derive the signing
 * account, and is NEVER logged, stored or echoed — not even partially.
 */
import { createWalletClient, defineChain, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { triviuExecutorAbi } from "../abi.js";
import type { Step } from "../build/steps.js";

export const MAINNET_CHAIN_ID = 137;

export interface SubmitGateInput {
  dryRun: boolean;
  chainId: number;
  simulationOk: boolean;
  env: Record<string, string | undefined>;
}

export interface SubmitGateDecision {
  allowed: boolean;
  reason: string;
}

/** Pure and unit-tested: the full truth table of "may we send?". */
export function submitDecision(input: SubmitGateInput): SubmitGateDecision {
  if (input.dryRun) {
    return { allowed: false, reason: "dry_run=true (default): nothing is sent. That's how you learn." };
  }
  if (!input.simulationOk) {
    return { allowed: false, reason: "fork simulation did not pass — no simulation, no submission." };
  }
  if (input.chainId === MAINNET_CHAIN_ID && input.env["TRIVIU_I_ACCEPT_THE_RISK"] !== "yes") {
    return {
      allowed: false,
      reason:
        "mainnet refused: set TRIVIU_I_ACCEPT_THE_RISK=yes only after reading the RISK NOTICE " +
        "in the README and validating the route on a fork (sim/README.md).",
    };
  }
  if (!input.env["TRIVIU_PRIVATE_KEY"]) {
    return { allowed: false, reason: "TRIVIU_PRIVATE_KEY not set — the key never lives in the repo." };
  }
  return { allowed: true, reason: "all gates open: dry_run off, simulation ok, risk acknowledged." };
}

export interface SubmitCycleArgs {
  rpcUrl: string;
  chainId: number;
  executor: `0x${string}`;
  asset: `0x${string}`;
  principal: bigint;
  minProfit: bigint;
  steps: readonly Step[];
  env: Record<string, string | undefined>;
}

/** Signs and submits executeCycle. Callers gate through submitDecision first. */
export async function submitCycle(args: SubmitCycleArgs): Promise<`0x${string}`> {
  const key = args.env["TRIVIU_PRIVATE_KEY"];
  if (!key) throw new Error("TRIVIU_PRIVATE_KEY not set");

  const account = privateKeyToAccount(key as `0x${string}`);
  const chain = defineChain({
    id: args.chainId,
    name: `configured-${args.chainId}`,
    nativeCurrency: { name: "native", symbol: "NATIVE", decimals: 18 },
    rpcUrls: { default: { http: [args.rpcUrl] } },
  });

  const wallet = createWalletClient({ account, chain, transport: http(args.rpcUrl) });
  return wallet.writeContract({
    address: args.executor,
    abi: triviuExecutorAbi,
    functionName: "executeCycle",
    args: [args.asset, args.principal, args.minProfit, [...args.steps]],
  });
}
