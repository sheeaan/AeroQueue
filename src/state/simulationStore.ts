import { create } from 'zustand';
import type { MonteCarloResult } from '@/simulation/analysis/statistics';
import type { StrategyId } from '@/simulation/strategies/BoardingStrategy';
import { SimulationStatus } from '@/simulation/domain/state';

/**
 * "Coarse" state mirrored out of the engine for React consumption.
 *
 * Critically, this does **not** include the per-agent snapshot. Pushing
 * hundreds of agent positions through React/Zustand every frame would trigger a
 * reconciliation storm and defeat the whole point of the PixiJS canvas. The
 * high-frequency agent stream is delivered straight to the renderer via the
 * controller's imperative `onFrame` channel; only these low-frequency,
 * dashboard-relevant fields live in the store.
 */
export interface SimulationCoarse {
  status: SimulationStatus;
  /** Current simulation clock, in ticks. */
  time: number;
  seatedCount: number;
  totalPassengers: number;
  /** Playback-speed multiplier. */
  speed: number;
  /** Whether the rAF playback loop is currently active. */
  isRunning: boolean;
}

export interface SimulationUiState extends SimulationCoarse {
  /** Strategy currently selected in the UI. */
  strategyId: StrategyId;
  /** Whether the congestion heatmap overlay is shown. */
  showHeatmap: boolean;
  /** Simple (deterministic) mode vs Realism (stochastic) mode. */
  isSimpleMode: boolean;
  /** Latest Monte-Carlo summary, or `null` before any batch has run. */
  monteCarlo: MonteCarloResult | null;

  /** Apply a partial coarse-state update pushed from the controller. */
  setCoarse: (patch: Partial<SimulationCoarse>) => void;
  setStrategy: (id: StrategyId) => void;
  setHeatmap: (visible: boolean) => void;
  toggleHeatmap: () => void;
  setSimpleMode: (enabled: boolean) => void;
  setMonteCarlo: (result: MonteCarloResult | null) => void;
  resetUi: () => void;
}

const INITIAL_COARSE: SimulationCoarse = {
  status: SimulationStatus.Idle,
  time: 0,
  seatedCount: 0,
  totalPassengers: 0,
  speed: 1,
  isRunning: false,
};

/**
 * The single source of truth for React UI surfaces. Components read it through
 * selector hooks; the {@link SimulationProvider} wires the controller's coarse
 * sink into `setCoarse`.
 */
export const useSimulationStore = create<SimulationUiState>((set) => ({
  ...INITIAL_COARSE,
  strategyId: 'steffen-perfect',
  showHeatmap: true,
  isSimpleMode: false,
  monteCarlo: null,

  setCoarse: (patch) => set(patch),
  setStrategy: (strategyId) => set({ strategyId }),
  setHeatmap: (showHeatmap) => set({ showHeatmap }),
  toggleHeatmap: () => set((state) => ({ showHeatmap: !state.showHeatmap })),
  setSimpleMode: (isSimpleMode) => set({ isSimpleMode }),
  setMonteCarlo: (monteCarlo) => set({ monteCarlo }),
  resetUi: () => set({ ...INITIAL_COARSE }),
}));
