import { Container, Graphics } from 'pixi.js';
import type { CabinLayout } from '@/simulation/domain/Grid';
import {
  COLOR_AISLE_LINE,
  COLOR_COCKPIT,
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
// centre. Tuned for an A320-like seat-map silhouette.
const NOSE_LEN = 56; // short, blunt nose cone (A320-like)
const TAIL_LEN = 86; // moderate, blunt tapered tail cone (not a rocket point)
const TAIL_TIP_RATIO = 0.3; // tail-cone end half-height as a fraction of body half-height
const BODY_PAD_Y = 6; // fuselage half-height beyond the outermost seats (tight)
const BODY_PAD_FRONT = 34; // cabin space ahead of row 0 (cockpit door / fwd galley)
const BODY_PAD_REAR = 28; // cabin space behind the last row (aft galley / lav)

const WING_SPAN = 74; // wing reach beyond the fuselage edge
const WING_ROOT_ROW = 14; // wing root anchored mid-fuselage
const WING_ROOT_CHORD = 120;
const WING_SWEEP = 68;
const WING_TIP_CHORD = 32;
const STAB_SPAN = 34; // horizontal stabilizer reach
const STAB_AT = 0.18; // position along the tail cone (0 = base, 1 = tip)
const STAB_CHORD = 46;
const STAB_SWEEP = 26;

const JET_GATE_RISE = 64; // jet-bridge gate offset from the fuselage side
const GATE_W = 38;
const GATE_H = 24;

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
 * Pure and shared by the renderer (canvas sizing + rotation), the draw routines,
 * and the agent renderer (jet-bridge entry path).
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

  const entry: JetBridgePath = {
    gateX: gridLeftX - 4,
    gateY: bodyBottom + JET_GATE_RISE,
    doorX: geo.rowToX(0),
    doorY: bodyBottom,
    aisleX: geo.rowToX(0),
    aisleY: cY,
  };

  const wingTop = bodyTop - WING_SPAN;
  const wingBottom = bodyBottom + WING_SPAN;
  const gateOuter = entry.gateY + GATE_H / 2;

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
 * wings/tailplane → bezier hull → fixtures, aisle, seats, cockpit, doors.
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

  const lifting = new Graphics();
  drawWings(lifting, geo, anatomy);
  drawStabilizers(lifting, anatomy);
  layer.addChild(lifting);

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
  drawCockpit(detail, anatomy);
  drawDoorsAndExits(detail, geo, anatomy);
  layer.addChild(detail);

  return layer;
}

/** Half-height of the tapering tail cone at a given x (smoothstep taper). */
function tailHalfAt(a: CabinAnatomy, x: number): number {
  if (x <= a.bodyRightX) return a.bodyHalf;
  const t = Math.min(1, (x - a.bodyRightX) / (a.tailTipX - a.bodyRightX));
  const e = t * t * (3 - 2 * t);
  return a.bodyHalf + (a.tailTipHalf - a.bodyHalf) * e;
}

/**
 * Aerodynamic fuselage: a smooth blunt nose (half-ellipse, vertical tangent at
 * the tip), a parallel-sided cabin, and a tapered tail cone. Shoulder-adjacent
 * control points share the shoulder Y for tangent-smooth, corner-free joins.
 */
function drawHull(g: Graphics, a: CabinAnatomy): void {
  const tailLen = a.tailTipX - a.bodyRightX;

  g.moveTo(a.bodyLeftX, a.bodyTop);
  g.lineTo(a.bodyRightX, a.bodyTop);
  // tail upper taper → tail-cone tip
  g.bezierCurveTo(
    a.bodyRightX + tailLen * 0.5,
    a.bodyTop,
    a.tailTipX - tailLen * 0.1,
    a.cY - a.tailTipHalf,
    a.tailTipX,
    a.cY - a.tailTipHalf,
  );
  g.quadraticCurveTo(a.tailTipX + 7, a.cY, a.tailTipX, a.cY + a.tailTipHalf);
  g.bezierCurveTo(
    a.tailTipX - tailLen * 0.1,
    a.cY + a.tailTipHalf,
    a.bodyRightX + tailLen * 0.5,
    a.bodyBottom,
    a.bodyRightX,
    a.bodyBottom,
  );
  g.lineTo(a.bodyLeftX, a.bodyBottom);
  // blunt nose: smooth half-ellipse (vertical tangent at the tip)
  g.quadraticCurveTo(a.noseTipX, a.bodyBottom, a.noseTipX, a.cY);
  g.quadraticCurveTo(a.noseTipX, a.bodyTop, a.bodyLeftX, a.bodyTop);
  g.closePath();

  g.fill({ color: COLOR_HULL_FILL, alpha: 0.92 });
  g.stroke({ width: 2, color: COLOR_HULL_STROKE, alpha: 0.95, alignment: 0.5 });
}

