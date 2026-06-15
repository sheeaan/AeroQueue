import type { CabinSide, SeatColumnType } from '../domain/geometry';
import type { CabinLayout } from '../domain/Grid';
import type { Seat } from '../domain/Seat';
import type { SeatId } from '../domain/ids';

/**
 * Shared utilities for the concrete boarding-strategy generators. All functions
 * are pure and deterministic (any randomness is delegated to the injected RNG),
 * so a `(seed, strategy)` pair always yields the same boarding order.
 */

/** Composite key for the `(row, side, type)` → seat lookup (unique in a 3-3 cabin). */
export function seatKey(row: number, side: CabinSide, type: SeatColumnType): string {
  return `${row}:${side}:${type}`;
}

/** Build a `(row, side, type)` → {@link Seat} index for direct addressing. */
export function buildSeatLookup(cabin: CabinLayout): Map<string, Seat> {
  const lookup = new Map<string, Seat>();
  for (const seat of cabin.seats) lookup.set(seatKey(seat.row, seat.side, seat.type), seat);
  return lookup;
}

/** All seat ids in raw layout order (row-major). */
export function allSeatIds(cabin: CabinLayout): SeatId[] {
  return cabin.seats.map((seat) => seat.id);
}

/** Seats whose row is contained in `rows`. */
export function seatsInRows(cabin: CabinLayout, rows: ReadonlySet<number>): Seat[] {
  return cabin.seats.filter((seat) => rows.has(seat.row));
}

/**
 * Partition rows `[0 .. R-1]` into `zoneCount` contiguous blocks, returned
 * **front-to-rear** (index 0 = the front-most block). Remainder rows are spread
 * across the earliest blocks so sizes differ by at most one.
 */
export function rowZones(cabin: CabinLayout, zoneCount: number): number[][] {
  const total = cabin.rows;
  const base = Math.floor(total / zoneCount);
  const remainder = total % zoneCount;

  const zones: number[][] = [];
  let start = 0;
  for (let z = 0; z < zoneCount; z++) {
    const size = base + (z < remainder ? 1 : 0);
    const rows: number[] = [];
    for (let r = start; r < start + size; r++) rows.push(r);
    zones.push(rows);
    start += size;
  }
  return zones;
}
