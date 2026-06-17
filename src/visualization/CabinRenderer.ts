import { Container, Graphics } from 'pixi.js';
import type { CabinLayout } from '@/simulation/domain/Grid';
import {
  COLOR_AISLE_LINE,
  COLOR_DOOR,
  COLOR_EXIT,
  COLOR_FIXTURE,
  COLOR_HULL_FILL,
  COLOR_HULL_STROKE,
  COLOR_JETBRIDGE_FILL,
  COLOR_JETBRIDGE_STROKE,
  COLOR_SEAT_FILL,
  COLOR_SEAT_OUTLINE,
  COLOR_WING_FILL,
  COLOR_WING_STROKE,
} from './colors';
import type { CanvasGeometry } from './geometry';

// ── Anatomy proportions (px) ──────────────────────────────────────────────────
// Horizontal layout: nose at -X (left), tail at +X (right), aisle along the
// centre. Tuned to a long, thin A320 seat-map silhouette (BA reference).
const NOSE_LEN = 62; // smooth blunt nose
const TAIL_LEN = 112; // long gradual tapered tail cone (no fins)
const TAIL_TIP_RATIO = 0.18; // tail-cone end half-height as a fraction of body half-height
const BODY_PAD_Y = 6; // fuselage half-height beyond the outermost seats (hugs the seats)
const BODY_PAD_FRONT = 38; // forward galley / door vestibule
const BODY_PAD_REAR = 34; // aft galley / lav

// Subtle overwing shading (not big swept triangles).
const WING_SPAN = 56; // wing reach beyond the fuselage edge
const WING_ROOT_ROW = 9; // wing root begins near this row
const WING_ROOT_CHORD = 186; // broad root spanning the over-wing rows
const WING_SWEEP = 40;
const WING_TIP_CHORD = 100; // wide tip → soft trapezoid, not a triangle

const JET_GATE_RISE = 54; // jet-bridge gate offset from the fuselage side

/** Jet-bridge waypoints (logical coords) shared with the agent entry animation. */
export interface JetBridgePath {
  gateX: number;
  gateY: number;
  doorX: number;
  doorY: number;
  aisleX: number;
  aisleY: number;
}

/**
 * Derived geometry of the aircraft and the content bounding box (logical coords).
 * Pure and shared by the renderer, the draw routines, and the agent renderer.
 */
export interface CabinAnatomy {
  cY: number;
  bodyHalf: number;
  bodyTop: number;
  bodyBottom: number;
  bodyLeftX: number;
  bodyRightX: number;
  gridLeftX: number;
  gridRightX: number;
  noseTipX: number;
  tailTipX: number;
  tailTipHalf: number;
  entry: JetBridgePath;
  bbox: { minX: number; maxX: number; minY: number; maxY: number };
}

export function computeAnatomy(geo: CanvasGeometry): CabinAnatomy {
  const cY = geo.margin + (geo.columns * geo.cell) / 2;
  const bodyHalf = (geo.columns * geo.cell) / 2 + BODY_PAD_Y;
  const bodyTop = cY - bodyHalf;
  const bodyBottom = cY + bodyHalf;

  const gridLeftX = geo.rowToX(0) - geo.cell / 2;
  const gridRightX = geo.rowToX(geo.rows - 1) + geo.cell / 2;
  const bodyLeftX = gridLeftX - BODY_PAD_FRONT;
  const bodyRightX = gridRightX + BODY_PAD_REAR;

  const noseTipX = bodyLeftX - NOSE_LEN;
  const tailTipX = bodyRightX + TAIL_LEN;
  const tailTipHalf = bodyHalf * TAIL_TIP_RATIO;

  // Door sits in the forward vestibule AHEAD of row 0, so boarding passengers
  // reach the aisle through the galley — never crossing the first-row seats.
  const frontX = gridLeftX - 4;
  const entry: JetBridgePath = {
    doorX: frontX,
    doorY: bodyBottom,
    aisleX: frontX,
    aisleY: cY,
    gateX: frontX - 24,
    gateY: bodyBottom + JET_GATE_RISE,
  };

  const wingTop = bodyTop - WING_SPAN;
  const wingBottom = bodyBottom + WING_SPAN;
  const gateOuter = entry.gateY + 12;

  const bbox = {
    minX: noseTipX,
    maxX: tailTipX,
    minY: wingTop,
    maxY: Math.max(wingBottom, gateOuter),
  };

  return {
    cY,
    bodyHalf,
    bodyTop,
    bodyBottom,
    bodyLeftX,
    bodyRightX,
    gridLeftX,
    gridRightX,
    noseTipX,
    tailTipX,
    tailTipHalf,
    entry,
    bbox,
  };
}

