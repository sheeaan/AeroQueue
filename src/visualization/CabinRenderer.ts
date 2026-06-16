import { Container, Graphics } from 'pixi.js';
import type { CabinLayout } from '@/simulation/domain/Grid';
import {
  COLOR_AISLE_BAND,
  COLOR_DOOR,
  COLOR_HULL_FILL,
  COLOR_HULL_STROKE,
  COLOR_JETBRIDGE_FILL,
  COLOR_JETBRIDGE_STROKE,
  COLOR_SEAT_OUTLINE,
  COLOR_WING_FILL,
  COLOR_WING_STROKE,
} from './colors';
import type { CanvasGeometry } from './geometry';

// ── Anatomy proportions (px, in grid/world coordinate space) ──────────────────
const NOSE_LEN = 72; // nose cone reach beyond the body
const TAIL_LEN = 96; // tail taper reach beyond the body
const TAIL_TIP_RATIO = 0.26; // tail-cone half-height as a fraction of body half-height
const BODY_PAD_Y = 14; // fuselage half-height beyond the outermost seats
const BODY_PAD_X = 12; // body extends this far past the seat grid before the cones
const WING_SPAN = 84; // wing reach beyond the fuselage edge
const WING_ROOT_ROW = 10; // wing root anchored near this cabin row
const WING_ROOT_CHORD = 150;
const WING_SWEEP = 74; // how far the tip is swept aft of the root
const WING_TIP_CHORD = 46;
const STAB_SPAN = 44; // horizontal stabilizer reach
const STAB_CHORD = 64;
const STAB_SWEEP = 30;
const JET_BRIDGE_LEN = 92; // gate terminal distance ahead of the body
const FRAME_MARGIN = 14; // breathing room around the whole aircraft

/**
 * Derived geometry of the aircraft hull + appendages, plus the canvas frame
 * padding needed to contain everything. Pure and shared by the renderer (for
 * canvas sizing + world offset) and the draw routines (for the shapes), so the
 * two can never disagree.
 */
export interface CabinAnatomy {
  cY: number;
  bodyHalf: number;
  bodyTop: number;
  bodyBottom: number;
  bodyLeftX: number;
  bodyRightX: number;
  noseTipX: number;
  tailBaseX: number;
  tailTipX: number;
  tailTipHalf: number;
  jetGateX: number;
  /** Padding (px) the anatomy extends beyond the bare seat-grid bounds. */
  frame: { left: number; right: number; top: number; bottom: number };
}

export function computeAnatomy(geo: CanvasGeometry): CabinAnatomy {
  const cY = geo.margin + (geo.columns * geo.cell) / 2;
  const bodyHalf = (geo.columns * geo.cell) / 2 + BODY_PAD_Y;
  const bodyTop = cY - bodyHalf;
  const bodyBottom = cY + bodyHalf;

  const gridLeftX = geo.rowToX(0) - geo.cell / 2;
  const gridRightX = geo.rowToX(geo.rows - 1) + geo.cell / 2;
  const bodyLeftX = gridLeftX - BODY_PAD_X;
  const bodyRightX = gridRightX + BODY_PAD_X;

  const noseTipX = bodyLeftX - NOSE_LEN;
  const tailBaseX = bodyRightX;
  const tailTipX = bodyRightX + TAIL_LEN;
  const tailTipHalf = bodyHalf * TAIL_TIP_RATIO;
  const jetGateX = bodyLeftX - JET_BRIDGE_LEN;

  const wingTop = bodyTop - WING_SPAN;
  const wingBottom = bodyBottom + WING_SPAN;
  const leftExtent = Math.min(noseTipX, jetGateX);

  const frame = {
    left: Math.ceil(-leftExtent) + FRAME_MARGIN,
    right: Math.ceil(tailTipX - geo.width) + FRAME_MARGIN,
    top: Math.ceil(-wingTop) + FRAME_MARGIN,
    bottom: Math.ceil(wingBottom - geo.height) + FRAME_MARGIN,
  };

  return {
    cY,
    bodyHalf,
    bodyTop,
    bodyBottom,
    bodyLeftX,
    bodyRightX,
    noseTipX,
    tailBaseX,
    tailTipX,
    tailTipHalf,
    jetGateX,
    frame,
  };
}

