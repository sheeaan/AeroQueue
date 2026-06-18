import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { SnapshotAgent } from '@/simulation/engine/SimulationEngine';
import { PassengerState } from '@/simulation/domain/state';
import type { CabinAnatomy } from './CabinRenderer';
import { COLOR_BLOCKED_FLASH, COLOR_STOW_ARC, lerpColor, SEAT_COLORS } from './colors';
import { AGENT_RADIUS, type CanvasGeometry } from './geometry';

/** Exponential-smoothing rate for position interpolation (larger = snappier). */
const SMOOTH = 14;
/** Spacing between agents waiting single-file in the entry queue (px). */
const QUEUE_SPACING = 13;
/** Displayed glow-dot diameter, in multiples of the logical agent radius. */
const DOT_SCALE = 3.4;

type Phase = 'queued' | 'cabin';

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
}

/**
 * Owns the agent "data points" and animates them every Pixi tick.
 *
 * Agents are high-contrast glowing dots moving through the cellular-automata
 * lattice. `Queued` passengers marshal in a single-file line to the LEFT of the
 * grid along the aisle row (ordered by boarding sequence); when the engine
 * admits one it streams RIGHT along the aisle to its row under engine-driven
 * motion. Snapshots carry discrete cell positions; the per-frame `update` lerps
 * each dot toward its current target for smooth motion. State is visualised
 * purely through colour/scale: a crisp loading arc while Stowing, a stark red
 * pulse while Blocked (aisle interference).
 */
export class AgentRenderer {
  readonly layer = new Container();
  private readonly bodyTexture: Texture;
  private readonly agents = new Map<number, AgentVisual>();
  private latest: ReadonlyArray<SnapshotAgent> = [];

  constructor(
    private readonly geo: CanvasGeometry,
    private readonly anatomy: CabinAnatomy,
  ) {
    this.bodyTexture = makeGlowTexture();
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
      if (visual.baseColor !== color) visual.baseColor = color;
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
    body.width = AGENT_RADIUS * DOT_SCALE;
    body.height = AGENT_RADIUS * DOT_SCALE;
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
    };
  }

  /** Per-frame interpolation + state visualisation. `time` is seconds since start. */
  update(dt: number, time: number): void {
    const f = 1 - Math.exp(-dt * SMOOTH);
    for (const visual of this.agents.values()) {
      const tx = visual.phase === 'queued' ? visual.queueX : visual.engineX;
      const ty = visual.phase === 'queued' ? visual.queueY : visual.engineY;
      visual.x += (tx - visual.x) * f;
      visual.y += (ty - visual.y) * f;
      visual.container.position.set(visual.x, visual.y);
      this.applyState(visual, time);
    }
  }

  /** Single-file queue slot: rank 0 just left of the entry, higher ranks trailing back. */
  private queueSlot(rank: number): [number, number] {
    const e = this.anatomy.entry;
    return [e.entryX - (rank + 1) * QUEUE_SPACING, e.aisleY];
  }

  private applyState(visual: AgentVisual, time: number): void {
    switch (visual.state) {
      case PassengerState.Stowing: {
        // Emphasise the mathematical stow delay: a crisp loading arc + bright pulse.
        visual.container.scale.set(1 + 0.18 * Math.sin(time * 8));
        visual.body.tint = visual.baseColor;
        visual.body.alpha = 1;
        visual.arc.clear();
        const start = -Math.PI / 2;
        visual.arc
          .arc(0, 0, AGENT_RADIUS + 3, start, start + visual.stowProgress * Math.PI * 2)
          .stroke({ width: 2, color: COLOR_STOW_ARC, alpha: 0.95 });
        break;
      }
      case PassengerState.Blocked: {
        // Aisle interference → flash a stark, high-contrast red bottleneck.
        visual.container.scale.set(1);
        visual.body.tint = lerpColor(visual.baseColor, COLOR_BLOCKED_FLASH, 0.5 + 0.5 * Math.sin(time * 14));
        visual.body.alpha = 1;
        visual.arc.clear();
        break;
      }
      case PassengerState.Queued: {
        visual.container.scale.set(0.74);
        visual.body.tint = visual.baseColor;
        visual.body.alpha = 0.55;
        visual.arc.clear();
        break;
      }
      case PassengerState.Seated: {
        visual.container.scale.set(0.82);
        visual.body.tint = visual.baseColor;
        visual.body.alpha = 0.9;
        visual.arc.clear();
        break;
      }
      default: {
        // Walking the aisle.
        visual.container.scale.set(1);
        visual.body.tint = visual.baseColor;
        visual.body.alpha = 1;
        visual.arc.clear();
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

/**
 * A soft radial-gradient "glow dot": a bright solid core fading to a transparent
 * halo, so a tinted sprite reads as a glowing data point on the dark lattice.
 */
function makeGlowTexture(): Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const r = size / 2;
  const gradient = ctx.createRadialGradient(r, r, 0, r, r, r);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.4, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.6, 'rgba(255,255,255,0.45)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(r, r, r, 0, Math.PI * 2);
  ctx.fill();
  return Texture.from(canvas);
}
