import { Application, Container } from 'pixi.js';
import type { Ticker } from 'pixi.js';
import type { CabinLayout } from '@/simulation/domain/Grid';
import type { SimulationSnapshot } from '@/simulation/engine/SimulationEngine';
import { AgentRenderer } from './AgentRenderer';
import { createCabinLayer } from './CabinRenderer';
import { COLOR_CABIN_BG } from './colors';
import { createGeometry } from './geometry';
import { HeatmapRenderer } from './HeatmapRenderer';

/**
 * Top-level PixiJS orchestrator. Owns the `Application`, composes the three
 * layers (static cabin → heatmap overlay → agents), and runs a single Pixi
 * ticker that interpolates agents and repaints the heatmap at 60 FPS.
 *
 * It consumes the engine through the decoupled pull channel: `applySnapshot` is
 * fed by `useSimulationFrames`, never via React state — so the animation loop
 * never triggers a React reconciliation.
 */
export class SimulationRenderer {
  private time = 0;

  private constructor(
    private readonly app: Application,
    private readonly world: Container,
    private readonly agents: AgentRenderer,
    private readonly heatmap: HeatmapRenderer,
  ) {
    this.app.ticker.add(this.tick);
  }

  static async create(host: HTMLElement, cabin: CabinLayout): Promise<SimulationRenderer> {
    const geo = createGeometry(cabin);

    const app = new Application();
    await app.init({
      width: geo.width,
      height: geo.height,
      background: COLOR_CABIN_BG,
      backgroundAlpha: 1,
      antialias: true,
      resolution: Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1),
      autoDensity: true,
      preference: 'webgl', // GLSL-only path; avoids needing a parallel WGSL shader
    });

    const canvas = app.canvas as HTMLCanvasElement;
    canvas.style.width = '100%';
    canvas.style.height = 'auto';
    canvas.style.display = 'block';
    host.appendChild(canvas);

    const world = new Container();
    app.stage.addChild(world);

    world.addChild(createCabinLayer(cabin, geo)); // 1. static cabin
    const heatmap = new HeatmapRenderer(geo, app.renderer);
    world.addChild(heatmap.sprite); // 2. congestion overlay
    const agents = new AgentRenderer(geo, app.renderer);
    world.addChild(agents.layer); // 3. agents on top

    return new SimulationRenderer(app, world, agents, heatmap);
  }

  /** Feed the latest engine snapshot to the agent + heatmap layers. */
  applySnapshot(snapshot: SimulationSnapshot): void {
    this.agents.setSnapshot(snapshot.agents);
  }

  setHeatmapVisible(visible: boolean): void {
    this.heatmap.setVisible(visible);
  }

  private readonly tick = (ticker: Ticker): void => {
    const dt = Math.min(0.05, ticker.deltaMS / 1000); // clamp tab-switch spikes
    this.time += dt;
    this.agents.update(dt, this.time);
    this.heatmap.update(this.agents.currentAgents, dt);
  };

  /** Robust teardown (safe under React strict-mode double-invocation). */
  destroy(): void {
    try {
      this.app.ticker.remove(this.tick);
    } catch {
      /* already torn down */
    }
    try {
      // Tear down the display tree (sprites/containers) but not shared textures…
      this.app.destroy(true, { children: true });
    } catch {
      /* ignore */
    }
    try {
      // …then free the textures and off-screen resources exactly once.
      this.agents.destroyResources();
      this.heatmap.destroyResources();
    } catch {
      /* ignore */
    }
  }
}