/**
 * Builds the entire static background: the blueprint aircraft (jet bridge →
 * wings/tailplane → aerodynamic hull → door) and, inside the hull, the aisle
 * band and seat outlines. Everything is drawn once and never mutates, so it adds
 * zero per-frame cost to the SimulationRenderer ticker.
 *
 * Layers are added back-to-front: appendages first so the fuselage body sits on
 * top of their roots, then cabin detailing on top of the hull.
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

  const door = new Graphics();
  drawDoor(door, geo, anatomy);
  layer.addChild(door);

  const band = new Graphics();
  drawAisleBand(band, geo);
  layer.addChild(band);

  const seats = new Graphics();
  drawSeats(seats, cabin, geo);
  layer.addChild(seats);

  return layer;
}

/** Aerodynamic fuselage: rounded nose cone, constant body, tapered tail cone. */
function drawHull(g: Graphics, a: CabinAnatomy): void {
  const tailMidX = (a.tailBaseX + a.tailTipX) / 2;

  g.moveTo(a.bodyLeftX, a.bodyTop);
  g.lineTo(a.tailBaseX, a.bodyTop);
  // tail upper taper → rounded tail-cone end → lower taper
  g.quadraticCurveTo(tailMidX, a.bodyTop, a.tailTipX, a.cY - a.tailTipHalf);
  g.quadraticCurveTo(a.tailTipX + 9, a.cY, a.tailTipX, a.cY + a.tailTipHalf);
  g.quadraticCurveTo(tailMidX, a.bodyBottom, a.tailBaseX, a.bodyBottom);
  g.lineTo(a.bodyLeftX, a.bodyBottom);
  // nose cone: smooth rounded point at the front
  g.quadraticCurveTo(a.noseTipX, a.bodyBottom, a.noseTipX, a.cY);
  g.quadraticCurveTo(a.noseTipX, a.bodyTop, a.bodyLeftX, a.bodyTop);
  g.closePath();

  g.fill({ color: COLOR_HULL_FILL, alpha: 0.55 });
  g.stroke({ width: 1.6, color: COLOR_HULL_STROKE, alpha: 0.95, alignment: 0.5 });
}

/** Swept main wings, mirrored above and below the fuselage. */
function drawWings(g: Graphics, geo: CanvasGeometry, a: CabinAnatomy): void {
  const rootLE = geo.rowToX(WING_ROOT_ROW);
  const rootTE = rootLE + WING_ROOT_CHORD;
  const tipLE = rootLE + WING_SWEEP;
  const tipTE = tipLE + WING_TIP_CHORD;

  // upper wing (sweeps toward -Y)
  g.poly([rootLE, a.bodyTop + 6, rootTE, a.bodyTop + 6, tipTE, a.bodyTop - WING_SPAN, tipLE, a.bodyTop - WING_SPAN]);
  g.fill({ color: COLOR_WING_FILL, alpha: 0.5 });
  g.stroke({ width: 1.2, color: COLOR_WING_STROKE, alpha: 0.85 });

  // lower wing (sweeps toward +Y)
  g.poly([rootLE, a.bodyBottom - 6, rootTE, a.bodyBottom - 6, tipTE, a.bodyBottom + WING_SPAN, tipLE, a.bodyBottom + WING_SPAN]);
  g.fill({ color: COLOR_WING_FILL, alpha: 0.5 });
  g.stroke({ width: 1.2, color: COLOR_WING_STROKE, alpha: 0.85 });
}

