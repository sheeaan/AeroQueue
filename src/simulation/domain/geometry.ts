/**
 * Spatial primitives for the cabin's cellular-automata grid.
 *
 * The cabin is abstracted (per the OR specification) as a 2-D Cartesian matrix
 * `C` of dimensions `R x S`, where `R` is the number of rows and `S` is the
 * number of columns *including the aisle*. For a narrow-body 3-3 layout
 * `S = 7` with the aisle at the centre column.
 */

/** Which physical half of the fuselage a seat belongs to. */
export type CabinSide = 'left' | 'right';

/**
 * Lateral seat classification. Drives both the WilMA/Reverse-Pyramid ordering
 * logic (later phases) and the colour-coding of agents in the PixiJS layer
 * (window = blue, middle = green, aisle = red).
 */
export type SeatColumnType = 'window' | 'middle' | 'aisle';

/** Whether a grid column carries seats or is the central walking corridor. */
export type CellKind = 'seat' | 'aisle';

/**
 * Discrete grid coordinate `(row, col)` inside the cabin matrix `C`.
 * `row` increases towards the tail; `col` increases from the left fuselage wall
 * to the right. A `row` of `-1` is the jet-bridge door (pre-boarding holding).
 */
export interface GridCoord {
  readonly row: number;
  readonly col: number;
}
