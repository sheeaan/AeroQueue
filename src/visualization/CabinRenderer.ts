import { Container, Graphics } from 'pixi.js';
import type { CabinLayout } from '@/simulation/domain/Grid';
import type { SeatColumnType } from '@/simulation/domain/geometry';
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
  COLOR_SEAT_OUTLINE,
  COLOR_WING_FILL,
  COLOR_WING_SHEEN,
  COLOR_WING_STROKE,
  SEAT_TYPE_COLORS,
} from './colors';
import type { CanvasGeometry } from './geometry';

// ── Anatomy proportions (px) ──────────────────────────────────────────────────
// Horizontal layout: NOSE points LEFT (small X), TAIL points RIGHT (large X),
// the aisle runs along the centre in X. Tuned to a realistic A320 top-down
// planform (cf. AeroLOPA / SeatGuru): blunt rounded nose, a uniform fuselage
// cylinder, swept-back wings at mid-fuselage, and a gentle tail taper.
const NOSE_LEN = 70; // blunt, rounded nose (NOT an elongated cone)
const NOSE_TIP_ROUND = 0.62; // tip bluntness (×bodyHalf); larger = blunter
const TAIL_LEN = 122; // gentle tail taper
const TAIL_TIP_RATIO = 0.26; // tail-cone end half-height as a fraction of body half-height
const BODY_PAD_Y = 8; // fuselage half-height beyond the outermost seats
const BODY_PAD_FRONT = 44; // forward galley / boarding-door vestibule
const BODY_PAD_REAR = 34; // aft galley / lav

// Swept-back main wings. The plane points left, so the wings sweep toward the
// RIGHT (tips further aft than roots). Drawn beneath the hull so the roots blend
// into the airframe.
const WING_ROOT_ROW = 12; // wing root begins mid-fuselage
const WING_ROOT_CHORD = 104; // root chord along the fuselage
const WING_TIP_CHORD = 24; // narrow tip chord (strong taper)
const WING_SWEEP = 88; // how far the tip is swept aft (right)
const WING_SPAN = 80; // long, blade-like wing reach beyond the fuselage

// Emergency-exit rows: fore door, the over-wing pair, and the aft door.
const OVERWING_EXIT_ROWS = [11, 13];

const JET_GATE_RISE = 58; // jet-bridge gate distance above the forward door

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

  const bbox = {
    minX: Math.min(noseTipX, entry.gateX - 20),
    maxX: tailTipX,
    minY: Math.min(bodyTop - WING_SPAN, entry.gateY - 16),
    maxY: bodyBottom + WING_SPAN,
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
 * Builds the static background, drawn once (zero per-frame cost): wings → jet
 * bridge → fuselage hull → galley fixtures → aisle → seats → doors / exits.
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
 * Realistic A320 fuselage: a blunt, rounded nose (left), a straight uniform
 * cabin cylinder, and a gentle tail taper (right). A subtle cockpit windscreen
 * is hinted at the nose.
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

  g.fill({ color: COLOR_HULL_FILL, alpha: 0.97 });
  g.stroke({ width: 2.2, color: COLOR_HULL_STROKE, alpha: 0.95, alignment: 0.5 });

  drawCockpit(g, a);
}

/** Subtle cockpit windscreen: a shallow "<" of glass lines near the nose. */
function drawCockpit(g: Graphics, a: CabinAnatomy): void {
  const wsX = a.noseTipX + NOSE_LEN * 0.52;
  const h = a.bodyHalf * 0.46;
  g.moveTo(wsX + 11, a.cY - h).lineTo(wsX - 5, a.cY).lineTo(wsX + 11, a.cY + h);
  g.stroke({ width: 1.4, color: COLOR_COCKPIT, alpha: 0.5 });

  g.moveTo(wsX + 17, a.cY - h * 0.9).lineTo(wsX + 3, a.cY).lineTo(wsX + 17, a.cY + h * 0.9);
  g.stroke({ width: 1, color: COLOR_COCKPIT, alpha: 0.3 });
}

/**
 * Swept-back main wings, mirrored above and below the fuselage. The tips sweep
 * toward the RIGHT (aft). Each wing carries an engine nacelle near the root.
 */
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
  g.quadraticCurveTo(leTip + WING_TIP_CHORD * 0.5, tipY + dir * 3, teTip, tipY); // rounded tip
  g.lineTo(teRoot, rootIn); // trailing edge
  g.closePath();
  g.fill({ color: COLOR_WING_FILL, alpha: 0.55 });
  g.stroke({ width: 1.1, color: COLOR_WING_STROKE, alpha: 0.5 });

  // Spar sheen along the leading edge.
  g.moveTo(xLE + 10, rootIn).lineTo(leTip + 8, tipY);
  g.stroke({ width: 2, color: COLOR_WING_SHEEN, alpha: 0.4 });

  // Engine nacelle: a pod on the leading edge a third of the way out.
  const nx = xLE + WING_SWEEP * 0.34;
  const ny = edgeY + dir * (WING_SPAN * 0.4);
  g.roundRect(nx - 13, ny - 5, 26, 10, 5);
  g.fill({ color: COLOR_HULL_FILL, alpha: 0.95 });
  g.stroke({ width: 1.1, color: COLOR_WING_STROKE, alpha: 0.7 });
}

