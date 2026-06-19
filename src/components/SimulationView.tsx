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
 * Vertically stacked "applet" layout, FoilSim-style: the wind-tunnel boarding
 * canvas on top, its native controls directly beneath it, and then the full-
 * width analysis block (Monte-Carlo plotter + comparative bar chart) below —
 * each section separated by a thin gray rule.
 */
export function SimulationView() {
  return (
    <SimulationProvider>
      <div className="lab">
        <div className="lab-stage" id="simulation">
          <div className="stage">
            <SimulationCanvas />
          </div>
        </div>
        <div className="lab-controls">
          <ControlPanel />
        </div>
        <div className="lab-analysis" id="analysis">
          <AnalyticsDashboard />
        </div>
      </div>
    </SimulationProvider>
  );
}
