import { PICTOGRAM_BOX, PICTOGRAMS, type PictogramName } from './pictograms';
import { PLACE_STYLES, type PlaceKind } from './place-kinds';

interface CanvasLayer {
  readonly path: Path2D;
  readonly rule: CanvasFillRule;
}

/** `Path2D`s are built on first use (there is no `Path2D` during server rendering). */
const built = new Map<PictogramName, readonly CanvasLayer[]>();

function canvasLayers(name: PictogramName): readonly CanvasLayer[] {
  let layers = built.get(name);
  if (!layers) {
    layers = PICTOGRAMS[name].map((layer) => ({ path: new Path2D(layer.d), rule: layer.rule ?? 'nonzero' }));
    built.set(name, layers);
  }
  return layers;
}

/** Share of the disc's diameter the pictogram fills (a touch more than `<PlaceIcon>`: minimap discs are tiny). */
const GLYPH_SCALE = 0.72;

/**
 * A place marker on a 2D canvas, centred on (x, y) in the context's current units: a soft shadow, a white rim, the
 * kind's disc and its pictogram. Callers set the device-pixel transform first, so the paths rasterise crisply at any DPR.
 */
export function drawPlaceMarker(
  ctx: CanvasRenderingContext2D,
  kind: PlaceKind,
  x: number,
  y: number,
  radius: number,
): void {
  const style = PLACE_STYLES[kind];
  ctx.fillStyle = 'rgba(14, 39, 51, 0.38)';
  ctx.beginPath();
  ctx.arc(x, y + 0.7, radius + 1.9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x, y, radius + 1.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = style.color;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  const size = radius * 2 * GLYPH_SCALE;
  ctx.save();
  ctx.translate(x - size / 2, y - size / 2);
  ctx.scale(size / PICTOGRAM_BOX, size / PICTOGRAM_BOX);
  ctx.fillStyle = style.ink;
  for (const { path, rule } of canvasLayers(style.pictogram)) ctx.fill(path, rule);
  ctx.restore();
}
