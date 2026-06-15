'use client';

import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { DEFAULT_SIMULATION_CONFIG } from '@/simulation/config/simulation';
import type { SimulationConfig } from '@/simulation/config/simulation';
import { SimulationController } from '@/runtime/SimulationController';
import { useSimulationStore } from '@/state/simulationStore';

const ControllerContext = createContext<SimulationController | null>(null);

interface SimulationProviderProps {
  children: ReactNode;
  /** Override the default configuration (e.g. a different cabin or seed). */
  config?: SimulationConfig;
}

/**
 * Owns a single {@link SimulationController} instance for the React subtree and
 * wires its coarse-state sink into the Zustand store. The controller is created
 * lazily via a ref so it survives re-renders and is never re-instantiated; it is
 * disposed on unmount.
 *
 * This is the seam that keeps the engine decoupled: descendants obtain the
 * controller from context and choose their own channel — React selector hooks
 * for coarse UI, or the imperative `onFrame` subscription for the canvas.
 */
export function SimulationProvider({ children, config = DEFAULT_SIMULATION_CONFIG }: SimulationProviderProps) {
  const controllerRef = useRef<SimulationController | null>(null);
  if (controllerRef.current === null) {
    controllerRef.current = new SimulationController(config);
  }

  const setCoarse = useSimulationStore((state) => state.setCoarse);

  useEffect(() => {
    const controller = controllerRef.current!;
    controller.setCoarseSink(setCoarse);
    return () => controller.dispose();
  }, [setCoarse]);

  return (
    <ControllerContext.Provider value={controllerRef.current}>{children}</ControllerContext.Provider>
  );
}

/** Access the controller; throws if used outside a {@link SimulationProvider}. */
export function useSimulationContext(): SimulationController {
  const controller = useContext(ControllerContext);
  if (!controller) {
    throw new Error('useSimulationContext must be used within a <SimulationProvider>');
  }
  return controller;
}
