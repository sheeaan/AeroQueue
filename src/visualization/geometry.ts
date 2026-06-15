import type { CabinLayout } from '@/simulation/domain/Grid';

/**
 * Maps the discrete simulation grid `(row, col)` onto canvas pixels.
 *
 * Orientation is top-down with the fuselage laid out horizontally: the cabin's
 * long axis (rows, front → rear) runs along **X**, and the seat columns + aisle
 * stack along **Y**. The central aisle is therefore a horizontal band through
 * the middle of the canvas, which is where the congestion heatmap is painted.
 */

/** Pixels per grid cell (uniform on both axes). */
export const CELL = 26;
/** Outer padding around the cabin, in pixels. */
export const MARGIN = 30;
/** Rendered agent radius, in pixels. */
export const AGENT_RADIUS = 8;

export interface CanvasGeometry {
  readonly cell: number;
  readonly margin: number;
  readonly rows: number;
  readonly columns: number;
  readonly aisleColIndex: number;
  readonly width: number;
  readonly height: number;
  /** Centre-X of a cell at the given (possibly -1 = door) row. */
  rowToX(row: number): number;
  /** Centre-Y of a cell at the given column. */
  colToY(col: number): number;
}

export function createGeometry(cabin: CabinLayout): CanvasGeometry {
  const rows = cabin.rows;
  const columns = cabin.columns.length;
  const width = MARGIN * 2 + rows * CELL;
  const height = MARGIN * 2 + columns * CELL;

  return {
    cell: CELL,
    margin: MARGIN,
    rows,
    columns,
    aisleColIndex: cabin.aisleColIndex,
    width,
    height,
    rowToX: (row) => MARGIN + row * CELL + CELL / 2,
    colToY: (col) => MARGIN + col * CELL + CELL / 2,
  };
}
