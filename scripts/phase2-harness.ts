/**
 * Headless verification harness (not part of the app build).
 * Runs every strategy through the real engine many times and prints the
 * boarding-time distribution, asserting that every passenger actually seats.
 *
 *   npx tsx scripts/phase2-harness.ts
 */
import { DEFAULT_SIMULATION_CONFIG } from '@/simulation/config/simulation';
import { SimulationEngine } from '@/simulation/engine/SimulationEngine';
import { Random } from '@/simulation/rng/Random';
import { summarize } from '@/simulation/analysis/statistics';
import { getStrategy, registerDefaultStrategies } from '@/simulation/strategies';
import type { StrategyId } from '@/simulation/strategies/BoardingStrategy';

registerDefaultStrategies();

const cabin = DEFAULT_SIMULATION_CONFIG.cabin;
const RUNS = 50;
const ORDER: StrategyId[] = [
  'front-to-back',
  'back-to-front',
  'random',
  'wilma',
  'reverse-pyramid',
  'steffen-perfect',
];

console.log(`Cabin: ${cabin.name} — ${cabin.seatCount} seats, ${RUNS} runs each\n`);
console.log('strategy'.padEnd(18), 'mean', '  sd', '   min', '  max', '  incomplete');

for (const id of ORDER) {
  const strategy = getStrategy(id)!;
  const samples: number[] = [];
  let incomplete = 0;

  for (let run = 0; run < RUNS; run++) {
    const order = strategy.generateOrder(cabin, new Random(1000 + run));
    const engine = new SimulationEngine({ ...DEFAULT_SIMULATION_CONFIG, seed: 7000 + run });
    engine.initialize(order);
    const result = engine.run();
    if (result.seatedCount !== cabin.seatCount) incomplete++;
    samples.push(result.boardingTime);
  }

  const s = summarize(samples);
  console.log(
    id.padEnd(18),
    s.mean.toFixed(0).padStart(4),
    s.stdDev.toFixed(0).padStart(4),
    s.min.toFixed(0).padStart(5),
    s.max.toFixed(0).padStart(5),
    String(incomplete).padStart(8),
  );
}
