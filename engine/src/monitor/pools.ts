/**
 * Pipeline step 1 (§9.2): read pool state in ONE multicall round-trip and
 * turn it into graph edges for the Bellman–Ford detector.
 *
 * Honesty notes, in code as in docs:
 *  - UniV2 rates apply the constant-product formula, including price impact
 *    when a volume is given: out = (V·f·R_out) / (R_in + V·f), f = 1 − fee.
 *  - UniV3 rates here are MARGINAL (spot from slot0, fee applied, no
 *    tick-walk). That is a teaching approximation: the fork simulation —
 *    which runs before any submission — is the source of truth.
 *  - A pool that fails to answer is skipped, not guessed.
 */
import { parseAbi } from "viem";
import type { Edge } from "../graph/bellmanFord.js";
import type { PoolConfig } from "../config.js";

const univ2PairAbi = parseAbi([
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
]);

const univ3PoolAbi = parseAbi([
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
]);

export interface MulticallSuccess {
  status: "success";
  result: unknown;
}
export interface MulticallFailure {
  status: "failure";
  error: Error;
}
export type MulticallOutcome = MulticallSuccess | MulticallFailure;

/** The slice of a viem PublicClient the monitor needs — injectable in tests. */
export interface PoolsClient {
  multicall(args: {
    contracts: readonly { address: `0x${string}`; abi: unknown; functionName: string }[];
    allowFailure: true;
  }): Promise<MulticallOutcome[]>;
}

/** Constant-product output for input v against reserves (rIn → rOut). */
function cpmmOut(v: number, rIn: number, rOut: number, f: number): number {
  return (v * f * rOut) / (rIn + v * f);
}

/**
 * Fetches every pool in one multicall and returns both directions of each
 * pool as edges. `volumeInToken0`, when given, prices UniV2 legs WITH impact
 * for that volume (expressed in token0 units; the reverse direction uses the
 * equivalent value in token1).
 */
export async function fetchEdges(
  client: PoolsClient,
  pools: readonly PoolConfig[],
  volumeInToken0?: number
): Promise<Edge[]> {
  if (pools.length === 0) return [];

  const outcomes = await client.multicall({
    contracts: pools.map((p) => ({
      address: p.address,
      abi: p.kind === "univ2" ? univ2PairAbi : univ3PoolAbi,
      functionName: p.kind === "univ2" ? "getReserves" : "slot0",
    })),
    allowFailure: true,
  });

  const edges: Edge[] = [];

  for (let i = 0; i < pools.length; i++) {
    const pool = pools[i]!;
    const outcome = outcomes[i];
    if (!outcome || outcome.status !== "success") {
      console.warn(`pool ${pool.address} did not answer — skipped, not guessed.`);
      continue;
    }

    if (pool.kind === "univ2") {
      const [reserve0, reserve1] = outcome.result as [bigint, bigint, number];
      const r0 = Number(reserve0) / 10 ** pool.decimals0;
      const r1 = Number(reserve1) / 10 ** pool.decimals1;
      if (r0 <= 0 || r1 <= 0) continue; // empty pool: no edge
      const f = 1 - pool.feeBps / 10_000;

      let forward: number;
      let reverse: number;
      if (volumeInToken0 !== undefined && volumeInToken0 > 0) {
        forward = cpmmOut(volumeInToken0, r0, r1, f) / volumeInToken0;
        const volumeInToken1 = volumeInToken0 * (r1 / r0); // same value, other side
        reverse = cpmmOut(volumeInToken1, r1, r0, f) / volumeInToken1;
      } else {
        forward = (r1 / r0) * f;
        reverse = (r0 / r1) * f;
      }

      edges.push(
        { from: pool.token0, to: pool.token1, effectiveRate: forward, pool: pool.address },
        { from: pool.token1, to: pool.token0, effectiveRate: reverse, pool: pool.address }
      );
    } else {
      const slot0 = outcome.result as [bigint, number, number, number, number, number, boolean];
      const sqrtPriceX96 = Number(slot0[0]);
      if (sqrtPriceX96 <= 0) continue;
      // raw token1-per-token0, then rescaled to human units by decimals.
      const raw = (sqrtPriceX96 / 2 ** 96) ** 2;
      const price = raw * 10 ** (pool.decimals0 - pool.decimals1);
      const f = 1 - pool.feePpm / 1_000_000;

      edges.push(
        { from: pool.token0, to: pool.token1, effectiveRate: price * f, pool: pool.address },
        { from: pool.token1, to: pool.token0, effectiveRate: (1 / price) * f, pool: pool.address }
      );
    }
  }

  return edges;
}
