/**
 * Headless verification of the GA optimizer's evolution loop.
 * Confirms the GA improves over generations and converges toward the known
 * optimum (Steffen) under Simple-Mode fitness, far below a random baseline.
 *
 *   npx tsx scripts/phase5-harness.ts
 */
import { DEFAULT_SIMULATION_CONFIG } from '@/simulation/config/simulation';
import type { SeatId } from '@/simulation/domain/ids';
import { SimulationEngine } from '@/simulation/engine/SimulationEngine';
import { DEFAULT_GA_OPTIONS, evolve } from '@/simulation/optimization/geneticAlgorithm';
import { Random } from '@/simulation/rng/Random';
import { getStrategy, registerDefaultStrategies } from '@/simulation/strategies';

registerDefaultStrategies();

const cabin = DEFAULT_SIMULATION_CONFIG.cabin;
const genes = cabin.seats.map((seat) => seat.id);
const config = { ...DEFAULT_SIMULATION_CONFIG, simpleMode: true, seed: 1 };
const engine = new SimulationEngine(config);

const fitness = (order: ReadonlyArray<SeatId>): number => {
  engine.initialize(order);
  return engine.run().boardingTime;
};

const steffen = getStrategy('steffen-perfect')!.generateOrder(cabin, new Random(1));
const randomOrder = new Random(2).shuffle(genes.slice());
console.log('Baselines (Simple Mode E(T)):');
console.log('  Steffen (optimum):', fitness(steffen).toFixed(0));
console.log('  Random order     :', fitness(randomOrder).toFixed(0));

console.log('\nEvolving…');
const GENERATIONS = 60;
const result = evolve(
  genes,
  fitness,
  { ...DEFAULT_GA_OPTIONS, generations: GENERATIONS, populationSize: 60, seed: 123 },
  (s) => {
    if (s.generation % 10 === 0 || s.generation === GENERATIONS - 1) {
      console.log(`  gen ${String(s.generation).padStart(2)}: best=${s.bestFitness.toFixed(0)}  mean=${s.meanFitness.toFixed(0)}`);
    }
  },
);

console.log('\nGA best E(T):', result.bestFitness.toFixed(0));
console.log('Improvement: gen0 best', result.history[0].bestFitness.toFixed(0), '→', result.bestFitness.toFixed(0));
console.log('valid permutation:', new Set(result.best).size === genes.length && result.best.length === genes.length);
