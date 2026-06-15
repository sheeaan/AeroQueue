import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { Renderer } from 'pixi.js';
import type { SnapshotAgent } from '@/simulation/engine/SimulationEngine';
import { PassengerState } from '@/simulation/domain/state';
import { COLOR_BLOCKED_FLASH, lerpColor, SEAT_COLORS } from './colors';
import { AGENT_RADIUS, type CanvasGeometry } from './geometry';

/** Exponential-smoothing rate for position interpolation (larger = snappier). */
const SMOOTH = 14;

interface AgentVisual {
  container: Container;
  body: Sprite;
  arc: Graphics;
  /** Current (interpolated) pixel position. */
  x: number;
  y: number;
  /** Target pixel position from the latest snapshot. */
  targetX: number;
  targetY: number;
  baseColor: number;
  state: PassengerState;
  stowProgress: number;
}

/**
 * Owns the agent sprites and animates them every Pixi tick.
 *
 * Snapshots (which carry *discrete* cell positions that only change on an
 * arrival event) merely set each agent's target; the per-frame `update` lerps
 * the sprite toward it, yielding smooth gliding between cells. State indicators
 * are applied here too: a pulsing countdown arc for `Stowing`, and a
 * high-contrast colour flash for `Blocked`.
 */
export class AgentRenderer {
  readonly layer = new Container();
  private readonly bodyTexture: Texture;
  private readonly agents = new Map<number, AgentVisual>();
  private latest: ReadonlyArray<SnapshotAgent> = [];

  constructor(private readonly geo: CanvasGeometry, renderer: Renderer) {
    // One shared white circle texture, tinted per agent — far cheaper than a
    // Graphics redraw per agent per frame.
    const circle = new Graphics().circle(0, 0, AGENT_RADIUS * 2).fill(0xffffff);
    this.bodyTexture = renderer.generateTexture(circle);
    circle.destroy();
  }

  /** Push the latest snapshot; updates targets/state without touching the GPU. */
  setSnapshot(agents: ReadonlyArray<SnapshotAgent>): void {
    this.latest = agents;
    for (const agent of agents) {
      let visual = this.agents.get(agent.id);
      if (!visual) {
        visual = this.spawn(agent);
        this.agents.set(agent.id, visual);
      }
      // Seat assignment can change when a new strategy is loaded for the same id.
      const color = SEAT_COLORS[agent.seatType];
      if (visual.baseColor !== color) visual.baseColor = color;
      visual.targetX = this.geo.rowToX(agent.row);
      visual.targetY = this.geo.colToY(agent.col);
      visual.state = agent.state;
      visual.stowProgress = agent.stowProgress;
    }
  }

  get currentAgents(): ReadonlyArray<SnapshotAgent> {
    return this.latest;
  }

  private spawn(agent: SnapshotAgent): AgentVisual {
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

    const x = this.geo.rowToX(agent.row);
    const y = this.geo.colToY(agent.col);
    container.position.set(x, y);
    this.layer.addChild(container);

    return { container, body, arc, x, y, targetX: x, targetY: y, baseColor: base, state: agent.state, stowProgress: agent.stowProgress };
  }

  /** Per-frame interpolation + state visualisation. `time` is seconds since start. */
  update(dt: number, time: number): void {
    const f = 1 - Math.exp(-dt * SMOOTH);
    for (const visual of this.agents.values()) {
      visual.x += (visual.targetX - visual.x) * f;
      visual.y += (visual.targetY - visual.y) * f;
      visual.container.position.set(visual.x, visual.y);
      this.applyState(visual, time);
    }
  }

  private applyState(visual: AgentVisual, time: number): void {
    switch (visual.state) {
      case PassengerState.Stowing: {
        visual.container.scale.set(1 + 0.16 * Math.sin(time * 8)); // pulse
        visual.body.tint = visual.baseColor;
        visual.body.alpha = 1;
        visual.arc.clear();
        const start = -Math.PI / 2;
        visual.arc
          .arc(0, 0, AGENT_RADIUS + 3, start, start + visual.stowProgress * Math.PI * 2)
          .stroke({ width: 2, color: 0xffffff, alpha: 0.92 });
        break;
      }
      case PassengerState.Blocked: {
        visual.container.scale.set(1);
        visual.body.tint = lerpColor(visual.baseColor, COLOR_BLOCKED_FLASH, 0.5 + 0.5 * Math.sin(time * 14));
        visual.body.alpha = 1;
        visual.arc.clear();
        break;
      }
      case PassengerState.Queued: {
        visual.container.scale.set(0.85);
        visual.body.tint = visual.baseColor;
        visual.body.alpha = 0.35;
        visual.arc.clear();
        break;
      }
      case PassengerState.Seated: {
        visual.container.scale.set(0.9);
        visual.body.tint = visual.baseColor;
        visual.body.alpha = 0.95;
        visual.arc.clear();
        break;
      }
      default: {
        // Walking
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
