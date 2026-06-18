/**
 * Headless analytics Web Worker — Monte-Carlo batches and the Genetic-Algorithm
 * optimizer. Both run the pure TypeScript engine off the main thread so the UI
 * stays responsive; only progress/results are posted back.
 *
 * Instantiate (Next.js-compatible) with:
 *   new Worker(new URL('../workers/monteCarlo.worker.ts', import.meta.url), { type: 'module' })
 *
 * The heavy logic lives in pure functions ({@link runMonteCarlo}, {@link evolveOrder})
 * so it is Node-testable; the message glue at the bottom only activates inside a
 * real worker scope.
 */
import { summarize } from '@/simulation/analysis/statistics';
import type { MonteCarloResult } from '@/simulation/analysis/statistics';
import { DEFAULT_SIMULATION_CONFIG } from '@/simulation/config/simulation';
import type { SimulationConfig } from '@/simulation/config/simulation';
import type { SeatId } from '@/simulation/domain/ids';
import { SimulationEngine } from '@/simulation/engine/SimulationEngine';
import {
  DEFAULT_GA_OPTIONS,
  evolve,
  type GAGenerationStat,
} from '@/simulation/optimization/geneticAlgorithm';
import { Random } from '@/simulation/rng/Random';
import { getStrategy, registerDefaultStrategies } from '@/simulation/strategies';
import type { StrategyId } from '@/simulation/strategies/BoardingStrategy';

// ── Request protocol (discriminated by `kind`) ────────────────────────────────
export interface MonteCarloRequest {
  kind: 'monte-carlo';
  strategyId: StrategyId;
  iterations: number;
  isSimpleMode: boolean;
  baseSeed?: number;
}

export interface EvolveRequest {
  kind: 'evolve';
  generations?: number;
  populationSize?: number;
  baseSeed?: number;
}

/** Run a smaller Monte-Carlo batch for several strategies, for the comparison chart. */
export interface CompareRequest {
  kind: 'compare';
  strategyIds: StrategyId[];
  iterations: number;
  isSimpleMode: boolean;
  /** Explicit order for the 'custom' (GA-evolved) entry, if it is being compared. */
  customOrder?: SeatId[];
  baseSeed?: number;
}

export type WorkerRequest = MonteCarloRequest | EvolveRequest | CompareRequest;

// ── Response protocol (discriminated by `type`) ───────────────────────────────
export interface MonteCarloProgress {
  type: 'mc-progress';
  completed: number;
  total: number;
}

export interface MonteCarloDone {
  type: 'mc-done';
  result: MonteCarloResult;
  /** Raw per-run boarding times, for the distribution chart. */
  samples: number[];
  strategyId: StrategyId;
  isSimpleMode: boolean;
}

export interface EvolveProgress {
  type: 'evolve-progress';
  generation: number;
  total: number;
  bestFitness: number;
  meanFitness: number;
}

export interface EvolveDone {
  type: 'evolve-done';
  /** The fittest boarding sequence found. */
  order: SeatId[];
  fitness: number;
  history: GAGenerationStat[];
}

/** One strategy's aggregate row in the comparison chart. */
export interface CompareRow {
  strategyId: StrategyId;
  label: string;
  /** Mean boarding time μ (ticks). */
  mean: number;
  /** Standard deviation σ (ticks) — drives the error bars. */
  stdDev: number;
  min: number;
  max: number;
  runs: number;
}

export interface CompareProgress {
  type: 'compare-progress';
  completed: number;
  total: number;
}

export interface CompareDone {
  type: 'compare-done';
  rows: CompareRow[];
  /** Theoretical zero-interference "free boarding" time (ticks) — the baseline. */
  freeBoardingTicks: number;
  isSimpleMode: boolean;
}

export type WorkerResponse =
  | MonteCarloProgress
  | MonteCarloDone
  | EvolveProgress
  | EvolveDone
  | CompareProgress
  | CompareDone;

export interface MonteCarloRun {
  result: MonteCarloResult;
  samples: number[];
}

const ATTRIBUTE_SEED_OFFSET = 1_000_003;

