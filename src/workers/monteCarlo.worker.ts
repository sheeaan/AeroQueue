/**
 * Headless Monte-Carlo shard runner (Web Worker).
 *
 * Rationale: a single visualised run is statistically meaningless because
 * stowage times and walking speeds are random. To converge on the true expected
 * boarding time `E` (Law of Large Numbers) the platform runs `M ∈ {10, 100,
 * 1000, 10000}` headless simulations. Doing that on the main thread would freeze
 * the UI, so the work is offloaded here and only progress/results are posted
 * back.
 *
 * The heavy lifting lives in the *pure* {@link executeMonteCarlo} function so it
 * can be unit-tested without a Worker context; the message glue at the bottom
 * only activates inside an actual worker.
 */
import { summarize } from '@/simulation/analysis/statistics';
import type { MonteCarloResult } from '@/simulation/analysis/statistics';
import type { SimulationConfig } from '@/simulation/config/simulation';
import type { SeatId } from '@/simulation/domain/ids';
import { SimulationEngine } from '@/simulation/engine/SimulationEngine';

// ── Message protocol ────────────────────────────────────────────────────────
export interface MonteCarloRequest {
  type: 'run';
  config: SimulationConfig;
  /** Boarding order (chromosome) to evaluate. */
  order: SeatId[];
  /** Number of independent simulations `M`. */
  runs: number;
  /** Base seed; run `i` uses `baseSeed + i` for reproducible independence. */
  baseSeed: number;
}

export interface MonteCarloProgress {
  type: 'progress';
  completed: number;
  total: number;
}

export interface MonteCarloComplete {
  type: 'complete';
  result: MonteCarloResult;
}

export type MonteCarloOutbound = MonteCarloProgress | MonteCarloComplete;

/**
 * Run `request.runs` independent headless simulations and aggregate their final
 * boarding times. Pure and synchronous — the caller decides how to surface
 * progress (the worker glue posts it; a test can collect it).
 */
export function executeMonteCarlo(
  request: MonteCarloRequest,
  onProgress?: (completed: number, total: number) => void,
): MonteCarloResult {
  const samples: number[] = [];
  for (let i = 0; i < request.runs; i++) {
    const engine = new SimulationEngine({ ...request.config, seed: request.baseSeed + i });
    engine.initialize(request.order);
    samples.push(engine.run().boardingTime);
    onProgress?.(i + 1, request.runs);
  }
  return summarize(samples);
}

// ── Worker glue (only runs inside a DedicatedWorkerGlobalScope) ───────────────
// Guarded so importing this module on the main thread (e.g. for the pure
// function or its types) has no side effects. `importScripts` exists only in
// worker scopes, which makes it a reliable discriminator.
const workerScope = globalThis as unknown as {
  importScripts?: unknown;
  postMessage?: (message: unknown) => void;
  onmessage?: ((event: MessageEvent<MonteCarloRequest>) => void) | null;
};

if (typeof workerScope.importScripts === 'function' && typeof workerScope.postMessage === 'function') {
  const post = (message: MonteCarloOutbound): void => workerScope.postMessage!(message);
  workerScope.onmessage = (event: MessageEvent<MonteCarloRequest>) => {
    const result = executeMonteCarlo(event.data, (completed, total) =>
      post({ type: 'progress', completed, total }),
    );
    post({ type: 'complete', result });
  };
}
