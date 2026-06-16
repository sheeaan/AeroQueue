/**
 * Headless verification for the Monte-Carlo worker's *computation* path.
 * Exercises the exact `runMonteCarlo` function the worker calls (the worker glue
 * is guarded out under Node), confirming μ/σ² are produced and that Simple Mode
 * collapses variance relative to Realism.
 *
 *   npx tsx scripts/phase4-harness.ts
 */
import type { StrategyId } from '@/simulation/strategies/BoardingStrategy';
import { runMonteCarlo } from '@/workers/monteCarlo.worker';

const STRATEGIES: StrategyId[] = ['steffen-perfect', 'wilma', 'back-to-front', 'random'];
const ITERATIONS = 300;

for (const isSimpleMode of [false, true]) {
  console.log(`\n=== ${isSimpleMode ? 'SIMPLE (deterministic)' : 'REALISM (stochastic)'} — ${ITERATIONS} runs ===`);
  console.log('strategy'.padEnd(16), 'mean μ'.padStart(9), 'var σ²'.padStart(10), 'sd σ'.padStart(8));
  for (const strategyId of STRATEGIES) {
    const { result: r } = runMonteCarlo({ kind: 'monte-carlo', strategyId, iterations: ITERATIONS, isSimpleMode });
    console.log(
      strategyId.padEnd(16),
      r.mean.toFixed(1).padStart(9),
      r.variance.toFixed(1).padStart(10),
      r.stdDev.toFixed(1).padStart(8),
    );
  }
}
