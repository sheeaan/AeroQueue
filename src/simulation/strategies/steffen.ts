import type { CabinSide, SeatColumnType } from '../domain/geometry';
import type { CabinLayout } from '../domain/Grid';
import type { SeatId } from '../domain/ids';
import type { Random } from '../rng/Random';
import type { BoardingStrategy } from './BoardingStrategy';
import { buildSeatLookup, seatKey } from './helpers';

/** Outside-in lateral order. */
const TYPE_ORDER: ReadonlyArray<SeatColumnType> = ['window', 'middle', 'aisle'];
/** Side order (arbitrary for performance; left first matches the 30A, 28A… example). */
const SIDE_ORDER: ReadonlyArray<CabinSide> = ['left', 'right'];

/**
 * Steffen Method (Perfect) — the MCMC-derived, mathematically optimal sequence.
 *
 * The controlling insight is that luggage stowing, not walking, is the binding
 * constraint, so the sequence is engineered to make stowing fully *parallel*.
 * Passengers are admitted single-file with a strict **two-row physical gap**, so
 * no two consecutive boarders' "collision boxes" overlap and they hoist bags
 * simultaneously.
 *
 * Construction (fully deterministic — the optimum needs no randomness):
 *   for each seat column, outside-in (window → middle → aisle)
 *     for each side
 *       for each parity offset {0, 1}             // even-from-rear, then odd
 *         walk rows rear → front in steps of 2    // e.g. 30A, 28A, 26A, 24A …
 *
 * Each descending step-2 run guarantees the 2-row aisle gap that maximises
 * parallel stowage; switching column/side/parity starts a fresh run while the
 * previous wave is still settling. Up to ~2× faster than back-to-front.
 */
export const steffenPerfectStrategy: BoardingStrategy = {
  id: 'steffen-perfect',
  name: 'Steffen (Perfect)',
  description: 'Optimal single-file order; alternating rows by 2 for fully parallel stowage.',
  generateOrder(cabin: CabinLayout, _rng: Random): SeatId[] {
    const lookup = buildSeatLookup(cabin);
    const rearRow = cabin.rows - 1;
    const order: SeatId[] = [];

    for (const type of TYPE_ORDER) {
      for (const side of SIDE_ORDER) {
        for (const offset of [0, 1] as const) {
          for (let row = rearRow - offset; row >= 0; row -= 2) {
            const seat = lookup.get(seatKey(row, side, type));
            if (seat) order.push(seat.id);
          }
        }
      }
    }
    return order;
  },
};
