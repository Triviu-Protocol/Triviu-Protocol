import { describe, expect, it } from "vitest";
import { fetchEdges, type PoolsClient } from "./pools.js";
import type { PoolConfig } from "../config.js";

/** A fake client that answers the multicall with pre-baked results. */
function clientAnswering(results: unknown[]): PoolsClient {
  return {
    multicall: async () => results.map((result) => ({ status: "success" as const, result })),
  };
}

const V2_POOL: PoolConfig = {
  kind: "univ2",
  address: "0x6e7a5FAFcec6BB1e78bAE2A1F0B612012BF14827",
  token0: "wmatic",
  token1: "usdce",
  decimals0: 18,
  decimals1: 6,
  feeBps: 30,
};

describe("fetchEdges — UniV2 constant-product math", () => {
  // Reserves: 1000 WMATIC (18 dec) vs 500 USDC.e (6 dec) → price 0.5.
  const reserves = [1000n * 10n ** 18n, 500n * 10n ** 6n, 0];

  it("marginal rates apply the fee to the spot price, both directions", async () => {
    const edges = await fetchEdges(clientAnswering([reserves]), [V2_POOL]);
    expect(edges).toHaveLength(2);
    // forward: (500/1000) · 0.997 = 0.4985
    expect(edges[0]).toMatchObject({ from: "wmatic", to: "usdce" });
    expect(edges[0]!.effectiveRate).toBeCloseTo(0.4985, 10);
    // reverse: (1000/500) · 0.997 = 1.994
    expect(edges[1]!.effectiveRate).toBeCloseTo(1.994, 10);
  });

  it("volume-aware rate includes price impact (hand-checked CPMM numbers)", async () => {
    const edges = await fetchEdges(clientAnswering([reserves]), [V2_POOL], 100);
    // out = (100·0.997·500) / (1000 + 100·0.997) = 49850 / 1099.7 = 45.330544…
    // rate = out / 100 = 0.45330544…
    expect(edges[0]!.effectiveRate).toBeCloseTo(49850 / 1099.7 / 100, 12);
    // impact makes the volume rate strictly worse than the marginal one
    expect(edges[0]!.effectiveRate).toBeLessThan(0.4985);
  });

  it("skips pools that fail to answer instead of guessing", async () => {
    const failing: PoolsClient = {
      multicall: async () => [{ status: "failure" as const, error: new Error("rpc down") }],
    };
    expect(await fetchEdges(failing, [V2_POOL])).toHaveLength(0);
  });

  it("emits no edges for an empty pool", async () => {
    const edges = await fetchEdges(clientAnswering([[0n, 0n, 0]]), [V2_POOL]);
    expect(edges).toHaveLength(0);
  });
});

describe("fetchEdges — UniV3 marginal price from slot0", () => {
  const V3_POOL: PoolConfig = {
    kind: "univ3",
    address: "0x6e7a5FAFcec6BB1e78bAE2A1F0B612012BF14827",
    token0: "wmatic",
    token1: "usdce",
    decimals0: 18,
    decimals1: 6,
    feePpm: 3000,
  };

  it("recovers the human price from sqrtPriceX96 and applies the fee", async () => {
    // Target human price: 0.5 usdce per wmatic. Raw price accounts for the
    // 12-decimal gap: raw = 0.5 · 10^(6−18) = 5e-13 → sqrt = √raw · 2^96.
    const sqrtPriceX96 = BigInt(Math.round(Math.sqrt(5e-13) * 2 ** 96));
    const slot0 = [sqrtPriceX96, 0, 0, 0, 0, 0, true];

    const edges = await fetchEdges(clientAnswering([slot0]), [V3_POOL]);
    expect(edges).toHaveLength(2);
    // forward ≈ 0.5 · (1 − 0.003) = 0.4985 (float tolerance for the √ round-trip)
    expect(edges[0]!.effectiveRate).toBeCloseTo(0.4985, 6);
    // reverse ≈ 2 · 0.997 = 1.994
    expect(edges[1]!.effectiveRate).toBeCloseTo(1.994, 5);
  });
});
