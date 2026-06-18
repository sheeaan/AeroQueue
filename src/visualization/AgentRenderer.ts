import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { Renderer } from 'pixi.js';
import type { SnapshotAgent } from '@/simulation/engine/SimulationEngine';
import { PassengerState } from '@/simulation/domain/state';
import type { CabinAnatomy } from './CabinRenderer';
import { COLOR_BLOCKED, COLOR_STOW_ARC, SEAT_COLORS } from './colors';
import { AGENT_RADIUS, type CanvasGeometry } from './geometry';

/** Exponential-smoothing rate for position interpolation (larger = snappier). */
const SMOOTH = 14;
/** Spacing between agents waiting single-file in the entry queue (px). */
const QUEUE_SPACING = 13;

type Phase = 'queued' | 'cabin';
type ArcKind = 'none' | 'stow' | 'blocked';

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
  stowProgress: number;
  phase: Phase;
  /** What the overlay graphic currently shows (avoids redundant redraws). */
  arcKind: ArcKind;
}

/**
 * Owns the agent discs and animates them every Pixi tick.
 *
 * Passengers are clean flat discs colour-coded by seat type (soft blue / teal /
 * coral). `Queued` passengers marshal in a single-file line to the LEFT of the
 * grid along the aisle row and stream RIGHT into the lattice under engine-driven
 * motion. State is shown with restrained UI overlays: a thin light loading arc
 * that sweeps while Stowing, and a thin amber ring while aisle-Blocked. No glow,
 * gradient, or pulsing.
 */
export class AgentRenderer {
  readonly layer = new Container();
  private readonly bodyTexture: Texture;
  private readonly agents = new Map<number, AgentVisual>();
  private latest: ReadonlyArray<SnapshotAgent> = [];

  constructor(
    private readonly geo: CanvasGeometry,
    private readonly anatomy: CabinAnatomy,
    renderer: Renderer,
  ) {
    const circle = new Graphics().circle(0, 0, AGENT_RADIUS * 2).fill(0xffffff);
    this.bodyTexture = renderer.generateTexture(circle);
    circle.destroy();
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
      visual.baseColor = SEAT_COLORS[agent.seatType];
      visual.state = agent.state;
      visual.stowProgress = agent.stowProgress;

      if (agent.state === PassengerState.Queued) {
        visual.phase = 'queued';
        const slot = this.queueSlot(rank.get(agent.id) ?? 0);
        visual.queueX = slot[0];
        visual.queueY = slot[1];
      } else {
        visual.phase = 'cabin';
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
      stowProgress: agent.stowProgress,
      phase: queued ? 'queued' : 'cabin',
      arcKind: 'none',
    };
  }

  /** Per-frame position interpolation + state overlay. */
  update(dt: number): void {
    const f = 1 - Math.exp(-dt * SMOOTH);
    for (const visual of this.agents.values()) {
      const tx = visual.phase === 'queued' ? visual.queueX : visual.engineX;
      const ty = visual.phase === 'queued' ? visual.queueY : visual.engineY;
      visual.x += (tx - visual.x) * f;
      visual.y += (ty - visual.y) * f;
      visual.container.position.set(visual.x, visual.y);
      this.applyState(visual);
    }
  }

  /** Single-file queue slot: rank 0 just left of the entry, higher ranks trailing back. */
  private queueSlot(rank: number): [number, number] {
    const e = this.anatomy.entry;
    return [e.entryX - (rank + 1) * QUEUE_SPACING, e.aisleY];
  }

  private applyState(visual: AgentVisual): void {
    visual.body.tint = visual.baseColor;

    if (visual.state === PassengerState.Stowing) {
      // A crisp, thin loading arc that fills as the bags are stowed.
      visual.arc.clear();
      const start = -Math.PI / 2;
      visual.arc
        .arc(0, 0, AGENT_RADIUS + 3, start, start + visual.stowProgress * Math.PI * 2)
        .stroke({ width: 2, color: COLOR_STOW_ARC, alpha: 0.95 });
      visual.arcKind = 'stow';
      return;
    }

    if (visual.state === PassengerState.Blocked) {
      if (visual.arcKind !== 'blocked') {
        visual.arc.clear();
        visual.arc.circle(0, 0, AGENT_RADIUS + 2.5).stroke({ width: 2, color: COLOR_BLOCKED, alpha: 1 });
        visual.arcKind = 'blocked';
      }
      return;
    }

    if (visual.arcKind !== 'none') {
      visual.arc.clear();
      visual.arcKind = 'none';
    }
  }

  /** Free the shared texture (display objects are torn down with the stage). */
  destroyResources(): void {
    this.bodyTexture.destroy(true);
    this.agents.clear();
    this.latest = [];
  }
}
