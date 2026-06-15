import { Container, RenderTexture, Sprite, Texture } from 'pixi.js';
import type { Filter, Renderer } from 'pixi.js';
import type { SnapshotAgent } from '@/simulation/engine/SimulationEngine';
import { PassengerState } from '@/simulation/domain/state';
import type { CanvasGeometry } from './geometry';
import { createHeatmapFilter } from './heatmapShader';

/** Per-frame heat persistence (at 60 FPS) — higher = longer-lived bottlenecks. */
const DECAY = 0.93;
/** How fast a Stowing/Blocked agent heats its aisle cell. */
const RISE = 2.4;
/** Blob diameter, in cells (controls how far heat bleeds along the aisle). */
const BLOB_CELLS = 3.4;

/**
 * Real-time congestion heatmap using a two-pass, GPU-friendly pipeline:
 *
 *   Pass 1 — additive accumulation: one soft blob per aisle row is drawn into an
 *            off-screen {@link RenderTexture} with `blendMode = 'add'`, so
 *            overlapping congestion *sums* into a single intensity field. Only
 *            ~`rows` sprites are ever drawn — never hundreds of overlapping
 *            translucent sprites on the visible stage.
 *   Pass 2 — gradient mapping: the on-stage sprite that displays that texture
 *            carries a custom WebGL filter ({@link createHeatmapFilter}) that
 *            recolours the accumulated intensity green → yellow → red.
 *
 * Temporal smoothing/decay lives in a small CPU array so a cleared bottleneck
 * fades out rather than snapping off.
 */
export class HeatmapRenderer {
  readonly sprite: Sprite;
  private readonly renderTexture: RenderTexture;
  private readonly blobLayer = new Container();
  private readonly rowBlobs: Sprite[] = [];
  private readonly blobTexture: Texture;
  private readonly heat: number[];
  private readonly filter: Filter | null;

  constructor(private readonly geo: CanvasGeometry, private readonly renderer: Renderer) {
    this.heat = new Array<number>(geo.rows).fill(0);
    this.blobTexture = makeBlobTexture();
    this.renderTexture = RenderTexture.create({ width: geo.width, height: geo.height, resolution: 1 });

    const aisleY = geo.colToY(geo.aisleColIndex);
    const diameter = geo.cell * BLOB_CELLS;
    for (let row = 0; row < geo.rows; row++) {
      const blob = new Sprite(this.blobTexture);
      blob.anchor.set(0.5);
      blob.width = diameter;
      blob.height = diameter;
      blob.position.set(geo.rowToX(row), aisleY);
      blob.blendMode = 'add';
      blob.alpha = 0;
      this.blobLayer.addChild(blob);
      this.rowBlobs.push(blob);
    }

    this.sprite = new Sprite(this.renderTexture);
    this.filter = createHeatmapFilter();
    if (this.filter) this.sprite.filters = [this.filter];
  }

  setVisible(visible: boolean): void {
    this.sprite.visible = visible;
  }

  /** Accumulate, decay, and re-render the intensity texture for this frame. */
  update(agents: ReadonlyArray<SnapshotAgent>, dt: number): void {
    if (!this.sprite.visible) return;

    const decay = Math.pow(DECAY, dt * 60);
    for (let row = 0; row < this.heat.length; row++) this.heat[row] *= decay;

    for (const agent of agents) {
      if (agent.state === PassengerState.Stowing || agent.state === PassengerState.Blocked) {
        if (agent.row >= 0 && agent.row < this.heat.length) {
          this.heat[agent.row] = Math.min(1.6, this.heat[agent.row] + RISE * dt);
        }
      }
    }

    for (let row = 0; row < this.rowBlobs.length; row++) {
      this.rowBlobs[row].alpha = Math.min(1, this.heat[row]);
    }

    this.renderer.render({ container: this.blobLayer, target: this.renderTexture, clear: true });
  }

  destroyResources(): void {
    this.blobLayer.destroy({ children: true });
    this.renderTexture.destroy(true);
    this.blobTexture.destroy(true);
  }
}

/** A soft radial-gradient blob used as the additive heat brush. */
function makeBlobTexture(): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.5, 'rgba(255,255,255,0.5)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(64, 64, 64, 0, Math.PI * 2);
  ctx.fill();
  return Texture.from(canvas);
}
