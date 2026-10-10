/**
 * Place pictograms: one small silhouette per kind of place, drawn in a 24×24 box and filled in one colour on the
 * place's disc (see `place-kinds.ts`). Plain path data so the same drawing feeds the SVG badges in the phone and the
 * `Path2D` markers on the minimap canvas. Shapes stay bold (strokes ≥ 1.6 units) so they read at 10–12 px.
 *
 * Every layer is filled with the non-zero rule unless it says `evenodd` (then it cuts holes: windows, doors, rings).
 */

export interface PictogramLayer {
  readonly d: string;
  readonly rule?: 'evenodd';
}

export type Pictogram = readonly PictogramLayer[];

export const PICTOGRAM_BOX = 24;

const n = (value: number): number => Math.round(value * 100) / 100;
const rect = (x: number, y: number, w: number, h: number): string =>
  `M${n(x)} ${n(y)}h${n(w)}v${n(h)}h${n(-w)}z`;
const rounded = (x: number, y: number, w: number, h: number, r: number): string =>
  `M${n(x + r)} ${n(y)}h${n(w - 2 * r)}a${r} ${r} 0 0 1 ${r} ${r}v${n(h - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${r}` +
  `h${n(2 * r - w)}a${r} ${r} 0 0 1 ${-r} ${-r}v${n(2 * r - h)}a${r} ${r} 0 0 1 ${r} ${-r}z`;
const ellipse = (cx: number, cy: number, rx: number, ry: number): string =>
  `M${n(cx - rx)} ${n(cy)}a${rx} ${ry} 0 1 1 ${n(2 * rx)} 0a${rx} ${ry} 0 1 1 ${n(-2 * rx)} 0z`;
const circle = (cx: number, cy: number, r: number): string => ellipse(cx, cy, r, r);
/** A row of `count` downward scallops from (x, y), `width` wide in all (awnings). */
const scallops = (x: number, y: number, width: number, count: number, depth: number): string => {
  const step = width / count;
  let d = `M${n(x)} ${n(y)}`;
  for (let i = 0; i < count; i++) d += `a${n(step / 2)} ${n(depth)} 0 0 0 ${n(step)} 0`;
  return `${d}z`;
};

/** A side-on vehicle body with arches cut for two wheels, plus the wheels. */
const vehicle = (body: string, wheels: readonly number[], wheelY: number, wheelR: number): string =>
  body + wheels.map((x) => circle(x, wheelY, wheelR)).join('');

const plane: Pictogram = [
  {
    d: 'M12 1.8c1 0 1.7 1 1.7 2.2v5l8.3 5v2.3l-8.3-2.6v4.9l2.5 1.8v1.8L12 21.2l-4.2 1v-1.8l2.5-1.8v-4.9L2 16.3V14l8.3-5V4c0-1.2.7-2.2 1.7-2.2z',
  },
];

const gradCap: Pictogram = [
  { d: 'M12 3.2 23.5 8.6 12 14 .5 8.6z' },
  { d: 'M5.6 11.6 12 14.6l6.4-3v4.6c0 2-2.9 3.6-6.4 3.6s-6.4-1.6-6.4-3.6z' },
  { d: rect(20.3, 9.4, 1.4, 6.6) + circle(21, 16.8, 1.4) },
];

const schoolHouse: Pictogram = [
  {
    d:
      'M11.3 1.4h5.3v3.1h-4V5.2l9.4 6.2h-1.9v9.4H3.9v-9.4H2l9.3-6.2z' +
      rect(5.9, 13, 2.9, 2.9) +
      rect(15.2, 13, 2.9, 2.9) +
      'M10.4 20.8v-3.6a1.6 1.6 0 0 1 3.2 0v3.6z' +
      circle(12, 9, 1.35),
    rule: 'evenodd',
  },
];

const examCentre: Pictogram = [
  {
    d:
      rounded(2, 3.5, 20, 13.5, 1.8) +
      rect(4, 5.5, 16, 9.5) +
      'M7.2 10.3l1.5-1.5 2 2 4.6-4.6 1.5 1.5-6.1 6.1z',
    rule: 'evenodd',
  },
  { d: 'M9.8 17h4.4l.8 3h-6z' + rounded(6.5, 19.6, 11, 1.9, 0.9) },
];

