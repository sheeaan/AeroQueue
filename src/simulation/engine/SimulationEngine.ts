import { invariant } from '@/lib/assert';
import type { SimulationConfig } from '../config/simulation';
import { CabinGrid } from '../domain/Grid';
import type { CabinLayout } from '../domain/Grid';
import type { CabinSide, SeatColumnType } from '../domain/geometry';
import { SimulationEventType } from '../domain/events';
import type { SimulationEvent } from '../domain/events';
import { PassengerId } from '../domain/ids';
import type { SeatId } from '../domain/ids';
import type { Passenger } from '../domain/Passenger';
import type { Seat } from '../domain/Seat';
import { PassengerState, SimulationStatus } from '../domain/state';
import { Random } from '../rng/Random';
import { sampleBagCount, sampleStowTime, sampleWalkingSpeed } from '../rng/distributions';
import { EventQueue } from './EventQueue';

/** Floor on walking velocity to keep `1 / v` travel time finite. */
const MIN_WALK_SPEED = 1e-3;

// ── Render-facing projections ────────────────────────────────────────────────
// Deliberately flat, primitive-only structures so the rendering layer (PixiJS)
// never touches a live engine object. A snapshot is a *value*, safe to hand to
// another thread, memoise, or diff.

/** One agent as the visualiser needs to draw it. */
export interface SnapshotAgent {
  readonly id: number;
  readonly row: number;
  readonly col: number;
  readonly state: PassengerState;
  readonly seatType: SeatColumnType;
  readonly side: CabinSide;
  /** Stow completion in [0, 1] for the countdown-arc indicator. */
  readonly stowProgress: number;
  readonly bagCount: number;
}

/** Immutable picture of the world at a single instant. */
export interface SimulationSnapshot {
  readonly time: number;
  readonly status: SimulationStatus;
  readonly seatedCount: number;
  readonly totalPassengers: number;
  readonly agents: ReadonlyArray<SnapshotAgent>;
  /** Per-row aisle congestion accumulator, source data for the heatmap overlay. */
  readonly aisleHeat: ReadonlyArray<number>;
}

/** Aggregate outcome of a completed (headless) run. */
export interface RunResult {
  /** Final boarding time `E` in ticks. */
  readonly boardingTime: number;
  readonly seatedCount: number;
  readonly eventsProcessed: number;
  /** Σ T_aisle_delay — total ticks lost to aisle interference. */
  readonly aisleDelayTotal: number;
  /** Σ T_seat_delay — total ticks lost to seat-interference over-climbs. */
  readonly seatDelayTotal: number;
}

export type EngineLifecycle = 'initialized' | 'started' | 'completed' | 'reset';
export type EngineListener = (event: EngineLifecycle, engine: SimulationEngine) => void;

/**
 * Pure, headless, deterministic discrete-event simulation engine with full
 * cellular-automata kinematics.
 *
 * Spatial model: the aisle is a 1-D array indexed by row (0 = front/door,
 * `R-1` = rear). Passengers enter at the front and translate toward higher row
 * indices — a single-file corridor with no overtaking. Three interference
 * mechanisms emerge from local rules:
 *
 *   1. **Movement** — an agent may occupy row `r+1` only if that cell is free.
 *   2. **Aisle interference** — a `Stowing` agent occupies its aisle cell,
 *      forcing trailing agents to `Blocked` at `r-1`; blocks cascade rearward.
 *   3. **Seat interference** — entering a seat past `k` already-seated neighbours
 *      adds an over-climb penalty `k · (t_clear + t_sit)` to the
 *      `Stowing → Seated` transition.
 *
 * The engine carries no browser/React/Pixi dependency, so it runs identically on
 * the main thread, in a Web Worker, or under a unit test.
 */
export class SimulationEngine {
  private readonly grid: CabinGrid;
  private readonly seatById: Map<SeatId, Seat>;
  /** For each seat, the inner neighbours between it and the aisle (over-climb blockers). */
  private readonly innerSeats: Map<SeatId, SeatId[]>;
  private readonly aisleCol: number;

  private readonly passengers = new Map<PassengerId, Passenger>();
  private readonly queue = new EventQueue();
  private readonly listeners = new Set<EngineListener>();

