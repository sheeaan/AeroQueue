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

// ── Anatomy proportions (px, in logical coordinates: front = -X, tail = +X) ───
// The SimulationRenderer rotates the world +90° so this lays out vertically with
// the nose at the top, matching a real airline seat map.
const NOSE_LEN = 132; // elongated parabolic nose cone
const TAIL_LEN = 154; // long tapered tail cone
const TAIL_TIP_RATIO = 0.16; // tail-cone half-height as a fraction of body half-height
const BODY_PAD_Y = 16; // fuselage half-height beyond the outermost seats
const BODY_PAD_FRONT = 80; // cabin space ahead of row 0 (cockpit / fwd galley / door)
const BODY_PAD_REAR = 66; // cabin space behind the last row (aft galley / lav)

const WING_SPAN = 112; // wing reach beyond the fuselage edge
const WING_ROOT_ROW = 13; // wing root anchored mid-fuselage
const WING_ROOT_CHORD = 200;
const WING_SWEEP = 150; // strong aft sweep
const WING_TIP_CHORD = 46;
const STAB_SPAN = 60; // horizontal stabilizer reach
const STAB_AT = 0.42; // position along the tail cone (0 = base, 1 = tip)
const STAB_CHORD = 72;
const STAB_SWEEP = 46;

const JET_GATE_RISE = 86; // jet-bridge gate offset from the fuselage side
const GATE_W = 46;
const GATE_H = 30;

/**
 * Derived geometry of the aircraft and the content bounding box (logical coords).
 * Pure and shared by the renderer (for canvas sizing + rotation placement) and the
 * draw routines, so the two can never disagree.
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

  const wingTop = bodyTop - WING_SPAN;
  const wingBottom = bodyBottom + WING_SPAN;
  const gateOuter = bodyBottom + JET_GATE_RISE + GATE_H / 2;

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
    bbox,
  };
}

/**
 * Builds the entire static background, drawn once (zero per-frame cost):
 * jet bridge → wings/tailplane → bezier hull → fixtures, aisle, seats, cockpit,
 * doors. Back-to-front so the fuselage sits over the appendage roots and the
 * cabin detailing sits over the hull.
 */
