import { Container, Graphics } from 'pixi.js';
import type { CabinLayout } from '@/simulation/domain/Grid';
import {
  COLOR_AISLE_BAND,
  COLOR_DOOR,
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

// ── Anatomy proportions (px, in grid/world coordinate space) ──────────────────
const NOSE_LEN = 118; // elongated parabolic nose-cone reach
const TAIL_LEN = 150; // long graceful tail-cone taper
const TAIL_TIP_RATIO = 0.18; // tail-cone half-height as a fraction of body half-height
const BODY_PAD_Y = 14; // fuselage half-height beyond the outermost seats
const BODY_PAD_X = 10; // body extends this far past the seat grid before the cones

const WING_SPAN = 94; // wing reach beyond the fuselage edge
const WING_ROOT_ROW = 11; // wing root anchored near this cabin row (mid-fuselage)
const WING_ROOT_CHORD = 150; // wide root
const WING_SWEEP = 84; // tip swept this far aft of the root leading edge
const WING_TIP_CHORD = 40; // narrow tip

const STAB_SPAN = 52; // horizontal stabilizer reach
const STAB_CHORD = 76;
const STAB_SWEEP = 40;

const JET_BRIDGE_LEN = 100; // gate terminal distance ahead of the body
const FRAME_MARGIN = 16; // breathing room around the whole aircraft

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
 * wings/tailplane → bezier hull → door) and, inside the hull, the aisle band and
 * rounded seat blocks. Drawn once and never mutated, so it adds zero per-frame
 * cost to the SimulationRenderer ticker.
 *
 * Layers are added back-to-front so the fuselage body sits on top of the
 * appendage roots and the cabin detailing sits on top of the hull.
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

/**
 * Aerodynamic fuselage built from cubic Béziers: an elongated parabolic nose
 * cone, a parallel-sided cabin, and a long tapered tail cone. Control points
 * adjacent to the cabin shoulders share the shoulder's Y so the curves leave the
 * straight body with a horizontal tangent (no visible corner).
 */
function drawHull(g: Graphics, a: CabinAnatomy): void {
  const noseLen = a.bodyLeftX - a.noseTipX;
  const tailLen = a.tailTipX - a.bodyRightX;

  g.moveTo(a.bodyLeftX, a.bodyTop);
  // straight cabin (top)
  g.lineTo(a.bodyRightX, a.bodyTop);
  // upper tail taper → tail-cone tip
  g.bezierCurveTo(
    a.bodyRightX + tailLen * 0.5,
    a.bodyTop,
    a.tailTipX - tailLen * 0.12,
    a.cY - a.tailTipHalf,
    a.tailTipX,
    a.cY - a.tailTipHalf,
  );
  // rounded tail-cone end
  g.quadraticCurveTo(a.tailTipX + 7, a.cY, a.tailTipX, a.cY + a.tailTipHalf);
  // lower tail taper back to the cabin
  g.bezierCurveTo(
    a.tailTipX - tailLen * 0.12,
    a.cY + a.tailTipHalf,
    a.bodyRightX + tailLen * 0.5,
    a.bodyBottom,
    a.bodyRightX,
    a.bodyBottom,
  );
  // straight cabin (bottom)
  g.lineTo(a.bodyLeftX, a.bodyBottom);
  // lower nose cone → tip
  g.bezierCurveTo(
    a.bodyLeftX - noseLen * 0.55,
    a.bodyBottom,
    a.noseTipX + noseLen * 0.16,
    a.cY + a.bodyHalf * 0.32,
    a.noseTipX,
    a.cY,
  );
  // upper nose cone: tip → shoulder
  g.bezierCurveTo(
    a.noseTipX + noseLen * 0.16,
    a.cY - a.bodyHalf * 0.32,
    a.bodyLeftX - noseLen * 0.55,
    a.bodyTop,
    a.bodyLeftX,
    a.bodyTop,
  );
  g.closePath();

  g.fill({ color: COLOR_HULL_FILL, alpha: 0.4 });
  g.stroke({ width: 1.7, color: COLOR_HULL_STROKE, alpha: 0.95, alignment: 0.5 });
}

/** Swept tapered main wings (wide root → narrow swept-back tip), mirrored. */
function drawWings(g: Graphics, geo: CanvasGeometry, a: CabinAnatomy): void {
  const rootLE = geo.rowToX(WING_ROOT_ROW);
  const rootTE = rootLE + WING_ROOT_CHORD;
  const tipLE = rootLE + WING_SWEEP;
  const tipTE = tipLE + WING_TIP_CHORD;

  // upper wing (sweeps toward -Y)
  g.poly([rootLE, a.bodyTop + 7, rootTE, a.bodyTop + 7, tipTE, a.bodyTop - WING_SPAN, tipLE, a.bodyTop - WING_SPAN]);
  g.fill({ color: COLOR_WING_FILL, alpha: 0.5 });
  g.stroke({ width: 1.2, color: COLOR_WING_STROKE, alpha: 0.85 });

  // lower wing (sweeps toward +Y)
  g.poly([rootLE, a.bodyBottom - 7, rootTE, a.bodyBottom - 7, tipTE, a.bodyBottom + WING_SPAN, tipLE, a.bodyBottom + WING_SPAN]);
  g.fill({ color: COLOR_WING_FILL, alpha: 0.5 });
  g.stroke({ width: 1.2, color: COLOR_WING_STROKE, alpha: 0.85 });
}

