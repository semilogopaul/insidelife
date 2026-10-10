/**
 * Making a house yours: outside paint, roofing sheets, gate colour and a name on the gate for houses you own; wall paint
 * and floor finishes inside any home you rent or own (never the family house or a hostel). Prices are 2026 Lagos
 * labour + materials before the world price index; the server is authoritative, the client uses the same quote.
 */
import type { BlueprintId } from './housing.js';

export interface Swatch<Id extends string> {
  readonly id: Id;
  readonly label: string;
  /** sRGB. */
  readonly hex: string;
}

export const HOUSE_PAINTS = [
  { id: 'cream', label: 'Cream', hex: '#f1e3c6' },
  { id: 'white', label: 'Brilliant white', hex: '#f7f5ef' },
  { id: 'sky', label: 'Sky blue', hex: '#93c1dd' },
  { id: 'peach', label: 'Peach', hex: '#f0b48a' },
  { id: 'mint', label: 'Mint green', hex: '#a9d6aa' },
  { id: 'lemon', label: 'Lemon', hex: '#efd662' },
  { id: 'terracotta', label: 'Terracotta', hex: '#c9805a' },
  { id: 'ash', label: 'Ash grey', hex: '#b9bbb8' },
  { id: 'lilac', label: 'Lilac', hex: '#c3a9df' },
  { id: 'pink', label: 'Candy pink', hex: '#f2a7c3' },
  { id: 'coral', label: 'Coral', hex: '#f08a7a' },
] as const satisfies readonly Swatch<string>[];
export type HousePaintId = (typeof HOUSE_PAINTS)[number]['id'];

/** Long-span aluminium and stone-coated roofing sheet colours. */
export const ROOF_COLOURS = [
  { id: 'brick-red', label: 'Brick red', hex: '#8e2b2b' },
  { id: 'forest-green', label: 'Forest green', hex: '#2f5d50' },
  { id: 'ocean-blue', label: 'Ocean blue', hex: '#2c4f7c' },
  { id: 'charcoal', label: 'Charcoal', hex: '#3a3d44' },
  { id: 'terracotta', label: 'Terracotta', hex: '#a4532e' },
  { id: 'coffee', label: 'Coffee brown', hex: '#5b3a29' },
  { id: 'silver', label: 'Silver', hex: '#c7cbcf' },
] as const satisfies readonly Swatch<string>[];
export type RoofColourId = (typeof ROOF_COLOURS)[number]['id'];

export const GATE_COLOURS = [
  { id: 'black', label: 'Black', hex: '#2b2b2e' },
  { id: 'gold', label: 'Gold', hex: '#b8912f' },
  { id: 'white', label: 'White', hex: '#ecebe6' },
  { id: 'green', label: 'Green', hex: '#1f5f3f' },
  { id: 'maroon', label: 'Maroon', hex: '#6b1f2a' },
  { id: 'navy', label: 'Navy', hex: '#1f3f6b' },
  { id: 'pink', label: 'Pink', hex: '#e07aa5' },
] as const satisfies readonly Swatch<string>[];
export type GateColourId = (typeof GATE_COLOURS)[number]['id'];

/** Emulsion for inside walls. */
export const WALL_PAINTS = [
  { id: 'magnolia', label: 'Magnolia', hex: '#efe5d3' },
  { id: 'white', label: 'White', hex: '#f4f2ec' },
  { id: 'sky', label: 'Sky blue', hex: '#c9dfea' },
  { id: 'sage', label: 'Sage', hex: '#c8d5c0' },
  { id: 'butter', label: 'Butter yellow', hex: '#f2e2a6' },
  { id: 'blush', label: 'Blush pink', hex: '#efcfcb' },
  { id: 'lavender', label: 'Lavender', hex: '#d9d0e8' },
  { id: 'rose', label: 'Rose pink', hex: '#e9a9bd' },
  { id: 'teal', label: 'Deep teal', hex: '#2f6f73' },
  { id: 'navy', label: 'Navy', hex: '#273c5a' },
  { id: 'charcoal', label: 'Charcoal', hex: '#45484d' },
] as const satisfies readonly Swatch<string>[];
export type WallPaintId = (typeof WALL_PAINTS)[number]['id'];

/** Floor finishes; `style` is how the 3D room draws it. */
export const FLOOR_FINISHES = [
  { id: 'cement', label: 'Screeded cement', style: 'cement', hex: '#9e9a92', pricePerSqm: 2_500 },
  { id: 'vinyl', label: 'Vinyl (rubber) tiles', style: 'vinyl', hex: '#b9a27a', pricePerSqm: 4_500 },
  { id: 'carpet', label: 'Rug carpet', style: 'carpet', hex: '#7d2d3a', pricePerSqm: 7_500 },
  { id: 'ceramic', label: 'Ceramic tiles', style: 'tiles', hex: '#e7e1d6', pricePerSqm: 11_000 },
  { id: 'terrazzo', label: 'Terrazzo', style: 'terrazzo', hex: '#d9d2c3', pricePerSqm: 16_000 },
  { id: 'parquet', label: 'Wooden parquet', style: 'wood', hex: '#8a5a32', pricePerSqm: 24_000 },
  { id: 'marble', label: 'Marble', style: 'marble', hex: '#f3efe8', pricePerSqm: 48_000 },
] as const;
export type FloorFinishId = (typeof FLOOR_FINISHES)[number]['id'];
export type FloorFinish = (typeof FLOOR_FINISHES)[number];

