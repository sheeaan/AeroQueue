/**
 * Strategy package barrel + default-registration bootstrap.
 *
 * Importing concrete strategies for their side effects is fragile under
 * tree-shaking, so registration is an explicit, idempotent call instead.
 */
import { registerStrategy } from './BoardingStrategy';
import { backToFrontStrategy } from './backToFront';
import { frontToBackStrategy } from './frontToBack';
import { randomStrategy } from './random';
import { reversePyramidStrategy } from './reversePyramid';
import { steffenPerfectStrategy } from './steffen';
import { wilmaStrategy } from './wilma';

export * from './BoardingStrategy';
export { randomStrategy } from './random';
export { backToFrontStrategy } from './backToFront';
export { frontToBackStrategy } from './frontToBack';
export { wilmaStrategy } from './wilma';
export { reversePyramidStrategy } from './reversePyramid';
export { steffenPerfectStrategy } from './steffen';

/** Every concrete strategy implemented so far, in display order. */
export const DEFAULT_STRATEGIES = [
  randomStrategy,
  backToFrontStrategy,
  frontToBackStrategy,
  wilmaStrategy,
  reversePyramidStrategy,
  steffenPerfectStrategy,
] as const;

let registered = false;

/** Register all built-in strategies with the global registry (idempotent). */
export function registerDefaultStrategies(): void {
  if (registered) return;
  registered = true;
  for (const strategy of DEFAULT_STRATEGIES) registerStrategy(strategy);
}
