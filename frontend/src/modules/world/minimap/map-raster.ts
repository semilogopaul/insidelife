import { CITY_MAP, DIR_E, DIR_N, DIR_S, DIR_W, findVenue, type LotArchetype } from '@insidelife/shared';

/**
 * The city drawn once into an offscreen canvas (2 px per metre, north up): water, land, parks, beaches and roads with
 * casings. The minimap blits a rotated window of it every frame.
 */

export const RASTER_PX_PER_METRE = 2;

const WATER = '#1f5f70';
const LAND = '#e9ddc3';
const SAND = '#f3e2b2';
const PARK = '#b3cf97';
const VENUE = '#f2e6cb';
const CASING = '#b9a98a';
const ROAD = '#fffdf6';
const ARTERIAL = '#ffe9a8';
const BRIDGE_CASING = '#6d7b80';

let cached: HTMLCanvasElement | null = null;

const toRaster = (value: number, min: number): number => (value - min) * RASTER_PX_PER_METRE;

export function cityRaster(): HTMLCanvasElement {
  if (cached) return cached;
  const { minX, minZ, maxX, maxZ } = CITY_MAP.bounds;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round((maxX - minX) * RASTER_PX_PER_METRE);
  canvas.height = Math.round((maxZ - minZ) * RASTER_PX_PER_METRE);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const cell = CITY_MAP.cellSize * RASTER_PX_PER_METRE;
  ctx.fillStyle = WATER;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let row = 0; row < CITY_MAP.rows; row++) {
    for (let col = 0; col < CITY_MAP.cols; col++) {
      const index = row * CITY_MAP.cols + col;
      const kind = CITY_MAP.cells[index] as number;
      if (kind === 1 || kind === 4) continue;
      const lotIndex = CITY_MAP.lotIndex[index] as number;
      const lot = lotIndex >= 0 ? CITY_MAP.lots[lotIndex] : undefined;
      let fill = LAND;
      if (kind === 2) fill = SAND;
      else if (lot?.kind === 'venue') fill = lot.archetype === 'park' || lot.archetype === 'campus' || lot.archetype === 'stadium' ? PARK : VENUE;
      ctx.fillStyle = fill;
      ctx.fillRect(col * cell - 0.5, row * cell - 0.5, cell + 1, cell + 1);
    }
  }

  const strokeRoads = (width: (roadClass: string, bridge: boolean) => number, color: (roadClass: string, bridge: boolean) => string): void => {
    ctx.lineCap = 'round';
    for (const tile of CITY_MAP.roadTiles) {
      const x = toRaster(tile.x, minX);
      const z = toRaster(tile.z, minZ);
      ctx.strokeStyle = color(tile.roadClass, tile.bridge);
      ctx.lineWidth = width(tile.roadClass, tile.bridge);
      ctx.beginPath();
      for (const [bit, dx, dz] of [
        [DIR_N, 0, -1],
        [DIR_E, 1, 0],
        [DIR_S, 0, 1],
        [DIR_W, -1, 0],
      ] as const) {
        if ((tile.mask & bit) === 0) continue;
        ctx.moveTo(x, z);
        ctx.lineTo(x + (dx * cell) / 2, z + (dz * cell) / 2);
      }
      ctx.stroke();
    }
  };
  const roadWidth = (roadClass: string): number => (roadClass === 'street' ? 11 : 14);
  strokeRoads(
    (roadClass) => roadWidth(roadClass) + 5,
    (_, bridge) => (bridge ? BRIDGE_CASING : CASING),
  );
  strokeRoads(roadWidth, (roadClass) => (roadClass === 'street' ? ROAD : ARTERIAL));
  for (const roundabout of CITY_MAP.roundabouts) {
    const x = toRaster(roundabout.centre.x, minX);
    const z = toRaster(roundabout.centre.z, minZ);
    ctx.strokeStyle = CASING;
    ctx.lineWidth = 17;
    ctx.beginPath();
    ctx.arc(x, z, roundabout.ringRadius * RASTER_PX_PER_METRE, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = ARTERIAL;
    ctx.lineWidth = 12;
    ctx.stroke();
  }
  cached = canvas;
  return canvas;
}

export interface MapIcon {
  readonly x: number;
  readonly z: number;
  readonly color: string;
  readonly glyph: string;
  readonly name: string;
}

const ICON: Readonly<Record<LotArchetype, readonly [string, string]>> = {
  airport: ['#13606b', '✈'],
  campus: ['#0f5132', 'U'],
  market: ['#d0571c', 'M'],
  mall: ['#2457d6', 'S'],
  hospital: ['#c62828', '+'],
  'office-tower': ['#0e2733', 'O'],
  office: ['#0e2733', 'O'],
  government: ['#1a8a4a', 'G'],
  stadium: ['#1a8a4a', '★'],
  park: ['#3f7d3a', 'P'],
  beach: ['#d99c00', 'B'],
  hotel: ['#6b4a1f', 'H'],
  club: ['#c8287a', '♪'],
  mosque: ['#1f6b45', 'M'],
  church: ['#2b3f8f', '✝'],
  'motor-park': ['#d99c00', 'D'],
  'car-dealer': ['#c62828', 'C'],
  shop: ['#e8742b', '•'],
  school: ['#2457d6', 'S'],
};

/** Your land and houses: a gold house where you live, green for the rest. */
export function propertyIcons(owned: readonly { readonly x: number; readonly z: number; readonly name: string; readonly livedIn: boolean }[]): MapIcon[] {
  return owned.map((place) => ({ x: place.x, z: place.z, color: place.livedIn ? '#d99c00' : '#1a8a4a', glyph: '⌂', name: place.name }));
}

export function venueIcons(): readonly MapIcon[] {
  const icons: MapIcon[] = [];
  for (const lot of CITY_MAP.lots) {
    if (lot.kind !== 'venue' || !lot.entrance || !lot.venueId) continue;
    const [color, glyph] = ICON[lot.archetype ?? 'shop'];
    icons.push({ x: (lot.footprint.minX + lot.footprint.maxX) / 2, z: (lot.footprint.minZ + lot.footprint.maxZ) / 2, color, glyph, name: findVenue(lot.venueId)?.name ?? lot.venueId });
  }
  return icons;
}
