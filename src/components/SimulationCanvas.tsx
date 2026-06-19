'use client';

import { useEffect, useRef } from 'react';
import { useSimulationContext } from '@/components/SimulationProvider';
import { useSimulationFrames } from '@/hooks/useSimulation';
import { useSimulationStore } from '@/state/simulationStore';
import { SimulationRenderer } from '@/visualization/SimulationRenderer';

/**
 * Mounts the PixiJS renderer and feeds it engine snapshots via
 * `useSimulationFrames`.
 *
 * Loaded client-side only (the page imports it with `next/dynamic({ ssr:false })`)
 * because PixiJS needs the DOM/WebGL. `Application.init` is async, so the
 * `disposed` guard covers the case where the effect is cleaned up before init
 * resolves (React strict mode).
 */
export function SimulationCanvas() {
  const controller = useSimulationContext();
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<SimulationRenderer | null>(null);
  const showHeatmap = useSimulationStore((state) => state.showHeatmap);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let renderer: SimulationRenderer | null = null;

    SimulationRenderer.create(host, controller.engine.cabin)
      .then((created) => {
        if (disposed) {
          created.destroy();
          return;
        }
        renderer = created;
        rendererRef.current = created;
        created.applySnapshot(controller.engine.getSnapshot());
        created.setHeatmapVisible(useSimulationStore.getState().showHeatmap);
      })
      .catch((error) => console.error('[AeroQueue] renderer init failed:', error));

    return () => {
      disposed = true;
      renderer?.destroy();
      rendererRef.current = null;
    };
  }, [controller]);

  // High-frequency snapshot stream → renderer (bypasses React reconciliation).
  useSimulationFrames((snapshot) => rendererRef.current?.applySnapshot(snapshot));

  // Low-frequency heatmap toggle from the store.
  useEffect(() => {
    rendererRef.current?.setHeatmapVisible(showHeatmap);
  }, [showHeatmap]);

  return <div ref={hostRef} className="canvas-host" />;
}
