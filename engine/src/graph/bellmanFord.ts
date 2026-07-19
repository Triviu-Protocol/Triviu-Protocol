/**
 * Profitable-cycle detection — the mathematical core of whitepaper §3.
 *
 * Idea: a cycle A→B→C→A is profitable (before gas) when the product of
 * effective rates exceeds 1:
 *
 *     r1·(1−φ1) · r2·(1−φ2) · r3·(1−φ3) > 1
 *
 * Taking −ln of each factor turns "product > 1" into "sum < 0": finding
 * arbitrage is equivalent to finding a NEGATIVE CYCLE in the graph whose
 * weights are −ln(effective rate). Bellman–Ford detects negative cycles
 * in O(V·E).
 *
 * This file is deliberately readable: it is teaching material as much as
 * engine code. Run `npm test` for the worked examples.
 */

export interface Edge {
  from: string;          // source token
  to: string;            // destination token
  effectiveRate: number; // r · (1 − fee), for the volume considered
  pool?: string;         // pool address (metadata)
}

export interface CycleResult {
  /** Cycle tokens, closed: e.g. ["A","B","C","A"] */
  cycle: string[];
  /** Product of effective rates along the cycle (> 1 ⇒ gross profit). */
  grossFactor: number;
}

/**
 * Finds a negative cycle (⇔ a cycle whose rate product > 1), if any.
 * Returns null when the supplied graph holds no arbitrage.
 *
 * Honesty note: existing in the graph ≠ capturable in practice.
 * Between detection and block inclusion sit professional competition,
 * gas and slippage — see the Risk Notice in the README.
 */
export function findNegativeCycle(edges: Edge[]): CycleResult | null {
  const nodes = [...new Set(edges.flatMap((e) => [e.from, e.to]))];
  if (nodes.length === 0) return null;

  // Weights: w = −ln(effective rate). Rate ≤ 0 is invalid (broken/illiquid pool).
  const weighted = edges
    .filter((e) => e.effectiveRate > 0)
    .map((e) => ({ ...e, w: -Math.log(e.effectiveRate) }));

  const dist = new Map<string, number>();
  const pred = new Map<string, string>();
  for (const n of nodes) dist.set(n, 0); // virtual source: dist 0 everywhere

  // Classic relaxation: V−1 passes.
  for (let i = 0; i < nodes.length - 1; i++) {
    let changed = false;
    for (const e of weighted) {
      const du = dist.get(e.from)!;
      const dv = dist.get(e.to)!;
      if (du + e.w < dv - 1e-12) {
        dist.set(e.to, du + e.w);
        pred.set(e.to, e.from);
        changed = true;
      }
    }
    if (!changed) break;
  }

  // Extra pass: if it still relaxes, a negative cycle reaches `e.to`.
  for (const e of weighted) {
    const du = dist.get(e.from)!;
    const dv = dist.get(e.to)!;
    if (du + e.w < dv - 1e-12) {
      return reconstructCycle(e.to, pred, edges);
    }
  }
  return null;
}

/** Walks predecessors until a node repeats; extracts and closes the cycle. */
function reconstructCycle(
  start: string,
  pred: Map<string, string>,
  edges: Edge[]
): CycleResult | null {
  // Ensure we are INSIDE the cycle: walk V steps back.
  let x = start;
  for (let i = 0; i < pred.size; i++) x = pred.get(x) ?? x;

  const path: string[] = [x];
  let cur = pred.get(x);
  while (cur !== undefined && cur !== x) {
    path.push(cur);
    cur = pred.get(cur);
  }
  if (cur === undefined) return null;
  path.push(x);
  path.reverse(); // traversal order

  // Product of rates along the reconstructed cycle.
  let factor = 1;
  for (let i = 0; i < path.length - 1; i++) {
    const from = path[i]!;
    const to = path[i + 1]!;
    const edge = edges.find((e) => e.from === from && e.to === to);
    if (!edge) return null;
    factor *= edge.effectiveRate;
  }
  return { cycle: path, grossFactor: factor };
}

/**
 * The full execution condition from whitepaper §3, now with costs:
 *   grossProfit = V · (grossFactor − 1)
 *   execute ⇔ grossProfit − G ≥ minProfit
 */
export function meetsExecutionCondition(params: {
  principal: number;   // V, in asset A
  grossFactor: number; // product of the cycle's effective rates
  gasCostInA: number;  // G, converted into asset A
  minProfit: number;
}): boolean {
  const { principal, grossFactor, gasCostInA, minProfit } = params;
  const grossProfit = principal * (grossFactor - 1);
  return grossProfit - gasCostInA >= minProfit;
}
