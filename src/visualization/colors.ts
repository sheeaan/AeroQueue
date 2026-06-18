import type { SeatColumnType } from '@/simulation/domain/geometry';

/**
 * Palette for the modern "analytics SaaS" aesthetic: a muted dark-slate field, a
 * soft seat lattice, and passengers as clean flat data-visualisation discs
 * colour-coded by seat type (soft blue / teal / coral). Polished but flat — no
 * neon, no gradients on the agents themselves.
 */
export const SEAT_COLORS: Record<SeatColumnType, number> = {
  window: 0x60a5fa, // soft blue
  middle: 0x2dd4bf, // teal
  aisle: 0xfb7185, // coral
};

/** Thin amber ring marking an aisle-Blocked agent (a clean UI indicator). */
export const COLOR_BLOCKED = 0xf59e0b;

/** Thin light arc that sweeps as a Stowing agent unloads its bags. */
export const COLOR_STOW_ARC = 0xe5e7eb;

/** Muted dark-slate application background. */
export const COLOR_CABIN_BG = 0x111827;

/** Soft, muted seat-cell fill. */
export const COLOR_SEAT_FILL = 0x1f2937;
/** Subtle seat-cell border. */
export const COLOR_SEAT_STROKE = 0x374151;
/** Subtle central-aisle guide. */
export const COLOR_AISLE = 0x374151;
