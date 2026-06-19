'use client';

import { useSimulation } from '@/hooks/useSimulation';
import { DEFAULT_STRATEGIES } from '@/simulation/strategies';
import type { StrategyId } from '@/simulation/strategies/BoardingStrategy';
import { useSimulationStore } from '@/state/simulationStore';

const SEAT_LEGEND: ReadonlyArray<{ label: string; className: string }> = [
  { label: 'Moving', className: 'dot-moving' },
  { label: 'Stowing', className: 'dot-stow' },
  { label: 'Blocked', className: 'dot-blocked' },
  { label: 'Over-climb', className: 'dot-overclimb' },
];

/**
 * Controls below the canvas: strategy select, Realism/Simple toggle,
 * play/pause/reset, the heatmap toggle, and the live readouts.
 */
export function ControlPanel() {
  const { play, pause, reset, setSpeed, selectStrategy, setSimpleMode, strategyId } = useSimulation();
  const status = useSimulationStore((s) => s.status);
  const speed = useSimulationStore((s) => s.speed);
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

      <label className="speed-control">
        <span className="speed-label">Speed</span>
        <input
          type="range"
          min={0.25}
          max={8}
          step={0.25}
          value={speed}
          onChange={(event) => setSpeed(Number(event.target.value))}
          aria-label="Simulation speed"
        />
        <span className="speed-value">{speed}×</span>
      </label>

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
