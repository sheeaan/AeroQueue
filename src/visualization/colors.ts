/**
 * Palette for the raw "NASA FoilSim" wind-tunnel aesthetic: a pitch-black field,
 * a pure cyan wireframe lattice, and passengers as stark high-contrast squares.
 * No gradients, glows, tints, or interpolation helpers — only hard hex values.
 */

/** Pitch-black application background (the wind-tunnel view). */
export const COLOR_CABIN_BG = 0x000000;

/** Pure cyan for the hollow 1px seat-cell wireframes (the mathematical grid). */
export const COLOR_GRID = 0x00ffff;

/** Dim teal dashes marking the central aisle corridor. */
export const COLOR_AISLE_DASH = 0x00aaaa;

/** Moving passenger (queued / walking / seated) — solid white square. */
export const COLOR_AGENT_MOVING = 0xffffff;

/** Held passenger (stowing or aisle-blocked) — solid yellow square. */
export const COLOR_AGENT_HELD = 0xffff00;
