/**
 * Tiny line-chart geometry (no chart library): linear scales, nice ticks, SVG paths and nearest-point lookup.
 * Pure so it is unit-tested and reused by any chart in the module.
 */

export interface ChartBox {
  readonly width: number;
  readonly height: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface ChartPoint {
  readonly x: number;
  readonly y: number;
}

export interface LineGeometry {
  readonly points: readonly ChartPoint[];
  /** `M…L…` polyline through every point. */
  readonly line: string;
  /** Closed area under the line down to the plot bottom (for the 10% wash). */
  readonly area: string;
  readonly yTicks: ReadonlyArray<{ readonly value: number; readonly y: number }>;
  readonly domain: readonly [number, number];
  readonly min: { readonly index: number; readonly value: number };
  readonly max: { readonly index: number; readonly value: number };
}

/** Map `value` from [d0, d1] to [r0, r1]. A flat domain maps to the middle of the range. */
export function scaleLinear(value: number, [d0, d1]: readonly [number, number], [r0, r1]: readonly [number, number]): number {
  if (d1 === d0) return (r0 + r1) / 2;
  return r0 + ((value - d0) / (d1 - d0)) * (r1 - r0);
}

/** A 1/2/2.5/5 × 10ⁿ step that splits [min, max] into about `count` intervals. */
export function niceStep(span: number, count: number): number {
  if (!(span > 0) || count <= 0) return 1;
  const raw = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const residual = raw / magnitude;
  const factor = residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 2.5 ? 2.5 : residual <= 5 ? 5 : 10;
  return factor * magnitude;
}

/** Round tick values covering [min, max] (the domain is widened to the outer ticks). */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) {
    const pad = Math.abs(min) * 0.05 || 1;
    return niceTicks(min - pad, max + pad, count);
  }
  const step = niceStep(max - min, count);
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  // Integer stepping avoids float drift (0.1 + 0.2…); round to the step's precision.
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 1);
  for (let i = 0; start + i * step <= end + step / 2; i++) ticks.push(Number((start + i * step).toFixed(decimals)));
  return ticks;
}

/** Geometry for one series drawn left (oldest) to right (newest) inside `box`. */
export function buildLine(values: readonly number[], box: ChartBox, tickCount = 4): LineGeometry | null {
  if (values.length === 0) return null;
  let minIndex = 0;
  let maxIndex = 0;
  values.forEach((value, index) => {
    if (value < (values[minIndex] ?? value)) minIndex = index;
    if (value > (values[maxIndex] ?? value)) maxIndex = index;
  });
  const minValue = values[minIndex] ?? 0;
  const maxValue = values[maxIndex] ?? 0;
  const ticks = niceTicks(minValue, maxValue, tickCount);
  const domain: [number, number] = [ticks[0] ?? minValue, ticks.at(-1) ?? maxValue];
  const xRange: [number, number] = [box.left, box.width - box.right];
  const yRange: [number, number] = [box.height - box.bottom, box.top];
  const last = Math.max(1, values.length - 1);
  const points = values.map((value, index) => ({
    x: values.length === 1 ? (xRange[0] + xRange[1]) / 2 : scaleLinear(index, [0, last], xRange),
    y: scaleLinear(value, domain, yRange),
  }));
  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${round(point.x)},${round(point.y)}`).join('');
  const first = points[0]!;
  const end = points.at(-1)!;
  const area = `${line}L${round(end.x)},${round(yRange[0])}L${round(first.x)},${round(yRange[0])}Z`;
  return {
    points,
    line,
    area,
    yTicks: ticks.map((value) => ({ value, y: scaleLinear(value, domain, yRange) })),
    domain,
    min: { index: minIndex, value: minValue },
    max: { index: maxIndex, value: maxValue },
  };
}

/** Index of the data point closest to pixel `x` (for the hover crosshair). */
export function nearestIndex(x: number, count: number, box: Pick<ChartBox, 'width' | 'left' | 'right'>): number {
  if (count <= 1) return 0;
  const ratio = (x - box.left) / Math.max(1, box.width - box.left - box.right);
  return Math.min(count - 1, Math.max(0, Math.round(ratio * (count - 1))));
}

const round = (n: number): number => Math.round(n * 10) / 10;