/** Smaller swept horizontal stabilizers near the tail. */
function drawStabilizers(g: Graphics, a: CabinAnatomy): void {
  const rootLE = a.tailBaseX - 8;
  const rootTE = rootLE + STAB_CHORD;
  const tipLE = rootLE + STAB_SWEEP;
  const tipTE = tipLE + STAB_CHORD * 0.55;

  g.poly([rootLE, a.bodyTop + 4, rootTE, a.bodyTop + 4, tipTE, a.bodyTop - STAB_SPAN, tipLE, a.bodyTop - STAB_SPAN]);
  g.fill({ color: COLOR_WING_FILL, alpha: 0.5 });
  g.stroke({ width: 1.1, color: COLOR_WING_STROKE, alpha: 0.85 });

  g.poly([rootLE, a.bodyBottom - 4, rootTE, a.bodyBottom - 4, tipTE, a.bodyBottom + STAB_SPAN, tipLE, a.bodyBottom + STAB_SPAN]);
  g.fill({ color: COLOR_WING_FILL, alpha: 0.5 });
  g.stroke({ width: 1.1, color: COLOR_WING_STROKE, alpha: 0.85 });
}

/** Jet bridge: a gate terminal at the far left and a gangway to the front door. */
function drawJetBridge(g: Graphics, geo: CanvasGeometry, a: CabinAnatomy): void {
  const gateW = 30;
  const gateH = 66;
  const gateCX = a.jetGateX + gateW / 2;
  const gateCY = a.bodyTop - 30;
  const doorX = geo.rowToX(1);
  const doorY = a.bodyTop;

  // gangway (under the hull, which overlaps it at the door)
  thickSegment(g, gateCX + gateW / 2, gateCY, doorX, doorY, 13);

  // gate terminal
  g.roundRect(gateCX - gateW / 2, gateCY - gateH / 2, gateW, gateH, 6);
  g.fill({ color: COLOR_JETBRIDGE_FILL, alpha: 0.85 });
  g.stroke({ width: 1.2, color: COLOR_JETBRIDGE_STROKE, alpha: 0.9 });
}

/** Bright door slit on the hull edge where the jet bridge connects. */
function drawDoor(g: Graphics, geo: CanvasGeometry, a: CabinAnatomy): void {
  const doorX = geo.rowToX(1);
  g.rect(doorX - 7, a.bodyTop - 2, 14, 4);
  g.fill({ color: COLOR_DOOR, alpha: 0.9 });
}

/** A filled quad of the given width centred on the segment (x1,y1)→(x2,y2). */
function thickSegment(g: Graphics, x1: number, y1: number, x2: number, y2: number, width: number): void {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * (width / 2);
  const ny = (dx / len) * (width / 2);
  g.poly([x1 + nx, y1 + ny, x2 + nx, y2 + ny, x2 - nx, y2 - ny, x1 - nx, y1 - ny]);
  g.fill({ color: COLOR_JETBRIDGE_FILL, alpha: 0.8 });
  g.stroke({ width: 1.2, color: COLOR_JETBRIDGE_STROKE, alpha: 0.9 });
}

/** Central aisle band, where agents walk and heat accumulates. */
function drawAisleBand(g: Graphics, geo: CanvasGeometry): void {
  const aisleY = geo.colToY(geo.aisleColIndex);
  g.roundRect(geo.margin * 0.7, aisleY - geo.cell * 0.5, geo.width - geo.margin * 1.4, geo.cell, 6);
  g.fill({ color: COLOR_AISLE_BAND, alpha: 0.9 });
}

/** Seat outlines — every path accumulated, then stroked in a single draw call. */
function drawSeats(g: Graphics, cabin: CabinLayout, geo: CanvasGeometry): void {
  const size = geo.cell * 0.78;
  for (const seat of cabin.seats) {
    const x = geo.rowToX(seat.coord.row) - size / 2;
    const y = geo.colToY(seat.coord.col) - size / 2;
    g.roundRect(x, y, size, size, 4);
  }
  g.stroke({ width: 1, color: COLOR_SEAT_OUTLINE, alpha: 0.9 });
}