const byId = <T extends { readonly id: string }>(
  list: readonly T[],
  id: string | null | undefined,
): T | undefined => list.find((entry) => entry.id === id);
export const findHousePaint = (id: string | null | undefined) => byId(HOUSE_PAINTS, id);
export const findRoofColour = (id: string | null | undefined) => byId(ROOF_COLOURS, id);
export const findGateColour = (id: string | null | undefined) => byId(GATE_COLOURS, id);
export const findWallPaint = (id: string | null | undefined) => byId(WALL_PAINTS, id);
export const findFloorFinish = (id: string | null | undefined) => byId(FLOOR_FINISHES, id);

/** How a house you own looks outside (null fields: the builder's default). */
export interface HouseExterior {
  readonly paint: HousePaintId | null;
  readonly roof: RoofColourId | null;
  readonly gate: GateColourId | null;
  /** On the gate plate ("Bakare Lodge"); null = surname + house type. */
  readonly name: string | null;
}

/** Inside: wall paint and floor (null fields: as the house came). */
export interface HomeDecor {
  readonly paint: WallPaintId | null;
  readonly floor: FloorFinishId | null;
}

export const NO_EXTERIOR: HouseExterior = { paint: null, roof: null, gate: null, name: null };
export const NO_DECOR: HomeDecor = { paint: null, floor: null };

/** Letters, numbers, spaces and a little punctuation; 2-24 characters. */
export const HOUSE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 '&.-]{1,23}$/;

/** Painting the outside, by house (scaffolding, two coats, labour). */
const EXTERIOR_PAINT_COST: Readonly<Record<BlueprintId, number>> = {
  bungalow: 650_000,
  duplex: 1_250_000,
  'block-of-flats': 2_100_000,
  mansion: 3_600_000,
};
/** Changing the roof colour means new sheets: strip and re-roof. */
const REROOF_COST: Readonly<Record<BlueprintId, number>> = {
  bungalow: 3_800_000,
  duplex: 5_600_000,
  'block-of-flats': 6_800_000,
  mansion: 12_500_000,
};
const GATE_PAINT_COST = 85_000;
const NAMEPLATE_COST = 45_000;

export interface StyleQuoteLine {
  readonly label: string;
  readonly cost: number;
}

export interface StyleQuote {
  readonly lines: readonly StyleQuoteLine[];
  readonly total: number;
}

const roundTo = (value: number, step: number): number => Math.round(value / step) * step;

function quote(lines: readonly StyleQuoteLine[]): StyleQuote {
  return { lines, total: lines.reduce((sum, line) => sum + line.cost, 0) };
}

/** What changing the outside costs (only what actually changes is charged). */
export function exteriorQuote(
  blueprintId: BlueprintId,
  current: HouseExterior,
  next: Partial<HouseExterior>,
  priceIndex: number,
): StyleQuote {
  const lines: StyleQuoteLine[] = [];
  const price = (base: number): number => roundTo(base * priceIndex, 1_000);
  if (next.paint !== undefined && next.paint !== current.paint && next.paint !== null) {
    lines.push({
      label: `Paint the house ${findHousePaint(next.paint)?.label.toLowerCase() ?? next.paint}`,
      cost: price(EXTERIOR_PAINT_COST[blueprintId]),
    });
  }
  if (next.roof !== undefined && next.roof !== current.roof && next.roof !== null) {
    lines.push({
      label: `New ${findRoofColour(next.roof)?.label.toLowerCase() ?? next.roof} roofing sheets`,
      cost: price(REROOF_COST[blueprintId]),
    });
  }
  if (next.gate !== undefined && next.gate !== current.gate && next.gate !== null) {
    lines.push({
      label: `Paint the gate ${findGateColour(next.gate)?.label.toLowerCase() ?? next.gate}`,
      cost: price(GATE_PAINT_COST),
    });
  }
  if (next.name !== undefined && next.name !== current.name) {
    lines.push({
      label: next.name ? `Gate plate: “${next.name}”` : 'Plain gate plate',
      cost: price(NAMEPLATE_COST),
    });
  }
  return quote(lines);
}

/** Rough floor area of a home by bedrooms (living room, kitchen, bath and the bedrooms). */
export function homeFloorArea(bedrooms: number): number {
  return 22 + Math.max(1, bedrooms) * 16;
}

/** What repainting inside or laying a new floor costs (only what changes). */
export function decorQuote(
  bedrooms: number,
  current: HomeDecor,
  next: Partial<HomeDecor>,
  priceIndex: number,
): StyleQuote {
  const lines: StyleQuoteLine[] = [];
  const area = homeFloorArea(bedrooms);
  if (next.paint !== undefined && next.paint !== current.paint && next.paint !== null) {
    // Walls ≈ 2.6 × floor area; ₦1,900/m² for two coats of emulsion with labour.
    lines.push({
      label: `Paint inside ${findWallPaint(next.paint)?.label.toLowerCase() ?? next.paint}`,
      cost: roundTo(area * 2.6 * 1_900 * priceIndex, 1_000),
    });
  }
  if (next.floor !== undefined && next.floor !== current.floor && next.floor !== null) {
    const finish = findFloorFinish(next.floor);
    if (finish)
      lines.push({
        label: `${finish.label} floor (${area} m²)`,
        cost: roundTo(area * finish.pricePerSqm * priceIndex, 1_000),
      });
  }
  return quote(lines);
}
