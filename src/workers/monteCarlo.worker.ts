/**
 * Headless Monte-Carlo Web Worker.
 *
 * A single visualised run is statistically meaningless (stow times, walking
 * speeds, and — for some strategies — the boarding order are random). To
 * converge on the true expected boarding time `E` (Law of Large Numbers) the
 * platform runs many headless simulations. Doing that on the main thread would
 * freeze the UI, so it happens here and only progress/results are posted back.
 *
 * Instantiate from the main thread (Next.js-compatible) with:
 *   new Worker(new URL('../workers/monteCarlo.worker.ts', import.meta.url), { type: 'module' })
 *
 * The heavy lifting lives in the pure {@link runMonteCarlo} function so it can be
 * unit-tested in Node; the message glue at the bottom only activates inside a
 * real worker scope.
 */
import { summarize } from '@/simulation/analysis/statistics';
import type { MonteCarloResult } from '@/simulation/analysis/statistics';
import { DEFAULT_SIMULATION_CONFIG } from '@/simulation/config/simulation';
import type { SimulationConfig } from '@/simulation/config/simulation';
import { SimulationEngine } from '@/simulation/engine/SimulationEngine';
import { Random } from '@/simulation/rng/Random';
import { getStrategy, registerDefaultStrategies } from '@/simulation/strategies';
import type { StrategyId } from '@/simulation/strategies/BoardingStrategy';

// ── Message protocol ────────────────────────────────────────────────────────
export interface MonteCarloRequest {
  strategyId: StrategyId;
  /** Number of independent simulations `M`. */
  iterations: number;
  /** Deterministic Simple Mode vs stochastic Realism Mode. */
  isSimpleMode: boolean;
  /** Optional base seed for reproducibility. */
  baseSeed?: number;
}

export interface MonteCarloProgress {
  type: 'progress';
  completed: number;
  total: number;
}

export interface MonteCarloDone {
  type: 'done';
  result: MonteCarloResult;
  strategyId: StrategyId;
  isSimpleMode: boolean;
}

export type MonteCarloResponse = MonteCarloProgress | MonteCarloDone;

/** Seed offset that decorrelates the order stream from the attribute stream. */
const ATTRIBUTE_SEED_OFFSET = 1_000_003;

/**
 * Run `request.iterations` independent simulations and aggregate the boarding
 * times into `{ mean (μ), variance (σ²), … }`. Each iteration draws a fresh
 * boarding order *and* fresh passenger attributes (in Realism Mode), so the
 * resulting variance captures the strategy's full real-world spread.
 */
export function runMonteCarlo(
  request: MonteCarloRequest,
  onProgress?: (completed: number, total: number) => void,
): MonteCarloResult {
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

  return summarize(samples);
}

// ── Worker glue (only activates inside a DedicatedWorkerGlobalScope) ──────────
// Guarded with `typeof self` so importing this module in Node (for the pure
// function or its types) has no side effects.
if (typeof self !== 'undefined' && typeof (self as unknown as Worker).postMessage === 'function') {
  const ctx = self as unknown as Worker;
  ctx.onmessage = (event: MessageEvent<MonteCarloRequest>) => {
    const request = event.data;
    const result = runMonteCarlo(request, (completed, total) =>
      ctx.postMessage({ type: 'progress', completed, total } satisfies MonteCarloProgress),
    );
    ctx.postMessage({
      type: 'done',
      result,
      strategyId: request.strategyId,
      isSimpleMode: request.isSimpleMode,
    } satisfies MonteCarloDone);
  };
}
