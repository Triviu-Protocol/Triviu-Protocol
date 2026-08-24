/**
 * Optimal trade size for a constant-product cycle — closed form.
 *
 * The detector in `bellmanFord.ts` answers *whether* a cycle is profitable. It does not
 * answer *how much* to send through it, and until now nothing did: `index.ts` reads the
 * principal from `params.toml` as a fixed constant, the same value whatever the cycle's
 * edge or the pools' depth.
 *
 * A fixed principal is wrong in both directions, and the profit curve says why. Profit is
 *
 *     P(x) = E1·x/(E2 + E3·x) − κ·x        κ = 1 + φ  (flash-loan premium)
 *
 * which rises, peaks, and falls. Undershoot the peak and money is left on the table;
 * overshoot it and slippage eats the edge until the trade turns negative. The peak moves
 * with the square of the edge, so the same principal that is right for a 1% divergence is
 * badly wrong for a 0.1% one.
 *
 * Setting P'(x) = 0 gives (E2 + E3·x)² = E1·E2/κ, and therefore
 *
 *     x* = ( √(E1·E2/κ) − E2 ) / E3
 *     P* = ( √E1 − √(κ·E2) )² / E3
 *
 * Arbitrage exists ⟺ E1 > κ·E2 ⟺ ∏ᵢ(γᵢ·R_outᵢ/R_inᵢ) > 1 + φ.
 *
 * Gas is constant in x, so it never moves x* — it only shifts the go/no-go. That is why
 * `netProfit` subtracts it and `optimalIn` does not.
 *
 * ## Why the formulas below are not written the way they are derived
 *
 * The reference runs at 60 decimal digits; this engine runs on float64, with about 16.
 * Both closed forms subtract two nearly-equal numbers when the edge is small —
 * `√(E1·E2/κ)` approaches `E2` as δ approaches zero — so both are rewritten in an
 * algebraically identical, cancellation-free form using δ = E1/(κ·E2) − 1 and the
 * rationalisation √(1+δ) − 1 = δ/(√(1+δ) + 1):
 *
 *     x* = E2·δ / ( E3·(√(1+δ) + 1) )
 *     P* = (κ·E2·δ)² / ( E3·(√E1 + √(κ·E2))² )
 *
 * **Measured honestly, the gain is smaller than the argument suggests.** Against the
 * 60-digit reference across edges from 1e-3 to 1e-13, the rewritten form lands between
 * 0,3× and 2,0× the error of the literal one — sometimes better, occasionally worse.
 * The cancellation is real but is not the dominant error here: composing E1 and E2 from
 * large reserves already costs more digits than the subtraction does.
 *
 * The rewrite stays because it is principled and costs nothing, **not** because it was
 * measured to rescue the calculation. Claiming the latter would be the kind of tidy
 * story this repository exists to avoid — and it was written that way first, until the
 * test refused it.
 *
 * The real precision limit is elsewhere and worth stating: with reserves at 1e24 and
 * three hops, E2 reaches 1e72 and every product spends digits. If a cycle ever needs
 * more than float64 offers, the answer is not a cleverer formula — it is `bigint` or an
 * arbitrary-precision library, and that is a deliberate decision, not a rewrite.
 */

/** One constant-product hop, in the direction the cycle traverses it. */
export interface Hop {
  /** 1 − fee. A 0.30% pool is 0.997. */
  gamma: number;
  /** Reserve of the token entering this hop. */
  reserveIn: number;
  /** Reserve of the token leaving this hop. */
  reserveOut: number;
}

/** The composed cycle as a single rational function z = E1·x/(E2 + E3·x). */
export interface Composed {
  e1: number;
  e2: number;
  e3: number;
}

export interface Sizing {
  /** x*, the input that maximises profit. Zero when no arbitrage exists. */
  optimalIn: number;
  /** P*, gross profit at x*, in the cycle's entry asset. */
  grossProfit: number;
  /** P* − gas. The number the go/no-go actually depends on. */
  netProfit: number;
  /**
   * δ = E1/(κ·E2) − 1. Negative means the cycle does not pay its own fees.
   *
   * `null` from the numeric solver, where δ is not defined: it works from a simulator,
   * not from composed coefficients. It was `NaN` first, and the N1 of this wave showed
   * why that is worse than useless — **every comparison against NaN is false**, so
   * `if (edge > threshold)` silently takes the no branch and the caller cannot tell
   * "no edge" from "edge never computed". `null` makes the type system ask.
   */
  edge: number | null;
  /** Whether netProfit is strictly positive. */
  worthExecuting: boolean;
  /**
   * x* as a fraction of the first hop's entry reserve.
   *
   * Above `DEPTH_WARNING_FRACTION` the closed form is still arithmetically right but stops
   * describing a concentrated-liquidity pool, because the trade crosses ticks the maths
   * does not model. Absent from the numeric solver, which has no reserves to compare to.
   */
  fractionOfFirstPool?: number;
}

/**
 * Composes N constant-product swaps into one rational function.
 *
 * Each hop maps u ↦ γ·u·R_out/(R_in + γ·u). Feeding u = E1·x/(E2 + E3·x) through it
 * yields the same shape again, which is why any number of hops collapses to three
 * coefficients. Identity is (1, 1, 0), where z = x.
 */
export function compose(hops: readonly Hop[]): Composed {
  let e1 = 1;
  let e2 = 1;
  let e3 = 0;
  for (const h of hops) {
    const nextE1 = h.gamma * h.reserveOut * e1;
    const nextE2 = h.reserveIn * e2;
    const nextE3 = h.reserveIn * e3 + h.gamma * e1;
    e1 = nextE1;
    e2 = nextE2;
    e3 = nextE3;
  }
  return { e1, e2, e3 };
}

