'use client';

import { useMemo } from 'react';

interface Bin {
  x0: number;
  x1: number;
  count: number;
}

interface Distribution {
  bins: Bin[];
  cdf: Array<{ x: number; y: number }>;
  min: number;
  max: number;
  mean: number;
  maxCount: number;
  degenerate: boolean;
}

function buildDistribution(samples: number[], binCount: number): Distribution {
  const n = samples.length;
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (const s of samples) {
    if (s < min) min = s;
    if (s > max) max = s;
    sum += s;
  }
  const mean = sum / n;

  // Degenerate case: a perfectly consistent strategy (e.g. Steffen in Simple Mode).
  if (max - min < 1e-9) {
    return {
      bins: [{ x0: min, x1: min, count: n }],
      cdf: [
        { x: min, y: 0 },
        { x: min, y: 1 },
      ],
      min,
      max,
      mean,
      maxCount: n,
      degenerate: true,
    };
  }

  const width = (max - min) / binCount;
  const bins: Bin[] = Array.from({ length: binCount }, (_, i) => ({
    x0: min + i * width,
    x1: min + (i + 1) * width,
    count: 0,
  }));
  for (const s of samples) {
    let idx = Math.floor((s - min) / width);
    if (idx >= binCount) idx = binCount - 1;
    if (idx < 0) idx = 0;
    bins[idx].count++;
  }

  let maxCount = 0;
  for (const b of bins) if (b.count > maxCount) maxCount = b.count;

  // Cumulative distribution from the histogram edges.
  const cdf: Array<{ x: number; y: number }> = [{ x: min, y: 0 }];
  let cumulative = 0;
  for (const b of bins) {
    cumulative += b.count;
    cdf.push({ x: b.x1, y: cumulative / n });
  }

  return { bins, cdf, min, max, mean, maxCount, degenerate: false };
}

/**
 * Lightweight dependency-free SVG visualisation of a Monte-Carlo boarding-time
 * distribution: a histogram (frequency) with an overlaid cumulative distribution
 * function (CDF). Makes the variance story visceral — a tall narrow histogram is
 * a consistent strategy; a wide flat one (Random) is a gamble.
 */
export function DistributionChart({ samples }: { samples: number[] }) {
  const dist = useMemo(() => buildDistribution(samples, 24), [samples]);

  // viewBox coordinate system.
  const W = 320;
  const H = 168;
  const padL = 6;
  const padR = 6;
  const padT = 10;
  const padB = 24;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const baseY = padT + plotH;

  const span = dist.max - dist.min || 1;
  const xOf = (value: number) => padL + ((value - dist.min) / span) * plotW;
  const barH = (count: number) => (dist.maxCount ? (count / dist.maxCount) * plotH : 0);
  const cdfY = (y: number) => baseY - y * plotH;

  const cdfPoints = dist.cdf.map((p) => `${xOf(p.x).toFixed(1)},${cdfY(p.y).toFixed(1)}`).join(' ');
  const meanX = xOf(dist.mean);

  return (
    <div className="dist-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Boarding-time distribution">
        {/* histogram bars */}
        {dist.degenerate ? (
          <rect x={W / 2 - 6} y={padT} width={12} height={plotH} className="dist-bar" />
        ) : (
          dist.bins.map((b, i) => {
            const x = xOf(b.x0);
            const w = Math.max(1, xOf(b.x1) - xOf(b.x0) - 1);
            const h = barH(b.count);
            return <rect key={i} x={x} y={baseY - h} width={w} height={h} className="dist-bar" />;
          })
        )}

        {/* mean marker */}
        <line x1={meanX} y1={padT} x2={meanX} y2={baseY} className="dist-mean" />

        {/* CDF overlay */}
        <polyline points={cdfPoints} className="dist-cdf" />

        {/* baseline */}
        <line x1={padL} y1={baseY} x2={W - padR} y2={baseY} className="dist-axis" />

        {/* x labels */}
        <text x={padL} y={H - 7} className="dist-label" textAnchor="start">
          {dist.min.toFixed(0)}
        </text>
        <text x={meanX} y={H - 7} className="dist-label" textAnchor="middle">
          μ {dist.mean.toFixed(0)}
        </text>
        <text x={W - padR} y={H - 7} className="dist-label" textAnchor="end">
          {dist.max.toFixed(0)}
        </text>
      </svg>
      <div className="dist-legend">
        <span>
          <span className="swatch swatch-bar" /> frequency
        </span>
        <span>
          <span className="swatch swatch-cdf" /> CDF
        </span>
        <span className="dist-spread">spread {(dist.max - dist.min).toFixed(0)} ticks</span>
      </div>
    </div>
  );
}
