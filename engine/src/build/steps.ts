/**
 * Pipeline step 4 (§9.2): turn a detected cycle into the calldata legs the
 * TriviuExecutor will run.
 *
 * v0 shape — one UniV2-compatible router, one multi-hop swap:
 *   step 1: asset.approve(router, amountIn)
 *   step 2: router.swapExactTokensForTokens(amountIn, 0, [A,B,C,A], executor, deadline)
 *
 * Two honest notes:
 *  - amountOutMin is 0 ON PURPOSE: the binding protection is the executor's
 *    on-chain check `finalBalance ≥ principal + minProfit` (litepaper §3).
 *    Per-leg floors arrive with the typed adapters of v0.2.
 *  - The asset token address must ALSO be whitelisted as a Registry target,
 *    because the approve leg is a call to the token itself.
 */
import { encodeFunctionData, parseAbi } from "viem";

export interface Step {
  target: `0x${string}`;
  data: `0x${string}`;
}

const erc20ApproveAbi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
]);

const univ2RouterAbi = parseAbi([
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)",
]);

export function buildApproveStep(
  token: `0x${string}`,
  spender: `0x${string}`,
  amount: bigint
): Step {
  return {
    target: token,
    data: encodeFunctionData({
      abi: erc20ApproveAbi,
      functionName: "approve",
      args: [spender, amount],
    }),
  };
}

export function buildUniV2SwapStep(
  router: `0x${string}`,
  args: {
    amountIn: bigint;
    amountOutMin: bigint;
    path: readonly `0x${string}`[];
    to: `0x${string}`;
    deadline: bigint;
  }
): Step {
  return {
    target: router,
    data: encodeFunctionData({
      abi: univ2RouterAbi,
      functionName: "swapExactTokensForTokens",
      args: [args.amountIn, args.amountOutMin, [...args.path], args.to, args.deadline],
    }),
  };
}

/**
 * A→B→C→A as executor steps. `path` must be CLOSED (first == last) and have
 * at least 4 entries; `executor` receives the swap output so the on-chain
 * profit check sees the whole result.
 */
export function buildTriangularCycleSteps(args: {
  router: `0x${string}`;
  executor: `0x${string}`;
  path: readonly `0x${string}`[];
  amountIn: bigint;
  deadline: bigint;
}): Step[] {
  const { router, executor, path, amountIn, deadline } = args;
  const first = path[0];
  const last = path[path.length - 1];
  if (path.length < 4 || first === undefined || first !== last) {
    throw new Error("cycle path must be closed (A→…→A) with at least 4 entries");
  }

  return [
    buildApproveStep(first, router, amountIn),
    buildUniV2SwapStep(router, {
      amountIn,
      amountOutMin: 0n, // executor's minProfit check is the real gate — see header
      path,
      to: executor,
      deadline,
    }),
  ];
}