/**
 * Jet bridge: a gate rotunda above the forward port door with a solid gangway
 * descending to it. Queued passengers walk down this gangway to board.
 */
function drawJetBridge(g: Graphics, a: CabinAnatomy): void {
  const e = a.entry;
  const w = 13;
  // Vertical gangway from the gate down into the top of the fuselage.
  g.roundRect(e.doorX - w / 2, e.gateY, w, e.doorY - e.gateY + 6, 3);
  g.fill({ color: COLOR_JETBRIDGE_FILL, alpha: 0.96 });
  g.stroke({ width: 1.3, color: COLOR_JETBRIDGE_STROKE, alpha: 0.9 });

  // Gate rotunda.
  g.roundRect(e.gateX - 18, e.gateY - 11, 36, 20, 6);
  g.fill({ color: COLOR_JETBRIDGE_FILL, alpha: 0.96 });
  g.stroke({ width: 1.3, color: COLOR_JETBRIDGE_STROKE, alpha: 0.9 });
}

/** Galley / lavatory fixture blocks at the cabin ends (fore and aft). */
function drawFixtures(g: Graphics, a: CabinAnatomy): void {
  const half = a.bodyHalf - 9;
  const foreX = a.bodyLeftX + 6;
  const foreW = a.gridLeftX - a.bodyLeftX - 12;
  const aftX = a.gridRightX + 6;
  const aftW = a.bodyRightX - a.gridRightX - 12;
  g.roundRect(foreX, a.cY - half, foreW, half * 2, 5);
  g.roundRect(aftX, a.cY - half, aftW, half * 2, 5);
  g.fill({ color: COLOR_FIXTURE, alpha: 0.5 });
  g.stroke({ width: 1, color: COLOR_HULL_STROKE, alpha: 0.4 });
}

/** Thin centre-aisle reference line. */
function drawAisle(g: Graphics, geo: CanvasGeometry, a: CabinAnatomy): void {
  g.moveTo(a.gridLeftX, geo.colToY(geo.aisleColIndex));
  g.lineTo(a.gridRightX, geo.colToY(geo.aisleColIndex));
  g.stroke({ width: 2, color: COLOR_AISLE_LINE, alpha: 0.5 });
}

const SEAT_TYPE_ORDER: SeatColumnType[] = ['window', 'middle', 'aisle'];

/**
 * Seats as crisp rounded rectangles, coloured by lateral type (steel blue →
 * muted blue → dark slate, window → aisle) with a few px of padding between
 * each, exactly like a professional seat map.
 */
function drawSeats(g: Graphics, cabin: CabinLayout, geo: CanvasGeometry): void {
  const gap = 4; // ~2px of padding on each side between neighbouring seats
  const size = geo.cell - gap;
  const r = 4;

  // One batched fill per seat type.
  for (const type of SEAT_TYPE_ORDER) {
    for (const seat of cabin.seats) {
      if (seat.type !== type) continue;
      const x = geo.rowToX(seat.coord.row) - size / 2;
      const y = geo.colToY(seat.coord.col) - size / 2;
      g.roundRect(x, y, size, size, r);
    }
    g.fill({ color: SEAT_TYPE_COLORS[type], alpha: 1 });
  }

  // Crisp shared outline.
  for (const seat of cabin.seats) {
    const x = geo.rowToX(seat.coord.row) - size / 2;
    const y = geo.colToY(seat.coord.col) - size / 2;
    g.roundRect(x, y, size, size, r);
  }
  g.stroke({ width: 1, color: COLOR_SEAT_OUTLINE, alpha: 0.5 });
}

/**
 * Forward boarding door (top edge, where the jet bridge connects) plus bright
 * green fore / over-wing / aft exit marks with outward chevrons.
 */
function drawDoorsAndExits(g: Graphics, geo: CanvasGeometry, a: CabinAnatomy): void {
  // Forward boarding door on the top edge.
  g.rect(a.entry.doorX - 9, a.bodyTop - 3, 18, 5);
  g.fill({ color: COLOR_DOOR, alpha: 0.95 });

  const exitRows = [0, ...OVERWING_EXIT_ROWS, geo.rows - 1];
  for (const row of exitRows) {
    const x = geo.rowToX(row);
    drawExit(g, x, a.bodyTop, -1);
    drawExit(g, x, a.bodyBottom, 1);
  }
}

/**
 * One green exit marker straddling the hull edge at `(x, edgeY)`, with a small
 * chevron pointing outward (`dir` = -1 above the hull, +1 below).
 */
function drawExit(g: Graphics, x: number, edgeY: number, dir: number): void {
  g.roundRect(x - 8, edgeY - 2, 16, 4, 1.5);
  g.fill({ color: COLOR_EXIT, alpha: 0.9 });

  const base = edgeY + dir * 4;
  const tip = edgeY + dir * 9;
  g.moveTo(x - 6, base).lineTo(x, tip).lineTo(x + 6, base);
  g.stroke({ width: 1.6, color: COLOR_EXIT, alpha: 0.95 });
}