/**
 * Run `request.iterations` independent simulations and return both the aggregate
 * `{ mean (μ), variance (σ²), … }` and the raw boarding-time samples (needed to
 * visualise the distribution).
 */
export function runMonteCarlo(
  request: MonteCarloRequest,
  onProgress?: (completed: number, total: number) => void,
): MonteCarloRun {
  registerDefaultStrategies();
  const strategy = getStrategy(request.strategyId);
  const cabin = DEFAULT_SIMULATION_CONFIG.cabin;
  const baseSeed = request.baseSeed ?? 0xc0ffee;
  const total = Math.max(0, Math.floor(request.iterations));
  const reportEvery = Math.max(1, Math.floor(total / 100));

  const samples: number[] = new Array(total);
  for (let i = 0; i < total; i++) {
    const order = strategy
      ? strategy.generateOrder(cabin, new Random(baseSeed + i))
      : cabin.seats.map((seat) => seat.id);

    const config: SimulationConfig = {
      ...DEFAULT_SIMULATION_CONFIG,
      seed: baseSeed + ATTRIBUTE_SEED_OFFSET + i,
      simpleMode: request.isSimpleMode,
    };

    const engine = new SimulationEngine(config);
    engine.initialize(order);
    samples[i] = engine.run().boardingTime;

    if (onProgress && (i % reportEvery === 0 || i === total - 1)) onProgress(i + 1, total);
  }

  return { result: summarize(samples), samples };
}

/**
 * Evolve an optimal boarding sequence with the GA. Fitness is the boarding time
 * in **Simple Mode** (deterministic, so the GA optimises pure order structure
 * and every chromosome is a stable, cacheable fitness value). A single engine is
 * reused across evaluations to avoid re-allocating cabin geometry.
 */
export function evolveOrder(
  request: EvolveRequest,
  onGeneration?: (stat: GAGenerationStat) => void,
): EvolveDone {
  const cabin = DEFAULT_SIMULATION_CONFIG.cabin;
  const genes = cabin.seats.map((seat) => seat.id);
  const config: SimulationConfig = { ...DEFAULT_SIMULATION_CONFIG, simpleMode: true, seed: 1 };
  const engine = new SimulationEngine(config);

  const fitness = (order: ReadonlyArray<SeatId>): number => {
    engine.initialize(order);
    return engine.run().boardingTime;
  };

  const result = evolve(
    genes,
    fitness,
    {
      ...DEFAULT_GA_OPTIONS,
      generations: request.generations ?? DEFAULT_GA_OPTIONS.generations,
      populationSize: request.populationSize ?? DEFAULT_GA_OPTIONS.populationSize,
      seed: request.baseSeed ?? 0x5eed,
    },
    onGeneration,
  );

  return { type: 'evolve-done', order: result.best, fitness: result.bestFitness, history: result.history };
}

/**
 * Theoretical "free boarding" time — the makespan if there were **zero**
 * interference (no aisle blocking, no seat over-climbs). It is bounded below by
 * the single-door throughput (every passenger must cross the door, spaced by
 * `boardingIntervalTicks`) plus one stow service for the last passenger, who in
 * the best case takes the nearest row (zero walk). This is the lower-bound red
 * baseline the comparison chart draws under the bars.
 */
export function freeBoardingTicks(config: SimulationConfig, isSimpleMode: boolean): number {
  const passengers = config.cabin.seatCount;
  const interval = config.boardingIntervalTicks;
  const meanStow = isSimpleMode
    ? config.simple.bagCount * config.simple.ticksPerBag
    : meanStowRealism(config);
  return Math.max(0, (passengers - 1) * interval + meanStow);
}

/** Analytic mean of the Realism-mode stow time (Gamma mean `k·θ` per bag + base). */
function meanStowRealism(config: SimulationConfig): number {
  const { bagCountWeights, stowage } = config;
  let m = 0;
  for (let b = 0; b < bagCountWeights.length; b++) {
    const stowMean =
      b <= 0 ? stowage.baseTicks : stowage.baseTicks + b * stowage.shapePerBag * stowage.scalePerBag;
    m += bagCountWeights[b] * stowMean;
  }
  return m;
}

