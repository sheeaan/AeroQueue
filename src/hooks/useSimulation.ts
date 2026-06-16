'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useSimulationContext } from '@/components/SimulationProvider';
import type { SimulationSnapshot } from '@/simulation/engine/SimulationEngine';
import type { StrategyId } from '@/simulation/strategies/BoardingStrategy';
import { useSimulationStore } from '@/state/simulationStore';

/** Playback + strategy controls returned by {@link useSimulation}. */
export interface SimulationControls {
  play: () => void;
  pause: () => void;
  /** Restart the current run (deterministic re-initialisation). */
  reset: () => void;
  setSpeed: (multiplier: number) => void;
  /** Switch boarding strategy and reload the manifest. */
  selectStrategy: (id: StrategyId) => void;
  /** Toggle deterministic Simple Mode vs stochastic Realism Mode. */
  setSimpleMode: (enabled: boolean) => void;
  strategyId: StrategyId;
}

/**
 * Primary React entry point. Lazily loads the selected strategy on mount and
 * returns stable, memoised controls. The heavy per-frame agent stream never
 * flows through this hook — see {@link useSimulationFrames}.
 */
export function useSimulation(): SimulationControls {
  const controller = useSimulationContext();
  const strategyId = useSimulationStore((state) => state.strategyId);
  const setStoreStrategy = useSimulationStore((state) => state.setStrategy);
  const setStoreSimpleMode = useSimulationStore((state) => state.setSimpleMode);
  const initialised = useRef(false);

  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;
    controller.loadStrategy(strategyId);
  }, [controller, strategyId]);

  const play = useCallback(() => controller.play(), [controller]);
  const pause = useCallback(() => controller.pause(), [controller]);
  const reset = useCallback(() => controller.loadStrategy(strategyId), [controller, strategyId]);
  const setSpeed = useCallback((multiplier: number) => controller.setSpeed(multiplier), [controller]);
  const selectStrategy = useCallback(
    (id: StrategyId) => {
      setStoreStrategy(id);
      controller.loadStrategy(id);
    },
    [controller, setStoreStrategy],
  );
  const setSimpleMode = useCallback(
    (enabled: boolean) => {
      setStoreSimpleMode(enabled);
      controller.setSimpleMode(enabled);
    },
    [controller, setStoreSimpleMode],
  );

  return { play, pause, reset, setSpeed, selectStrategy, setSimpleMode, strategyId };
}

/**
 * Subscribe an imperative consumer (typically the PixiJS renderer) to the
 * high-frequency snapshot stream. The callback is held in a ref so the
 * subscription is stable across renders and never thrashes.
 */
export function useSimulationFrames(onFrame: (snapshot: SimulationSnapshot) => void): void {
  const controller = useSimulationContext();
  const callbackRef = useRef(onFrame);
  callbackRef.current = onFrame;

  useEffect(() => controller.onFrame((snapshot) => callbackRef.current(snapshot)), [controller]);
}
