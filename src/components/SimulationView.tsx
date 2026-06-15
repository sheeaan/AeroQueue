'use client';

import dynamic from 'next/dynamic';
import { ControlPanel } from '@/components/ControlPanel';
import { SimulationProvider } from '@/components/SimulationProvider';

/**
 * The PixiJS canvas is loaded only on the client: `Application.init` touches
 * WebGL/`window`, so it must never run during SSR. `ssr: false` keeps the whole
 * Pixi dependency out of the server bundle and shows a lightweight placeholder
 * until the renderer is ready.
 */
const SimulationCanvas = dynamic(
  () => import('@/components/SimulationCanvas').then((module) => module.SimulationCanvas),
  {
    ssr: false,
    loading: () => <div className="canvas-loading">Initialising WebGL renderer…</div>,
  },
);

/** Composes the provider, the WebGL canvas, and the overlaid control panel. */
export function SimulationView() {
  return (
    <SimulationProvider>
      <div className="stage">
        <SimulationCanvas />
        <div className="stage-overlay">
          <ControlPanel />
        </div>
      </div>
    </SimulationProvider>
  );
}