const marketStall: Pictogram = [
  { d: 'M3.8 3.4h16.4l2.3 5.8H1.5z' },
  { d: scallops(1.5, 9.1, 21, 4, 2.4) },
  { d: rect(3.2, 11, 1.7, 5) + rect(19.1, 11, 1.7, 5) + rounded(2.2, 15.6, 19.6, 5.6, 1) },
  { d: circle(8.2, 14.2, 1.9) + circle(12, 13.8, 2.1) + circle(15.8, 14.2, 1.9) },
];

const shoppingBag: Pictogram = [
  { d: 'M8 8.4V7a4 4 0 0 1 8 0v1.4h-2V7a2 2 0 0 0-4 0v1.4z' },
  {
    d:
      'M5.4 8h13.2c.6 0 1 .4 1.1 1l1 11.2c.1.7-.5 1.3-1.2 1.3H4.5c-.7 0-1.3-.6-1.2-1.3l1-11.2c.1-.6.5-1 1.1-1z' +
      circle(8.9, 11.3, 1) +
      circle(15.1, 11.3, 1),
    rule: 'evenodd',
  },
];

const storefront: Pictogram = [
  { d: rounded(3, 2.6, 18, 3.4, 0.8) },
  { d: 'M2.4 6.6h19.2v2.4' + 'a2.4 2 0 0 1-4.8 0a2.4 2 0 0 1-4.8 0a2.4 2 0 0 1-4.8 0a2.4 2 0 0 1-4.8 0z' },
  { d: rect(3.8, 12.2, 16.4, 9) + rect(6, 14, 5.2, 4.2) + rect(13.4, 14, 4.6, 7.2), rule: 'evenodd' },
];

const scissors: Pictogram = [
  {
    d: circle(6.6, 17.4, 3.6) + circle(6.6, 17.4, 1.7) + circle(17.4, 17.4, 3.6) + circle(17.4, 17.4, 1.7),
    rule: 'evenodd',
  },
  { d: 'M8.6 14.6 18.8 2.2l1 .9-8.6 13.3zM12.8 16.4 4.2 3.1l1-.9 10.2 12.4z' },
];

const forkKnife: Pictogram = [
  {
    d: 'M4.6 2.4h1.5v5.4h1.3V2.4h1.5v5.4h1.3V2.4h1.5v6.7c0 1.6-1 2.8-2.4 3.2v9.4H7V12.3c-1.4-.4-2.4-1.6-2.4-3.2z',
  },
  { d: 'M19.4 2.4v19.3h-2.4v-7.4h-2.2V8.8c0-3.5 1.7-5.7 4.6-6.4z' },
];

const cocktail: Pictogram = [
  { d: 'M2.8 3.2h18.4L13.2 12v6.6h4v2.2H6.8v-2.2h4V12z' },
  { d: circle(17.6, 3.6, 2.4) },
];

const musicNotes: Pictogram = [
  { d: 'M8.2 17.6V5.6L20.2 3v12.8h-1.8V7.4l-8.4 1.9v8.3z' },
  { d: circle(6.1, 17.6, 2.9) + circle(16.3, 15.8, 2.9) },
];

const clapper: Pictogram = [
  { d: 'M2.6 8.4 19.7 3.1l.8 2.6-17.1 5.3z' },
  {
    d:
      rounded(2.6, 11.2, 18.8, 10, 1.2) +
      'M4.5 11.2h2.9l-1.4 2.6H3.1zM10.3 11.2h2.9l-1.4 2.6H8.9zM16.1 11.2H19l-1.4 2.6h-2.9z',
    rule: 'evenodd',
  },
];

const dumbbell: Pictogram = [
  {
    d:
      rect(6.4, 10.9, 11.2, 2.2) +
      rounded(3.6, 6.4, 3.2, 11.2, 1) +
      rounded(17.2, 6.4, 3.2, 11.2, 1) +
      rounded(1.2, 8.6, 2.8, 6.8, 0.9) +
      rounded(20, 8.6, 2.8, 6.8, 0.9),
  },
];

