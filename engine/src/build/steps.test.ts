import { describe, expect, it } from "vitest";
import { decodeFunctionData, parseAbi } from "viem";
import { buildApproveStep, buildTriangularCycleSteps, buildUniV2SwapStep } from "./steps.js";

const TOKEN_A = "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270" as const;
const TOKEN_B = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174" as const;
const TOKEN_C = "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619" as const;
const ROUTER = "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff" as const;
const EXECUTOR = "0x000000000000000000000000000000000000dEaD" as const;

const erc20Abi = parseAbi(["function approve(address spender, uint256 amount) returns (bool)"]);
const routerAbi = parseAbi([
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)",
]);

describe("step builders — calldata the executor will forward", () => {
  it("approve step targets the token and encodes spender + amount", () => {
    const step = buildApproveStep(TOKEN_A, ROUTER, 123n);
    expect(step.target).toBe(TOKEN_A);
    const decoded = decodeFunctionData({ abi: erc20Abi, data: step.data });
    expect(decoded.functionName).toBe("approve");
    expect(decoded.args).toEqual([ROUTER, 123n]);
  });

  it("swap step targets the router and round-trips every argument", () => {
    const step = buildUniV2SwapStep(ROUTER, {
      amountIn: 10n ** 18n,
      amountOutMin: 5n,
      path: [TOKEN_A, TOKEN_B],
      to: EXECUTOR,
      deadline: 1_800_000_000n,
    });
    expect(step.target).toBe(ROUTER);
    const decoded = decodeFunctionData({ abi: routerAbi, data: step.data });
    expect(decoded.functionName).toBe("swapExactTokensForTokens");
    expect(decoded.args).toEqual([10n ** 18n, 5n, [TOKEN_A, TOKEN_B], EXECUTOR, 1_800_000_000n]);
  });

  it("triangular cycle = approve leg + one multi-hop swap through the closed path", () => {
    const steps = buildTriangularCycleSteps({
      router: ROUTER,
      executor: EXECUTOR,
      path: [TOKEN_A, TOKEN_B, TOKEN_C, TOKEN_A],
      amountIn: 7n,
      deadline: 1_800_000_000n,
    });
    expect(steps).toHaveLength(2);
    expect(steps[0]!.target).toBe(TOKEN_A); // the approve is a call to the token itself
    const swap = decodeFunctionData({ abi: routerAbi, data: steps[1]!.data });
    expect(swap.args?.[2]).toEqual([TOKEN_A, TOKEN_B, TOKEN_C, TOKEN_A]);
    expect(swap.args?.[1]).toBe(0n); // executor's on-chain minProfit is the binding gate
    expect(swap.args?.[3]).toBe(EXECUTOR); // output lands where the check happens
  });

  it("refuses an open path — the cycle must end where it began", () => {
    expect(() =>
      buildTriangularCycleSteps({
        router: ROUTER,
        executor: EXECUTOR,
        path: [TOKEN_A, TOKEN_B, TOKEN_C],
        amountIn: 7n,
        deadline: 1_800_000_000n,
      })
    ).toThrow(/closed/);
  });
});