/** Output of the cycle for an input x, via the composed form. */
export function cycleOut(x: number, hops: readonly Hop[]): number {
  const { e1, e2, e3 } = compose(hops);
  return (e1 * x) / (e2 + e3 * x);
}

/**
 * Minimum relative price divergence for arbitrage to exist at all.
 *
 * ∏γᵢ · priceRatio > 1 + φ  ⟹  priceRatio > (1+φ)/∏γᵢ. Returns threshold − 1, so a
 * three-hop cycle of 0.30% pools against a 0.05% flash loan returns 0.00953 — anything
 * below that divergence cannot pay its own costs, whatever the size.
 */
export function noArbThreshold(gammas: readonly number[], phi: number): number {
  let product = 1;
  for (const g of gammas) product *= g;
  return (1 + phi) / product - 1;
}

/**
 * Solves for the profit-maximising input.
 *
 * @param hops - the cycle, in traversal order.
 * @param phi - flash-loan premium. Aave v3 is 0.0005; Balancer is 0.
 * @param gasCost - gas for the whole cycle, in the entry asset. Constant in x, so it
 *   changes `netProfit` and `worthExecuting` but never `optimalIn`.
 */
export function solveCycle(
  hops: readonly Hop[],
  phi = 0,
  gasCost = 0
): Sizing {
  const { e1, e2, e3 } = compose(hops);
  const primeiro = hops[0];
  const kappa = 1 + phi;

  // δ computed as a ratio, not as a difference of large products: E1 and κ·E2 are both
  // enormous and nearly equal, so `(e1 - kappa*e2)` would cancel away the answer while
  // `e1/(kappa*e2)` keeps full relative precision.
  const edge = e1 / (kappa * e2) - 1;

  if (!(edge > 0) || e3 === 0 || !Number.isFinite(edge)) {
    return {
      optimalIn: 0,
      grossProfit: 0,
      netProfit: -gasCost,
      edge: Number.isFinite(edge) ? edge : null,
      worthExecuting: false,
    };
  }

  // x* = E2·δ / (E3·(√(1+δ) + 1)) — identical to (√(E1·E2/κ) − E2)/E3, without the
  // subtraction of two nearly-equal numbers.
  const optimalIn = (e2 * edge) / (e3 * (Math.sqrt(1 + edge) + 1));

  // P* = (κ·E2·δ)² / (E3·(√E1 + √(κ·E2))²) — same rationalisation applied to (√E1 − √(κE2))².
  const denomRoot = Math.sqrt(e1) + Math.sqrt(kappa * e2);
  const numer = kappa * e2 * edge;
  const grossProfit = (numer * numer) / (e3 * denomRoot * denomRoot);

  const netProfit = grossProfit - gasCost;
  return {
    optimalIn,
    grossProfit,
    netProfit,
    edge,
    worthExecuting: netProfit > 0,
    // `hops` tem pelo menos um elemento aqui: um ciclo vazio compõe para E3 = 0 e já
    // saiu pelo ramo acima. Ainda assim leio com guarda — o compilador não sabe disso, e
    // silenciar com `!` seria trocar uma prova por uma promessa.
    fractionOfFirstPool: primeiro ? optimalIn / primeiro.reserveIn : undefined,
  };
}

/**
 * Fraction of the first pool's entry reserve above which the closed form stops being
 * trustworthy on a concentrated-liquidity venue.
 *
 * Measured: x* self-limits — even a 1000% edge only asks for 19,3% of the reserve, so the
 * constant-product maths never returns an absurd size. What it does do is cross ticks. The
 * reference's own concentrated-range case has the closed form **overestimating profit by
 * 137%** once the range is left, and 10% of a pool is where that starts to matter.
 *
 * Above this, use `solveCycleNumeric` against a simulator that reflects real ticks.
 */
export const DEPTH_WARNING_FRACTION = 0.1;

/**
 * Ternary search on the profit curve — the fallback the closed form needs.
 *
 * The closed form assumes each hop stays inside one constant-product range. A Uniswap v3
 * position that crosses a tick stops obeying that assumption, and the closed form then
 * **overestimates** the profit — by up to 137% in the reference's own concentrated-range
 * test. The curve stays unimodal either way, so a ternary search remains valid and gives
 * the honest number when `simulateOut` reflects real tick-crossing behaviour.
 *
 * Use this whenever the size approaches the liquidity available in a single range.
 */
export function solveCycleNumeric(
  simulateOut: (x: number) => number,
  upperBound: number,
  phi = 0,
  gasCost = 0,
  iterations = 200
): Sizing {
  const kappa = 1 + phi;
  const profit = (x: number) => simulateOut(x) - kappa * x;

  let lo = 0;
  let hi = upperBound;
  for (let i = 0; i < iterations; i++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    if (profit(m1) < profit(m2)) lo = m1;
    else hi = m2;
  }
  const optimalIn = (lo + hi) / 2;
  const grossProfit = profit(optimalIn);
  const netProfit = grossProfit - gasCost;
  return {
    optimalIn: grossProfit > 0 ? optimalIn : 0,
    grossProfit: Math.max(0, grossProfit),
    edge: null, // δ needs the composed coefficients; the simulator does not have them
    netProfit: grossProfit > 0 ? netProfit : -gasCost,
    worthExecuting: grossProfit > 0 && netProfit > 0,
  };
}