/** A swept, tapered lifting surface (wide root → narrow swept-back tip). */
function sweptSurface(
  g: Graphics,
  rootLE: number,
  rootChord: number,
  sweep: number,
  tipChord: number,
  rootY: number,
  tipY: number,
  strokeWidth: number,
): void {
  const rootTE = rootLE + rootChord;
  const tipLE = rootLE + sweep;
  const tipTE = tipLE + tipChord;
  g.poly([rootLE, rootY, rootTE, rootY, tipTE, tipY, tipLE, tipY]);
  g.fill({ color: COLOR_WING_FILL, alpha: 0.6 });
  g.stroke({ width: strokeWidth, color: COLOR_WING_STROKE, alpha: 0.9 });
}

/** Swept main wings, mirrored above and below the mid-fuselage. */
function drawWings(g: Graphics, geo: CanvasGeometry, a: CabinAnatomy): void {
  const rootLE = geo.rowToX(WING_ROOT_ROW);
  sweptSurface(g, rootLE, WING_ROOT_CHORD, WING_SWEEP, WING_TIP_CHORD, a.bodyTop + 6, a.bodyTop - WING_SPAN, 1.4);
  sweptSurface(g, rootLE, WING_ROOT_CHORD, WING_SWEEP, WING_TIP_CHORD, a.bodyBottom - 6, a.bodyBottom + WING_SPAN, 1.4);
}

/** Small swept horizontal stabilizers attached to the tapering tail cone. */
function drawStabilizers(g: Graphics, a: CabinAnatomy): void {
  const rootLE = a.bodyRightX + (a.tailTipX - a.bodyRightX) * STAB_AT;
  const half = tailHalfAt(a, rootLE);
  sweptSurface(g, rootLE, STAB_CHORD, STAB_SWEEP, STAB_CHORD * 0.5, a.cY - half + 2, a.cY - half - STAB_SPAN, 1.1);
  sweptSurface(g, rootLE, STAB_CHORD, STAB_SWEEP, STAB_CHORD * 0.5, a.cY + half - 2, a.cY + half + STAB_SPAN, 1.1);
}

/**
 * Jet bridge: a gate rotunda with a thick angled gangway connecting flush to the
 * Row 0 door. After the +90° rotation this reads as a gangway entering from the
 * top-left into the forward-left door.
 */
function drawJetBridge(g: Graphics, a: CabinAnatomy): void {
  const e = a.entry;
  const w = 15;
  const dx = e.doorX - e.gateX;
  const dy = e.doorY - 5 - e.gateY; // tuck the end just inside the hull → flush
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * (w / 2);
  const ny = (dx / len) * (w / 2);
  g.poly([e.gateX + nx, e.gateY + ny, e.doorX + nx, e.doorY - 5 + ny, e.doorX - nx, e.doorY - 5 - ny, e.gateX - nx, e.gateY - ny]);
  g.fill({ color: COLOR_JETBRIDGE_FILL, alpha: 0.95 });
  g.stroke({ width: 1.4, color: COLOR_JETBRIDGE_STROKE, alpha: 0.95 });

  g.roundRect(e.gateX - GATE_W / 2, e.gateY - GATE_H / 2, GATE_W, GATE_H, 6);
  g.fill({ color: COLOR_JETBRIDGE_FILL, alpha: 0.95 });
  g.stroke({ width: 1.4, color: COLOR_JETBRIDGE_STROKE, alpha: 0.95 });
}

/** Galley / lavatory fixture blocks at the cabin ends (fore and aft). */
function drawFixtures(g: Graphics, a: CabinAnatomy): void {
  const half = a.bodyHalf - 10;
  g.roundRect(a.bodyLeftX + 8, a.cY - half, a.gridLeftX - a.bodyLeftX - 14, half * 2, 5);
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

/** Cockpit windscreen: a few short chevron strokes near the nose. */
function drawCockpit(g: Graphics, a: CabinAnatomy): void {
  const x0 = a.bodyLeftX - 4;
  for (let i = 0; i < 3; i++) {
    const off = 9 + i * 7;
    g.moveTo(x0 - i * 10, a.cY - off);
    g.quadraticCurveTo(x0 - i * 10 - 13, a.cY, x0 - i * 10, a.cY + off);
  }
  g.stroke({ width: 1.1, color: COLOR_COCKPIT, alpha: 0.5 });
}

/** Forward boarding door plus green over-wing exit marks. */
function drawDoorsAndExits(g: Graphics, geo: CanvasGeometry, a: CabinAnatomy): void {
  g.rect(geo.rowToX(0) - 9, a.bodyBottom - 2, 18, 5);
  g.fill({ color: COLOR_DOOR, alpha: 0.92 });

  const exitRows = [WING_ROOT_ROW, WING_ROOT_ROW + 4];
  for (const row of exitRows) {
    const x = geo.rowToX(row) - 7;
    g.rect(x, a.bodyTop - 1, 14, 4);
    g.rect(x, a.bodyBottom - 3, 14, 4);
  }
  g.fill({ color: COLOR_EXIT, alpha: 0.85 });
}
