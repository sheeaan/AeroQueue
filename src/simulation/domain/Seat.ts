import type { SeatId } from './ids';
import type { CabinSide, GridCoord, SeatColumnType } from './geometry';

/**
 * A single physical seat in the cabin.
 *
 * Seats are *immutable geometry* — they are computed once from the cabin layout
 * and never mutate during a run. Live occupancy is tracked separately by
 * {@link CabinGrid} so that the static topology can be shared freely (including
 * across Web Workers) without copying.
 */
export interface Seat {
  /** Stable key such as `"12A"`. */
  readonly id: SeatId;
  /** Human-facing label (currently identical to `id`, kept distinct for i18n). */
  readonly label: string;
  /** Zero-based cabin row (0 = nose-most row). */
  readonly row: number;
  /** Position of this seat within the cellular-automata matrix `C`. */
  readonly coord: GridCoord;
  /** Fuselage half. */
  readonly side: CabinSide;
  /** Lateral classification (window / middle / aisle). */
  readonly type: SeatColumnType;
  /**
   * Number of seated neighbours between this seat and the aisle.
   * 0 = aisle seat, 1 = middle, 2 = window. This is exactly the count of
   * passengers who must perform the over-climb maneuver in the seat-interference
   * penalty `T_seat_delay`.
   */
  readonly aisleDistance: number;
}
