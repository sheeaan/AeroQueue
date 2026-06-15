import type { CabinLayout } from '../domain/Grid';
import type { SeatId } from '../domain/ids';
import type { Random } from '../rng/Random';
import type { BoardingStrategy } from './BoardingStrategy';
import { rowZones, seatsInRows } from './helpers';

const ZONE_COUNT = 5;

/**
 * Front-to-Back — the pathological worst case, included as a baseline.
 *
 * Front blocks board first and immediately halt in the forward aisle to stow,
 * physically corking the door so trailing passengers cannot even enter. A purely
 * serial process with essentially zero parallel stowage.
 */
export const frontToBackStrategy: BoardingStrategy = {
  id: 'front-to-back',
  name: 'Front-to-Back',
  description: `${ZONE_COUNT} block zones boarded front → rear; random within each block.`,
  generateOrder(cabin: CabinLayout, rng: Random): SeatId[] {
    const zones = rowZones(cabin, ZONE_COUNT); // front-to-rear
    const order: SeatId[] = [];
    for (let z = 0; z < zones.length; z++) {
      const seats = seatsInRows(cabin, new Set(zones[z]));
      rng.shuffle(seats);
      for (const seat of seats) order.push(seat.id);
    }
    return order;
  },
};
