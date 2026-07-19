/**
 * Pipeline step 4 (§9.2): turn a detected cycle into the TYPED legs the
 * TriviuExecutor v0.2 will run (F-02). The engine no longer builds raw
 * calldata — it fills in a `Leg` per hop and the contract constructs the swap
 * itself, so a whitelisted router can only ever be asked to swap.
 *
 * v0 shape — one UniV2-compatible router, one leg per hop of a closed cycle:
 *   leg i: { dex: UniV2, router, tokenIn: path[i], tokenOut: path[i+1] }
 *
 * Honest note: amountOutMin is 0 by default — the binding protection is the
 * executor's on-chain check `finalBalance ≥ principal + minProfit` (whitepaper
 * §3). Per-leg floors and cross-DEX (UniV3) routing are set by the caller.
 */

/** Mirrors the on-chain `enum Dex`. */
export const Dex = { UniV2: 0, UniV3: 1 } as const;
export type DexId = (typeof Dex)[keyof typeof Dex];

/** Mirrors the on-chain `struct Leg` (field order matters for encoding). */
export interface Leg {
  dex: DexId;
  router: `0x${string}`;
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  fee: number; // uint24 UniV3 pool fee tier; ignored for UniV2
  amountOutMin: bigint;
}

/**
 * A→B→C→A as typed executor legs. `path` must be CLOSED (first == last) and
 * have at least 4 entries. Every hop uses `router`/`dex` unless overridden.
 */
export function buildTriangularCycleLegs(args: {
  router: `0x${string}`;
  path: readonly `0x${string}`[];
  dex?: DexId;
  fee?: number;
  amountOutMin?: bigint;
}): Leg[] {
  const { router, path } = args;
  const dex = args.dex ?? Dex.UniV2;
  const fee = args.fee ?? 0;
  const amountOutMin = args.amountOutMin ?? 0n;

  const first = path[0];
  const last = path[path.length - 1];
  if (path.length < 4 || first === undefined || first !== last) {
    throw new Error("cycle path must be closed (A→…→A) with at least 4 entries");
  }

  const legs: Leg[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    legs.push({
      dex,
      router,
      tokenIn: path[i]!,
      tokenOut: path[i + 1]!,
      fee,
      amountOutMin,
    });
  }
  return legs;
}