  // FIFO of passengers who have reached the door but await a free entry cell.
  private readonly pendingEntry: PassengerId[] = [];

  // Transient kinematic bookkeeping (engine-internal; not part of the domain model).
  private readonly cellEnteredAt = new Map<PassengerId, number>(); // for aisle-dwell heat
  private readonly blockedSince = new Map<PassengerId, number>(); // for aisle-delay metric
  private readonly stowStartedAt = new Map<PassengerId, number>(); // for the stow-progress arc

  private rng: Random;
  /** When true, attribute generation bypasses the stochastic distributions. */
  private deterministic: boolean;
  private clock = 0;
  private processed = 0;
  private seated = 0;
  private runStatus: SimulationStatus = SimulationStatus.Idle;
  /** Per-row aisle congestion (dwell time), length = cabin rows. */
  private readonly aisleHeat: number[];

  constructor(private readonly config: SimulationConfig) {
    this.grid = new CabinGrid(config.cabin);
    this.aisleCol = config.cabin.aisleColIndex;
    this.rng = new Random(config.seed);
    this.deterministic = config.simpleMode;
    this.aisleHeat = new Array<number>(config.cabin.rows).fill(0);
    this.seatById = new Map(config.cabin.seats.map((seat) => [seat.id, seat]));
    this.innerSeats = this.buildInnerSeats(config.cabin);
  }

  // ── Public read-only accessors ──────────────────────────────────────────────
  get cabin(): CabinLayout {
    return this.config.cabin;
  }
  get currentTime(): number {
    return this.clock;
  }
  get status(): SimulationStatus {
    return this.runStatus;
  }
  get passengerCount(): number {
    return this.passengers.size;
  }
  get seatedCount(): number {
    return this.seated;
  }
  get eventsProcessed(): number {
    return this.processed;
  }
  get isDeterministic(): boolean {
    return this.deterministic;
  }

  /** Toggle Simple (deterministic) vs Realism (stochastic) attribute generation. */
  setDeterministic(value: boolean): void {
    this.deterministic = value;
  }

  // ── Lifecycle observation (push channel) ────────────────────────────────────
  subscribe(listener: EngineListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: EngineLifecycle): void {
    for (const listener of this.listeners) listener(event, this);
  }

  // ── Setup ──────────────────────────────────────────────────────────────────
  /**
   * Populate the manifest from a boarding `order` (seat ids from a
   * {@link BoardingStrategy}) and schedule each passenger's `Board` event.
   * Stochastic attributes are sampled here from the seeded RNG, so the *sequence*
   * can be held fixed while attributes re-randomise across Monte-Carlo seeds.
   */
  initialize(order: ReadonlyArray<SeatId>): void {
    this.resetState();

    let queueIndex = 0;
    for (const seatId of order) {
      const seat = this.seatById.get(seatId);
      invariant(seat, `Boarding order references unknown seat "${seatId}"`);

      // Simple Mode: deterministic "textbook" attributes (no RNG). Realism Mode:
      // sample from the configured probability distributions.
      let bagCount: number;
      let stowTime: number;
      let walkingSpeed: number;
      if (this.deterministic) {
        bagCount = this.config.simple.bagCount;
        stowTime = bagCount * this.config.simple.ticksPerBag;
        walkingSpeed = this.config.simple.walkingSpeed;
      } else {
        bagCount = sampleBagCount(this.rng, this.config.bagCountWeights);
        stowTime = sampleStowTime(this.rng, bagCount, this.config.stowage);
        walkingSpeed = sampleWalkingSpeed(this.rng, this.config.walking);
      }
      const id = PassengerId(queueIndex);

      this.passengers.set(id, {
        id,
        assignedSeat: seatId,
        assignedSeatCoord: seat.coord,
        walkingSpeed,
        bagCount,
        stowTime,
        familyGroup: null,
        boardingGroup: 0,
        state: PassengerState.Queued,
        position: { row: -1, col: this.aisleCol }, // at the door
        stowTimeRemaining: stowTime,
        queueIndex,
        metrics: {
          boardedAt: null,
          seatedAt: null,
          walkTicks: 0,
          stowTicks: 0,
          aisleBlockedTicks: 0,
          seatShuffleTicks: 0,
        },
      });

      // Stagger arrival at the door by the gate-scan cadence; actual *entry* is
      // gated by the door cell's occupancy (see tryAdmit).
      this.queue.schedule({
        time: queueIndex * this.config.boardingIntervalTicks,
        type: SimulationEventType.Board,
        passenger: id,
      });
      queueIndex++;
    }

    this.runStatus = SimulationStatus.Idle;
    this.emit('initialized');
  }

