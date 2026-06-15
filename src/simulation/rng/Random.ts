/**
 * Deterministic, seedable pseudo-random number generator (mulberry32).
 *
 * Reproducibility is non-negotiable for a Monte-Carlo lab: a given `(seed,
 * strategy)` pair must produce byte-identical runs so that results are
 * verifiable and so that Web-Worker shards can be reconstructed. `Math.random`
 * offers no seeding, hence this tiny, fast (~2ns/call) 32-bit generator.
 */
export class Random {
  private state: number;

  constructor(seed: number) {
    // Coerce to a 32-bit unsigned integer state.
    this.state = seed >>> 0;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform integer in [0, maxExclusive). */
  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }

  /** Uniform float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Bernoulli trial with success probability `p`. */
  bool(p = 0.5): boolean {
    return this.next() < p;
  }

  /** Uniformly pick one element of a non-empty array. */
  pick<T>(items: ReadonlyArray<T>): T {
    return items[this.int(items.length)];
  }

  /** In-place Fisher–Yates shuffle; returns the same array for chaining. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const tmp = items[i];
      items[i] = items[j];
      items[j] = tmp;
    }
    return items;
  }

  /** Standard normal variate via Box–Muller (one of the pair is discarded). */
  normal(mean = 0, stdDev = 1): number {
    // Guard against log(0).
    const u1 = this.next() || Number.EPSILON;
    const u2 = this.next();
    const magnitude = Math.sqrt(-2 * Math.log(u1));
    return mean + stdDev * magnitude * Math.cos(2 * Math.PI * u2);
  }

  /** Exponential variate with the given rate `λ`. */
  exponential(rate: number): number {
    return -Math.log(1 - this.next()) / rate;
  }

  /** Fork an independent generator with a derived seed (for worker sharding). */
  fork(salt: number): Random {
    return new Random((this.state ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0);
  }
}
