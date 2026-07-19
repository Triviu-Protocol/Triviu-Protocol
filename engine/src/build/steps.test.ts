import { describe, expect, it } from "vitest";
import { buildTriangularCycleLegs, Dex } from "./steps.js";

const TOKEN_A = "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270" as const;
const TOKEN_B = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174" as const;
const TOKEN_C = "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619" as const;
const ROUTER = "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff" as const;

describe("typed leg builder — what the v0.2 executor will run (F-02)", () => {
  it("closed cycle → one typed leg per hop, chained head-to-tail", () => {
    const legs = buildTriangularCycleLegs({
      router: ROUTER,
      path: [TOKEN_A, TOKEN_B, TOKEN_C, TOKEN_A],
    });

    expect(legs).toHaveLength(3);
    expect(legs.map((l) => [l.tokenIn, l.tokenOut])).toEqual([
      [TOKEN_A, TOKEN_B],
      [TOKEN_B, TOKEN_C],
      [TOKEN_C, TOKEN_A],
    ]);
    // Opens and closes on the asset; every hop chains to the next.
    expect(legs[0]!.tokenIn).toBe(TOKEN_A);
    expect(legs[legs.length - 1]!.tokenOut).toBe(TOKEN_A);
    for (let i = 1; i < legs.length; i++) {
      expect(legs[i]!.tokenIn).toBe(legs[i - 1]!.tokenOut);
    }
  });

  it("defaults to UniV2 with no per-leg floor and every leg on the given router", () => {
    const legs = buildTriangularCycleLegs({
      router: ROUTER,
      path: [TOKEN_A, TOKEN_B, TOKEN_C, TOKEN_A],
    });
    for (const leg of legs) {
      expect(leg.dex).toBe(Dex.UniV2);
      expect(leg.router).toBe(ROUTER);
      expect(leg.fee).toBe(0);
      expect(leg.amountOutMin).toBe(0n); // executor's on-chain minProfit is the binding gate
    }
  });

  it("honors a UniV3 override with a pool fee tier", () => {
    const legs = buildTriangularCycleLegs({
      router: ROUTER,
      path: [TOKEN_A, TOKEN_B, TOKEN_C, TOKEN_A],
      dex: Dex.UniV3,
      fee: 3000,
    });
    for (const leg of legs) {
      expect(leg.dex).toBe(Dex.UniV3);
      expect(leg.fee).toBe(3000);
    }
  });

  it("refuses an open path — the cycle must end where it began", () => {
    expect(() =>
      buildTriangularCycleLegs({
        router: ROUTER,
        path: [TOKEN_A, TOKEN_B, TOKEN_C],
      })
    ).toThrow(/closed/);
  });
});
