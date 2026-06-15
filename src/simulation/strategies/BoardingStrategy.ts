import type { CabinLayout } from '../domain/Grid';
import type { SeatId } from '../domain/ids';
import type { Random } from '../rng/Random';

/**
 * Canonical strategy identifiers. Concrete sequence generators are implemented
 * in later phases; Phase 1 only fixes the contract and the registry seam so the
 * engine can be wired against the interface today.
 */
export type StrategyId =
  | 'random'
  | 'back-to-front'
  | 'front-to-back'
  | 'wilma'
  | 'reverse-pyramid'
  | 'steffen-perfect'
  | 'steffen-modified'
  | 'custom';

/**
 * A boarding strategy is a *pure function* from cabin geometry (plus an RNG for
 * stochastic strategies like Random) to an ordered list of seat ids — the exact
 * sequence in which passengers are admitted through the door. The genetic-
 * algorithm optimiser (later phase) treats this very array as a "chromosome".
 */
export interface BoardingStrategy {
  readonly id: StrategyId;
  readonly name: string;
  readonly description: string;
  /** Produce the boarding order. Implemented in Phase 2. */
  generateOrder(cabin: CabinLayout, rng: Random): SeatId[];
}

// ── Registry ──────────────────────────────────────────────────────────────────
// A tiny service locator so the UI can enumerate available strategies and the
// engine can resolve one by id. Intentionally empty until strategies land.

const registry = new Map<StrategyId, BoardingStrategy>();

export function registerStrategy(strategy: BoardingStrategy): void {
  registry.set(strategy.id, strategy);
}

export function getStrategy(id: StrategyId): BoardingStrategy | undefined {
  return registry.get(id);
}

export function listStrategies(): BoardingStrategy[] {
  return [...registry.values()];
}
