import type { CabinLayout, ColumnSpec } from '../domain/Grid';
import type { Seat } from '../domain/Seat';
import type { SeatColumnType } from '../domain/geometry';
import { SeatId } from '../domain/ids';

/**
 * Cabin-layout factories.
 *
 * A layout is pure, immutable geometry derived from a column pattern. The
 * canonical narrow-body (Boeing 737 / Airbus A320) is 3-3 seating: columns
 * `A B C | aisle | D E F`, i.e. `S = 7` with the aisle at index 3.
 */

/** Seat letters per fuselage side, ordered window → aisle. */
const LEFT_LETTERS = ['A', 'B', 'C'] as const; // A = window, C = aisle-side
const RIGHT_LETTERS = ['D', 'E', 'F'] as const; // D = aisle-side, F = window

/** Map the gap between a seat column and the aisle to a lateral classification. */
function classify(aisleDistance: number): SeatColumnType {
  if (aisleDistance === 0) return 'aisle';
  if (aisleDistance === 1) return 'middle';
  return 'window';
}

/**
 * Build a symmetric 3-3 narrow-body cabin with `rows` rows (default 30 ≈ 180
 * seats, a typical A320/737 single-class fit).
 */
export function createNarrowBodyCabin(rows = 30): CabinLayout {
  const seatsPerSide = 3;
  const aisleColIndex = seatsPerSide; // columns 0..2 | 3 (aisle) | 4..6

  // ── Static column descriptors ──────────────────────────────────────────────
  const columns: ColumnSpec[] = [];
  for (let col = 0; col <= seatsPerSide * 2; col++) {
    if (col === aisleColIndex) {
      columns.push({ index: col, kind: 'aisle' });
      continue;
    }
    const left = col < aisleColIndex;
    const aisleDistance = Math.abs(col - aisleColIndex) - 1;
    const letter = left ? LEFT_LETTERS[col] : RIGHT_LETTERS[col - aisleColIndex - 1];
    columns.push({
      index: col,
      kind: 'seat',
      side: left ? 'left' : 'right',
      type: classify(aisleDistance),
      seatLetter: letter,
    });
  }

  // ── Seat instances (row-major) ─────────────────────────────────────────────
  const seats: Seat[] = [];
  for (let row = 0; row < rows; row++) {
    const rowLabel = row + 1; // human-facing rows are 1-based
    for (const column of columns) {
      if (column.kind !== 'seat') continue;
      const aisleDistance = Math.abs(column.index - aisleColIndex) - 1;
      const id = SeatId(`${rowLabel}${column.seatLetter}`);
      seats.push({
        id,
        label: `${rowLabel}${column.seatLetter}`,
        row,
        coord: { row, col: column.index },
        side: column.side!,
        type: column.type!,
        aisleDistance,
      });
    }
  }

  return {
    id: `narrow-body-3-3-${rows}`,
    name: `Narrow-body 3-3 (${rows} rows)`,
    rows,
    columns,
    aisleColIndex,
    seats,
    seatCount: seats.length,
  };
}

/** Default cabin shared by the demo and the default simulation config. */
export const NARROW_BODY_3_3: CabinLayout = createNarrowBodyCabin(30);
