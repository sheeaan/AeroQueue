'use client';

import { useSimulation } from '@/hooks/useSimulation';
import { DEFAULT_STRATEGIES } from '@/simulation/strategies';
import type { StrategyId } from '@/simulation/strategies/BoardingStrategy';
import { useSimulationStore } from '@/state/simulationStore';

const SEAT_LEGEND: ReadonlyArray<{ label: string; className: string }> = [
  { label: 'Window', className: 'dot-window' },
  { label: 'Middle', className: 'dot-middle' },
  { label: 'Aisle', className: 'dot-aisle' },
];

/**
 * React/Zustand control surface overlaying the canvas. Strategy selection,
 * transport controls, and the heatmap toggle all flow through the coarse store —
 * none of them participate in the 60 FPS render loop.
 */
export function ControlPanel() {
  const { play, pause, reset, selectStrategy, setSimpleMode, strategyId } = useSimulation();
  const status = useSimulationStore((s) => s.status);
  const time = useSimulationStore((s) => s.time);
  const seatedCount = useSimulationStore((s) => s.seatedCount);
  const totalPassengers = useSimulationStore((s) => s.totalPassengers);
  const showHeatmap = useSimulationStore((s) => s.showHeatmap);
  const toggleHeatmap = useSimulationStore((s) => s.toggleHeatmap);
  const isSimpleMode = useSimulationStore((s) => s.isSimpleMode);

  return (
    <div className="control-panel">
      <div className="control-row">
        <select
          value={strategyId}
          onChange={(event) => selectStrategy(event.target.value as StrategyId)}
          aria-label="Boarding strategy"
        >
          {DEFAULT_STRATEGIES.map((strategy) => (
            <option key={strategy.id} value={strategy.id}>
              {strategy.name}
            </option>
          ))}
          {strategyId === 'custom' && <option value="custom">🧬 Evolved (GA)</option>}
        </select>
      </div>

      <div className="mode-toggle" role="group" aria-label="Simulation mode">
        <button
          className={isSimpleMode ? '' : 'mode-active'}
          onClick={() => setSimpleMode(false)}
        >
          Realism
        </button>
        <button
          className={isSimpleMode ? 'mode-active' : ''}
          onClick={() => setSimpleMode(true)}
        >
          Simple
        </button>
      </div>

      <div className="control-row">
        <button onClick={play}>Play</button>
        <button className="secondary" onClick={pause}>
          Pause
        </button>
        <button className="secondary" onClick={reset}>
          Reset
        </button>
      </div>

      <label className="toggle">
        <input type="checkbox" checked={showHeatmap} onChange={toggleHeatmap} />
        Congestion heatmap
      </label>

      <div className="readout">
        <span className="readout-label">Status</span>
        <span className="readout-value">{status}</span>
      </div>
      <div className="readout">
        <span className="readout-label">Boarding time (E)</span>
        <span className="readout-value">{time.toFixed(1)}</span>
      </div>
      <div className="readout">
        <span className="readout-label">Boarded</span>
        <span className="readout-value">
          {seatedCount}/{totalPassengers}
        </span>
      </div>

      <div className="legend">
        {SEAT_LEGEND.map((item) => (
          <span className="legend-item" key={item.label}>
            <span className={`legend-dot ${item.className}`} />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}
