import type { SeatColumnType } from '@/simulation/domain/geometry';

/**
 * Palette for the abstract physics-simulation aesthetic.
 *
 * The cabin is rendered as a raw cellular-automata lattice on a near-black field
 * — no aircraft anatomy. Agents are high-contrast "data points" colour-coded by
 * seat type on a strictly technical RGB-primary palette, so the lateral sorting
 * of a strategy (e.g. WilMA's window → middle → aisle wave) reads at a glance.
 */
export const SEAT_COLORS: Record<SeatColumnType, number> = {
  window: 0x00e5ff, // cyan
  middle: 0xff2bd6, // magenta
  aisle: 0xffe600, // yellow
};

/** Stark, high-contrast red an agent flashes toward while Blocked (aisle interference). */
export const COLOR_BLOCKED_FLASH = 0xff1733;

/** Bright accent for the Stowing loading-arc / pulse indicator. */
export const COLOR_STOW_ARC = 0xffffff;

// ── Lattice (cellular-automata matrix) ────────────────────────────────────────
/** Pure dark background — the void the simulation runs against. */
export const COLOR_CABIN_BG = 0x05070c;
/** Dark technical grey for the unfilled seat-cell wireframes. */
export const COLOR_CELL_STROKE = 0x2b3a52;
/** Faint subtle track marking the central aisle corridor. */
export const COLOR_AISLE_TRACK = 0x16263f;
/** Thin registration frame bounding the whole lattice. */
export const COLOR_LATTICE_FRAME = 0x1b2740;

/** Component-wise linear interpolation between two packed RGB colours. */
export function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}