/**
 * Builds the static background, drawn once (zero per-frame cost): jet bridge →
 * subtle wings → bezier hull → galley fixtures, aisle, seats, door/exits.
 */
export function createCabinLayer(
  cabin: CabinLayout,
  geo: CanvasGeometry,
  anatomy: CabinAnatomy,
): Container {
  const layer = new Container();

  const jetBridge = new Graphics();
  drawJetBridge(jetBridge, anatomy);
  layer.addChild(jetBridge);

  const wings = new Graphics();
  drawWings(wings, geo, anatomy);
  layer.addChild(wings);

  const hull = new Graphics();
  drawHull(hull, anatomy);
  layer.addChild(hull);

  const fixtures = new Graphics();
  drawFixtures(fixtures, anatomy);
  layer.addChild(fixtures);

  const aisle = new Graphics();
  drawAisle(aisle, geo, anatomy);
  layer.addChild(aisle);

  const seats = new Graphics();
  drawSeats(seats, cabin, geo);
  layer.addChild(seats);

  const detail = new Graphics();
  drawDoorsAndExits(detail, geo, anatomy);
  layer.addChild(detail);

  return layer;
}

/**
 * Aerodynamic fuselage: a smooth blunt nose (half-ellipse, vertical tangent at
 * the tip), a parallel-sided cabin, and a long gradual tail cone — no fins.
 */
function drawHull(g: Graphics, a: CabinAnatomy): void {
  const tailLen = a.tailTipX - a.bodyRightX;

  g.moveTo(a.bodyLeftX, a.bodyTop);
  g.lineTo(a.bodyRightX, a.bodyTop);
  g.bezierCurveTo(
    a.bodyRightX + tailLen * 0.55,
    a.bodyTop,
    a.tailTipX - tailLen * 0.12,
    a.cY - a.tailTipHalf,
    a.tailTipX,
    a.cY - a.tailTipHalf,
  );
  g.quadraticCurveTo(a.tailTipX + 6, a.cY, a.tailTipX, a.cY + a.tailTipHalf);
  g.bezierCurveTo(
    a.tailTipX - tailLen * 0.12,
    a.cY + a.tailTipHalf,
    a.bodyRightX + tailLen * 0.55,
    a.bodyBottom,
    a.bodyRightX,
    a.bodyBottom,
  );
  g.lineTo(a.bodyLeftX, a.bodyBottom);
  g.quadraticCurveTo(a.noseTipX, a.bodyBottom, a.noseTipX, a.cY);
  g.quadraticCurveTo(a.noseTipX, a.bodyTop, a.bodyLeftX, a.bodyTop);
  g.closePath();

  g.fill({ color: COLOR_HULL_FILL, alpha: 0.92 });
  g.stroke({ width: 2, color: COLOR_HULL_STROKE, alpha: 0.95, alignment: 0.5 });
}

/** Subtle over-wing shading: a broad, softly-swept trapezoid each side. */
function drawWings(g: Graphics, geo: CanvasGeometry, a: CabinAnatomy): void {
  const rootLE = geo.rowToX(WING_ROOT_ROW);
  const rootTE = rootLE + WING_ROOT_CHORD;
  const tipLE = rootLE + WING_SWEEP;
  const tipTE = tipLE + WING_TIP_CHORD;
  g.poly([rootLE, a.bodyTop + 4, rootTE, a.bodyTop + 4, tipTE, a.bodyTop - WING_SPAN, tipLE, a.bodyTop - WING_SPAN]);
  g.poly([rootLE, a.bodyBottom - 4, rootTE, a.bodyBottom - 4, tipTE, a.bodyBottom + WING_SPAN, tipLE, a.bodyBottom + WING_SPAN]);
  g.fill({ color: COLOR_WING_FILL, alpha: 0.45 });
  g.stroke({ width: 1, color: COLOR_WING_STROKE, alpha: 0.5 });
}

