'use client';

import { useMemo } from 'react';
import type { CompareRow } from '@/workers/monteCarlo.worker';

/**
 * Comparative bar chart of mean boarding time (μ) per strategy, in the style of a
 * dedicated operations-research study:
 *   - bars sorted slowest → fastest (highest μ on the left),
 *   - error bars showing ± one standard deviation (σ) — algorithm consistency,
 *   - a dashed red baseline at the theoretical zero-interference "free boarding"
 *     time, so every bar's distance above the line is its avoidable delay.
 *
 * Dependency-free custom SVG so there is no charting-library weight; the viewBox
 * makes it fully responsive inside the analytics panel.
 */

/** Flat data-visualisation palette, assigned per sorted bar. */
const BAR_PALETTE = [
  '#fb7185', // coral (slowest)
  '#f59e0b', // amber
  '#facc15', // yellow
  '#a78bfa', // violet
  '#38bdf8', // sky
  '#2dd4bf', // teal
  '#34d399', // green
  '#60a5fa', // blue (fastest)
];

const W = 600;
const H = 320;
const PAD_L = 46;
const PAD_R = 14;
const PAD_T = 18;
const PAD_B = 96; // room for rotated strategy labels
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;
const BASE_Y = PAD_T + PLOT_H;

function niceCeil(value: number): number {
  if (value <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(value)));
  const n = value / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

export function ComparativeBarChart({
  rows,
  freeBoardingTicks,
}: {
  rows: CompareRow[];
  freeBoardingTicks: number;
}) {
  const { sorted, yMax, ticks } = useMemo(() => {
    const sorted = [...rows].sort((a, b) => b.mean - a.mean);
    let top = 0;
    for (const r of sorted) top = Math.max(top, r.mean + r.stdDev);
    top = Math.max(top, freeBoardingTicks);
    const yMax = niceCeil(top * 1.08);
    const tickStep = yMax / 4;
    const ticks = Array.from({ length: 5 }, (_, i) => Math.round(tickStep * i));
    return { sorted, yMax, ticks };
  }, [rows, freeBoardingTicks]);

  if (sorted.length === 0) return null;

  const yOf = (value: number) => PAD_T + PLOT_H * (1 - value / yMax);
  const slot = PLOT_W / sorted.length;
  const barW = Math.min(46, slot * 0.62);
  const baselineY = yOf(freeBoardingTicks);

  return (
    <div className="compare-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Mean boarding time by strategy">
        {/* y gridlines + labels */}
        {ticks.map((t) => {
          const y = yOf(t);
          return (
            <g key={t}>
              <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} className="cmp-grid" />
              <text x={PAD_L - 6} y={y + 3} className="cmp-ylabel" textAnchor="end">
                {t}
              </text>
            </g>
          );
        })}

        {/* bars + error bars */}
        {sorted.map((row, i) => {
          const cx = PAD_L + slot * (i + 0.5);
          const x = cx - barW / 2;
          const top = yOf(row.mean);
          const color = BAR_PALETTE[i % BAR_PALETTE.length];
          const hi = yOf(row.mean + row.stdDev);
          const lo = yOf(Math.max(0, row.mean - row.stdDev));
          const cap = Math.min(7, barW / 2.5);
          return (
            <g key={row.strategyId}>
              <title>{`${row.label}: μ ${row.mean.toFixed(1)} ± ${row.stdDev.toFixed(1)} ticks`}</title>
              <rect x={x} y={top} width={barW} height={Math.max(0, BASE_Y - top)} rx={3} fill={color} />
              {/* error bar (± σ) */}
              <line x1={cx} y1={hi} x2={cx} y2={lo} className="cmp-err" />
              <line x1={cx - cap} y1={hi} x2={cx + cap} y2={hi} className="cmp-err" />
              <line x1={cx - cap} y1={lo} x2={cx + cap} y2={lo} className="cmp-err" />
              {/* μ value */}
              <text x={cx} y={top - 6} className="cmp-value" textAnchor="middle">
                {row.mean.toFixed(0)}
              </text>
              {/* rotated strategy label */}
              <text
                x={cx}
                y={BASE_Y + 12}
                className="cmp-xlabel"
                textAnchor="end"
                transform={`rotate(-38 ${cx} ${BASE_Y + 12})`}
              >
                {row.label}
              </text>
            </g>
          );
        })}

        {/* free-boarding baseline */}
        <line x1={PAD_L} y1={baselineY} x2={W - PAD_R} y2={baselineY} className="cmp-baseline" />
        <text x={W - PAD_R} y={baselineY - 5} className="cmp-baseline-label" textAnchor="end">
          Free boarding ≈ {freeBoardingTicks.toFixed(0)}
        </text>

        {/* axes */}
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={BASE_Y} className="cmp-axis" />
        <line x1={PAD_L} y1={BASE_Y} x2={W - PAD_R} y2={BASE_Y} className="cmp-axis" />
      </svg>
      <div className="cmp-legend">
        <span>
          <span className="cmp-swatch cmp-swatch-bar" /> mean μ (ticks)
        </span>
        <span>
          <span className="cmp-swatch cmp-swatch-err" /> ± σ
        </span>
        <span>
          <span className="cmp-swatch cmp-swatch-base" /> free boarding
        </span>
      </div>
    </div>
  );
}
