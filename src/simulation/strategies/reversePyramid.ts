import type { CabinLayout } from '../domain/Grid';
import type { SeatId } from '../domain/ids';
import type { Random } from '../rng/Random';
import type { BoardingStrategy } from './BoardingStrategy';

/** Number of diagonal bands. */
const ZONE_COUNT = 5;
/** Maximum aisle distance (window) in a 3-3 cabin. */
const MAX_AISLE_DISTANCE = 2;

/**
 * Reverse Pyramid — a hybrid that fuses WilMA's outside-in sorting with a
 * back-to-front flow along the diagonal.
 *
 * Each seat is scored by how *rear* and how *outboard* it is:
 *
 *   score = rearness + outwardness  ∈ [0, 2]
 *
 * Sorting by descending score and quantising into {@link ZONE_COUNT} bands
 * yields diagonal waves: Zone 1 is the rear-window corner, the final zone is the
 * front-aisle corner. This preserves WilMA's zero seat interference while
 * spreading passengers longitudinally to cut the localized aisle clustering that
 * pure WilMA still suffers.
 */
export const reversePyramidStrategy: BoardingStrategy = {
  id: 'reverse-pyramid',
  name: 'Reverse Pyramid',
  description: `${ZONE_COUNT} diagonal zones, rear-window → front-aisle; random within each zone.`,
  generateOrder(cabin: CabinLayout, rng: Random): SeatId[] {
    const lastRow = Math.max(1, cabin.rows - 1);
    const scored = cabin.seats.map((seat) => ({
      id: seat.id,
      score: (lastRow - seat.row) / lastRow + seat.aisleDistance / MAX_AISLE_DISTANCE,
    }));
    // Highest score (rear + window) boards first.
    scored.sort((a, b) => b.score - a.score);

    const order: SeatId[] = [];
    const perZone = Math.ceil(scored.length / ZONE_COUNT);
    for (let z = 0; z < ZONE_COUNT; z++) {
      const band = scored.slice(z * perZone, (z + 1) * perZone).map((entry) => entry.id);
      rng.shuffle(band); // intra-zone randomness preserves the diagonal but allows parallelism
      for (const id of band) order.push(id);
    }
    return order;
  },
};