const balloons: Pictogram = [
  { d: ellipse(9, 7.6, 4.4, 5.4) + ellipse(15.6, 9.4, 4, 4.9) },
  { d: 'M8.2 12.8h1.6l-.8 1.6zM14.8 14.1h1.6l-.8 1.6z' },
  {
    d: 'M8.5 14.2c.4 2.6 1.6 4.6 3 7.3l1-.4c-1.3-2.5-2.3-4.4-2.6-6.9zM16 15.5c-.4 2.3-1.4 3.8-2.6 6l-1-.4c1.1-2.1 2-3.5 2.4-5.7z',
  },
];

const bed: Pictogram = [
  { d: rounded(2, 5, 2.4, 16.4, 0.8) },
  { d: rect(4.4, 15, 17.6, 2.6) + rect(19.6, 17.6, 2.4, 3.8) },
  { d: 'M11 10.4h8.4a2.6 2.6 0 0 1 2.6 2.6V15H11z' },
  { d: circle(7.6, 12, 2.4) },
];

const cross: Pictogram = [{ d: 'M9.4 3h5.2v6.4H21v5.2h-6.4V21H9.4v-6.4H3V9.4h6.4z' }];

/** A two-tone capsule: one half solid, one half outlined. */
const capsule: Pictogram = [
  {
    d:
      'M14.65 13.95 18.8 9.8a3.25 3.25 0 0 0-4.6-4.6l-4.15 4.15z' +
      'M14.65 12.11 17.88 8.88a1.95 1.95 0 0 0-2.76-2.76l-3.23 3.23z',
    rule: 'evenodd',
  },
  { d: 'M9.35 10.05 5.2 14.2a3.25 3.25 0 0 0 4.6 4.6l4.15-4.15z' },
];

const officeBlock: Pictogram = [
  {
    d:
      'M3.6 21.4V7.2L12 3.4l8.4 3.8v14.2z' +
      [7, 10.4, 13.8]
        .flatMap((y) => [rect(6, y, 2.4, 2), rect(10.8, y, 2.4, 2), rect(15.6, y, 2.4, 2)])
        .join('') +
      rect(10.2, 17.2, 3.6, 4.2),
    rule: 'evenodd',
  },
];

const towers: Pictogram = [
  {
    d:
      'M4.4 21.6V5l4.4-3.2L13.2 5v16.6z' +
      [6, 9.2, 12.4, 15.6].flatMap((y) => [rect(6.3, y, 1.4, 2), rect(9.9, y, 1.4, 2)]).join(''),
    rule: 'evenodd',
  },
  {
    d: 'M14.6 21.6V8.6h5.2v13z' + [10.4, 13.6, 16.8].map((y) => rect(16.1, y, 2.2, 1.8)).join(''),
    rule: 'evenodd',
  },
];

const columns: Pictogram = [
  { d: 'M12 2.4 22 7.8H2z' },
  { d: rect(3, 9, 18, 2) },
  { d: [4.2, 8.4, 13.6, 17.8].map((x) => rect(x, 12.2, 2, 6)).join('') },
  { d: rect(2.6, 19, 18.8, 1.6) + rect(1.4, 21, 21.2, 1.6) },
];

/** A football: centre panel, seams and the panels showing at the rim. */
const SPOKES = [0, 1, 2, 3, 4].map((k) => -90 + k * 72);
const polar = (r: number, degrees: number): readonly [number, number] => [
  12 + r * Math.cos((degrees * Math.PI) / 180),
  12 + r * Math.sin((degrees * Math.PI) / 180),
];
const polygon = (points: readonly (readonly [number, number])[]): string =>
  `M${points.map(([x, y]) => `${n(x)} ${n(y)}`).join('L')}z`;
