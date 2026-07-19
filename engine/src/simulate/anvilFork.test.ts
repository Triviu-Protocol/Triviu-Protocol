import { describe, expect, it } from "vitest";
import { simulateCycle, type SimulationClient } from "./anvilFork.js";

const REQ = {
  executor: "0x000000000000000000000000000000000000dEaD" as const,
  account: "0x000000000000000000000000000000000000bEEF" as const,
  asset: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270" as const,
  principal: 10n ** 18n,
  minProfit: 0n,
  legs: [],
};

describe("simulateCycle", () => {
  it("reports ok with the fork's gas estimate when the call would succeed", async () => {
    const client: SimulationClient = {
      simulateContract: async () => ({}),
      estimateContractGas: async () => 123_456n,
    };
    expect(await simulateCycle(client, REQ)).toEqual({ ok: true, gasUsed: 123_456n });
  });

  it("still reports ok when the client cannot estimate gas", async () => {
    const client: SimulationClient = { simulateContract: async () => ({}) };
    expect(await simulateCycle(client, REQ)).toEqual({ ok: true });
  });

  it("surfaces the revert reason verbatim — reverting is the protocol working", async () => {
    const client: SimulationClient = {
      simulateContract: async () => {
        throw Object.assign(new Error("boom"), {
          shortMessage: 'reverted: UnprofitableCycle',
        });
      },
    };
    const result = await simulateCycle(client, REQ);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("UnprofitableCycle");
  });

  it("digs through nested causes for the most specific message", async () => {
    const client: SimulationClient = {
      simulateContract: async () => {
        throw Object.assign(new Error("outer"), {
          cause: { shortMessage: "BrokenChain(1)" },
        });
      },
    };
    const result = await simulateCycle(client, REQ);
    expect(result.reason).toBe("BrokenChain(1)");
  });
});
