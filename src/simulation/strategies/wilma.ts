import type { SeatColumnType } from '../domain/geometry';
import type { CabinLayout } from '../domain/Grid';
import type { SeatId } from '../domain/ids';
import type { Random } from '../rng/Random';
import type { BoardingStrategy } from './BoardingStrategy';

/** Lateral boarding order: outside-in. */
const TYPE_ORDER: ReadonlyArray<SeatColumnType> = ['window', 'middle', 'aisle'];

/**
 * WilMA (Window-Middle-Aisle / Outside-In) — three lateral zones.
 *
 * All window passengers board, then all middle, then all aisle. Because the
 * inner seats are always filled before the outer ones, **seat interference is
 * eliminated entirely** — no seated passenger is ever asked to stand. Aisle
 * interference remains moderate: window passengers within a zone can still
 * cluster, so order within each lateral zone is randomised.
 */
export const wilmaStrategy: BoardingStrategy = {
  id: 'wilma',
  name: 'WilMA (Outside-In)',
  description: 'Window → Middle → Aisle lateral zones; random within each zone.',
  generateOrder(cabin: CabinLayout, rng: Random): SeatId[] {
    const order: SeatId[] = [];
    for (const type of TYPE_ORDER) {
      const seats = cabin.seats.filter((seat) => seat.type === type);
      rng.shuffle(seats);
      for (const seat of seats) order.push(seat.id);
    }
    return order;
  },
};