  reset(): void {
    this.resetState();
    this.emit('reset');
  }

  private resetState(): void {
    this.queue.clear();
    this.passengers.clear();
    this.pendingEntry.length = 0;
    this.cellEnteredAt.clear();
    this.blockedSince.clear();
    this.stowStartedAt.clear();
    this.grid.reset();
    this.aisleHeat.fill(0);
    this.rng = new Random(this.config.seed);
    this.clock = 0;
    this.processed = 0;
    this.seated = 0;
    this.runStatus = SimulationStatus.Idle;
  }

  // ── Execution ───────────────────────────────────────────────────────────────
  /** Process exactly one event, jumping the clock to its timestamp. */
  step(): boolean {
    const event = this.queue.next();
    if (!event) return false;
    this.clock = event.time;
    this.dispatch(event);
    this.processed++;
    return true;
  }

  /** Headless execution: drain the queue and return the aggregate result. */
  run(): RunResult {
    this.runStatus = SimulationStatus.Running;
    this.emit('started');
    while (this.step()) {
      /* drain */
    }
    this.complete();
    return this.result();
  }

  /**
   * Advance up to (and including) `targetTime`, processing every event with
   * `event.time <= targetTime`. The visualised path: the controller calls this
   * once per animation frame. Between events the clock glides to the target so
   * on-screen interpolation stays smooth.
   */
  advanceTo(targetTime: number): void {
    if (this.runStatus === SimulationStatus.Completed) return;
    if (this.runStatus !== SimulationStatus.Running) {
      this.runStatus = SimulationStatus.Running;
      this.emit('started');
    }

    let next = this.queue.peek();
    while (next && next.time <= targetTime) {
      this.step();
      next = this.queue.peek();
    }

    if (!next) this.complete();
    else this.clock = Math.max(this.clock, targetTime);
  }

  private complete(): void {
    if (this.runStatus === SimulationStatus.Completed) return;
    this.runStatus = SimulationStatus.Completed;
    this.emit('completed');
  }

  // ── Event dispatch ──────────────────────────────────────────────────────────
  private dispatch(event: SimulationEvent): void {
    switch (event.type) {
      case SimulationEventType.Board:
        this.onBoard(event);
        break;
      case SimulationEventType.Advance:
        this.onAdvance(event);
        break;
      case SimulationEventType.FinishStow:
        this.onFinishStow(event);
        break;
      case SimulationEventType.Seated:
        this.onSeated(event);
        break;
      // BeginStow / BeginSeatShuffle / FinishSeatShuffle are reserved for a
      // finer-grained model; here stowing and the over-climb shuffle are folded
      // into FinishStow → Seated to keep the event count strictly Θ(N).
      default:
        break;
    }
  }

  /** Passenger reaches the aircraft door and queues for entry. */
  private onBoard(event: SimulationEvent): void {
    this.pendingEntry.push(event.passenger);
    this.tryAdmit();
  }

  /** Admit as many waiting passengers as the (single) door cell allows. */
  private tryAdmit(): void {
    while (this.pendingEntry.length > 0 && this.grid.isAisleFree(0)) {
      const id = this.pendingEntry.shift()!;
      this.admit(id);
    }
  }

  private admit(id: PassengerId): void {
    const passenger = this.passengers.get(id);
    if (!passenger) return;
    this.grid.enterAisle(0, id);
    passenger.position = { row: 0, col: this.aisleCol };
    passenger.state = PassengerState.Walking;
    if (passenger.metrics.boardedAt === null) passenger.metrics.boardedAt = this.clock;
    this.cellEnteredAt.set(id, this.clock);
    this.stepPassenger(id);
  }

