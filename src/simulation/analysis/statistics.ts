/**
 * Pure statistical aggregation for Monte-Carlo validation.
 *
 * Shared verbatim between the Web-Worker shard runner and the UI dashboard so
 * that "what the worker computed" and "what the chart shows" can never diverge.
 */

/** Aggregate summary of a batch of boarding-time samples. */
export interface MonteCarloResult {
  readonly runs: number;
  /** Sample mean `μ` of boarding times. */
  readonly mean: number;
  /** Unbiased sample variance `σ²` (n − 1 denominator). */
  readonly variance: number;
  readonly stdDev: number;
  /** 95% confidence interval for the mean (normal approximation). */
  readonly ci95: { readonly lower: number; readonly upper: number };
  readonly min: number;
  readonly max: number;
}

export function mean(samples: ReadonlyArray<number>): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (const x of samples) sum += x;
  return sum / samples.length;
}

/** Unbiased (n − 1) sample variance. */
export function variance(samples: ReadonlyArray<number>, precomputedMean?: number): number {
  const n = samples.length;
  if (n < 2) return 0;
  const m = precomputedMean ?? mean(samples);
  let sumSq = 0;
  for (const x of samples) {
    const d = x - m;
    sumSq += d * d;
  }
  return sumSq / (n - 1);
}

/**
 * Reduce raw samples to the reportable metrics. Min/max use an explicit loop
 * (not `Math.min(...samples)`) so that `M = 10_000`-sample batches never blow
 * the call-stack argument limit.
 */
export function summarize(samples: ReadonlyArray<number>): MonteCarloResult {
  const n = samples.length;
  if (n === 0) {
    return { runs: 0, mean: 0, variance: 0, stdDev: 0, ci95: { lower: 0, upper: 0 }, min: 0, max: 0 };
  }

  const m = mean(samples);
  const v = variance(samples, m);
  const stdDev = Math.sqrt(v);
  const standardError = stdDev / Math.sqrt(n);
  const margin = 1.96 * standardError;

  let min = samples[0];
  let max = samples[0];
  for (const x of samples) {
    if (x < min) min = x;
    if (x > max) max = x;
  }

  return {
    runs: n,
    mean: m,
    variance: v,
    stdDev,
    ci95: { lower: m - margin, upper: m + margin },
    min,
    max,
  };
}
