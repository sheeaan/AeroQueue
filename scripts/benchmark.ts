/**
 * Reproducible Monte-Carlo benchmark for the README results table.
 *
 * Runs every built-in strategy through N independent, seeded simulations in full
 * stochastic mode (Gamma-distributed stowage + seat-interference penalties) and
 * prints a markdown table ranked by mean boarding time E(T). This mirrors the
 * worker's `runMonteCarlo` loop exactly, but headless (no worker/DOM globals) so
 * the numbers in the README are the same ones the app produces.
 *
 *   npx tsx scripts/benchmark.ts        # or: npm run benchmark
 */
import { summarize } from '@/simulation/analysis/statistics';
import { DEFAULT_SIMULATION_CONFIG } from '@/simulation/config/simulation';
import type { SimulationConfig } from '@/simulation/config/simulation';
import { SimulationEngine } from '@/simulation/engine/SimulationEngine';
import { Random } from '@/simulation/rng/Random';
import { DEFAULT_STRATEGIES, registerDefaultStrategies } from '@/simulation/strategies';

registerDefaultStrategies();

const ITERATIONS = 1000;
const BASE_SEED = 0xc0ffee;
const ATTRIBUTE_SEED_OFFSET = 1_000_003; // matches monteCarlo.worker.ts

const cabin = DEFAULT_SIMULATION_CONFIG.cabin;

interface Row {
  name: string;
  mean: number;
  stdDev: number;
  min: number;
  max: number;
  runs: number;
}

function benchmark(strategy: (typeof DEFAULT_STRATEGIES)[number]): Row {
  const samples = new Array<number>(ITERATIONS);
  for (let i = 0; i < ITERATIONS; i++) {
    const order = strategy.generateOrder(cabin, new Random(BASE_SEED + i));
    const config: SimulationConfig = {
      ...DEFAULT_SIMULATION_CONFIG,
      seed: BASE_SEED + ATTRIBUTE_SEED_OFFSET + i,
      simpleMode: false,
    };
    const engine = new SimulationEngine(config);
    engine.initialize(order);
    samples[i] = engine.run().boardingTime;
  }
  const s = summarize(samples);
  return { name: strategy.name, mean: s.mean, stdDev: s.stdDev, min: s.min, max: s.max, runs: s.runs };
}

console.error(`Running ${ITERATIONS} seeded simulations × ${DEFAULT_STRATEGIES.length} strategies (full stochastic mode)…`);

const rows = DEFAULT_STRATEGIES.map(benchmark).sort((a, b) => a.mean - b.mean);
const fastest = rows.length > 0 ? rows[0].mean : 0;

const f = (n: number): string => n.toFixed(1);
console.log(`\n| Strategy | Mean E(T) | Std. Dev. | Min | Max | vs. fastest |`);
console.log(`| --- | ---: | ---: | ---: | ---: | ---: |`);
for (const r of rows) {
  const delta = fastest > 0 ? `+${(((r.mean - fastest) / fastest) * 100).toFixed(1)}%` : '—';
  const tag = r.mean === fastest ? '—' : delta;
  console.log(`| ${r.name} | ${f(r.mean)} | ${f(r.stdDev)} | ${f(r.min)} | ${f(r.max)} | ${tag} |`);
}
console.log(`\n_${ITERATIONS} seeded runs per strategy; boarding time in simulation ticks._`);
