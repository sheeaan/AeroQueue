'use client';

import { useEffect, useRef } from 'react';
import { useSimulationContext } from '@/components/SimulationProvider';
import { useSimulationFrames } from '@/hooks/useSimulation';
import { useSimulationStore } from '@/state/simulationStore';
import { SimulationRenderer } from '@/visualization/SimulationRenderer';

/**
 * Mounts the PixiJS renderer and bridges it to the engine via the decoupled
 * `useSimulationFrames` pull channel.
 *
 * This module (and therefore PixiJS) is only ever loaded client-side — the page
 * imports it through `next/dynamic({ ssr: false })`, so the WebGL stack never
 * runs during server rendering. The renderer is created asynchronously
 * (`Application.init` is async in Pixi v8); a `disposed` guard handles the case
 * where the effect is torn down before initialisation resolves (React strict
 * mode), and snapshots are routed to whatever renderer instance currently exists.
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
