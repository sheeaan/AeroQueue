/**
 * Canvas colors (FoilSim-style): black background, cyan seat grid, and bright
 * passenger squares whose colour shows their state.
 */

/** Pitch-black application background (the wind-tunnel view). */
export const COLOR_CABIN_BG = 0x000000;

/** Pure cyan for the hollow 1px seat-cell wireframes (the grid). */
export const COLOR_GRID = 0x00ffff;

/** Dim teal dashes marking the central aisle corridor. */
export const COLOR_AISLE_DASH = 0x00aaaa;

/** Moving / queued / seated passenger — solid white square. */
export const COLOR_AGENT_MOVING = 0xffffff;

/** Actively stowing luggage — yellow (the square fills bottom-up as it stows). */
export const COLOR_AGENT_STOW = 0xffff00;

/** Blocked by aisle interference (forced to halt) — solid red. */
export const COLOR_AGENT_BLOCKED = 0xff0000;

/** A seated passenger temporarily standing for a neighbour's over-climb — orange. */
export const COLOR_SEAT_SHUFFLE = 0xff8c00;

/** The over-climb vector arrow (aisle → target seat) and the tick countdown. */
export const COLOR_ARROW = 0xffffff;