/**
 * Jet bridge: a gate rotunda with a thick gangway connecting flush to the front
 * boarding door (ahead of Row 0, on the lower fuselage side).
 */
function drawJetBridge(g: Graphics, a: CabinAnatomy): void {
  const e = a.entry;
  const w = 15;
  const dx = e.doorX - e.gateX;
  const dy = e.doorY - 5 - e.gateY;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * (w / 2);
  const ny = (dx / len) * (w / 2);
  g.poly([e.gateX + nx, e.gateY + ny, e.doorX + nx, e.doorY - 5 + ny, e.doorX - nx, e.doorY - 5 - ny, e.gateX - nx, e.gateY - ny]);
  g.fill({ color: COLOR_JETBRIDGE_FILL, alpha: 0.95 });
  g.stroke({ width: 1.4, color: COLOR_JETBRIDGE_STROKE, alpha: 0.95 });

  g.roundRect(e.gateX - 19, e.gateY - 11, 38, 22, 6);
  g.fill({ color: COLOR_JETBRIDGE_FILL, alpha: 0.95 });
  g.stroke({ width: 1.4, color: COLOR_JETBRIDGE_STROKE, alpha: 0.95 });
}

/** Galley / lavatory fixture blocks at the cabin ends (fore and aft). */
function drawFixtures(g: Graphics, a: CabinAnatomy): void {
  const half = a.bodyHalf - 9;
  g.roundRect(a.bodyLeftX + 6, a.cY - half, a.gridLeftX - a.bodyLeftX - 12, half * 2, 5);
  g.roundRect(a.gridRightX + 6, a.cY - half, a.bodyRightX - a.gridRightX - 12, half * 2, 5);
  g.fill({ color: COLOR_FIXTURE, alpha: 0.5 });
  g.stroke({ width: 1, color: COLOR_HULL_STROKE, alpha: 0.4 });
}

/** Thin centre-aisle reference line. */
function drawAisle(g: Graphics, geo: CanvasGeometry, a: CabinAnatomy): void {
  g.moveTo(a.gridLeftX, geo.colToY(geo.aisleColIndex));
  g.lineTo(a.gridRightX, geo.colToY(geo.aisleColIndex));
  g.stroke({ width: 2, color: COLOR_AISLE_LINE, alpha: 0.5 });
}

/** Seats as filled rounded squares with a gap, like a real seat map. */
function drawSeats(g: Graphics, cabin: CabinLayout, geo: CanvasGeometry): void {
  const size = geo.cell * 0.74;
  const radius = 4;
  for (const seat of cabin.seats) {
    const x = geo.rowToX(seat.coord.row) - size / 2;
    const y = geo.colToY(seat.coord.col) - size / 2;
    g.roundRect(x, y, size, size, radius);
  }
  g.fill({ color: COLOR_SEAT_FILL, alpha: 0.65 });
  g.stroke({ width: 1.1, color: COLOR_SEAT_OUTLINE, alpha: 0.95 });
}

/** Forward boarding door plus green over-wing exit marks. */
function drawDoorsAndExits(g: Graphics, geo: CanvasGeometry, a: CabinAnatomy): void {
  g.rect(a.entry.doorX - 9, a.bodyBottom - 2, 18, 5);
  g.fill({ color: COLOR_DOOR, alpha: 0.9 });

  const exitRows = [WING_ROOT_ROW + 1, WING_ROOT_ROW + 5];
  for (const row of exitRows) {
    const x = geo.rowToX(row) - 7;
    g.rect(x, a.bodyTop - 1, 14, 4);
    g.rect(x, a.bodyBottom - 3, 14, 4);
  }
  g.fill({ color: COLOR_EXIT, alpha: 0.8 });
}
