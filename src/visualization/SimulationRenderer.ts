import { Application, Container } from 'pixi.js';
import type { Ticker } from 'pixi.js';
import type { CabinLayout } from '@/simulation/domain/Grid';
import type { SimulationSnapshot } from '@/simulation/engine/SimulationEngine';
import { AgentRenderer } from './AgentRenderer';
import { computeAnatomy, createCabinLayer } from './CabinRenderer';
import { COLOR_CABIN_BG } from './colors';
import { createGeometry } from './geometry';
import { HeatmapRenderer } from './HeatmapRenderer';

/**
 * Top-level PixiJS orchestrator. Owns the `Application`, composes the three
 * layers (static lattice → heatmap overlay → agents), and runs a single Pixi
 * ticker that interpolates agents and repaints the heatmap at 60 FPS.
 *
 * Sizing uses **mathematical letterbox scaling**: the scene is authored in a
 * fixed logical coordinate space (the lattice bounding box, a long narrow
 * rectangle) and the whole `world` container is scaled by
 * `min(w/logicalW, h/logicalH)` and centred on every resize, so the entire
 * row-by-column grid always fits the canvas with zero clipping at 100% zoom.
 *
 * The engine is consumed through the decoupled pull channel: `applySnapshot` is
 * fed by `useSimulationFrames`, never via React state — so the animation loop
 * never triggers a React reconciliation.
 */
export class SimulationRenderer {
  private time = 0;
  private readonly resizeObserver: ResizeObserver;
  private lastCssW = 0;

  private constructor(
    private readonly app: Application,
    private readonly host: HTMLElement,
    private readonly world: Container,
    private readonly agents: AgentRenderer,
    private readonly heatmap: HeatmapRenderer,
    private readonly logicalWidth: number,
    private readonly logicalHeight: number,
    private readonly minX: number,
    private readonly minY: number,
  ) {
    this.app.ticker.add(this.tick);
    this.layout();
    this.resizeObserver = new ResizeObserver(() => this.layout());
    this.resizeObserver.observe(host);
  }

  static async create(host: HTMLElement, cabin: CabinLayout): Promise<SimulationRenderer> {
    const geo = createGeometry(cabin);
    const anatomy = computeAnatomy(geo);
    const { bbox } = anatomy;

    // Logical scene size: the full lattice (rows × columns) + entry runway (+ pad).
    const logicalWidth = bbox.maxX - bbox.minX;
    const logicalHeight = bbox.maxY - bbox.minY;

    const initialW = Math.max(320, host.clientWidth || 800);
    const initialH = Math.max(1, Math.round((initialW * logicalHeight) / logicalWidth));

    const app = new Application();
    await app.init({
      width: initialW,
      height: initialH,
      background: COLOR_CABIN_BG,
      backgroundAlpha: 1,
      antialias: true,
      resolution: Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1),
      autoDensity: true,
      preference: 'webgl', // GLSL-only path; avoids needing a parallel WGSL shader
    });

    const canvas = app.canvas as HTMLCanvasElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = 'auto';
    host.appendChild(canvas);

    // Everything lives in `world` in logical coordinates; the layout pass scales
    // and centres it. Agents and the heatmap are children so their geo mapping
    // is preserved through the scale.
    const world = new Container();
    app.stage.addChild(world);

    world.addChild(createCabinLayer(cabin, geo, anatomy)); // 1. static lattice
    const heatmap = new HeatmapRenderer(geo, app.renderer);
    world.addChild(heatmap.sprite); // 2. congestion overlay
    const agents = new AgentRenderer(geo, anatomy);
    world.addChild(agents.layer); // 3. agents on top

    return new SimulationRenderer(
      app,
      host,
      world,
      agents,
      heatmap,
      logicalWidth,
      logicalHeight,
      bbox.minX,
      bbox.minY,
    );
  }

  /**
   * Resize the renderer to the host width and letterbox the logical scene into
   * it: scale = min(w/logicalW, h/logicalH), then centre.
   */
  private layout(): void {
    const cssW = this.host.clientWidth;
    if (!cssW) return;
    // The canvas height follows the logical aspect ratio so the wide plane sits
    // in a tidy band; guard against re-entrant resize from our own height change.
    if (Math.abs(cssW - this.lastCssW) < 0.5) return;
    this.lastCssW = cssW;

    const cssH = Math.max(1, Math.round((cssW * this.logicalHeight) / this.logicalWidth));
    this.app.renderer.resize(cssW, cssH);

    const scale = Math.min(cssW / this.logicalWidth, cssH / this.logicalHeight);
    this.world.scale.set(scale);
    this.world.position.set(
      (cssW - this.logicalWidth * scale) / 2 - this.minX * scale,
      (cssH - this.logicalHeight * scale) / 2 - this.minY * scale,
    );
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
      this.resizeObserver.disconnect();
    } catch {
      /* ignore */
    }
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
