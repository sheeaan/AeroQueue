import { Container, Graphics } from 'pixi.js';
import type { CabinLayout } from '@/simulation/domain/Grid';
import { COLOR_AISLE, COLOR_SEAT_FILL, COLOR_SEAT_STROKE } from './colors';
import type { CanvasGeometry } from './geometry';

// ── Grid metrics (px) ─────────────────────────────────────────────────────────
// The cabin is a clean lattice (no aircraft anatomy): rows run along X
// (front → rear), the seat columns + aisle stack along Y, and the central aisle
// is a subtle guide line the agents travel along.
const SEAT_GAP = 6; // padding so each seat cell reads as a discrete site
const SEAT_RADIUS = 4; // slightly rounded corners (modern, soft)
const GRID_PAD = 14; // gap between the outermost cells and the bbox edge
const ENTRY_RUNWAY = 120; // staging length to the left where queued agents marshal

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
 * Builds the static lattice, drawn once (zero per-frame cost): the subtle aisle
 * guide → the soft rounded seat-cell grid.
 */
export function createCabinLayer(
  cabin: CabinLayout,
  geo: CanvasGeometry,
  anatomy: CabinAnatomy,
): Container {
  const layer = new Container();

  const aisle = new Graphics();
  drawAisle(aisle, anatomy);
  layer.addChild(aisle);

  const cells = new Graphics();
  drawSeatCells(cells, cabin, geo);
  layer.addChild(cells);

  return layer;
}

/** Subtle central-aisle guide line (the corridor the agents travel along). */
function drawAisle(g: Graphics, a: CabinAnatomy): void {
  g.moveTo(a.entry.entryX, a.aisleY).lineTo(a.gridRightX, a.aisleY);
  g.stroke({ width: 2, color: COLOR_AISLE, alpha: 0.8 });
}

/**
 * Every seat as a clean, slightly rounded rectangle with a soft muted fill and a
 * subtle border — a tidy matrix of sites the bright agents move between.
 */
function drawSeatCells(g: Graphics, cabin: CabinLayout, geo: CanvasGeometry): void {
  const size = geo.cell - SEAT_GAP;
  for (const seat of cabin.seats) {
    const x = geo.rowToX(seat.coord.row) - size / 2;
    const y = geo.colToY(seat.coord.col) - size / 2;
    g.roundRect(x, y, size, size, SEAT_RADIUS);
  }
  g.fill({ color: COLOR_SEAT_FILL, alpha: 1 });

  for (const seat of cabin.seats) {
    const x = geo.rowToX(seat.coord.row) - size / 2;
    const y = geo.colToY(seat.coord.col) - size / 2;
    g.roundRect(x, y, size, size, SEAT_RADIUS);
  }
  g.stroke({ width: 1, color: COLOR_SEAT_STROKE, alpha: 1 });
}
