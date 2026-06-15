import type { PassengerId } from './ids';

/**
 * The discrete events that drive the simulation clock. The engine only ever
 * advances time to the timestamp of the next event of one of these types,
 * bypassing all intervening "dead time".
 */
export enum SimulationEventType {
  /** Agent crosses the aircraft door and enters the first aisle cell. */
  Board = 'board',
  /** Agent attempts to translate one cell further down the aisle. */
  Advance = 'advance',
  /** Agent has reached its row and starts the stochastic stow countdown. */
  BeginStow = 'begin-stow',
  /** Stow countdown elapsed; the aisle cell is about to free up. */
  FinishStow = 'finish-stow',
  /** A seated neighbour begins standing to clear the over-climb path. */
  BeginSeatShuffle = 'begin-seat-shuffle',
  /** Over-climb maneuver complete; cleared neighbours re-seat. */
  FinishSeatShuffle = 'finish-seat-shuffle',
  /** Agent occupies its terminal seat and leaves the aisle calculus. */
  Seated = 'seated',
}

/**
 * An entry in the engine's priority queue.
 *
 * Ordering is `(time ASC, id ASC)`. The monotonically increasing `id` is a
 * deterministic tie-breaker so that two events scheduled for the same timestamp
 * are processed in insertion order — essential for reproducible Monte-Carlo
 * runs across identical seeds.
 */
export interface SimulationEvent {
  /** Monotonic sequence number assigned by the queue (tie-breaker). */
  readonly id: number;
  /** Scheduled simulation timestamp, in ticks. */
  readonly time: number;
  readonly type: SimulationEventType;
  /** Subject of the event. */
  readonly passenger: PassengerId;
}
