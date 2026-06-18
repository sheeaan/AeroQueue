import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { Renderer } from 'pixi.js';
import type { SnapshotAgent } from '@/simulation/engine/SimulationEngine';
import { PassengerState } from '@/simulation/domain/state';
import type { CabinAnatomy } from './CabinRenderer';
import { COLOR_AGENT_HELD, COLOR_AGENT_MOVING } from './colors';
import { type CanvasGeometry } from './geometry';

/** Exponential-smoothing rate for position interpolation (larger = snappier). */
const SMOOTH = 14;
/** Spacing between agents waiting single-file in the entry queue (px). */
const QUEUE_SPACING = 13;
/** Side length of an agent square, in px. */
const AGENT_SIZE = 14;

type Phase = 'queued' | 'cabin';

interface AgentVisual {
  body: Sprite;
  x: number;
  y: number;
  /** Engine cell target (cabin phase). */
  engineX: number;
  engineY: number;
  /** Queue-slot target (queued phase). */
  queueX: number;
  queueY: number;
  state: PassengerState;
  /** Last state for which the tint was applied (avoids per-frame GPU writes). */
  markedState: PassengerState | null;
  phase: Phase;
}

/**
 * Owns the agent squares and animates only their *position* every Pixi tick.
 *
 * Passengers are raw data points: solid, sharp white squares moving through the
 * lattice, turning solid yellow while Stowing or aisle-Blocked. There are no
 * gradients, halos, outlines, scaling, or pulsing of any kind. `Queued`
 * passengers marshal in a single-file line to the LEFT of the grid along the
 * aisle row (ordered by boarding sequence) and stream RIGHT into the lattice
 * under engine-driven motion. Snapshots carry discrete cell positions; the
 * per-frame `update` lerps each square toward its current target.
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
    const square = new Graphics().rect(0, 0, AGENT_SIZE, AGENT_SIZE).fill(0xffffff);
    this.bodyTexture = renderer.generateTexture(square);
    square.destroy();
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
      visual.state = agent.state;

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
    const body = new Sprite(this.bodyTexture);
    body.anchor.set(0.5);
    body.width = AGENT_SIZE;
    body.height = AGENT_SIZE;
    body.tint = COLOR_AGENT_MOVING;

    const queued = agent.state === PassengerState.Queued;
    const engineX = this.geo.rowToX(agent.row);
    const engineY = this.geo.colToY(agent.col);
    const slot = this.queueSlot(rank);
    const startX = queued ? slot[0] : engineX;
    const startY = queued ? slot[1] : engineY;
    body.position.set(startX, startY);
    this.layer.addChild(body);

    return {
      body,
      x: startX,
      y: startY,
      engineX,
      engineY,
      queueX: slot[0],
      queueY: slot[1],
      state: agent.state,
      markedState: null,
      phase: queued ? 'queued' : 'cabin',
    };
  }

  /** Per-frame position interpolation. State colour is static (set on change only). */
  update(dt: number): void {
    const f = 1 - Math.exp(-dt * SMOOTH);
    for (const visual of this.agents.values()) {
      const tx = visual.phase === 'queued' ? visual.queueX : visual.engineX;
      const ty = visual.phase === 'queued' ? visual.queueY : visual.engineY;
      visual.x += (tx - visual.x) * f;
      visual.y += (ty - visual.y) * f;
      visual.body.position.set(visual.x, visual.y);
      this.applyState(visual);
    }
  }

  /** Single-file queue slot: rank 0 just left of the entry, higher ranks trailing back. */
  private queueSlot(rank: number): [number, number] {
    const e = this.anatomy.entry;
    return [e.entryX - (rank + 1) * QUEUE_SPACING, e.aisleY];
  }

  /**
   * Static per-state colour: white while moving (queued / walking / seated),
   * solid yellow while held (stowing or aisle-blocked). Only writes to the GPU
   * when the state actually changes, so nothing animates.
   */
  private applyState(visual: AgentVisual): void {
    if (visual.markedState === visual.state) return;
    visual.markedState = visual.state;
    const held =
      visual.state === PassengerState.Stowing || visual.state === PassengerState.Blocked;
    visual.body.tint = held ? COLOR_AGENT_HELD : COLOR_AGENT_MOVING;
  }

  /** Free the shared texture (display objects are torn down with the stage). */
  destroyResources(): void {
    this.bodyTexture.destroy(true);
    this.agents.clear();
    this.latest = [];
  }
}
