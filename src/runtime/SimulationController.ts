import type { SimulationConfig } from '@/simulation/config/simulation';
import type { SeatId } from '@/simulation/domain/ids';
import { SimulationStatus } from '@/simulation/domain/state';
import { SimulationEngine } from '@/simulation/engine/SimulationEngine';
import type { SimulationSnapshot } from '@/simulation/engine/SimulationEngine';
import { Random } from '@/simulation/rng/Random';
import { getStrategy, registerDefaultStrategies } from '@/simulation/strategies';
import type { StrategyId } from '@/simulation/strategies/BoardingStrategy';
import type { SimulationCoarse } from '@/state/simulationStore';

/** Base simulation-ticks advanced per real-time second at 1× speed. */
const BASE_TICKS_PER_SECOND = 4;

export type FrameListener = (snapshot: SimulationSnapshot) => void;
export type CoarseSink = (coarse: SimulationCoarse) => void;

/**
 * Browser-side conductor that bridges the pure {@link SimulationEngine} to the
 * UI without contaminating the engine with browser concerns.
 *
 * Responsibilities:
 *   - Own the `requestAnimationFrame` playback loop (the engine itself has no
 *     concept of wall-clock time).
 *   - Convert real elapsed time × playback speed into a simulation-time target
 *     and advance the engine to it once per frame.
 *   - Fan out the resulting {@link SimulationSnapshot} to imperative frame
 *     listeners (e.g. the PixiJS renderer) — bypassing React entirely.
 *   - Push only coarse lifecycle state into the Zustand store.
 *
 * This is the "robust subscription bridge" between the mathematical engine and
 * the rendering layer: high-frequency data flows through `onFrame`, low-
 * frequency data flows through the coarse sink.
 */
export class SimulationController {
  readonly engine: SimulationEngine;

  private rafId: number | null = null;
  private speed = 1;
  private lastFrameTime = 0;
  private readonly frameListeners = new Set<FrameListener>();
  private coarseSink: CoarseSink | null = null;
  private readonly seed: number;

  constructor(config: SimulationConfig) {
    this.engine = new SimulationEngine(config);
    this.seed = config.seed;
    registerDefaultStrategies();
    // Any engine lifecycle transition refreshes the coarse store.
    this.engine.subscribe(() => this.pushCoarse());
  }

  /** Build the manifest directly from an explicit boarding `order`. */
  init(order: ReadonlyArray<SeatId>): void {
    this.engine.initialize(order);
    this.pushCoarse();
    this.emitFrame();
  }

  /**
   * Generate the boarding order for `strategyId` and (re)initialise the engine.
   * The strategy RNG is derived deterministically from the config seed, so the
   * sequence is reproducible; the engine then samples passenger attributes from
   * its own seeded stream. Falls back to raw layout order for unknown ids.
   */
  loadStrategy(strategyId: StrategyId): void {
    this.pause();
    const strategy = getStrategy(strategyId);
    const cabin = this.engine.cabin;
    const order = strategy
      ? strategy.generateOrder(cabin, new Random(this.seed ^ 0x9e3779b9))
      : cabin.seats.map((seat) => seat.id);
    this.engine.initialize(order);
    this.pushCoarse();
    this.emitFrame();
  }

  /** Start (or resume) rAF-driven playback. No-op if already running/complete. */
  play(): void {
    if (this.rafId !== null) return;
    if (this.engine.status === SimulationStatus.Completed) return;
    this.lastFrameTime = performance.now();
    this.rafId = requestAnimationFrame(this.tick);
    this.pushCoarse();
  }

  /** Suspend playback; the engine state is preserved and resumable. */
  pause(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.pushCoarse();
  }

  /** Stop, reset the engine, and optionally re-initialise with a new order. */
  reset(order?: ReadonlyArray<SeatId>): void {
    this.pause();
    this.engine.reset();
    if (order) this.engine.initialize(order);
    this.pushCoarse();
    this.emitFrame();
  }

  /** Adjust the playback-speed multiplier (clamped to a sane range). */
  setSpeed(multiplier: number): void {
    this.speed = Math.max(0.1, Math.min(20, multiplier));
    this.pushCoarse();
  }

  /** Subscribe an imperative consumer (e.g. PixiJS) to per-frame snapshots. */
  onFrame(listener: FrameListener): () => void {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  }

  /** Register the coarse-state sink (the store's `setCoarse`). */
  setCoarseSink(sink: CoarseSink | null): void {
    this.coarseSink = sink;
    if (sink) this.pushCoarse();
  }

  /** Tear down: cancel the loop and drop all listeners. */
  dispose(): void {
    this.pause();
    this.frameListeners.clear();
    this.coarseSink = null;
  }

  private get isRunning(): boolean {
    return this.rafId !== null;
  }

  private readonly tick = (now: number): void => {
    const deltaSeconds = (now - this.lastFrameTime) / 1000;
    this.lastFrameTime = now;

    const target = this.engine.currentTime + deltaSeconds * BASE_TICKS_PER_SECOND * this.speed;
    this.engine.advanceTo(target);
    this.emitFrame();

    if (this.engine.status === SimulationStatus.Completed) {
      this.rafId = null;
      this.pushCoarse();
      return;
    }
    this.rafId = requestAnimationFrame(this.tick);
  };

  private emitFrame(): void {
    if (this.frameListeners.size === 0) return;
    const snapshot = this.engine.getSnapshot();
    for (const listener of this.frameListeners) listener(snapshot);
  }

  private pushCoarse(): void {
    this.coarseSink?.({
      status: this.engine.status,
      time: this.engine.currentTime,
      seatedCount: this.engine.seatedCount,
      totalPassengers: this.engine.passengerCount,
      speed: this.speed,
      isRunning: this.isRunning,
    });
  }
}
