/**
 * The Inside Life app mark: a danfo seen head-on, Ghana-Must-Go bag and ankara bundle on the roof rack, passengers in
 * the windscreen, the double stripe across its face, on a lagoon tile.
 *
 * One geometry feeds the inline `<AppMark>` component, `public/icon.svg` and every generated PNG
 * (`scripts/generate-icons.mjs`). Everything is plain path data in a 64×64 box so it renders the same in React,
 * browsers and librsvg (no ids, clip paths or gradients). Type-only imports: the icon script loads this file with Node's
 * type stripping.
 */
import type { BrandColor } from './brand';

export const APP_MARK_BOX = 64;
/** Corner radius of the rounded app tile (≈22%, close to the iOS/Android launcher squircle). */
export const APP_MARK_TILE_RADIUS = 14;
export const APP_MARK_BACKGROUND: BrandColor = 'lagoon';
/** Scale of the danfo on the rounded tile, leaving the launcher-style margin. */
export const APP_MARK_TILE_SCALE = 0.9;
/**
 * Scale that keeps the whole danfo (mirrors, wheels, cargo) inside the maskable safe zone: a centred circle with a
 * radius of 40% of the icon.
 */
export const APP_MARK_MASKABLE_SCALE = 0.74;

export interface AppMarkShape {
  readonly d: string;
  readonly fill: BrandColor;
  readonly opacity?: number;
  /** Fine detail that turns to noise at favicon size; dropped from the compact mark. */
  readonly detail?: boolean;
}

const n = (value: number): number => Math.round(value * 100) / 100;
const rect = (x: number, y: number, w: number, h: number): string => `M${n(x)} ${n(y)}h${n(w)}v${n(h)}h${n(-w)}z`;
const rounded = (x: number, y: number, w: number, h: number, r: number): string =>
  `M${n(x + r)} ${n(y)}h${n(w - 2 * r)}a${r} ${r} 0 0 1 ${r} ${r}v${n(h - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${r}` +
  `h${n(2 * r - w)}a${r} ${r} 0 0 1 ${-r} ${-r}v${n(2 * r - h)}a${r} ${r} 0 0 1 ${r} ${-r}z`;
const ellipse = (cx: number, cy: number, rx: number, ry: number): string =>
  `M${n(cx - rx)} ${n(cy)}a${rx} ${ry} 0 1 0 ${n(2 * rx)} 0a${rx} ${ry} 0 1 0 ${n(-2 * rx)} 0z`;
const circle = (cx: number, cy: number, r: number): string => ellipse(cx, cy, r, r);
/** Passenger silhouette: head and shoulders, cut off by the bottom of the windscreen. */
const passenger = (cx: number, headY: number): string =>
  circle(cx, headY, 2.3) + `M${n(cx - 4.8)} 31a4.8 ${n(31 - headY - 2.6)} 0 0 1 9.6 0z`;

// Ghana-Must-Go bag on the rack: white, red warp, blue weft.
const BAG = { x: 17.5, y: 3.6, w: 17, h: 7.8, r: 1.8 } as const;

