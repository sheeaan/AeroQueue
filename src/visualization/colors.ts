import type { SeatColumnType } from '@/simulation/domain/geometry';

/**
 * Palette for the visualisation. Agents are colour-coded by seat type so that
 * the lateral sorting of a strategy (e.g. WilMA's blue → green → red wave) is
 * legible at a glance without any text.
 */
export const SEAT_COLORS: Record<SeatColumnType, number> = {
  window: 0x4ea1ff, // blue
  middle: 0x4ade80, // green
  aisle: 0xf87171, // red
};

/** High-contrast colour an agent flashes toward while Blocked. */
export const COLOR_BLOCKED_FLASH = 0xffffff;

export const COLOR_CABIN_BG = 0x0b1120;
export const COLOR_FUSELAGE = 0x16203a;
export const COLOR_SEAT_OUTLINE = 0x2a3a57;
export const COLOR_AISLE_BAND = 0x0a101f;

// ── Blueprint aircraft anatomy (Phase 6) ──────────────────────────────
export const COLOR_HULL_FILL = 0x141e36;
export const COLOR_HULL_STROKE = 0x3f5680;
export const COLOR_WING_FILL = 0x101a30;
export const COLOR_WING_STROKE = 0x35496f;
export const COLOR_JETBRIDGE_FILL = 0x1b2640;
export const COLOR_JETBRIDGE_STROKE = 0x3f5680;
export const COLOR_DOOR = 0x9fd2ff;

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
