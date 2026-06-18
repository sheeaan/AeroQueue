import type { SeatColumnType } from '@/simulation/domain/geometry';

/**
 * Palette for the NASA "Beginner's Guide to Aeronautics" (FoilSim) academic
 * aesthetic: a sterile black-and-white engineering diagram on pure white, with
 * passengers as flat, solid primary-colour discs. There are deliberately no
 * gradients, glows, shadows, tints, or interpolation helpers here — only the
 * hard hex values a classic textbook figure would use.
 */

/** Pure white application background. */
export const COLOR_CABIN_BG = 0xffffff;

/** Hard black for every diagram line (hull, wings, jet bridge, seats, aisle). */
export const COLOR_DIAGRAM_LINE = 0x000000;
/** Pure white fill for closed airframe shapes, so they read as clean outlines. */
export const COLOR_DIAGRAM_FILL = 0xffffff;

/** Flat primary agent colours by seat type. */
export const SEAT_COLORS: Record<SeatColumnType, number> = {
  window: 0x0000ff, // pure blue
  middle: 0x00ff00, // pure green
  aisle: 0xff0000, // pure red
};

/** Static, stark fill an agent turns while Blocked (marks an aisle bottleneck). */
export const COLOR_BLOCKED = 0xffff00; // pure yellow
/** Static black outline used for the Stowing / Blocked diagram markers. */
export const COLOR_AGENT_OUTLINE = 0x000000;
