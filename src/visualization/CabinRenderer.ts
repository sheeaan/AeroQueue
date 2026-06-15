import { Container, Graphics } from 'pixi.js';
import type { CabinLayout } from '@/simulation/domain/Grid';
import { COLOR_AISLE_BAND, COLOR_FUSELAGE, COLOR_SEAT_OUTLINE } from './colors';
import type { CanvasGeometry } from './geometry';

/**
 * Builds the static cabin layer: fuselage shell, the central aisle band, and a
 * single batched {@link Graphics} of seat outlines. Drawn once — it never
 * changes during a run, so it carries no per-frame cost.
 */
export function createCabinLayer(cabin: CabinLayout, geo: CanvasGeometry): Container {
  const layer = new Container();

  // Fuselage shell.
  const shell = new Graphics();
  shell
    .roundRect(geo.margin * 0.5, geo.margin * 0.5, geo.width - geo.margin, geo.height - geo.margin, 20)
    .fill({ color: COLOR_FUSELAGE, alpha: 0.55 });
  layer.addChild(shell);

  // Central aisle band (where agents walk and heat accumulates).
  const aisleY = geo.colToY(geo.aisleColIndex);
  const band = new Graphics();
  band
    .roundRect(geo.margin * 0.7, aisleY - geo.cell * 0.5, geo.width - geo.margin * 1.4, geo.cell, 6)
    .fill({ color: COLOR_AISLE_BAND, alpha: 0.9 });
  layer.addChild(band);

  // Seat outlines — accumulate every path, then stroke once (a single draw call).
  const seats = new Graphics();
  const size = geo.cell * 0.78;
  for (const seat of cabin.seats) {
    const x = geo.rowToX(seat.coord.row) - size / 2;
    const y = geo.colToY(seat.coord.col) - size / 2;
    seats.roundRect(x, y, size, size, 4);
  }
  seats.stroke({ width: 1, color: COLOR_SEAT_OUTLINE, alpha: 0.9 });
  layer.addChild(seats);

  return layer;
}
