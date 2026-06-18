'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ComparativeBarChart } from '@/components/ComparativeBarChart';
import { DistributionChart } from '@/components/DistributionChart';
import { useSimulationContext } from '@/components/SimulationProvider';
import type { MonteCarloResult } from '@/simulation/analysis/statistics';
import type { SeatId } from '@/simulation/domain/ids';
import { DEFAULT_STRATEGIES } from '@/simulation/strategies';
import type { StrategyId } from '@/simulation/strategies/BoardingStrategy';
import { useSimulationStore } from '@/state/simulationStore';
import type {
  CompareRequest,
  CompareRow,
  EvolveRequest,
  MonteCarloRequest,
  WorkerResponse,
} from '@/workers/monteCarlo.worker';

const ITERATIONS = 1000;
const COMPARE_ITERATIONS = 80;
const GA_GENERATIONS = 60;
const GA_POPULATION = 60;

type Activity = 'idle' | 'monte-carlo' | 'evolve' | 'compare';

interface ResultMeta {
  strategyId: StrategyId;
  isSimpleMode: boolean;
}

interface GaSummary {
  fitness: number;
  initialBest: number;
  generations: number;
}

function strategyName(id: StrategyId): string {
  if (id === 'custom') return '🧬 Evolved (GA)';
  return DEFAULT_STRATEGIES.find((strategy) => strategy.id === id)?.name ?? id;
}

/**
 * Statistical analytics + optimization panel. Offloads both the Monte-Carlo
 * batch and the Genetic-Algorithm search to the Web Worker, visualises the
 * resulting boarding-time distribution, and loads the GA's fittest sequence
 * straight into the live visualizer.
 */
