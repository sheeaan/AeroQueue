import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { CabinSide, SeatColumnType } from '@/simulation/domain/geometry';
import type { SnapshotAgent } from '@/simulation/engine/SimulationEngine';
import { PassengerState } from '@/simulation/domain/state';
import type { CabinAnatomy } from './CabinRenderer';
import {
  COLOR_AGENT_BLOCKED,
  COLOR_AGENT_MOVING,
  COLOR_AGENT_STOW,
  COLOR_ARROW,
  COLOR_SEAT_SHUFFLE,
} from './colors';
import type { CanvasGeometry } from './geometry';

/** Exponential-smoothing rate for position interpolation (larger = snappier). */
const SMOOTH = 14;
/** Spacing between agents waiting single-file in the entry queue (px). */
const QUEUE_SPACING = 13;
/** Side length of an agent square, in px. */
const AGENT_SIZE = 14;
/** stowProgress at/above this means the bags are stowed and the over-climb is running. */
const OVERCLIMB_PROGRESS = 0.999;

type Phase = 'queued' | 'cabin';

interface AgentVisual {
  container: Container;
  body: Graphics;
  label: Text | null;
  x: number;
  y: number;
  /** Engine cell target (cabin phase). */
  engineX: number;
  engineY: number;
  /** Queue-slot target (queued phase). */
  queueX: number;
  queueY: number;
  state: PassengerState;
  stowProgress: number;
  stowRemaining: number;
  seatType: SeatColumnType;
  side: CabinSide;
  row: number;
  phase: Phase;
  /** Last-drawn body appearance, so we only redraw when it actually changes. */
  drawnKey: string;
  /** Last number shown in the countdown label. */
  labelNum: number;
}

/** Distance of a seat from the aisle: aisle = 0, middle = 1, window = 2. */
function aisleDistanceOf(type: SeatColumnType): number {
  return type === 'aisle' ? 0 : type === 'middle' ? 1 : 2;
}

/**
 * Owns the agent squares and draws their state each Pixi tick.
 *
 * Colour shows what a passenger is doing: white while moving/queued/seated, and —
 * the parts that explain the bottlenecks — yellow while Stowing (the square fills
 * bottom-up as the stow timer elapses, with a tick countdown beside it) and red
 * while Blocked by the aisle ahead. During a seat over-climb a white arrow points
 * from the aisle to the target seat and the blocking seated passengers turn
 * orange. Queued passengers line up to the left of the grid and move right in.
 */
export class AgentRenderer {
  readonly layer = new Container();
  /** Overlay for the over-climb arrows, drawn above the squares. */
  private readonly arrows = new Graphics();
  private readonly agents = new Map<number, AgentVisual>();
  private latest: ReadonlyArray<SnapshotAgent> = [];
  private readonly labelStyle: TextStyle;
  private readonly aisleCol: number;
  private readonly aisleY: number;

  constructor(
    private readonly geo: CanvasGeometry,
    private readonly anatomy: CabinAnatomy,
  ) {
    this.aisleCol = geo.aisleColIndex;
    this.aisleY = geo.colToY(geo.aisleColIndex);
    this.labelStyle = new TextStyle({ fontFamily: 'Courier New', fontSize: 11, fill: COLOR_AGENT_STOW });
    this.layer.sortableChildren = true;
    this.arrows.zIndex = 2;
    this.layer.addChild(this.arrows);
  }

