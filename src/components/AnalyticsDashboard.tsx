'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { MonteCarloResult } from '@/simulation/analysis/statistics';
import { DEFAULT_STRATEGIES } from '@/simulation/strategies';
import type { StrategyId } from '@/simulation/strategies/BoardingStrategy';
import { useSimulationStore } from '@/state/simulationStore';
import type { MonteCarloRequest, MonteCarloResponse } from '@/workers/monteCarlo.worker';

const ITERATIONS = 1000;

interface ResultMeta {
  strategyId: StrategyId;
  isSimpleMode: boolean;
}

function strategyName(id: StrategyId): string {
  return DEFAULT_STRATEGIES.find((strategy) => strategy.id === id)?.name ?? id;
}

/**
 * Statistical analytics panel. Offloads `ITERATIONS` headless simulations to the
 * Monte-Carlo Web Worker (keeping the main thread responsive), shows live
 * progress, and reports the resulting mean (μ) and variance (σ²) for the
 * currently selected strategy + mode.
 */
export function AnalyticsDashboard() {
  const strategyId = useSimulationStore((s) => s.strategyId);
  const isSimpleMode = useSimulationStore((s) => s.isSimpleMode);
  const result = useSimulationStore((s) => s.monteCarlo);
  const setResult = useSimulationStore((s) => s.setMonteCarlo);

  const workerRef = useRef<Worker | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [meta, setMeta] = useState<ResultMeta | null>(null);

  useEffect(() => {
    // Instantiated the Next.js-compatible way so webpack bundles the worker as
    // its own chunk. Worker APIs are client-only, so this runs in an effect.
    const worker = new Worker(new URL('../workers/monteCarlo.worker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<MonteCarloResponse>) => {
      const message = event.data;
      if (message.type === 'progress') {
        setProgress(message.completed / message.total);
      } else {
        setResult(message.result);
        setMeta({ strategyId: message.strategyId, isSimpleMode: message.isSimpleMode });
        setProgress(1);
        setRunning(false);
      }
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [setResult]);

  const run = () => {
    const worker = workerRef.current;
    if (running || !worker) return;
    setRunning(true);
    setProgress(0);
    setResult(null);
    setMeta(null);
    const request: MonteCarloRequest = { strategyId, iterations: ITERATIONS, isSimpleMode };
    worker.postMessage(request);
  };

  const stale = useMemo(
    () => meta !== null && (meta.strategyId !== strategyId || meta.isSimpleMode !== isSimpleMode),
    [meta, strategyId, isSimpleMode],
  );

  return (
    <section className="analytics">
      <h2 className="analytics-title">Monte-Carlo Analytics</h2>
      <p className="analytics-sub">
        {strategyName(strategyId)} · {isSimpleMode ? 'Simple' : 'Realism'} mode
      </p>

      <button className="run-button" onClick={run} disabled={running}>
        {running ? `Running… ${Math.round(progress * 100)}%` : `Run ${ITERATIONS} Simulations`}
      </button>

      {running && (
        <div className="progress" role="progressbar" aria-valuenow={Math.round(progress * 100)}>
          <div className="progress-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}

      {result && result.runs > 0 && (
        <ResultView result={result} meta={meta} stale={stale} />
      )}
    </section>
  );
}

function ResultView({
  result,
  meta,
  stale,
}: {
  result: MonteCarloResult;
  meta: ResultMeta | null;
  stale: boolean;
}) {
  return (
    <div className="analytics-result">
      {meta && (
        <p className="analytics-for">
          {result.runs} runs · {strategyName(meta.strategyId)} ·{' '}
          {meta.isSimpleMode ? 'Simple' : 'Realism'}
          {stale && <span className="stale-tag">selection changed</span>}
        </p>
      )}
      <div className="stat-grid">
        <div className="stat">
          <div className="stat-label">Mean μ</div>
          <div className="stat-value">{result.mean.toFixed(1)}</div>
          <div className="stat-unit">ticks</div>
        </div>
        <div className="stat">
          <div className="stat-label">Variance σ²</div>
          <div className="stat-value">{result.variance.toFixed(1)}</div>
          <div className="stat-unit">ticks²</div>
        </div>
      </div>
      <div className="stat-row">
        <span>σ {result.stdDev.toFixed(1)}</span>
        <span>
          95% CI [{result.ci95.lower.toFixed(0)}, {result.ci95.upper.toFixed(0)}]
        </span>
        <span>
          range {result.min.toFixed(0)}–{result.max.toFixed(0)}
        </span>
      </div>
    </div>
  );
}
