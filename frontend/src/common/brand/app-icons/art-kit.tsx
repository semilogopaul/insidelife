import type { ReactNode } from 'react';

/** Drawing context handed to every app icon's art (64×64 box). */
export interface ArtContext {
  /** An id unique to this icon instance (gradients and patterns can't share ids across icons on one page). */
  readonly id: (name: string) => string;
  /** `url(#…)` reference to one of this icon's defs. */
  readonly url: (name: string) => string;
  /** At small sizes fine detail (stitching, plate digits, window panes) turns to noise and is left out. */
  readonly compact: boolean;
}

export interface AppIconArt {
  /** Accessible name when the icon stands alone. */
  readonly name: string;
  /** Tile gradient, top to bottom. */
  readonly tile: readonly [string, string];
  /** Hairline around the tile; white by default, ink on light tiles so they hold their edge on the paper phone. */
  readonly rim?: { readonly color: string; readonly opacity: number };
  /** Flat on the tile, behind the subject (scenery). Clipped to the tile. */
  readonly backdrop?: (ctx: ArtContext) => ReactNode;
  /** The motif, lifted off the tile by a soft shadow. Clipped to the tile. */
  readonly subject: (ctx: ArtContext) => ReactNode;
}

type Stop = readonly [offset: number, color: string, opacity?: number];

/** A linear gradient in the shape's own box: top → bottom unless told otherwise. */
export function Linear({
  id,
  stops,
  x1 = 0,
  y1 = 0,
  x2 = 0,
  y2 = 1,
}: {
  readonly id: string;
  readonly stops: readonly Stop[];
  readonly x1?: number;
  readonly y1?: number;
  readonly x2?: number;
  readonly y2?: number;
}) {
  return (
    <linearGradient id={id} x1={x1} y1={y1} x2={x2} y2={y2}>
      {stops.map(([offset, color, opacity]) => (
        <stop key={offset} offset={offset} stopColor={color} stopOpacity={opacity} />
      ))}
    </linearGradient>
  );
}

const n = (value: number): number => Math.round(value * 100) / 100;

/** The naira sign (N with a double bar) centred on (cx, cy), `height` tall, as one path. */
export function naira(cx: number, cy: number, height: number): string {
  const s = height / 12;
  const poly = (points: readonly (readonly [number, number])[]): string =>
    `M${points.map(([x, y]) => `${n(cx + (x - 5) * s)} ${n(cy + (y - 6) * s)}`).join('L')}z`;
  return (
    poly([
      [0, 0],
      [2.3, 0],
      [2.3, 12],
      [0, 12],
    ]) +
    poly([
      [7.7, 0],
      [10, 0],
      [10, 12],
      [7.7, 12],
    ]) +
    poly([
      [0, 0],
      [2.7, 0],
      [10, 12],
      [7.3, 12],
    ]) +
    poly([
      [-1.7, 3.5],
      [11.7, 3.5],
      [11.7, 5.1],
      [-1.7, 5.1],
    ]) +
    poly([
      [-1.7, 6.9],
      [11.7, 6.9],
      [11.7, 8.5],
      [-1.7, 8.5],
    ])
  );
}