  /** Push the latest snapshot; updates targets/state without touching the GPU. */
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
      visual.stowProgress = agent.stowProgress;
      visual.stowRemaining = agent.stowRemaining;
      visual.seatType = agent.seatType;
      visual.side = agent.side;
      visual.row = agent.row;

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
    const body = new Graphics();
    const container = new Container();
    container.zIndex = 1;
    container.addChild(body);

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
      label: null,
      x: startX,
      y: startY,
      engineX,
      engineY,
      queueX: slot[0],
      queueY: slot[1],
      state: agent.state,
      stowProgress: agent.stowProgress,
      stowRemaining: agent.stowRemaining,
      seatType: agent.seatType,
      side: agent.side,
      row: agent.row,
      phase: queued ? 'queued' : 'cabin',
      drawnKey: '',
      labelNum: -1,
    };
  }

  /** Per-frame interpolation, over-climb detection, and per-state drawing. */
  update(dt: number): void {
    const f = 1 - Math.exp(-dt * SMOOTH);
    for (const visual of this.agents.values()) {
      const tx = visual.phase === 'queued' ? visual.queueX : visual.engineX;
      const ty = visual.phase === 'queued' ? visual.queueY : visual.engineY;
      visual.x += (tx - visual.x) * f;
      visual.y += (ty - visual.y) * f;
      visual.container.position.set(visual.x, visual.y);
    }

    // Index seated passengers by row+side so we can find over-climb blockers.
    const seated = new Map<string, Array<{ id: number; ad: number }>>();
    for (const [id, v] of this.agents) {
      if (v.state !== PassengerState.Seated) continue;
      const key = `${v.row}:${v.side}`;
      let bucket = seated.get(key);
      if (!bucket) seated.set(key, (bucket = []));
      bucket.push({ id, ad: aisleDistanceOf(v.seatType) });
    }

    // A passenger that has finished stowing but is still in the aisle is doing a
    // seat over-climb if there are already-seated neighbours between it and its
    // seat. Mark those neighbours and draw an arrow to the target seat.
    const shuffling = new Set<number>();
    const arrows: Array<{ x: number; y0: number; y1: number }> = [];
    for (const v of this.agents.values()) {
      if (v.state !== PassengerState.Stowing || v.stowProgress < OVERCLIMB_PROGRESS) continue;
      const targetAd = aisleDistanceOf(v.seatType);
      if (targetAd === 0) continue; // an aisle seat never over-climbs
      const blockers = (seated.get(`${v.row}:${v.side}`) ?? []).filter((b) => b.ad < targetAd);
      if (blockers.length === 0) continue;
      for (const b of blockers) shuffling.add(b.id);
      const seatCol = v.side === 'left' ? this.aisleCol - 1 - targetAd : this.aisleCol + 1 + targetAd;
      arrows.push({ x: this.geo.rowToX(v.row), y0: this.aisleY, y1: this.geo.colToY(seatCol) });
    }
    this.drawArrows(arrows);

    for (const [id, v] of this.agents) this.applyState(v, shuffling.has(id));
  }

  /** Single-file queue slot: rank 0 just left of the entry, higher ranks trailing back. */
  private queueSlot(rank: number): [number, number] {
    const e = this.anatomy.entry;
    return [e.entryX - (rank + 1) * QUEUE_SPACING, e.aisleY];
  }

  private applyState(visual: AgentVisual, isShuffling: boolean): void {
    if (visual.state === PassengerState.Stowing) {
      const bucket = Math.round(Math.max(0, Math.min(1, visual.stowProgress)) * AGENT_SIZE);
      const key = `stow:${bucket}`;
      if (key !== visual.drawnKey) {
        this.drawStow(visual.body, visual.stowProgress);
        visual.drawnKey = key;
      }
      this.updateLabel(visual, visual.stowRemaining);
      return;
    }

    let key: string;
    let color: number;
    if (visual.state === PassengerState.Blocked) {
      key = 'block';
      color = COLOR_AGENT_BLOCKED;
    } else if (visual.state === PassengerState.Seated) {
      key = isShuffling ? 'shuffle' : 'seat';
      color = isShuffling ? COLOR_SEAT_SHUFFLE : COLOR_AGENT_MOVING;
    } else {
      key = 'move';
      color = COLOR_AGENT_MOVING;
    }
    if (key !== visual.drawnKey) {
      this.drawSolid(visual.body, color);
      visual.drawnKey = key;
    }
    this.hideLabel(visual);
  }

  /** Solid filled square (moving / blocked / seated / shuffling). */
  private drawSolid(g: Graphics, color: number): void {
    const h = AGENT_SIZE / 2;
    g.clear();
    g.rect(-h, -h, AGENT_SIZE, AGENT_SIZE).fill({ color, alpha: 1 });
  }

  /** Hollow yellow square filled from the bottom up to `progress` — the stow "loading bar". */
  private drawStow(g: Graphics, progress: number): void {
    const h = AGENT_SIZE / 2;
    const fill = AGENT_SIZE * Math.max(0, Math.min(1, progress));
    g.clear();
    if (fill > 0) g.rect(-h, h - fill, AGENT_SIZE, fill).fill({ color: COLOR_AGENT_STOW, alpha: 1 });
    g.rect(-h, -h, AGENT_SIZE, AGENT_SIZE).stroke({ width: 1.5, color: COLOR_AGENT_STOW, alpha: 1 });
  }

  /** Crisp monospace countdown of the remaining stow ticks, beside the square. */
  private updateLabel(visual: AgentVisual, remaining: number): void {
    const n = Math.ceil(remaining - 1e-6);
    if (n <= 0) {
      this.hideLabel(visual);
      return;
    }
    if (!visual.label) {
      visual.label = new Text({ text: String(n), style: this.labelStyle, resolution: 2 });
      visual.label.anchor.set(0, 0.5);
      visual.label.position.set(AGENT_SIZE / 2 + 3, 0);
      visual.container.addChild(visual.label);
      visual.labelNum = n;
    } else if (visual.labelNum !== n) {
      visual.label.text = String(n);
      visual.labelNum = n;
    }
    visual.label.visible = true;
  }

  private hideLabel(visual: AgentVisual): void {
    if (visual.label) visual.label.visible = false;
  }

  /** Draw the over-climb arrows: a 1px white line + arrowhead from aisle to seat. */
  private drawArrows(segments: Array<{ x: number; y0: number; y1: number }>): void {
    this.arrows.clear();
    if (segments.length === 0) return;
    const head = 4;
    for (const s of segments) {
      this.arrows.moveTo(s.x, s.y0).lineTo(s.x, s.y1);
      const dir = s.y1 > s.y0 ? 1 : -1;
      this.arrows
        .moveTo(s.x - head, s.y1 - dir * head)
        .lineTo(s.x, s.y1)
        .lineTo(s.x + head, s.y1 - dir * head);
    }
    this.arrows.stroke({ width: 1, color: COLOR_ARROW, alpha: 1 });
  }

  /** Display objects are torn down with the stage; just drop our references. */
  destroyResources(): void {
    this.agents.clear();
    this.latest = [];
  }
}