/** Two smaller swept horizontal stabilizers on the tapered tail section. */
function drawStabilizers(g: Graphics, a: CabinAnatomy): void {
  const rootLE = a.tailBaseX - 6;
  const rootTE = rootLE + STAB_CHORD;
  const tipLE = rootLE + STAB_SWEEP;
  const tipTE = tipLE + STAB_CHORD * 0.55;

  g.poly([rootLE, a.bodyTop + 5, rootTE, a.bodyTop + 5, tipTE, a.bodyTop - STAB_SPAN, tipLE, a.bodyTop - STAB_SPAN]);
  g.fill({ color: COLOR_WING_FILL, alpha: 0.5 });
  g.stroke({ width: 1.1, color: COLOR_WING_STROKE, alpha: 0.85 });

  g.poly([rootLE, a.bodyBottom - 5, rootTE, a.bodyBottom - 5, tipTE, a.bodyBottom + STAB_SPAN, tipLE, a.bodyBottom + STAB_SPAN]);
  g.fill({ color: COLOR_WING_FILL, alpha: 0.5 });
  g.stroke({ width: 1.1, color: COLOR_WING_STROKE, alpha: 0.85 });
}

/**
 * Jet bridge: a solid gate terminal at the top-left and a thick walkway angling
 * down to the Row 0 boarding door. The walkway end overruns the hull edge so the
 * connection reads as seamless (the door slit is painted over the seam later).
 */
function drawJetBridge(g: Graphics, geo: CanvasGeometry, a: CabinAnatomy): void {
  const gateW = 38;
  const gateH = 30;
  const gateCX = a.jetGateX + gateW / 2;
  const gateCY = a.bodyTop - 62;
  const doorX = geo.rowToX(0);
  const doorY = a.bodyTop + 4; // a touch inside the hull → seamless join

  // walkway (solid, distinct)
  const w = 16;
  const dx = doorX - gateCX;
  const dy = doorY - gateCY;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * (w / 2);
  const ny = (dx / len) * (w / 2);
  g.poly([gateCX + nx, gateCY + ny, doorX + nx, doorY + ny, doorX - nx, doorY - ny, gateCX - nx, gateCY - ny]);
  g.fill({ color: COLOR_JETBRIDGE_FILL, alpha: 0.95 });
  g.stroke({ width: 1.3, color: COLOR_JETBRIDGE_STROKE, alpha: 0.95 });

  // gate terminal
  g.roundRect(gateCX - gateW / 2, gateCY - gateH / 2, gateW, gateH, 6);
  g.fill({ color: COLOR_JETBRIDGE_FILL, alpha: 0.95 });
  g.stroke({ width: 1.3, color: COLOR_JETBRIDGE_STROKE, alpha: 0.95 });
}

/** Bright door opening on the hull edge at Row 0 where the jet bridge meets. */
function drawDoor(g: Graphics, geo: CanvasGeometry, a: CabinAnatomy): void {
  const doorX = geo.rowToX(0);
  g.rect(doorX - 8, a.bodyTop - 2, 16, 5);
  g.fill({ color: COLOR_DOOR, alpha: 0.92 });
}

/** Central aisle band, where agents walk and heat accumulates. */
function drawAisleBand(g: Graphics, geo: CanvasGeometry): void {
  const aisleY = geo.colToY(geo.aisleColIndex);
  g.roundRect(geo.margin * 0.7, aisleY - geo.cell * 0.5, geo.width - geo.margin * 1.4, geo.cell, 6);
  g.fill({ color: COLOR_AISLE_BAND, alpha: 0.9 });
}

/**
 * Seats as filled rounded rectangles (radius ~4px) with a gap between them, so
 * they read like a real airline seat map. Filled subtly so the coloured agent
 * sprites still pop on top.
 */
function drawSeats(g: Graphics, cabin: CabinLayout, geo: CanvasGeometry): void {
  const size = geo.cell * 0.72; // leaves ~7px of padding between seats
  const radius = 4;
  for (const seat of cabin.seats) {
    const x = geo.rowToX(seat.coord.row) - size / 2;
    const y = geo.colToY(seat.coord.col) - size / 2;
    g.roundRect(x, y, size, size, radius);
  }
  g.fill({ color: COLOR_SEAT_FILL, alpha: 0.55 });
  g.stroke({ width: 1, color: COLOR_SEAT_OUTLINE, alpha: 0.9 });
}