  /**
   * Core cellular-automata transition: decide what the passenger does from its
   * current aisle cell. Either it reaches its row and begins stowing, advances
   * one cell (reserving it and scheduling arrival), or blocks behind an occupied
   * cell. Called on entry, on every arrival, and whenever the cell ahead frees.
   */
  private stepPassenger(id: PassengerId): void {
    const passenger = this.passengers.get(id);
    if (!passenger) return;

    const row = passenger.position.row;
    const target = passenger.assignedSeatCoord.row;

    if (row === target) {
      this.beginStow(passenger);
      return;
    }

    const ahead = row + 1;
    if (this.grid.isAisleFree(ahead)) {
      this.clearBlocked(passenger);
      this.grid.enterAisle(ahead, id); // reserve the next cell (no overtaking)
      passenger.state = PassengerState.Walking;
      const travel = 1 / Math.max(passenger.walkingSpeed, MIN_WALK_SPEED);
      this.schedule(travel, SimulationEventType.Advance, id);
    } else if (passenger.state !== PassengerState.Blocked) {
      // Aisle interference: halt at row-1 until the cell ahead clears.
      passenger.state = PassengerState.Blocked;
      if (!this.blockedSince.has(id)) this.blockedSince.set(id, this.clock);
    }
  }

  /** Arrival at the previously-reserved cell `row+1`. */
  private onAdvance(event: SimulationEvent): void {
    const passenger = this.passengers.get(event.passenger);
    if (!passenger) return;

    const oldRow = passenger.position.row;
    const newRow = oldRow + 1;
    passenger.metrics.walkTicks += 1 / Math.max(passenger.walkingSpeed, MIN_WALK_SPEED);

    this.releaseCell(passenger.id, oldRow); // free old cell, wake follower, admit at door
    passenger.position = { row: newRow, col: this.aisleCol };
    this.cellEnteredAt.set(passenger.id, this.clock);

    this.stepPassenger(passenger.id);
  }

  /** Reached the assigned row: occupy the aisle cell and run the stow countdown. */
  private beginStow(passenger: Passenger): void {
    this.clearBlocked(passenger);
    passenger.state = PassengerState.Stowing;
    passenger.stowTimeRemaining = passenger.stowTime;
    this.stowStartedAt.set(passenger.id, this.clock);
    this.schedule(passenger.stowTime, SimulationEventType.FinishStow, passenger.id);
  }

  /** Stow complete: compute the over-climb penalty, then schedule seating. */
  private onFinishStow(event: SimulationEvent): void {
    const passenger = this.passengers.get(event.passenger);
    if (!passenger) return;

    passenger.metrics.stowTicks += passenger.stowTime;
    passenger.stowTimeRemaining = 0;

    const penalty = this.computeSeatPenalty(passenger);
    passenger.metrics.seatShuffleTicks += penalty;
    // The passenger keeps occupying the aisle cell throughout the shuffle, so the
    // over-climb continues to block trailing traffic — exactly the secondary
    // aisle interference the over-climb generates.
    this.schedule(penalty, SimulationEventType.Seated, passenger.id);
  }

  /**
   * Seat-interference penalty: `k · (t_clear + t_sit)` where `k` is the number
   * of already-seated neighbours between the aisle and the assigned seat. With an
   * outside-in strategy (WilMA/Steffen) `k = 0`, so the penalty vanishes.
   */
  private computeSeatPenalty(passenger: Passenger): number {
    const blockers = this.innerSeats.get(passenger.assignedSeat);
    if (!blockers || blockers.length === 0) return 0;

    const { clearTicks, sitTicks } = this.config.seatShuffle;
    let penalty = 0;
    for (const seatId of blockers) {
      if (this.grid.seatOccupantOf(seatId) !== null) penalty += clearTicks + sitTicks;
    }
    return penalty;
  }

  /** Terminal transition: leave the aisle, take the seat, wake whoever is behind. */
  private onSeated(event: SimulationEvent): void {
    const passenger = this.passengers.get(event.passenger);
    if (!passenger) return;

    const row = passenger.position.row;
    this.releaseCell(passenger.id, row); // frees the aisle cell + cascades the unblock
    passenger.state = PassengerState.Seated;
    passenger.position = passenger.assignedSeatCoord;
    passenger.metrics.seatedAt = this.clock;
    this.grid.occupySeat(passenger.assignedSeat, passenger.id);

    this.stowStartedAt.delete(passenger.id);
    this.cellEnteredAt.delete(passenger.id);
    this.seated++;
  }

