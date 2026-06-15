import type { CabinLayout } from '../domain/Grid';
import { createNarrowBodyCabin } from './cabin';

/** Gamma parameters governing stowage time as a function of bag count. */
export interface StowageParams {
  /** Gamma shape `k` contributed per carry-on bag. */
  shapePerBag: number;
  /** Gamma scale `θ` (ticks) per bag. */
  scalePerBag: number;
  /** Fixed overhead (ticks) every seating passenger pays, even with 0 bags. */
  baseTicks: number;
}

/** Normal parameters for walking velocity `v_k`. */
export interface WalkingParams {
  meanCellsPerTick: number;
  stdDev: number;
  /** Physical floor so velocity never goes ≤ 0. */
  min: number;
}

/** Deterministic durations of the over-climb (seat-interference) maneuver. */
export interface SeatShuffleParams {
  /** `t_clear`: ticks for a seated neighbour to step into the aisle. */
  clearTicks: number;
  /** `t_sit`: ticks to return to a seated position. */
  sitTicks: number;
}

/** Toggles for family/cohesion realism (`F_k`). */
export interface FamilyGroupParams {
  enabled: boolean;
  /** Mean members per group when enabled. */
  meanSize: number;
  /** Fraction of the manifest that travels in groups. */
  fraction: number;
}

/**
 * The complete, serialisable configuration for a single simulation. It is a
 * plain data object (no class instances beyond the immutable cabin) precisely
 * so it can be `postMessage`d into a Web Worker without loss.
 */
export interface SimulationConfig {
  /** Seed for the deterministic RNG. */
  seed: number;
  /** Immutable cabin geometry. */
  cabin: CabinLayout;
  /** Wall-clock seconds represented by one tick (for human-readable reporting). */
  secondsPerTick: number;
  /** Ticks between successive passengers crossing the aircraft door. */
  boardingIntervalTicks: number;
  /** Discrete bag-count distribution: `bagCountWeights[i] = P(B = i)`. */
  bagCountWeights: number[];
  stowage: StowageParams;
  walking: WalkingParams;
  seatShuffle: SeatShuffleParams;
  familyGroups: FamilyGroupParams;
}

/** Sensible defaults calibrated to a narrow-body single-class flight. */
export const DEFAULT_SIMULATION_CONFIG: SimulationConfig = {
  seed: 0x5eed,
  cabin: createNarrowBodyCabin(30),
  secondsPerTick: 1,
  boardingIntervalTicks: 3,
  bagCountWeights: [0.2, 0.5, 0.3], // P(0)=20%, P(1)=50%, P(2)=30%
  stowage: { shapePerBag: 2, scalePerBag: 3, baseTicks: 1 },
  walking: { meanCellsPerTick: 0.5, stdDev: 0.12, min: 0.15 },
  seatShuffle: { clearTicks: 4, sitTicks: 3 },
  familyGroups: { enabled: false, meanSize: 3, fraction: 0.3 },
};