const seam = (degrees: number, from: number, to: number, half: number): string => {
  const [dx, dy] = [Math.cos((degrees * Math.PI) / 180), Math.sin((degrees * Math.PI) / 180)];
  const at = (r: number, side: number): readonly [number, number] => [
    12 + r * dx - side * half * dy,
    12 + r * dy + side * half * dx,
  ];
  return polygon([at(from, -1), at(to, -1), at(to, 1), at(from, 1)]);
};

const football: Pictogram = [
  {
    d:
      circle(12, 12, 10.2) +
      polygon(SPOKES.map((a) => polar(3.9, a))) +
      SPOKES.map((a) => seam(a, 4.6, 6.6, 0.75)).join('') +
      SPOKES.map((a) =>
        polygon([
          polar(9.3, a - 21),
          polar(7.2, a - 11),
          polar(6.7, a),
          polar(7.2, a + 11),
          polar(9.3, a + 21),
        ]),
      ).join(''),
    rule: 'evenodd',
  },
];

const tree: Pictogram = [
  { d: circle(12, 8.4, 6.2) + circle(7.4, 11.8, 4.2) + circle(16.6, 11.8, 4.2) + rect(7.4, 11.4, 9.2, 4.6) },
  { d: 'M10.8 15h2.4v5.4h-2.4z' + rounded(5.6, 20, 12.8, 2, 1) },
];

const beach: Pictogram = [
  {
    d: 'M2.4 11.6C2.4 6.4 6.7 2.6 12 2.6s9.6 3.8 9.6 9c-1.6-1-3.2-1-4.8 0-1.6-1-3.2-1-4.8 0-1.6-1-3.2-1-4.8 0-1.6-1-3.2-1-4.8 0z',
  },
  { d: rect(11.2, 10.8, 1.6, 6.6) },
  {
    d: 'M1.6 19.2c1.7-1.6 3.5-1.6 5.1 0s3.5 1.6 5.2 0 3.5-1.6 5.2 0 3.4 1.6 5.3 0v2.4c-1.9 1.6-3.6 1.6-5.3 0s-3.5-1.6-5.2 0-3.5 1.6-5.2 0-3.4-1.6-5.1 0z',
  },
];

const mosque: Pictogram = [
  { d: 'M13.6 1A2.2 2.2 0 1 0 13.6 5 2.4 2.4 0 0 1 13.6 1z' },
  { d: rect(11.4, 4.2, 1.2, 2.4) },
  {
    d:
      'M5.4 14.2c0-4 3.2-6 6.6-8 3.4 2 6.6 4 6.6 8h.4v7.4H5v-7.4z' +
      'M10.4 21.6v-3.3a1.6 1.6 0 0 1 3.2 0v3.3z',
    rule: 'evenodd',
  },
  { d: 'M1.4 21.6V8.4l1.1-2.2 1.1 2.2v13.2zM20.4 21.6V8.4l1.1-2.2 1.1 2.2v13.2z' },
];

const church: Pictogram = [
  { d: rect(11.3, 0.8, 1.4, 5.2) + rect(9.9, 2.1, 4.2, 1.3) },
  {
    d: 'M9.3 21.6V8.6L12 5.8l2.7 2.8v13z' + 'M10.8 21.6v-3.4a1.2 1.2 0 0 1 2.4 0v3.4z',
    rule: 'evenodd',
  },
  { d: 'M2.6 21.6v-7.4l5.8-3v10.4zM21.4 21.6v-7.4l-5.8-3v10.4z' },
];

const bus: Pictogram = [
  {
    d:
      vehicle(
        'M3 4.6h15.4c1.6 0 2.7.9 3.2 2.4l1.2 4.2v6.4h-2.1a2.7 2.7 0 0 0-5.4 0H8.7a2.7 2.7 0 0 0-5.4 0H1.6V6c0-.8.6-1.4 1.4-1.4z',
        [6, 18],
        17.9,
        2,
      ) +
      rounded(3.4, 6.4, 3.6, 3.6, 0.5) +
      rounded(8.2, 6.4, 3.6, 3.6, 0.5) +
      rounded(13, 6.4, 3.6, 3.6, 0.5) +
      'M17.8 6.4h1c.6 0 1 .3 1.2.9l.8 3.1h-3z' +
      rect(1.6, 11.6, 21.2, 1),
    rule: 'evenodd',
  },
];

