/**
 * Finite-state machine vocabulary for agents and for the engine as a whole.
 */

/**
 * Per-passenger FSM. Every agent traverses a strict subset of these states; the
 * discrete-event engine only ever schedules events on transitions between them,
 * which is what lets the clock skip the "dead time" of seated/waiting agents.
 *
 *   Queued  -> Walking  -> (Blocked <-> Walking)* -> Stowing -> Seated
 */
export enum PassengerState {
  /** In the jet-bridge queue, sequenced by the active boarding strategy. */
  Queued = 'queued',
  /** Translating down the aisle vector, one cell per kinematic step. */
  Walking = 'walking',
  /** Movement forced to zero by a downstream agent (aisle interference). */
  Blocked = 'blocked',
  /** At the assigned row, occupying the aisle cell while the stow timer runs. */
  Stowing = 'stowing',
  /** Terminal: seated. Removed from aisle calculus (may still trigger over-climb). */
  Seated = 'seated',
}

/** Lifecycle of an entire simulation run. */
export enum SimulationStatus {
  /** Constructed and/or initialised, but the clock has not advanced. */
  Idle = 'idle',
  /** Actively processing events (headless `run()` or rAF-driven playback). */
  Running = 'running',
  /** Playback suspended by the controller; resumable. */
  Paused = 'paused',
  /** Event queue exhausted — all agents seated. */
  Completed = 'completed',
}
