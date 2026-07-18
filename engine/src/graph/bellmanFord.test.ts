/**
 * Worked examples for the cycle detector — the ones the module header
 * promises. Each case states its arithmetic in full so a reader can check
 * every number by hand: that is the point of this repository.
 */
import { describe, expect, it } from "vitest";
import { findNegativeCycle, meetsExecutionCondition, type Edge } from "./bellmanFord.js";

describe("findNegativeCycle — litepaper §3 worked examples", () => {
  it("detects a profitable triangle (rate product > 1)", () => {
    // Product = 1.02 · 1.03 · 0.97 = 1.019082 > 1 ⇒ gross profit exists.
    const edges: Edge[] = [
      { from: "A", to: "B", effectiveRate: 1.02 },
      { from: "B", to: "C", effectiveRate: 1.03 },
      { from: "C", to: "A", effectiveRate: 0.97 },
    ];
    const result = findNegativeCycle(edges);
    expect(result).not.toBeNull();
    expect(result!.grossFactor).toBeCloseTo(1.02 * 1.03 * 0.97, 10);
    // The cycle is closed: it ends where it began.
    expect(result!.cycle[0]).toBe(result!.cycle[result!.cycle.length - 1]);
    expect(result!.cycle).toHaveLength(4); // A→B→C→A written as 4 nodes
  });

  it("returns null when no cycle is profitable — the most common result", () => {
    // Every closed loop multiplies to < 1 once fees are applied.
    const edges: Edge[] = [
      { from: "A", to: "B", effectiveRate: 0.99 },
      { from: "B", to: "C", effectiveRate: 0.99 },
      { from: "C", to: "A", effectiveRate: 0.99 },
    ];
    expect(findNegativeCycle(edges)).toBeNull();
  });

  it("ignores broken pools (rate ≤ 0) instead of crashing", () => {
    const edges: Edge[] = [
      { from: "A", to: "B", effectiveRate: 0 },
      { from: "B", to: "A", effectiveRate: -1 },
    ];
    expect(findNegativeCycle(edges)).toBeNull();
  });

  it("returns null for an empty graph", () => {
    expect(findNegativeCycle([])).toBeNull();
  });
});

describe("meetsExecutionCondition — grossProfit − G ≥ minProfit", () => {
  // V = 1000, factor 1.02 ⇒ grossProfit = 20.
  const base = { principal: 1000, grossFactor: 1.02, gasCostInA: 5 };

  it("executes when net profit clears minProfit (20 − 5 = 15 ≥ 10)", () => {
    expect(meetsExecutionCondition({ ...base, minProfit: 10 })).toBe(true);
  });

  it("reverts when it does not (20 − 5 = 15 < 16)", () => {
    expect(meetsExecutionCondition({ ...base, minProfit: 16 })).toBe(false);
  });

  it("boundary is inclusive, matching the on-chain ≥ check (15 ≥ 15)", () => {
    expect(meetsExecutionCondition({ ...base, minProfit: 15 })).toBe(true);
  });

  it("gas can eat the whole edge — zero or negative expectation is real (README risk notice)", () => {
    expect(
      meetsExecutionCondition({ ...base, gasCostInA: 25, minProfit: 0 })
    ).toBe(false);
  });
});