const car: Pictogram = [
  {
    d: vehicle(
      'M1.4 16.9v-3.3c0-1.2.8-2.1 2-2.3l3.3-.7 3-3.6c.6-.7 1.4-1.1 2.3-1.1h3.8c1 0 1.9.4 2.5 1.2l2.8 3.5c1.7.3 2.3 1.2 2.3 2.4v3.9h-1.7a2.8 2.8 0 0 0-5.6 0H9.4a2.8 2.8 0 0 0-5.6 0z' +
        'M8.4 10.6l2-2.4c.3-.4.7-.5 1.1-.5h1.5v2.9zM14.6 7.7h1c.5 0 .9.2 1.2.6l1.6 2.3h-3.8z',
      [6.6, 18.9],
      17.2,
      2.1,
    ),
    rule: 'evenodd',
  },
];

const key: Pictogram = [
  { d: circle(6.4, 12, 4.8) + circle(6.4, 12, 2), rule: 'evenodd' },
  { d: rect(10.6, 10.8, 11.4, 2.4) + rect(16.4, 13, 1.8, 3.4) + rect(19.8, 13, 1.8, 2.4) },
];

const house: Pictogram = [
  { d: 'M12 2.6 22.4 11.4h-2.6v10.2H4.2V11.4H1.6z' + 'M10.2 21.6v-5.8h3.6v5.8z', rule: 'evenodd' },
];

/** A plot of land: a picket fence along its boundary. */
const land: Pictogram = [
  {
    d:
      [1.4, 7.4, 13.4, 19.4].map((x) => `M${x} 21V8.6l1.6-2.6 1.6 2.6V21z`).join('') +
      rect(1.2, 10.2, 21.6, 2.2) +
      rect(1.2, 15.6, 21.6, 2.2),
  },
];

const hardHat: Pictogram = [
  { d: 'M4.4 14.8c0-5 3.3-8.6 7.6-8.6s7.6 3.6 7.6 8.6z' + rect(10.9, 7.8, 2.2, 5.6), rule: 'evenodd' },
  { d: rounded(1.6, 15.6, 20.8, 2.6, 1.1) },
];

/** A petrol pump: the body with its window, and the nozzle hose hooked on the side. */
const fuelPump: Pictogram = [
  { d: rounded(3.4, 2.6, 11, 18.8, 1.6) + rect(5.6, 5, 6.6, 4.6), rule: 'evenodd' },
  { d: rect(2, 19.8, 13.8, 2.2) + 'M14.4 7.2h2.2l3.4 3.4v7.8a2.1 2.1 0 0 1-4.2 0v-4.2h-1.4v-2h3.4v6.2h.2v-7l-2.4-2.4h-1.2z' },
];

/** A spanner, head up-left, handle down-right. */
const wrench: Pictogram = [
  {
    d: 'M14.6 2.4a5.8 5.8 0 0 0-5.3 8.1L2.6 17.2a2.4 2.4 0 0 0 3.4 3.4l6.7-6.7a5.8 5.8 0 0 0 8.1-5.3l-3.4 3.4-3.4-.6-.6-3.4 3.4-3.4a5.8 5.8 0 0 0-2.2-.2z',
  },
];

export const PICTOGRAMS = {
  fuelPump,
  wrench,
  plane,
  gradCap,
  schoolHouse,
  examCentre,
  marketStall,
  shoppingBag,
  storefront,
  scissors,
  forkKnife,
  cocktail,
  musicNotes,
  clapper,
  dumbbell,
  balloons,
  bed,
  cross,
  capsule,
  officeBlock,
  towers,
  columns,
  football,
  tree,
  beach,
  mosque,
  church,
  bus,
  car,
  key,
  house,
  land,
  hardHat,
} as const satisfies Readonly<Record<string, Pictogram>>;

export type PictogramName = keyof typeof PICTOGRAMS;