export const APP_MARK_SHAPES: readonly AppMarkShape[] = [
  { d: ellipse(32, 59.6, 23, 1.8), fill: 'ink', opacity: 0.35, detail: true },
  // Roof rack
  { d: rect(17, 12.6, 1.6, 3) + rect(45.4, 12.6, 1.6, 3), fill: 'onInkSoft' },
  { d: rounded(15, 11.4, 34, 1.8, 0.9), fill: 'onInkSoft' },
  // Ghana-Must-Go bag
  { d: rounded(BAG.x, BAG.y, BAG.w, BAG.h, BAG.r), fill: 'paper' },
  { d: [20.4, 25.25, 30.1].map((x) => rect(x, BAG.y, 1.5, BAG.h)).join(''), fill: 'okada' },
  { d: [5.5, 8.2].map((y) => rect(BAG.x, y, BAG.w, 1.3)).join(''), fill: 'cobalt', opacity: 0.85 },
  { d: 'M23.4 3.7a2.6 2.3 0 0 1 5.2 0h-1.3a1.3 1.1 0 0 0-2.6 0z', fill: 'ink', detail: true },
  // Ankara bundle, knotted on top
  {
    d: 'M35.8 11.4c-.6-2.5.3-4.4 2.6-4.8h5.8c2.3.4 3.2 2.3 2.6 4.8zM40.6 6.9c-1.3-.5-1.9-1.7-1.6-2.9 1.1.2 2 1 2.4 2.2zM42.2 6.9c1.3-.5 1.9-1.7 1.6-2.9-1.1.2-2 1-2.4 2.2z',
    fill: 'ankara',
  },
  { d: circle(38.4, 9.3, 0.7) + circle(41.4, 8.5, 0.7) + circle(44.4, 9.4, 0.7), fill: 'danfoSoft', detail: true },
  // Side mirrors
  { d: rounded(5.2, 20, 4.6, 10, 1.4) + rect(9.6, 23.4, 1.6, 2.2) + rounded(54.2, 20, 4.6, 10, 1.4) + rect(52.8, 23.4, 1.6, 2.2), fill: 'danfo' },
  // Body
  { d: 'M10 23a9 9 0 0 1 9-9h26a9 9 0 0 1 9 9v28.5H10z', fill: 'danfo' },
  // Windscreen and the people inside
  { d: 'M18.5 17.5h27a3.6 3.6 0 0 1 3.5 2.9l1.6 8.1a2 2 0 0 1-2 2.4H14.4a2 2 0 0 1-2-2.4l1.6-8.1a3.6 3.6 0 0 1 3.5-2.9z', fill: 'ink' },
  { d: passenger(22.2, 24.1) + passenger(32, 23.5) + passenger(41.8, 24.1), fill: 'lagoon', detail: true },
  // The double stripe
  { d: rect(10, 34, 44, 2.6) + rect(10, 38.6, 44, 2.6), fill: 'ink' },
  // Headlights and grille
  { d: circle(18.6, 46.6, 3.9) + circle(45.4, 46.6, 3.9), fill: 'ink' },
  { d: circle(18.6, 46.6, 2.4) + circle(45.4, 46.6, 2.4), fill: 'danfoSoft' },
  { d: rounded(26.5, 44.2, 11, 4.8, 1.2), fill: 'ink' },
  // Bumper and wheels
  { d: 'M9 51.5h46v1.6a2.4 2.4 0 0 1-2.4 2.4H11.4A2.4 2.4 0 0 1 9 53.1z', fill: 'ink' },
  { d: rounded(13, 54, 7, 5.4, 1) + rounded(44, 54, 7, 5.4, 1), fill: 'ink' },
];

/** Shapes for a given size: the compact mark drops fine detail. */
export function appMarkShapes(compact = false): readonly AppMarkShape[] {
  return compact ? APP_MARK_SHAPES.filter((shape) => !shape.detail) : APP_MARK_SHAPES;
}

export interface AppMarkSvgOptions {
  /** Rounded launcher tile (default), full-bleed square (maskable / Apple touch icon) or no background. */
  readonly background?: 'tile' | 'full-bleed' | 'none';
  /** Scale of the danfo around the centre of the box (default: the tile margin on a tile, edge to edge otherwise). */
  readonly scale?: number;
  readonly compact?: boolean;
  readonly colors: Readonly<Record<BrandColor, string>>;
}

/** The mark as a standalone SVG document (for `public/icon.svg` and the PNG generator). */
export function appMarkSvg({ background = 'tile', scale, compact = false, colors }: AppMarkSvgOptions): string {
  const half = APP_MARK_BOX / 2;
  const factor = scale ?? (background === 'tile' ? APP_MARK_TILE_SCALE : 1);
  const tile =
    background === 'none'
      ? ''
      : `<rect width="${APP_MARK_BOX}" height="${APP_MARK_BOX}"${background === 'tile' ? ` rx="${APP_MARK_TILE_RADIUS}"` : ''} fill="${colors[APP_MARK_BACKGROUND]}"/>`;
  const paths = appMarkShapes(compact)
    .map((shape) => `<path d="${shape.d}" fill="${colors[shape.fill]}"${shape.opacity === undefined ? '' : ` opacity="${shape.opacity}"`}/>`)
    .join('');
  const body = factor === 1 ? paths : `<g transform="translate(${half} ${half}) scale(${factor}) translate(${-half} ${-half})">${paths}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${APP_MARK_BOX} ${APP_MARK_BOX}">${tile}${body}</svg>`;
}
