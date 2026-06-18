import { Container, Graphics } from 'pixi.js';
import type { CabinLayout } from '@/simulation/domain/Grid';
import {
  COLOR_AISLE_TRACK,
  COLOR_CELL_STROKE,
  COLOR_LATTICE_FRAME,
} from './colors';
import type { CanvasGeometry } from './geometry';

// ── Lattice metrics (px) ──────────────────────────────────────────────────────
// The cabin is a bare cellular-automata matrix: rows run along X (front → rear),
// the seat columns + aisle stack along Y. There is deliberately no aircraft
// anatomy — only the matrix, a subtle aisle track, and a registration frame.
const SEAT_GAP = 6; // padding so each seat cell reads as a discrete site
const SEAT_ROUND = 2; // barely-rounded corners on the wireframe squares
const FRAME_PAD = 14; // gap between the outermost cells and the registration frame
const BBOX_PAD = 18; // bbox margin (> FRAME_PAD) so the frame stroke never clips
const ENTRY_RUNWAY = 150; // staging length to the left where queued agents marshal

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
  // row, then stream right into the matrix. `entryX` is the door cell centre.
  const entry: EntryPath = { entryX: geo.rowToX(-1), aisleY };

  const bbox = {
    minX: entry.entryX - ENTRY_RUNWAY,
    maxX: gridRightX + BBOX_PAD,
    minY: gridTopY - BBOX_PAD,
    maxY: gridBottomY + BBOX_PAD,
  };

  return { gridLeftX, gridRightX, gridTopY, gridBottomY, aisleY, entry, bbox };
}

/**
 * Builds the static lattice background, drawn once (zero per-frame cost): the
 * subtle aisle track → seat-cell wireframe squares → the registration frame.
 */
export function createCabinLayer(
  cabin: CabinLayout,
  geo: CanvasGeometry,
  anatomy: CabinAnatomy,
): Container {
  const layer = new Container();

  const aisle = new Graphics();
  drawAisleTrack(aisle, geo, anatomy);
  layer.addChild(aisle);

  const cells = new Graphics();
  drawSeatCells(cells, cabin, geo);
  layer.addChild(cells);

  const frame = new Graphics();
  drawLatticeFrame(frame, anatomy);
  layer.addChild(frame);

  return layer;
}

/** Subtle central-aisle track: a thin recessed band the agents traverse. */
function drawAisleTrack(g: Graphics, geo: CanvasGeometry, a: CabinAnatomy): void {
  const half = geo.cell * 0.34;
  g.roundRect(a.entry.entryX, a.aisleY - half, a.gridRightX - a.entry.entryX, half * 2, half);
  g.fill({ color: COLOR_AISLE_TRACK, alpha: 0.9 });

  // Hairline centreline emphasising the corridor axis.
  g.moveTo(a.entry.entryX, a.aisleY).lineTo(a.gridRightX, a.aisleY);
  g.stroke({ width: 1, color: COLOR_CELL_STROKE, alpha: 0.6 });
}

/**
 * Every seat as a minimal, unfilled wireframe square in dark technical grey —
 * a bare matrix of sites the high-contrast agents move between.
 */
function drawSeatCells(g: Graphics, cabin: CabinLayout, geo: CanvasGeometry): void {
  const size = geo.cell - SEAT_GAP;
  for (const seat of cabin.seats) {
    const x = geo.rowToX(seat.coord.row) - size / 2;
    const y = geo.colToY(seat.coord.col) - size / 2;
    g.roundRect(x, y, size, size, SEAT_ROUND);
  }
  g.stroke({ width: 1, color: COLOR_CELL_STROKE, alpha: 0.85 });
}

/** Thin registration frame bounding the lattice — a NASA-dashboard reference box. */
function drawLatticeFrame(g: Graphics, a: CabinAnatomy): void {
  const x = a.gridLeftX - FRAME_PAD;
  const y = a.gridTopY - FRAME_PAD;
  const w = a.gridRightX + FRAME_PAD - x;
  const h = a.gridBottomY + FRAME_PAD - y;
  g.rect(x, y, w, h);
  g.stroke({ width: 1, color: COLOR_LATTICE_FRAME, alpha: 0.9 });
}
