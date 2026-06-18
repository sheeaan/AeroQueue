import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { Renderer } from 'pixi.js';
import type { SnapshotAgent } from '@/simulation/engine/SimulationEngine';
import { PassengerState } from '@/simulation/domain/state';
import type { CabinAnatomy } from './CabinRenderer';
import { COLOR_AGENT_OUTLINE, COLOR_BLOCKED, SEAT_COLORS } from './colors';
import { AGENT_RADIUS, type CanvasGeometry } from './geometry';

/** Exponential-smoothing rate for position interpolation (larger = snappier). */
const SMOOTH = 14;
/** Seconds for the gate → door → aisle boarding walk. */
const ENTER_DURATION = 0.8;
/** Spacing between passengers waiting single-file in the jet-bridge queue. */
const QUEUE_SPACING = 13;
/** Static ring radius for the Stowing / Blocked markers. */
const MARKER_RADIUS = AGENT_RADIUS + 2;
/** Static ring stroke width for the Stowing / Blocked markers. */
const MARKER_STROKE_W = 2.5;

type Phase = 'queued' | 'entering' | 'cabin';

interface AgentVisual {
  container: Container;
  body: Sprite;
  arc: Graphics;
  x: number;
  y: number;
  /** Engine cell target (cabin phase). */
  engineX: number;
  engineY: number;
  /** Queue-slot target (queued phase). */
  queueX: number;
  queueY: number;
  baseColor: number;
  state: PassengerState;
  /** Last state for which the static marker/tint was drawn (avoids per-frame redraw). */
  markedState: PassengerState | null;
  phase: Phase;
  /** 0→1 progress along the jet-bridge entry path. */
  enterT: number;
}

/**
 * Owns the agent discs and animates only their *position* every Pixi tick.
 *
 * Boarding is visualised through the top-left jet bridge: `Queued` passengers
 * spawn at the gate and form a single-file line up the gangway above the forward
 * port door (ordered by boarding sequence). When the engine admits one, it walks
 * vertically DOWN the gangway, through the door, and turns 90° into the central
 * aisle, then hands off to engine-driven motion that carries it horizontally
 * RIGHT to its seat.
 *
 * Per the NASA-diagram aesthetic the discs are flat and static: solid primary
 * colours with NO gradients, glows, shadows, scaling, or pulsing. State is shown
 * by a stark, static marker only — a black outline ring while Stowing, and a
 * solid-yellow fill (plus ring) while Blocked.
 */
export class AgentRenderer {
  readonly layer = new Container();
  private readonly bodyTexture: Texture;
  private readonly agents = new Map<number, AgentVisual>();
  private latest: ReadonlyArray<SnapshotAgent> = [];
  /** Unit vector from the door back toward the gate (queue direction). */
  private readonly bridgeUx: number;
  private readonly bridgeUy: number;
  private readonly bridgeLen: number;
  private readonly seg1: number;
  private readonly seg2: number;

  constructor(
    private readonly geo: CanvasGeometry,
    private readonly anatomy: CabinAnatomy,
    renderer: Renderer,
  ) {
    const circle = new Graphics().circle(0, 0, AGENT_RADIUS * 2).fill(0xffffff);
    this.bodyTexture = renderer.generateTexture(circle);
    circle.destroy();

    const e = anatomy.entry;
    const dx = e.gateX - e.doorX;
    const dy = e.gateY - e.doorY;
    this.bridgeLen = Math.hypot(dx, dy) || 1;
    this.bridgeUx = dx / this.bridgeLen;
    this.bridgeUy = dy / this.bridgeLen;
    this.seg1 = this.bridgeLen;
    this.seg2 = Math.hypot(e.aisleX - e.doorX, e.aisleY - e.doorY);
  }

  /** Push the latest snapshot; updates targets/phase without touching the GPU. */
  setSnapshot(agents: ReadonlyArray<SnapshotAgent>): void {
    this.latest = agents;

    // Rank queued passengers by id (≈ boarding order) for the single-file line.
    const rank = new Map<number, number>();
    const queued = agents.filter((a) => a.state === PassengerState.Queued);
    queued.sort((a, b) => a.id - b.id);
    for (let i = 0; i < queued.length; i++) rank.set(queued[i].id, i);

    for (const agent of agents) {
      let visual = this.agents.get(agent.id);
      if (!visual) {
        visual = this.spawn(agent, rank.get(agent.id) ?? 0);
        this.agents.set(agent.id, visual);
      }
      const color = SEAT_COLORS[agent.seatType];
      if (visual.baseColor !== color) {
        visual.baseColor = color;
        visual.markedState = null; // force the tint to be re-applied
      }
      visual.state = agent.state;

      if (agent.state === PassengerState.Queued) {
        visual.phase = 'queued';
        const slot = this.queueSlot(rank.get(agent.id) ?? 0);
        visual.queueX = slot[0];
        visual.queueY = slot[1];
      } else {
        if (visual.phase === 'queued') {
          visual.phase = 'entering';
          visual.enterT = 0;
        }
        visual.engineX = this.geo.rowToX(agent.row);
        visual.engineY = this.geo.colToY(agent.col);
      }
    }
  }