export function AnalyticsDashboard() {
  const controller = useSimulationContext();
  const strategyId = useSimulationStore((s) => s.strategyId);
  const isSimpleMode = useSimulationStore((s) => s.isSimpleMode);
  const setStrategy = useSimulationStore((s) => s.setStrategy);
  const result = useSimulationStore((s) => s.monteCarlo);
  const setResult = useSimulationStore((s) => s.setMonteCarlo);

  const workerRef = useRef<Worker | null>(null);
  const [activity, setActivity] = useState<Activity>('idle');
  const [progress, setProgress] = useState(0);
  const [samples, setSamples] = useState<number[] | null>(null);
  const [meta, setMeta] = useState<ResultMeta | null>(null);
  const [gaStatus, setGaStatus] = useState<{ generation: number; total: number; best: number } | null>(null);
  const [ga, setGa] = useState<GaSummary | null>(null);
  const [compare, setCompare] = useState<{ rows: CompareRow[]; freeBoardingTicks: number; isSimpleMode: boolean } | null>(null);
  // The GA-evolved order, captured so "Compare All" can include it as a contender.
  const customOrderRef = useRef<SeatId[] | null>(null);

  useEffect(() => {
    const worker = new Worker(new URL('../workers/monteCarlo.worker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;

    let initialBest = Infinity;

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      switch (message.type) {
        case 'mc-progress':
          setProgress(message.completed / message.total);
          break;
        case 'mc-done':
          setResult(message.result);
          setSamples(message.samples);
          setMeta({ strategyId: message.strategyId, isSimpleMode: message.isSimpleMode });
          setProgress(1);
          setActivity('idle');
          break;
        case 'evolve-progress':
          if (message.generation === 0) initialBest = message.bestFitness;
          setProgress((message.generation + 1) / message.total);
          setGaStatus({ generation: message.generation + 1, total: message.total, best: message.bestFitness });
          break;
        case 'evolve-done':
          // Load the fittest sequence into the live visualizer as the 'custom' strategy.
          controller.loadCustomOrder(message.order);
          customOrderRef.current = message.order;
          setStrategy('custom');
          setGa({
            fitness: message.fitness,
            initialBest,
            generations: message.history.length,
          });
          setGaStatus(null);
          setProgress(1);
          setActivity('idle');
          break;
        case 'compare-progress':
          setProgress(message.completed / message.total);
          break;
        case 'compare-done':
          setCompare({
            rows: message.rows,
            freeBoardingTicks: message.freeBoardingTicks,
            isSimpleMode: message.isSimpleMode,
          });
          setProgress(1);
          setActivity('idle');
          break;
      }
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [controller, setResult, setStrategy]);

  const busy = activity !== 'idle';

  const runMonteCarlo = () => {
    const worker = workerRef.current;
    if (busy || !worker) return;
    setActivity('monte-carlo');
    setProgress(0);
    setResult(null);
    setSamples(null);
    setMeta(null);
    const request: MonteCarloRequest = {
      kind: 'monte-carlo',
      strategyId,
      iterations: ITERATIONS,
      isSimpleMode,
    };
    worker.postMessage(request);
  };

  const runEvolve = () => {
    const worker = workerRef.current;
    if (busy || !worker) return;
    setActivity('evolve');
    setProgress(0);
    setGa(null);
    setGaStatus({ generation: 0, total: GA_GENERATIONS, best: Infinity });
    const request: EvolveRequest = {
      kind: 'evolve',
      generations: GA_GENERATIONS,
      populationSize: GA_POPULATION,
    };
    worker.postMessage(request);
  };

  const runCompare = () => {
    const worker = workerRef.current;
    if (busy || !worker) return;
    setActivity('compare');
    setProgress(0);
    setCompare(null);
    const strategyIds: StrategyId[] = DEFAULT_STRATEGIES.map((strategy) => strategy.id);
    if (customOrderRef.current) strategyIds.push('custom');
    const request: CompareRequest = {
      kind: 'compare',
      strategyIds,
      iterations: COMPARE_ITERATIONS,
      isSimpleMode,
      customOrder: customOrderRef.current ?? undefined,
    };
    worker.postMessage(request);
  };

  const stale = useMemo(
    () => meta !== null && (meta.strategyId !== strategyId || meta.isSimpleMode !== isSimpleMode),
    [meta, strategyId, isSimpleMode],
  );

  const pct = Math.round(progress * 100);

  return (
    <section className="analytics">
      <div className="analytics-head">
        <h2 className="analytics-title">Monte-Carlo Analytics</h2>
        <p className="analytics-sub">
          {strategyName(strategyId)} · {isSimpleMode ? 'Simple' : 'Realism'} mode
        </p>
      </div>

      <div className="analytics-actions">
        <button className="run-button" onClick={runMonteCarlo} disabled={busy}>
          {activity === 'monte-carlo' ? `Running… ${pct}%` : `Run ${ITERATIONS} Simulations`}
        </button>

        <button className="run-button evolve-button" onClick={runEvolve} disabled={busy}>
          {activity === 'evolve'
            ? gaStatus
              ? `Evolving… gen ${gaStatus.generation}/${gaStatus.total} · best ${gaStatus.best === Infinity ? '—' : gaStatus.best.toFixed(0)}`
              : `Evolving… ${pct}%`
            : '🧬 Evolve Optimal Sequence'}
        </button>

        <button className="run-button compare-button" onClick={runCompare} disabled={busy}>
          {activity === 'compare' ? `Comparing… ${pct}%` : '📊 Compare All Strategies'}
        </button>
      </div>

      {busy && (
        <div className="progress" role="progressbar" aria-valuenow={pct}>
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
      )}

      {ga && (
        <div className="ga-result">
          <p className="ga-headline">
            Evolved sequence loaded — press <strong>Play</strong> to watch it.
          </p>
          <div className="stat-row">
            <span>E(T) {ga.fitness.toFixed(0)} ticks</span>
            <span>
              gen 0 → {ga.generations}: {ga.initialBest.toFixed(0)} → {ga.fitness.toFixed(0)}
            </span>
          </div>
        </div>
      )}

      <div className="analytics-results">
        {result && result.runs > 0 && samples && (
          <MonteCarloResultView result={result} samples={samples} meta={meta} stale={stale} />
        )}

        {compare && compare.rows.length > 0 && (
          <div className="compare-result">
            <p className="analytics-for">
              Mean boarding time μ · {compare.rows[0].runs} runs ·{' '}
              {compare.isSimpleMode ? 'Simple' : 'Realism'} mode
            </p>
            <ComparativeBarChart rows={compare.rows} freeBoardingTicks={compare.freeBoardingTicks} />
          </div>
        )}
      </div>
    </section>
  );
}

function MonteCarloResultView({
  result,
  samples,
  meta,
  stale,
}: {
  result: MonteCarloResult;
  samples: number[];
  meta: ResultMeta | null;
  stale: boolean;
}) {
  return (
    <div className="analytics-result">
      {meta && (
        <p className="analytics-for">
          {result.runs} runs · {strategyName(meta.strategyId)} · {meta.isSimpleMode ? 'Simple' : 'Realism'}
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

      <DistributionChart samples={samples} />

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
