import type { CabinLayout } from '../domain/Grid';
import type { SeatId } from '../domain/ids';
import type { Random } from '../rng/Random';
import type { BoardingStrategy } from './BoardingStrategy';
import { allSeatIds } from './helpers';

/**
 * Random — a single boarding zone; every passenger is admitted in a uniformly
 * shuffled order.
 *
 * Counter-intuitively strong: random arrival naturally disperses passengers
 * along the longitudinal axis, opening multiple parallel stowage pockets. It
 * therefore routinely beats structured zone methods on the *mean*, while paying
 * for it with very high *variance* (a luggage-heavy cluster can land anywhere).
 */
export const randomStrategy: BoardingStrategy = {
  id: 'random',
  name: 'Random',
  description: 'Single zone; passengers boarded in a uniformly random order.',
  generateOrder(cabin: CabinLayout, rng: Random): SeatId[] {
    return rng.shuffle(allSeatIds(cabin));
  },
};