export function createCabinLayer(
  cabin: CabinLayout,
  geo: CanvasGeometry,
  anatomy: CabinAnatomy,
): Container {
  const layer = new Container();

  const jetBridge = new Graphics();
  drawJetBridge(jetBridge, geo, anatomy);
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
 * Aerodynamic fuselage from cubic Béziers: an elongated parabolic nose, a
 * parallel-sided cabin, and a long tapered tail cone. Shoulder-adjacent control
 * points share the shoulder Y for tangent-smooth joins (no corners).
 */
function drawHull(g: Graphics, a: CabinAnatomy): void {
  const noseLen = a.bodyLeftX - a.noseTipX;
  const tailLen = a.tailTipX - a.bodyRightX;

  g.moveTo(a.bodyLeftX, a.bodyTop);
  g.lineTo(a.bodyRightX, a.bodyTop);
  g.bezierCurveTo(
    a.bodyRightX + tailLen * 0.5,
    a.bodyTop,
    a.tailTipX - tailLen * 0.1,
    a.cY - a.tailTipHalf,
    a.tailTipX,
    a.cY - a.tailTipHalf,
  );
  g.quadraticCurveTo(a.tailTipX + 8, a.cY, a.tailTipX, a.cY + a.tailTipHalf);
  g.bezierCurveTo(
    a.tailTipX - tailLen * 0.1,
    a.cY + a.tailTipHalf,
    a.bodyRightX + tailLen * 0.5,
    a.bodyBottom,
    a.bodyRightX,
    a.bodyBottom,
  );
  g.lineTo(a.bodyLeftX, a.bodyBottom);
  g.bezierCurveTo(
    a.bodyLeftX - noseLen * 0.52,
    a.bodyBottom,
    a.noseTipX + noseLen * 0.14,
    a.cY + a.bodyHalf * 0.34,
    a.noseTipX,
    a.cY,
  );
  g.bezierCurveTo(
    a.noseTipX + noseLen * 0.14,
    a.cY - a.bodyHalf * 0.34,
    a.bodyLeftX - noseLen * 0.52,
    a.bodyTop,
    a.bodyLeftX,
    a.bodyTop,
  );
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

/** Large swept main wings, mirrored above and below the mid-fuselage. */
function drawWings(g: Graphics, geo: CanvasGeometry, a: CabinAnatomy): void {
  const rootLE = geo.rowToX(WING_ROOT_ROW);
  sweptSurface(g, rootLE, WING_ROOT_CHORD, WING_SWEEP, WING_TIP_CHORD, a.bodyTop + 8, a.bodyTop - WING_SPAN, 1.4);
  sweptSurface(g, rootLE, WING_ROOT_CHORD, WING_SWEEP, WING_TIP_CHORD, a.bodyBottom - 8, a.bodyBottom + WING_SPAN, 1.4);
}

/** Smaller swept horizontal stabilizers attached to the tapering tail cone. */
function drawStabilizers(g: Graphics, a: CabinAnatomy): void {
  const rootLE = a.bodyRightX + (a.tailTipX - a.bodyRightX) * STAB_AT;
  const half = tailHalfAt(a, rootLE);
  sweptSurface(g, rootLE, STAB_CHORD, STAB_SWEEP, STAB_CHORD * 0.5, a.cY - half + 2, a.cY - half - STAB_SPAN, 1.2);
  sweptSurface(g, rootLE, STAB_CHORD, STAB_SWEEP, STAB_CHORD * 0.5, a.cY + half - 2, a.cY + half + STAB_SPAN, 1.2);
}

/**
 * Jet bridge: a gate terminal off the fuselage side with a thick walkway to the
 * Row 0 door. After the +90° world rotation this reads as a bridge entering from
 * the top-left and connecting to the forward door.
 */
function drawJetBridge(g: Graphics, geo: CanvasGeometry, a: CabinAnatomy): void {
  const doorX = geo.rowToX(0);
  const doorY = a.bodyBottom - 4; // a touch inside the hull → seamless join
  const gateX = a.gridLeftX - 6;
  const gateY = a.bodyBottom + JET_GATE_RISE;

  // walkway
  const w = 18;
  const dx = doorX - gateX;
  const dy = doorY - gateY;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * (w / 2);
  const ny = (dx / len) * (w / 2);
  g.poly([gateX + nx, gateY + ny, doorX + nx, doorY + ny, doorX - nx, doorY - ny, gateX - nx, gateY - ny]);
  g.fill({ color: COLOR_JETBRIDGE_FILL, alpha: 0.95 });
  g.stroke({ width: 1.4, color: COLOR_JETBRIDGE_STROKE, alpha: 0.95 });

  // gate terminal
  g.roundRect(gateX - GATE_W / 2, gateY - GATE_H / 2, GATE_W, GATE_H, 6);
  g.fill({ color: COLOR_JETBRIDGE_FILL, alpha: 0.95 });
  g.stroke({ width: 1.4, color: COLOR_JETBRIDGE_STROKE, alpha: 0.95 });
}

/** Galley / lavatory fixture blocks filling the cabin ends (fore and aft). */
function drawFixtures(g: Graphics, a: CabinAnatomy): void {
  const inset = 10;
  const half = a.bodyHalf - 12;
  // forward galley (between the cockpit and row 0)
  g.roundRect(a.bodyLeftX + 14, a.cY - half, a.gridLeftX - a.bodyLeftX - 22, half * 2, 6);
  // aft galley (behind the last row)
  g.roundRect(a.gridRightX + inset, a.cY - half, a.bodyRightX - a.gridRightX - inset - 14, half * 2, 6);
  g.fill({ color: COLOR_FIXTURE, alpha: 0.55 });
  g.stroke({ width: 1, color: COLOR_HULL_STROKE, alpha: 0.45 });
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
  const x0 = a.bodyLeftX - 6;
  for (let i = 0; i < 3; i++) {
    const off = 10 + i * 9;
    g.moveTo(x0 - i * 14, a.cY - off);
    g.quadraticCurveTo(x0 - i * 14 - 18, a.cY, x0 - i * 14, a.cY + off);
  }
  g.stroke({ width: 1.1, color: COLOR_COCKPIT, alpha: 0.55 });
}

/** Forward door (where the jet bridge connects) plus green over-wing exit marks. */
function drawDoorsAndExits(g: Graphics, geo: CanvasGeometry, a: CabinAnatomy): void {
  // forward boarding door at Row 0 (on the bodyBottom edge → screen-left after rotation)
  g.rect(geo.rowToX(0) - 9, a.bodyBottom - 2, 18, 5);
  g.fill({ color: COLOR_DOOR, alpha: 0.92 });

  // over-wing exits, both sides, near the wing root rows
  const exitRows = [WING_ROOT_ROW, WING_ROOT_ROW + 4];
  for (const row of exitRows) {
    const x = geo.rowToX(row) - 7;
    g.rect(x, a.bodyTop - 1, 14, 4);
    g.rect(x, a.bodyBottom - 3, 14, 4);
  }
  g.fill({ color: COLOR_EXIT, alpha: 0.85 });
}
