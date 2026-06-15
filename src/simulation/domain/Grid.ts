import type { CabinSide, CellKind, SeatColumnType } from './geometry';
import type { PassengerId, SeatId } from './ids';
import type { Seat } from './Seat';

/** Static description of one column of the cabin matrix. */
export interface ColumnSpec {
  /** Zero-based column index `j` within the matrix `C`. */
  readonly index: number;
  readonly kind: CellKind;
  /** Present only for seat columns. */
  readonly side?: CabinSide;
  /** Present only for seat columns. */
  readonly type?: SeatColumnType;
  /** Cabin letter (A, B, C, ...) for seat columns. */
  readonly seatLetter?: string;
}

/**
 * Immutable cabin topology — the matrix `C` of dimensions `rows x columns`.
 * Produced by the layout factories in `config/cabin.ts`.
 */
export interface CabinLayout {
  readonly id: string;
  readonly name: string;
  /** Row count `R`. */
  readonly rows: number;
  /** Column descriptors, length `S` (seat columns + the aisle). */
  readonly columns: ReadonlyArray<ColumnSpec>;
  /** Zero-based index of the central aisle column. */
  readonly aisleColIndex: number;
  /** Flattened list of every seat (row-major). */
  readonly seats: ReadonlyArray<Seat>;
  readonly seatCount: number;
}

/**
 * Mutable occupancy layer over a {@link CabinLayout}.
 *
 * The aisle is stored as a dense 1-D array indexed by row, so that "is the cell
 * directly ahead free?" — the inner loop of every kinematic step — is an `O(1)`
 * lookup rather than an `O(N)` scan of all agents. This is the spatial-hash
 * optimisation that keeps a full run at `O(N log N)`.
 */
export class CabinGrid {
  private readonly aisle: Array<PassengerId | null>;
  private readonly seatOccupant: Map<SeatId, PassengerId | null>;

  constructor(public readonly layout: CabinLayout) {
    this.aisle = new Array<PassengerId | null>(layout.rows).fill(null);
    this.seatOccupant = new Map<SeatId, PassengerId | null>();
    for (const seat of layout.seats) this.seatOccupant.set(seat.id, null);
  }

  /** `true` when no agent occupies the aisle cell at `row`. */
  isAisleFree(row: number): boolean {
    return this.aisle[row] == null;
  }

  aisleOccupant(row: number): PassengerId | null {
    return this.aisle[row] ?? null;
  }

  enterAisle(row: number, id: PassengerId): void {
    this.aisle[row] = id;
  }

  leaveAisle(row: number): void {
    this.aisle[row] = null;
  }

  seatOccupantOf(seatId: SeatId): PassengerId | null {
    return this.seatOccupant.get(seatId) ?? null;
  }

  occupySeat(seatId: SeatId, id: PassengerId): void {
    this.seatOccupant.set(seatId, id);
  }

  /** Restore the grid to a fully empty state for a fresh run (no re-allocation). */
  reset(): void {
    this.aisle.fill(null);
    for (const key of this.seatOccupant.keys()) this.seatOccupant.set(key, null);
  }
}
