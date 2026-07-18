/**
 * Pool monitor (v0 skeleton).
 * Goal: read reserves/prices from whitelisted pools via multicall and build
 * the graph edges with effective rates (pool fee already discounted).
 *
 * TODO v0:
 *  - multicall getReserves / slot0 on whitelisted pools
 *  - convert to effective rate r_i * (1 - fee_i)
 *  - price impact (slippage) as a function of volume V
 */
export interface PoolEdge {
  from: string;      // source token
  to: string;        // destination token
  effectiveRate: number; // r * (1 - fee), for the volume considered
  pool: string;      // pool address
}

export async function fetchEdges(): Promise<PoolEdge[]> {
  // Skeleton: returns empty until the viem/multicall integration lands.
  return [];
}