  get currentAgents(): ReadonlyArray<SnapshotAgent> {
    return this.latest;
  }

  private spawn(agent: SnapshotAgent, rank: number): AgentVisual {
    const base = SEAT_COLORS[agent.seatType];
    const body = new Sprite(this.bodyTexture);
    body.anchor.set(0.5);
    body.width = AGENT_RADIUS * 2;
    body.height = AGENT_RADIUS * 2;
    body.tint = base;

    const arc = new Graphics();
    const container = new Container();
    container.addChild(body);
    container.addChild(arc);

    const queued = agent.state === PassengerState.Queued;
    const engineX = this.geo.rowToX(agent.row);
    const engineY = this.geo.colToY(agent.col);
    const slot = this.queueSlot(rank);
    const startX = queued ? slot[0] : engineX;
    const startY = queued ? slot[1] : engineY;
    container.position.set(startX, startY);
    this.layer.addChild(container);

    return {
      container,
      body,
      arc,
      x: startX,
      y: startY,
      engineX,
      engineY,
      queueX: slot[0],
      queueY: slot[1],
      baseColor: base,
      state: agent.state,
      markedState: null,
      phase: queued ? 'queued' : 'cabin',
      enterT: queued ? 0 : 1,
    };
  }

  /** Per-frame position interpolation. State visuals are static (set on change only). */
  update(dt: number): void {
    const f = 1 - Math.exp(-dt * SMOOTH);
    for (const visual of this.agents.values()) {
      let tx: number;
      let ty: number;
      if (visual.phase === 'queued') {
        tx = visual.queueX;
        ty = visual.queueY;
      } else if (visual.phase === 'entering') {
        visual.enterT += dt / ENTER_DURATION;
        if (visual.enterT >= 1) {
          visual.enterT = 1;
          visual.phase = 'cabin';
        }
        const point = this.entryPoint(visual.enterT);
        tx = point[0];
        ty = point[1];
      } else {
        tx = visual.engineX;
        ty = visual.engineY;
      }
      visual.x += (tx - visual.x) * f;
      visual.y += (ty - visual.y) * f;
      visual.container.position.set(visual.x, visual.y);
      this.applyState(visual);
    }
  }

  /** Single-file queue slot: rank 0 at the gate, higher ranks trailing back. */
  private queueSlot(rank: number): [number, number] {
    const e = this.anatomy.entry;
    const d = this.bridgeLen + rank * QUEUE_SPACING;
    return [e.doorX + this.bridgeUx * d, e.doorY + this.bridgeUy * d];
  }

  /** Point along the gate → door → aisle-entrance path at arc-fraction `t`. */
  private entryPoint(t: number): [number, number] {
    const e = this.anatomy.entry;
    const total = this.seg1 + this.seg2 || 1;
    const split = this.seg1 / total;
    if (t <= split) {
      const u = split === 0 ? 1 : t / split;
      return [e.gateX + (e.doorX - e.gateX) * u, e.gateY + (e.doorY - e.gateY) * u];
    }
    const u = (t - split) / (1 - split || 1);
    return [e.doorX + (e.aisleX - e.doorX) * u, e.doorY + (e.aisleY - e.doorY) * u];
  }

  /**
   * Apply the static per-state appearance. Idempotent and only does GPU work when
   * the state actually changes, so there is no per-frame animation of any kind.
   */
  private applyState(visual: AgentVisual): void {
    if (visual.markedState === visual.state) return;
    visual.markedState = visual.state;
    visual.arc.clear();

    switch (visual.state) {
      case PassengerState.Stowing: {
        // Stowing at the row: a stark, static black outline ring.
        visual.body.tint = visual.baseColor;
        visual.arc
          .circle(0, 0, MARKER_RADIUS)
          .stroke({ width: MARKER_STROKE_W, color: COLOR_AGENT_OUTLINE, alpha: 1 });
        break;
      }
      case PassengerState.Blocked: {
        // Aisle interference: turn solid yellow with a black ring (no animation).
        visual.body.tint = COLOR_BLOCKED;
        visual.arc
          .circle(0, 0, MARKER_RADIUS)
          .stroke({ width: MARKER_STROKE_W, color: COLOR_AGENT_OUTLINE, alpha: 1 });
        break;
      }
      default: {
        // Queued / Walking / Seated: a plain, flat, solid primary disc.
        visual.body.tint = visual.baseColor;
      }
    }
  }

  /** Free the shared texture (display objects are torn down with the stage). */
  destroyResources(): void {
    this.bodyTexture.destroy(true);
    this.agents.clear();
    this.latest = [];
  }
}
