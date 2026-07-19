/**
 * Minimal ABI surface of the on-chain contracts, in viem's human-readable
 * form. Kept by hand and small on purpose: the engine only ever calls
 * `executeCycle` — everything else it does is read-only or off-chain.
 *
 * v0.2 (F-02): legs are TYPED (`struct Leg`), not raw calldata.
 */
import { parseAbi } from "viem";

export const triviuExecutorAbi = parseAbi([
  "struct Leg { uint8 dex; address router; address tokenIn; address tokenOut; uint24 fee; uint256 amountOutMin; }",
  "function executeCycle(address asset, uint256 principal, uint256 minProfit, Leg[] calldata legs) external",
  "error TokenNotAllowed(address token)",
  "error TargetNotAllowed(address target)",
  "error NoLegs()",
  "error CycleNotClosed(address open, address close, address asset)",
  "error BrokenChain(uint256 index)",
  "error UnprofitableCycle(uint256 realizedDelta, uint256 required)",
  "error Reentrancy()",
  "event CycleExecuted(address indexed caller, address indexed asset, uint256 principal, uint256 profit, uint256 fee)",
]);
