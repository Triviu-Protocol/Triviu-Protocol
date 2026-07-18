/**
 * Minimal ABI surface of the on-chain contracts, in viem's human-readable
 * form. Kept by hand and small on purpose: the engine only ever calls
 * `executeCycle` — everything else it does is read-only or off-chain.
 */
import { parseAbi } from "viem";

export const triviuExecutorAbi = parseAbi([
  "struct Step { address target; bytes data; }",
  "function executeCycle(address asset, uint256 principal, uint256 minProfit, Step[] calldata steps) external",
  "error TokenNotAllowed(address token)",
  "error TargetNotAllowed(address target)",
  "error StepFailed(uint256 index)",
  "error UnprofitableCycle(uint256 finalBalance, uint256 required)",
  "error NotStateless(uint256 danglingBalance)",
  "event CycleExecuted(address indexed caller, address indexed asset, uint256 principal, uint256 profit)",
]);
