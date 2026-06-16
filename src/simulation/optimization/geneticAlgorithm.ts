import type { SeatId } from '../domain/ids';
import { Random } from '../rng/Random';

/**
 * Permutation Genetic Algorithm for evolving boarding sequences.
 *
 * A chromosome is a full permutation of the cabin's seat ids — i.e. a boarding
 * order. Fitness is the simulated boarding time `E(T)` (lower is better),
 * evaluated by an injected function so the GA stays decoupled from the engine
 * (and unit-testable with a mock fitness). Genetic operators are permutation-safe:
 *
 *   - Selection : tournament (pick `k`, keep the fittest) + elitism.
 *   - Crossover : Order Crossover (OX1) — preserves a contiguous slice of one
 *                 parent and fills the rest in the other parent's relative order,
 *                 guaranteeing a valid permutation.
 *   - Mutation  : swap mutation — a few random transpositions to escape local minima.
 */

export interface GAOptions {
  populationSize: number;
  generations: number;
  /** Top-N chromosomes carried unchanged into the next generation. */
  eliteCount: number;
  /** Probability a child is mutated after crossover. */
  mutationRate: number;
  /** Number of random swaps applied when a child mutates. */
  mutationSwaps: number;
  /** Tournament size for parent selection. */
  tournamentSize: number;
  seed: number;
}

export interface GAGenerationStat {
  generation: number;
  bestFitness: number;
  meanFitness: number;
}

export interface GAResult {
  best: SeatId[];
  bestFitness: number;
  history: GAGenerationStat[];
}

/** Sensible defaults (seed supplied per-run). */
export const DEFAULT_GA_OPTIONS: Omit<GAOptions, 'seed'> = {
  populationSize: 40,
  generations: 25,
  eliteCount: 4,
  mutationRate: 0.35,
  mutationSwaps: 3,
  tournamentSize: 4,
};

interface Scored {
  order: SeatId[];
  fitness: number;
}

/**
 * Evolve a boarding order that minimises `fitness`. Deterministic given
 * `options.seed` and a deterministic fitness function.
 */
export function evolve(
  genes: ReadonlyArray<SeatId>,
  fitness: (order: ReadonlyArray<SeatId>) => number,
  options: GAOptions,
  onGeneration?: (stat: GAGenerationStat) => void,
): GAResult {
  const rng = new Random(options.seed);

  // Cache fitness by chromosome (seat ids are short strings) so elites and
  // recurring offspring are never re-simulated.
  const cache = new Map<string, number>();
  const evaluate = (order: SeatId[]): number => {
    const key = order.join('');
    let value = cache.get(key);
    if (value === undefined) {
      value = fitness(order);
      cache.set(key, value);
    }
    return value;
  };

  let population: SeatId[][] = [];
  for (let i = 0; i < options.populationSize; i++) {
    population.push(rng.shuffle(genes.slice()));
  }

  const history: GAGenerationStat[] = [];
  let best: SeatId[] = population[0];
  let bestFitness = Infinity;

  for (let generation = 0; generation < options.generations; generation++) {
    const scored: Scored[] = population.map((order) => ({ order, fitness: evaluate(order) }));
    scored.sort((a, b) => a.fitness - b.fitness);

    if (scored[0].fitness < bestFitness) {
      bestFitness = scored[0].fitness;
      best = scored[0].order.slice();
    }

    const meanFitness = scored.reduce((sum, s) => sum + s.fitness, 0) / scored.length;
    const stat: GAGenerationStat = { generation, bestFitness: scored[0].fitness, meanFitness };
    history.push(stat);
    onGeneration?.(stat);

    if (generation === options.generations - 1) break;

    // Elitism: carry the fittest forward unchanged.
    const next: SeatId[][] = [];
    for (let e = 0; e < options.eliteCount && e < scored.length; e++) {
      next.push(scored[e].order.slice());
    }
    // Fill the rest with crossover + mutation offspring.
    while (next.length < options.populationSize) {
      const parentA = tournament(scored, rng, options.tournamentSize);
      const parentB = tournament(scored, rng, options.tournamentSize);
      let child = orderCrossover(parentA, parentB, rng);
      if (rng.next() < options.mutationRate) child = swapMutate(child, rng, options.mutationSwaps);
      next.push(child);
    }
    population = next;
  }

  return { best, bestFitness, history };
}

/** Tournament selection: sample `k` chromosomes, return the fittest one's order. */
function tournament(scored: Scored[], rng: Random, k: number): SeatId[] {
  let bestIndex = rng.int(scored.length);
  for (let i = 1; i < k; i++) {
    const index = rng.int(scored.length);
    if (scored[index].fitness < scored[bestIndex].fitness) bestIndex = index;
  }
  return scored[bestIndex].order;
}

/** Order Crossover (OX1): keep a slice of A, fill the rest in B's order. */
function orderCrossover(parentA: SeatId[], parentB: SeatId[], rng: Random): SeatId[] {
  const n = parentA.length;
  const a = rng.int(n);
  const b = rng.int(n);
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);

  const child: SeatId[] = new Array<SeatId>(n);
  const taken = new Set<SeatId>();
  for (let k = lo; k <= hi; k++) {
    child[k] = parentA[k];
    taken.add(parentA[k]);
  }

  let writePos = (hi + 1) % n;
  for (let s = 0; s < n; s++) {
    const gene = parentB[(hi + 1 + s) % n];
    if (!taken.has(gene)) {
      child[writePos] = gene;
      taken.add(gene);
      writePos = (writePos + 1) % n;
    }
  }
  return child;
}

/** Swap mutation: `swaps` random transpositions. */
function swapMutate(order: SeatId[], rng: Random, swaps: number): SeatId[] {
  const out = order.slice();
  for (let s = 0; s < swaps; s++) {
    const i = rng.int(out.length);
    const j = rng.int(out.length);
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}