  // ── Shared kinematic helpers ────────────────────────────────────────────────
  /**
   * Vacate an aisle cell: bank its dwell time as heat, free it, then wake the
   * single passenger directly behind (if blocked) and admit a new passenger if
   * the door cell just opened. This one routine drives the cascading unblock.
   */
  private releaseCell(id: PassengerId, row: number): void {
    const enteredAt = this.cellEnteredAt.get(id);
    if (enteredAt !== undefined && row >= 0) this.aisleHeat[row] += this.clock - enteredAt;
    this.grid.leaveAisle(row);

    const behindId = this.grid.aisleOccupant(row - 1);
    if (behindId !== null) {
      const behind = this.passengers.get(behindId);
      if (behind && behind.state === PassengerState.Blocked) this.stepPassenger(behindId);
    }

    if (row === 0) this.tryAdmit();
  }

  /** Bank accrued blocked time into the aisle-delay metric and clear the timer. */
  private clearBlocked(passenger: Passenger): void {
    const since = this.blockedSince.get(passenger.id);
    if (since !== undefined) {
      passenger.metrics.aisleBlockedTicks += this.clock - since;
      this.blockedSince.delete(passenger.id);
    }
  }

  private schedule(delay: number, type: SimulationEventType, passenger: PassengerId): void {
    this.queue.schedule({ time: this.clock + Math.max(0, delay), type, passenger });
  }

  /** Precompute, per seat, the inner neighbours that trigger an over-climb. */
  private buildInnerSeats(cabin: CabinLayout): Map<SeatId, SeatId[]> {
    const byRowSide = new Map<string, Seat[]>();
    for (const seat of cabin.seats) {
      const key = `${seat.row}:${seat.side}`;
      const bucket = byRowSide.get(key);
      if (bucket) bucket.push(seat);
      else byRowSide.set(key, [seat]);
    }

    const map = new Map<SeatId, SeatId[]>();
    for (const seat of cabin.seats) {
      const group = byRowSide.get(`${seat.row}:${seat.side}`)!;
      const inner = group
        .filter((other) => other.aisleDistance < seat.aisleDistance)
        .map((other) => other.id);
      map.set(seat.id, inner);
    }
    return map;
  }

  // ── Render projection (pull channel) ────────────────────────────────────────
  getSnapshot(): SimulationSnapshot {
    const agents: SnapshotAgent[] = [];
    for (const passenger of this.passengers.values()) {
      const seat = this.seatById.get(passenger.assignedSeat)!;
      agents.push({
        id: passenger.id,
        row: passenger.position.row,
        col: passenger.position.col,
        state: passenger.state,
        seatType: seat.type,
        side: seat.side,
        stowProgress: this.stowProgressOf(passenger),
        bagCount: passenger.bagCount,
      });
    }
    return {
      time: this.clock,
      status: this.runStatus,
      seatedCount: this.seated,
      totalPassengers: this.passengers.size,
      agents,
      aisleHeat: this.aisleHeat.slice(),
    };
  }

  /** Stow-arc fill ∈ [0, 1], derived from elapsed clock for smooth interpolation. */
  private stowProgressOf(passenger: Passenger): number {
    if (passenger.state === PassengerState.Seated) return 1;
    if (passenger.state !== PassengerState.Stowing || passenger.stowTime <= 0) return 0;
    const start = this.stowStartedAt.get(passenger.id) ?? this.clock;
    return Math.min(1, (this.clock - start) / passenger.stowTime);
  }

  private result(): RunResult {
    let aisleDelayTotal = 0;
    let seatDelayTotal = 0;
    for (const passenger of this.passengers.values()) {
      aisleDelayTotal += passenger.metrics.aisleBlockedTicks;
      seatDelayTotal += passenger.metrics.seatShuffleTicks;
    }
    return {
      boardingTime: this.clock,
      seatedCount: this.seated,
      eventsProcessed: this.processed,
      aisleDelayTotal,
      seatDelayTotal,
    };
  }
}
