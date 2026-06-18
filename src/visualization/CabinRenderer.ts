import { Container, Graphics } from 'pixi.js';
import type { CabinLayout } from '@/simulation/domain/Grid';
import { COLOR_DIAGRAM_FILL, COLOR_DIAGRAM_LINE } from './colors';
import type { CanvasGeometry } from './geometry';

// ── Diagram proportions (px) ──────────────────────────────────────────────────
// Horizontal top-down schematic: NOSE points LEFT (small X), TAIL points RIGHT
// (large X); the aisle runs along the centre in X. The silhouette is a highly
// simplified A320 — a blunt rounded nose, a straight body, and simple swept
// wings — drawn as hard black outlines over white, like a textbook figure.
const NOSE_LEN = 70; // blunt, rounded nose (NOT a pointy cone)
const NOSE_TIP_ROUND = 0.62; // tip bluntness (×bodyHalf); larger = blunter
const TAIL_LEN = 120; // gentle tail taper
const TAIL_TIP_RATIO = 0.26; // tail-cone end half-height as a fraction of body half-height
const BODY_PAD_Y = 8; // fuselage half-height beyond the outermost seats
const BODY_PAD_FRONT = 44; // forward galley / boarding-door vestibule
const BODY_PAD_REAR = 34; // aft galley / lav

// Simple swept-back main wings. The plane points left, so the tips sweep toward
// the RIGHT (aft). Drawn beneath the hull so the roots are hidden by its fill.
const WING_ROOT_ROW = 12; // wing root begins mid-fuselage
const WING_ROOT_CHORD = 104; // root chord along the fuselage
const WING_TIP_CHORD = 26; // narrow tip chord (strong taper)
const WING_SWEEP = 86; // how far the tip is swept aft (right)
const WING_SPAN = 78; // wing reach beyond the fuselage

const JET_GATE_RISE = 58; // jet-bridge gate distance above the forward door
const EDGE_PAD = 8; // bbox slack so the thick outer strokes never clip

