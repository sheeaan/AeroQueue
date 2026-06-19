'use client';

import { useMemo } from 'react';
import type { SeatColumnType } from '@/simulation/domain/geometry';
import type { Trajectory } from '@/workers/monteCarlo.worker';

/**
 * Space-time (trajectory) diagram: X = time, Y = aisle row, one line per
 * passenger. A sloped segment is walking; a flat segment is stowing or blocked —
 * so aisle interference shows up directly as horizontal stalls and the way they
 * stack up behind a bottleneck. Dependency-free SVG, like the other charts.
 */

/** Line colour by seat type (so the boarding "waves" are legible). */
const SEAT_COLOR: Record<SeatColumnType, string> = {
  window: '#22d3ee', // cyan
  middle: '#4ade80', // green
  aisle: '#f87171', // red
};

const W = 620;
const H = 300;
const PAD_L = 40;
const PAD_R = 12;
const PAD_T = 14;
const PAD_B = 40;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;
const BASE_Y = PAD_T + PLOT_H;

export function SpaceTimeChart({
  trajectories,
  rows,
  boardingTime,
}: {
  trajectories: Trajectory[];
  rows: number;
  boardingTime: number;
}) {
  const lines = useMemo(() => {
    const span = boardingTime || 1;
    const rowSpan = Math.max(1, rows - 1);
    const xOf = (t: number) => PAD_L + (t / span) * PLOT_W;
    const yOf = (row: number) => BASE_Y - (row / rowSpan) * PLOT_H;
    return trajectories.map((tr) => ({
      id: tr.id,
      color: SEAT_COLOR[tr.seatType],
      points: tr.points.map((p) => `${xOf(p.t).toFixed(1)},${yOf(p.row).toFixed(1)}`).join(' '),
    }));
  }, [trajectories, rows, boardingTime]);

  if (trajectories.length === 0) return null;

  const rowSpan = Math.max(1, rows - 1);
  const yOf = (row: number) => BASE_Y - (row / rowSpan) * PLOT_H;
  const xOf = (t: number) => PAD_L + (t / (boardingTime || 1)) * PLOT_W;

  const rowTicks: number[] = [];
  for (let r = 0; r <= rows - 1; r += 5) rowTicks.push(r);
  const timeTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(boardingTime * f));

  return (
    <div className="spacetime-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Space-time diagram of passenger rows over time">
        {/* row gridlines + labels */}
        {rowTicks.map((r) => {
          const y = yOf(r);
          return (
            <g key={`r${r}`}>
              <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} className="cmp-grid" />
              <text x={PAD_L - 5} y={y + 3} className="cmp-ylabel" textAnchor="end">
                {r}
              </text>
            </g>
          );
        })}

        {/* time tick labels */}
        {timeTicks.map((t, i) => (
          <text key={`t${i}`} x={xOf(t)} y={BASE_Y + 13} className="cmp-xlabel" textAnchor="middle">
            {t}
          </text>
        ))}

        {/* one polyline per passenger */}
        {lines.map((l) => (
          <polyline key={l.id} points={l.points} fill="none" stroke={l.color} strokeWidth={0.8} strokeOpacity={0.55} />
        ))}

        {/* axes + labels */}
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={BASE_Y} className="cmp-axis" />
        <line x1={PAD_L} y1={BASE_Y} x2={W - PAD_R} y2={BASE_Y} className="cmp-axis" />
        <text x={PAD_L + PLOT_W / 2} y={H - 4} className="cmp-xlabel" textAnchor="middle">
          Time (ticks)
        </text>
        <text x={11} y={PAD_T + PLOT_H / 2} className="cmp-ylabel" textAnchor="middle" transform={`rotate(-90 11 ${PAD_T + PLOT_H / 2})`}>
          Row
        </text>
      </svg>
      <div className="cmp-legend">
        <span>
          <span className="cmp-swatch" style={{ background: SEAT_COLOR.window }} /> window
        </span>
        <span>
          <span className="cmp-swatch" style={{ background: SEAT_COLOR.middle }} /> middle
        </span>
        <span>
          <span className="cmp-swatch" style={{ background: SEAT_COLOR.aisle }} /> aisle
        </span>
        <span className="dist-spread">flat = stow / block · sloped = walking</span>
      </div>
    </div>
  );
}
