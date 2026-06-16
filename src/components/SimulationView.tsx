'use client';

import dynamic from 'next/dynamic';
import { AnalyticsDashboard } from '@/components/AnalyticsDashboard';
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

/**
 * Two-column lab layout: the WebGL cabin on the left (always fully visible, no
 * overlays), and a dedicated sidebar on the right holding the controls and the
 * Monte-Carlo analytics. Collapses to a single column on narrow viewports.
 */
export function SimulationView() {
  return (
    <SimulationProvider>
      <div className="lab">
        <div className="lab-canvas">
          <div className="stage">
            <SimulationCanvas />
          </div>
        </div>
        <aside className="lab-sidebar">
          <ControlPanel />
          <AnalyticsDashboard />
        </aside>
      </div>
    </SimulationProvider>
  );
}