// Stroke weights (the spec calls for 2–3px hard black lines).
const HULL_STROKE_W = 3;
const WING_STROKE_W = 2;
const JETBRIDGE_STROKE_W = 2;
const SEAT_STROKE_W = 1.5;
const AISLE_STROKE_W = 1.5;

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

  // Forward PORT-side boarding door on the TOP edge, just ahead of Row 0. The
  // jet bridge descends to it; passengers turn 90° into the aisle below.
  const doorX = gridLeftX - 6;
  const entry: JetBridgePath = {
    doorX,
    doorY: bodyTop,
    aisleX: doorX,
    aisleY: cY,
    gateX: doorX,
    gateY: bodyTop - JET_GATE_RISE,
  };

  // Tight box around every drawn extent (nose, tail, wing tips, jet-bridge gate),
  // padded so the thick outer strokes are never clipped by the letterbox.
  const bbox = {
    minX: Math.min(noseTipX, entry.gateX - 20) - EDGE_PAD,
    maxX: tailTipX + EDGE_PAD,
    minY: Math.min(bodyTop - WING_SPAN, entry.gateY - 14) - EDGE_PAD,
    maxY: bodyBottom + WING_SPAN + EDGE_PAD,
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
 * Builds the static schematic, drawn once (zero per-frame cost): wings → jet
 * bridge → fuselage hull → aisle → seats → forward door. All hard black lines
 * over white.
 */
export function createCabinLayer(
  cabin: CabinLayout,
  geo: CanvasGeometry,
  anatomy: CabinAnatomy,
): Container {
  const layer = new Container();

  const wings = new Graphics();
  drawWings(wings, geo, anatomy);
  layer.addChild(wings);

  const jetBridge = new Graphics();
  drawJetBridge(jetBridge, anatomy);
  layer.addChild(jetBridge);

  const hull = new Graphics();
  drawHull(hull, anatomy);
  layer.addChild(hull);

  const aisle = new Graphics();
  drawAisle(aisle, geo, anatomy);
  layer.addChild(aisle);

  const seats = new Graphics();
  drawSeats(seats, cabin, geo);
  layer.addChild(seats);

  const door = new Graphics();
  drawDoor(door, anatomy);
  layer.addChild(door);

  return layer;
}

/**
 * Simplified A320 fuselage: a blunt, rounded nose (left), a straight uniform
 * cabin tube, and a gentle tail taper (right). White fill, hard black outline.
 */
function drawHull(g: Graphics, a: CabinAnatomy): void {
  const tailLen = a.tailTipX - a.bodyRightX;
  const noseTipRound = a.bodyHalf * NOSE_TIP_ROUND;

  g.moveTo(a.bodyLeftX, a.bodyTop);
  g.lineTo(a.bodyRightX, a.bodyTop);
  // Upper tail: gentle taper to the cone.
  g.bezierCurveTo(
    a.bodyRightX + tailLen * 0.5,
    a.bodyTop,
    a.tailTipX - tailLen * 0.14,
    a.cY - a.tailTipHalf,
    a.tailTipX,
    a.cY - a.tailTipHalf,
  );
  g.quadraticCurveTo(a.tailTipX + 7, a.cY, a.tailTipX, a.cY + a.tailTipHalf);
  // Lower tail, mirroring the upper taper.
  g.bezierCurveTo(
    a.tailTipX - tailLen * 0.14,
    a.cY + a.tailTipHalf,
    a.bodyRightX + tailLen * 0.5,
    a.bodyBottom,
    a.bodyRightX,
    a.bodyBottom,
  );
  g.lineTo(a.bodyLeftX, a.bodyBottom);
  // Lower nose: a blunt, rounded sweep to the tip.
  g.bezierCurveTo(
    a.bodyLeftX - NOSE_LEN * 0.52,
    a.bodyBottom,
    a.noseTipX,
    a.cY + noseTipRound,
    a.noseTipX,
    a.cY,
  );
  // Upper nose, mirroring the lower curve.
  g.bezierCurveTo(
    a.noseTipX,
    a.cY - noseTipRound,
    a.bodyLeftX - NOSE_LEN * 0.52,
    a.bodyTop,
    a.bodyLeftX,
    a.bodyTop,
  );
  g.closePath();

  g.fill({ color: COLOR_DIAGRAM_FILL, alpha: 1 });
  g.stroke({ width: HULL_STROKE_W, color: COLOR_DIAGRAM_LINE, alpha: 1, alignment: 0.5 });
}

/** Simple swept-back main wings, mirrored above and below the fuselage. */
function drawWings(g: Graphics, geo: CanvasGeometry, a: CabinAnatomy): void {
  const xLE = geo.rowToX(WING_ROOT_ROW);
  drawWingPanel(g, xLE, a.bodyTop, -1);
  drawWingPanel(g, xLE, a.bodyBottom, 1);
}

/** One swept wing on the `dir` (-1 above, +1 below) side of the fuselage. */
function drawWingPanel(g: Graphics, xLE: number, edgeY: number, dir: number): void {
  const rootIn = edgeY + dir * -8; // root chord buried under the hull join
  const tipY = edgeY + dir * WING_SPAN;
  const leTip = xLE + WING_SWEEP;
  const teTip = leTip + WING_TIP_CHORD;
  const teRoot = xLE + WING_ROOT_CHORD;

  g.moveTo(xLE, rootIn);
  g.lineTo(leTip, tipY); // leading edge, swept aft
  g.lineTo(teTip, tipY); // straight tip chord (sharp, schematic)
  g.lineTo(teRoot, rootIn); // trailing edge
  g.closePath();
  g.fill({ color: COLOR_DIAGRAM_FILL, alpha: 1 });
  g.stroke({ width: WING_STROKE_W, color: COLOR_DIAGRAM_LINE, alpha: 1, alignment: 0.5 });
}

/**
 * Jet bridge: a simple rectangular gangway from a gate box down to the forward
 * port door. Queued passengers walk down this gangway to board.
 */
function drawJetBridge(g: Graphics, a: CabinAnatomy): void {
  const e = a.entry;
  const w = 14;
  // Vertical gangway from the gate down into the top of the fuselage.
  g.rect(e.doorX - w / 2, e.gateY, w, e.doorY - e.gateY + 6);
  g.fill({ color: COLOR_DIAGRAM_FILL, alpha: 1 });
  g.stroke({ width: JETBRIDGE_STROKE_W, color: COLOR_DIAGRAM_LINE, alpha: 1, alignment: 0.5 });

  // Gate box where passengers spawn.
  g.rect(e.gateX - 19, e.gateY - 12, 38, 22);
  g.fill({ color: COLOR_DIAGRAM_FILL, alpha: 1 });
  g.stroke({ width: JETBRIDGE_STROKE_W, color: COLOR_DIAGRAM_LINE, alpha: 1, alignment: 0.5 });
}

/** Thin black centre-aisle reference line. */
function drawAisle(g: Graphics, geo: CanvasGeometry, a: CabinAnatomy): void {
  g.moveTo(a.gridLeftX, geo.colToY(geo.aisleColIndex));
  g.lineTo(a.gridRightX, geo.colToY(geo.aisleColIndex));
  g.stroke({ width: AISLE_STROKE_W, color: COLOR_DIAGRAM_LINE, alpha: 1 });
}

/**
 * Seats as strict, sharp-cornered black rectangles (no rounding), hollow, with
 * a few px of padding between each so the grid stays legible.
 */
function drawSeats(g: Graphics, cabin: CabinLayout, geo: CanvasGeometry): void {
  const gap = 6; // ~3px of padding on each side between neighbouring seats
  const size = geo.cell - gap;

  for (const seat of cabin.seats) {
    const x = geo.rowToX(seat.coord.row) - size / 2;
    const y = geo.colToY(seat.coord.col) - size / 2;
    g.rect(x, y, size, size); // sharp rectangle — deliberately not roundRect
  }
  g.stroke({ width: SEAT_STROKE_W, color: COLOR_DIAGRAM_LINE, alpha: 1 });
}

/** A simple solid-black forward boarding-door mark where the jet bridge meets the hull. */
function drawDoor(g: Graphics, a: CabinAnatomy): void {
  g.rect(a.entry.doorX - 9, a.bodyTop - 2, 18, 4);
  g.fill({ color: COLOR_DIAGRAM_LINE, alpha: 1 });
}
