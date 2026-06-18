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

// ── Aircraft anatomy (airline seat-map blueprint) ─────────────────────
// Tuned to read like a professional cabin diagram (AeroLOPA / SeatGuru) on the
// dark page: a near-black fuselage tube, a crisp metallic edge, swept-back
// brushed-metal wings, and crisp per-type seat blocks.
export const COLOR_HULL_FILL = 0x111a2c; // near-black fuselage interior
export const COLOR_HULL_STROKE = 0x8aa4cf; // crisp metallic hull edge
export const COLOR_WING_FILL = 0x3f4f6e; // brushed-metal wing
export const COLOR_WING_STROKE = 0x59719c; // wing edge
export const COLOR_WING_SHEEN = 0x6b80a6; // wing highlight
export const COLOR_JETBRIDGE_FILL = 0x28324d; // jet-bridge gangway
export const COLOR_JETBRIDGE_STROKE = 0x5a76a8;
export const COLOR_DOOR = 0xbfe0ff;
export const COLOR_SEAT_OUTLINE = 0x6a93cf; // light-blue seat outline
export const COLOR_FIXTURE = 0x33446a; // galley / lavatory blocks
export const COLOR_AISLE_LINE = 0x556e9d;
export const COLOR_EXIT = 0x49c46a;
export const COLOR_COCKPIT = 0x9fd2ff;

/** Seat fill by lateral type — muted, professional, light→dark window→aisle. */
export const SEAT_TYPE_COLORS: Record<SeatColumnType, number> = {
  window: 0x456c93, // steel blue
  middle: 0x375573, // muted blue
  aisle: 0x2c3c54, // dark slate
};

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
