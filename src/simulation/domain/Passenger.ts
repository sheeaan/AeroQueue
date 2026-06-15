import type { GridCoord } from './geometry';
import type { FamilyGroupId, PassengerId, SeatId } from './ids';
import type { PassengerState } from './state';

/**
 * Per-agent timing accumulators that decompose the objective
 *   E = max_k ( t_walk,k + t_stow,k + Σ T_aisle_delay,k + Σ T_seat_delay,k ).
 * Filled in incrementally by the engine's event handlers (Phase 2).
 */
export interface PassengerMetrics {
  /** Simulation time the agent crossed the aircraft door (`null` until boarded). */
  boardedAt: number | null;
  /** Simulation time the agent reached its terminal seat. */
  seatedAt: number | null;
  /** Ticks spent translating down the aisle (`t_walk`). */
  walkTicks: number;
  /** Ticks spent actively stowing luggage (`t_stow`). */
  stowTicks: number;
  /** Ticks lost to aisle interference (`Σ T_aisle_delay`). */
  aisleBlockedTicks: number;
  /** Ticks lost to the seat-interference over-climb (`Σ T_seat_delay`). */
  seatShuffleTicks: number;
}

/**
 * A passenger agent.
 *
 * The immutable `readonly` fields are the sampled agent vector
 *   p_k = ⟨ S_k, G_k(initial), v_k, B_k, t_stow,k, F_k ⟩
 * drawn at manifest-generation time. The mutable fields are the live FSM state
 * the discrete-event engine evolves.
 */
export interface Passenger {
  // ── Immutable agent vector (sampled once) ─────────────────────────────────
  /** Manifest index `k`. */
  readonly id: PassengerId;
  /** Assigned seat key `S_k`. */
  readonly assignedSeat: SeatId;
  /** Cached grid coordinate of `assignedSeat` (avoids repeated lookups). */
  readonly assignedSeatCoord: GridCoord;
  /** Preferred walking velocity `v_k`, in grid cells per tick. */
  readonly walkingSpeed: number;
  /** Carry-on count `B_k`. */
  readonly bagCount: number;
  /** Total sampled stowage duration `t_stow,k` (ticks), drawn from a Gamma. */
  readonly stowTime: number;
  /** Family/cohesion identifier `F_k`, or `null` when travelling solo. */
  readonly familyGroup: FamilyGroupId | null;

  // ── Mutable runtime / FSM state ───────────────────────────────────────────
  /** Boarding zone `G_k` assigned by the active strategy. */
  boardingGroup: number;
  /** Current FSM state. */
  state: PassengerState;
  /** Current cell in the matrix `C` (aisle while walking/stowing, seat once seated). */
  position: GridCoord;
  /** Remaining stow countdown while in the `Stowing` state. */
  stowTimeRemaining: number;
  /** Position within the boarding queue produced by the strategy. */
  queueIndex: number;
  /** Decomposed timing metrics for this agent. */
  metrics: PassengerMetrics;
}
