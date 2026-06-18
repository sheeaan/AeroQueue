import type { SeatColumnType } from '@/simulation/domain/geometry';

/**
 * Palette for the minimalist "educational video" aesthetic (CGP-Grey-style flat
 * vector art on a light field). The airframe is rendered as a clean light-gray
 * outline so attention stays on the agents, which are bright, flat, primary
 * discs that pop against the off-white background and read instantly by seat
 * type (window = blue, middle = green, aisle = red).
 */
export const SEAT_COLORS: Record<SeatColumnType, number> = {
  window: 0x2563eb, // blue
  middle: 0x16a34a, // green
  aisle: 0xdc2626, // red
};

/**
 * Sharp, high-contrast amber an agent switches to while Blocked, so an aisle
 * bottleneck pops out from the blue/green/red traffic at a glance.
 */
export const COLOR_BLOCKED_FLASH = 0xf59e0b;

/** Crisp dark accent for the Stowing loading arc and the Blocked ring. */
export const COLOR_AGENT_ACCENT = 0x1f2937;

/** Soft off-white page colour — the clean educational backdrop. */
export const COLOR_CABIN_BG = 0xf8f9fa;

// ── Flat airframe palette ─────────────────────────────────────────────────────
// Light-gray fills with a single thick, crisp dark-gray stroke. No gradients,
// sheens, nacelles, or cockpit detail — just clean vector outlines.
export const COLOR_HULL_FILL = 0xeceff3; // light-gray fuselage
export const COLOR_HULL_STROKE = 0x374151; // thick dark-gray outline
export const COLOR_WING_FILL = 0xdfe4ea; // slightly deeper gray wings
export const COLOR_WING_STROKE = 0x374151;
export const COLOR_JETBRIDGE_FILL = 0xe5e7eb; // jet-bridge gangway
export const COLOR_JETBRIDGE_STROKE = 0x374151;
export const COLOR_SEAT_STROKE = 0x94a3b8; // hollow seat outline (medium gray)
export const COLOR_AISLE_LINE = 0xcbd5e1; // subtle aisle guide
export const COLOR_DOOR = 0x374151; // forward boarding-door mark

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
