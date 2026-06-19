import type { StowageParams, WalkingParams } from '../config/simulation';
import type { Random } from './Random';

/**
 * Random samplers for the per-passenger attributes used in Realism mode
 * (walking speed, bag count, stow time). They add the human variation that gives
 * the simulation realistic spread; Simple mode skips them.
 */

/**
 * Gamma(shape `k`, scale `θ`) sampler via the Marsaglia–Tsang method.
 *
 * Used because stowage time is heavily right-skewed: most passengers stow
 * quickly, a long tail struggle with the overhead bin. Mean = `k·θ`,
 * variance = `k·θ²`. Valid for any `k > 0` (the `k < 1` case is boosted).
 */
export function sampleGamma(rng: Random, shape: number, scale: number): number {
  if (shape < 1) {
    // Boost: Gamma(k) = Gamma(k+1) · U^(1/k).
    const u = rng.next() || Number.EPSILON;
    return sampleGamma(rng, shape + 1, scale) * Math.pow(u, 1 / shape);
  }

  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      x = rng.normal(0, 1);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng.next();
    const x2 = x * x;
    if (u < 1 - 0.0331 * x2 * x2) return d * v * scale;
    if (Math.log(u) < 0.5 * x2 + d * (1 - v + Math.log(v))) return d * v * scale;
  }
}

/**
 * Stowage duration `t_stow,k`, scaled by carry-on count `B_k`.
 * Zero-bag passengers incur only the fixed `baseTicks` overhead; otherwise the
 * Gamma shape grows with the number of bags, lengthening both mean and tail.
 */
export function sampleStowTime(rng: Random, bagCount: number, params: StowageParams): number {
  if (bagCount <= 0) return params.baseTicks;
  return params.baseTicks + sampleGamma(rng, bagCount * params.shapePerBag, params.scalePerBag);
}

/** Walking velocity `v_k` (cells/tick), normal and clamped to a physical floor. */
export function sampleWalkingSpeed(rng: Random, params: WalkingParams): number {
  return Math.max(params.min, rng.normal(params.meanCellsPerTick, params.stdDev));
}

/**
 * Carry-on count `B_k` drawn from a discrete probability mass `weights`, where
 * `weights[i] = P(B_k = i)`. Falls back to the last bucket on rounding drift.
 */
export function sampleBagCount(rng: Random, weights: ReadonlyArray<number>): number {
  const u = rng.next();
  let cumulative = 0;
  for (let i = 0; i < weights.length; i++) {
    cumulative += weights[i];
    if (u < cumulative) return i;
  }
  return weights.length - 1;
}