/**
 * Run a smaller Monte-Carlo batch for every requested strategy and reduce each to
 * `{ mean (μ), stdDev (σ), … }`. Strategies share the same per-iteration attribute
 * seeds (common random numbers), so the comparison is variance-reduced and fair.
 */
export function runCompare(
  request: CompareRequest,
  onProgress?: (completed: number, total: number) => void,
): CompareDone {
  registerDefaultStrategies();
  const cabin = DEFAULT_SIMULATION_CONFIG.cabin;
  const baseSeed = request.baseSeed ?? 0xc0ffee;
  const iterations = Math.max(1, Math.floor(request.iterations));
  const total = request.strategyIds.length * iterations;
  const reportEvery = Math.max(1, Math.floor(total / 100));

  const rows: CompareRow[] = [];
  let completed = 0;

  for (const strategyId of request.strategyIds) {
    const strategy = strategyId === 'custom' ? null : getStrategy(strategyId);
    const label = strategyId === 'custom' ? 'GA Evolved' : strategy?.name ?? strategyId;
    const samples = new Array<number>(iterations);

    for (let i = 0; i < iterations; i++) {
      let order: SeatId[];
      if (strategyId === 'custom') {
        order = request.customOrder ? request.customOrder.slice() : cabin.seats.map((seat) => seat.id);
      } else if (strategy) {
        order = strategy.generateOrder(cabin, new Random(baseSeed + i));
      } else {
        order = cabin.seats.map((seat) => seat.id);
      }

      const config: SimulationConfig = {
        ...DEFAULT_SIMULATION_CONFIG,
        seed: baseSeed + ATTRIBUTE_SEED_OFFSET + i,
        simpleMode: request.isSimpleMode,
      };
      const engine = new SimulationEngine(config);
      engine.initialize(order);
      samples[i] = engine.run().boardingTime;

      completed++;
      if (onProgress && (completed % reportEvery === 0 || completed === total)) {
        onProgress(completed, total);
      }
    }

    const summary = summarize(samples);
    rows.push({
      strategyId,
      label,
      mean: summary.mean,
      stdDev: summary.stdDev,
      min: summary.min,
      max: summary.max,
      runs: summary.runs,
    });
  }

  return {
    type: 'compare-done',
    rows,
    freeBoardingTicks: freeBoardingTicks(DEFAULT_SIMULATION_CONFIG, request.isSimpleMode),
    isSimpleMode: request.isSimpleMode,
  };
}

// ── Worker glue (only activates inside a DedicatedWorkerGlobalScope) ──────────
if (typeof self !== 'undefined' && typeof (self as unknown as Worker).postMessage === 'function') {
  const ctx = self as unknown as Worker;
  ctx.onmessage = (event: MessageEvent<WorkerRequest>) => {
    const request = event.data;

    if (request.kind === 'monte-carlo') {
      const { result, samples } = runMonteCarlo(request, (completed, total) =>
        ctx.postMessage({ type: 'mc-progress', completed, total } satisfies MonteCarloProgress),
      );
      ctx.postMessage({
        type: 'mc-done',
        result,
        samples,
        strategyId: request.strategyId,
        isSimpleMode: request.isSimpleMode,
      } satisfies MonteCarloDone);
      return;
    }

    if (request.kind === 'evolve') {
      const total = request.generations ?? DEFAULT_GA_OPTIONS.generations;
      const done = evolveOrder(request, (stat) =>
        ctx.postMessage({
          type: 'evolve-progress',
          generation: stat.generation,
          total,
          bestFitness: stat.bestFitness,
          meanFitness: stat.meanFitness,
        } satisfies EvolveProgress),
      );
      ctx.postMessage(done satisfies EvolveDone);
      return;
    }

    if (request.kind === 'compare') {
      const done = runCompare(request, (completed, total) =>
        ctx.postMessage({ type: 'compare-progress', completed, total } satisfies CompareProgress),
      );
      ctx.postMessage(done satisfies CompareDone);
    }
  };
}
