import type { CabinLayout } from '../domain/Grid';
import type { SeatId } from '../domain/ids';
import type { Random } from '../rng/Random';
import type { BoardingStrategy } from './BoardingStrategy';
import { rowZones, seatsInRows } from './helpers';

/** Number of block zones the cabin is divided into. */
const ZONE_COUNT = 5;

/**
 * Back-to-Front (Block / Zone) — the ubiquitous airline method, and one of the
 * mathematically worst.
 *
 * The cabin is split into {@link ZONE_COUNT} contiguous blocks; the rear-most
 * block boards first, progressing forward. Passengers are shuffled *within* their
 * block. By forcing every active passenger into one tight spatial cluster it
 * maximises both aisle interference (everyone fights for the same few bins) and
 * seat interference (no window/aisle sorting) — a glowing rear bottleneck.
 */
export const backToFrontStrategy: BoardingStrategy = {
  id: 'back-to-front',
  name: 'Back-to-Front',
  description: `${ZONE_COUNT} block zones boarded rear → front; random within each block.`,
  generateOrder(cabin: CabinLayout, rng: Random): SeatId[] {
    const zones = rowZones(cabin, ZONE_COUNT); // front-to-rear
    const order: SeatId[] = [];
    for (let z = zones.length - 1; z >= 0; z--) {
      const seats = seatsInRows(cabin, new Set(zones[z]));
      rng.shuffle(seats);
      for (const seat of seats) order.push(seat.id);
    }
    return order;
  },
};
