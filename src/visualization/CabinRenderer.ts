import { Container, Graphics } from 'pixi.js';
import type { CabinLayout } from '@/simulation/domain/Grid';
import { COLOR_AISLE_DASH, COLOR_GRID } from './colors';
import type { CanvasGeometry } from './geometry';

// ── Grid metrics (px) ─────────────────────────────────────────────────────────
// There is deliberately NO aircraft here — no hull, nose, tail, wings, or jet
// bridge. The cabin is reduced to a pure mathematical lattice: rows run along X
// (front → rear), the seat columns + aisle stack along Y, and the central aisle
// is empty corridor marked by a dashed line.
const SEAT_GAP = 6; // padding so each seat cell reads as a discrete site
const GRID_PAD = 12; // gap between the outermost cells and the bbox edge
const ENTRY_RUNWAY = 120; // staging length to the left where queued agents marshal
const DASH_LEN = 7; // aisle dash length
const DASH_GAP = 6; // aisle gap between dashes

/** Logical X/Y of the aisle entry point, shared with the agent queue animation. */
export interface EntryPath {
  /** Centre-X of the door cell (one cell ahead of row 0), where agents stream in. */
  entryX: number;
  /** Centre-Y of the central aisle corridor. */
  aisleY: number;
}

/**
 * Derived geometry of the lattice and the content bounding box (logical coords).
 * Pure and shared by the renderer, the draw routines, and the agent renderer.
 */
export interface CabinAnatomy {
  gridLeftX: number;
  gridRightX: number;
  gridTopY: number;
  gridBottomY: number;
  aisleY: number;
  entry: EntryPath;
  bbox: { minX: number; maxX: number; minY: number; maxY: number };
}

export function computeAnatomy(geo: CanvasGeometry): CabinAnatomy {
  const gridLeftX = geo.rowToX(0) - geo.cell / 2;
  const gridRightX = geo.rowToX(geo.rows - 1) + geo.cell / 2;
  const gridTopY = geo.colToY(0) - geo.cell / 2;
  const gridBottomY = geo.colToY(geo.columns - 1) + geo.cell / 2;
  const aisleY = geo.colToY(geo.aisleColIndex);

  // Agents marshal in a single-file line to the LEFT of the grid along the aisle
  // row, then stream right into the lattice. `entryX` is the door cell centre.
  const entry: EntryPath = { entryX: geo.rowToX(-1), aisleY };

  const bbox = {
    minX: entry.entryX - ENTRY_RUNWAY,
    maxX: gridRightX + GRID_PAD,
    minY: gridTopY - GRID_PAD,
    maxY: gridBottomY + GRID_PAD,
  };

  return { gridLeftX, gridRightX, gridTopY, gridBottomY, aisleY, entry, bbox };
}

/**
 * Builds the static lattice, drawn once (zero per-frame cost): the dashed aisle
 * track → the cyan seat-cell wireframe grid.
 */
export function createCabinLayer(
  cabin: CabinLayout,
  geo: CanvasGeometry,
  anatomy: CabinAnatomy,
): Container {
  const layer = new Container();

  const aisle = new Graphics();
  drawAisleDashes(aisle, anatomy);
  layer.addChild(aisle);

  const cells = new Graphics();
  drawSeatCells(cells, cabin, geo);
  layer.addChild(cells);

  return layer;
}

/** Central aisle as a simple dashed line (otherwise empty black corridor). */
function drawAisleDashes(g: Graphics, a: CabinAnatomy): void {
  let x = a.entry.entryX;
  while (x < a.gridRightX) {
    const x1 = Math.min(x + DASH_LEN, a.gridRightX);
    g.moveTo(x, a.aisleY).lineTo(x1, a.aisleY);
    x += DASH_LEN + DASH_GAP;
  }
  g.stroke({ width: 1, color: COLOR_AISLE_DASH, alpha: 1 });
}

/**
 * Every seat as a strict, hollow, sharp-cornered 1px cyan wireframe rectangle —
 * the bare matrix of sites the high-contrast agents move between.
 */
function drawSeatCells(g: Graphics, cabin: CabinLayout, geo: CanvasGeometry): void {
  const size = geo.cell - SEAT_GAP;
  for (const seat of cabin.seats) {
    const x = geo.rowToX(seat.coord.row) - size / 2;
    const y = geo.colToY(seat.coord.col) - size / 2;
    g.rect(x, y, size, size); // sharp rectangle — never roundRect
  }
  g.stroke({ width: 1, color: COLOR_GRID, alpha: 1 });
}
