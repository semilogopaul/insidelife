import { describe, expect, it } from 'vitest';
import { AD_SLOTS } from '../catalog/ad-inventory.js';
import { DISTRICTS, DISTRICT_IDS } from '../catalog/geography.js';

const LAGOS_DISTRICT_IDS = DISTRICT_IDS.filter((id) => DISTRICTS[id].cityId === 'lagos');
import { VENUES } from '../catalog/venues.js';
import { hashString } from '../random/rng.js';
import { AD_PLACEMENTS } from './ad-placements.js';
import { CARRIAGEWAY_HALF_WIDTH, CITY_CELL_SIZE, LANE_WIDTH, ROAD_LINE_WIDTH } from './city-layout.js';
import {
  CITY_GEOMETRY_VERSION,
  CITY_MAP,
  cellBounds,
  cellKindAt,
  colWidth,

  homeLots,
  isRoadCol,
  isRoadRow,
  layoutToWorld,
  migrateWorldPoint,
  rowDepth,
  venueLot,
  worldToLayout,
  type CityBounds,
} from './city-map.js';
import { findRoute, nearestRoadPoint } from './routing.js';
import { SERVICE_POINTS } from './service-points.js';
import { homeLotOf, venueEntrance } from './world-map.js';

/**
 * The four-lane widening moved every road line outwards; nothing persisted may notice. Bookings point at ad spot ids,
 * houses at `homeLotOf` lots, GPS and doors at venue lots, the fuel/mechanic flows at service point ids. These pins
 * were captured from the two-lane city and must never change: if one fails, a player's data now points somewhere else.
 */

const sig = (parts: readonly (string | number)[][]): number => hashString(parts.map((part) => part.join('|')).join(';'));

describe('widening keeps every id', () => {
  it('keeps every lot: id, kind, district, venue, front, door, street, cells and seed', () => {
    // 882 lots before the multi-city work; 875 after it: the General Aviation Terminal (mmia-gat) took eight infill cells (one lot of 4 × 2).
    // 873 with the hotels: five more lots, seven fewer filler lots (infill cells behind three office cells at bends; the two on
    // Victoria Island stand on the eastern column of Eko Hotel and of Eko Atlantic, whose doors did not move).
    const lagos = CITY_MAP.lots.filter((l) => DISTRICTS[l.districtId].cityId === 'lagos');
    expect(lagos).toHaveLength(882 - 8 + 1 + 5 - 7);
    const lots = lagos.map((l) => [l.id, l.kind, l.districtId, l.venueId ?? '', l.archetype ?? '', l.front ?? '', l.entrance ? 'door' : '', l.street ?? '', l.cells.join(','), l.seed]);
    expect(sig(lots)).toBe(2_988_736_327);
  });

  it('keeps every district’s home lots, so `homeLotOf` lands every house and family home on the same lot', () => {
    expect(hashString(LAGOS_DISTRICT_IDS.map((d) => `${d}:${homeLots(d).map((l) => l.id).join(',')}`).join(';'))).toBe(3_072_173_288);
    const owned = LAGOS_DISTRICT_IDS.map((d) => Array.from({ length: 40 }, (_, i) => homeLotOf(`property:p-${i}`, d)?.id ?? '-').join(','));
    expect(hashString(owned.join(';'))).toBe(2_405_394_939);
  });

  it('keeps every filling station and mechanic on its lot, with its name', () => {
    expect(sig(SERVICE_POINTS.filter((p) => DISTRICTS[p.districtId].cityId === 'lagos').map((p) => [p.id, p.kind, p.lotId, p.name, p.street, p.districtId]))).toBe(321_660_306);
  });

  it('keeps every ad spot and bookable slot: id, kind, district, street, venue, name, tier and price', () => {
    expect(sig(AD_PLACEMENTS.filter((s) => s.cityId === 'lagos').map((s) => [s.id, s.kind, s.districtId, s.street, s.venueId ?? '']))).toBe(3_852_550_639);
    expect(sig(AD_SLOTS.filter((s) => !s.districtId || DISTRICTS[s.districtId].cityId === 'lagos').map((s) => [s.id, s.kind, s.name, s.districtId ?? '', s.tier, s.weekPriceKobo, s.maxConcurrentAds]))).toBe(3_659_380_086);
  });

  it('keeps every venue on its authored lot and street', () => {
    const venues = VENUES.filter((v) => DISTRICTS[v.districtId].cityId === 'lagos' && v.id !== 'mmia-gat').map((v) => {
      const lot = venueLot(v.id);
      return [v.id, lot?.id ?? '', lot?.cells.join(',') ?? '', lot?.front ?? '', lot?.street ?? ''];
    });
    expect(sig(venues)).toBe(2_744_238_424);
  });
});

describe('widening moves things outwards with the road (layout → world)', () => {
  const check = (rows: readonly Row[], now: (id: string) => { readonly x: number; readonly z: number } | undefined): void => {
    for (const [id, x, z] of rows) {
      const current = now(id);
      expect(current, id).toBeDefined();
      const moved = layoutToWorld({ x, z });
      expect(Math.hypot(moved.x - current!.x, moved.z - current!.z), id).toBeLessThan(0.01);
    }
  };

  it('carries every first-city venue door, station, premium board and ad spot onto today’s', () => {
    check(LEGACY_VENUE_DOORS, (id) => venueEntrance(id)?.position);
    check(LEGACY_SERVICE_POINTS, (id) => SERVICE_POINTS.find((point) => point.id === id)?.entrance.position);
    check(LEGACY_PREMIUM_BOARDS, (id) => CITY_MAP.billboards.find((board) => board.slotId === id)?.position);
    // A spot's anchor is where it was picked; its board may stand a few metres along the kerb to clear a door.
    check(LEGACY_AD_SPOTS, (id) => AD_PLACEMENTS.find((spot) => spot.id === id)?.anchor);
  });

  it('is monotonic and invertible, keeps lot cells 10 m and widens every road line to four lanes', () => {
    for (let x = -330; x <= 330; x += 0.73) {
      const a = layoutToWorld({ x, z: 0 }).x;
      const b = layoutToWorld({ x: x + 0.01, z: 0 }).x;
      expect(b).toBeGreaterThan(a);
      expect(worldToLayout({ x: a, z: 0 }).x).toBeCloseTo(x, 9);
    }
    for (let col = 0; col < CITY_MAP.cols; col++) expect(colWidth(col)).toBe(isRoadCol(col) ? ROAD_LINE_WIDTH : CITY_CELL_SIZE);
    for (let row = 0; row < CITY_MAP.rows; row++) expect(rowDepth(row)).toBe(isRoadRow(row) ? ROAD_LINE_WIDTH : CITY_CELL_SIZE);
    for (const tile of CITY_MAP.roadTiles) {
      if (tile.mask & 5) expect(tile.width, `${tile.col},${tile.row}`).toBe(ROAD_LINE_WIDTH);
      if (tile.mask & 10) expect(tile.depth, `${tile.col},${tile.row}`).toBe(ROAD_LINE_WIDTH);
    }
    expect(2 * CARRIAGEWAY_HALF_WIDTH).toBe(4 * LANE_WIDTH);
  });

  it('migrates positions saved before the widening exactly once', () => {
    const old = { x: LEGACY_VENUE_DOORS[0]![1], z: LEGACY_VENUE_DOORS[0]![2], heading: 1.2 };
    const moved = migrateWorldPoint(old, undefined);
    expect(moved.heading).toBe(1.2);
    expect(moved).toMatchObject(layoutToWorld(old));
    expect(migrateWorldPoint(moved, CITY_GEOMETRY_VERSION)).toBe(moved);
    expect(migrateWorldPoint(old, 1)).toEqual(moved);
  });
});

describe('four-lane geometry invariants', () => {
  const overlaps = (a: CityBounds, b: CityBounds): boolean => a.minX < b.maxX - 1e-9 && b.minX < a.maxX - 1e-9 && a.minZ < b.maxZ - 1e-9 && b.minZ < a.maxZ - 1e-9;

  it('never lets a lot overlap a road', () => {
    const roads = CITY_MAP.roadTiles.map((tile) => cellBounds(tile.col, tile.row));
    for (const lot of CITY_MAP.lots) for (const road of roads) expect(overlaps(lot.footprint, road), lot.id).toBe(false);
  }, 30_000);

  it('reaches every door from the road graph, with the car parked in the kerbside lane', () => {
    // Each city is one connected road graph: from a venue in the city to every door in it.
    const origin: Readonly<Record<string, string>> = { lagos: 'unilag', abuja: 'wuse-market' };
    const doors = [...CITY_MAP.lots.flatMap((lot) => (lot.entrance ? [[lot.id, lot.entrance, DISTRICTS[lot.districtId].cityId] as const] : [])), ...SERVICE_POINTS.map((point) => [point.id, point.entrance, DISTRICTS[point.districtId].cityId] as const)];
    expect(doors.length).toBeGreaterThan(500);
    for (const [id, entrance, city] of doors) {
      const from = venueEntrance(origin[city]!)!.position;
      expect(findRoute(from, entrance.position), id).not.toBeNull();
      expect(['road', 'bridge', 'roundabout'], id).toContain(cellKindAt(entrance.parking));
      const kerb = nearestRoadPoint(entrance.parking)!;
      expect(kerb.distance, id).toBeGreaterThanOrEqual(LANE_WIDTH);
      expect(kerb.distance, id).toBeLessThanOrEqual(CARRIAGEWAY_HALF_WIDTH - 1);
      expect(nearestRoadPoint(entrance.position)!.distance, id).toBeLessThanOrEqual(ROAD_LINE_WIDTH / 2 + 1);
    }
  }, 30_000);
});

// ---------------------------------------------------------------------------------------------------------------

/**
 * Where persisted references pointed in the first city (one 10 m cell per road, before the four-lane widening), captured
 * from that build: venue doors, filling stations and mechanics, premium boards and every generated ad spot, as
 * [id, x, z] in the old world metres. The tests above check each still exists and that `layoutToWorld`
 * carries the old point onto the new one (the same thing, moved outwards with the road). Never regenerate it.
 */
type Row = readonly [id: string, x: number, z: number];

const LEGACY_VENUE_DOORS: readonly Row[] = [["mmia-airport",-265,-170.9],["alausa-secretariat",-165,-170.9],["computer-village",-205,-130.9],["ikeja-city-mall",-165,-130.9],["ikeja-cinema",-125,-159.1],["cbt-ikeja",-215,-119.1],["berger-car-market",-85,-170.9],["ikeja-gra-lounge",-95,-159.1],["lasuth",-255,-119.1],["unilag",-59.1,-35],["yabatech",-85,0.9],["yaba-market",-85,-50.9],["yaba-hub",-70.9,-25],["cbt-yaba",-135,-79.1],["yaba-gym",-125,-39.1],["yaba-salon",-135,0.9],["luth",-205,-39.1],["mushin-market",-245,-50.9],["mushin-pharmacy",-179.1,-35],["national-stadium",-145,99.1],["shitta-amala",-135,40.9],["surulere-clinic",-205,59.1],["surulere-school",-205,99.1],["surulere-church",-155,40.9],["lasu",-269.1,175],["ikorodu-garage",165,-159.1],["balogun-market",-55,109.1],["marina",-69.1,135],["lagos-general-hospital",-15,90.9],["freedom-park",5,139.1],["central-mosque",5,109.1],["cms-motor-park",-15,120.9],["ikoyi-club",75,79.1],["immigration-ikoyi",35,99.1],["ikoyi-fine-dining",65,110.9],["ikoyi-estate-agency",25,110.9],["eko-hotel",35,150.9],["the-vault",75,150.9],["vi-lounge",95,150.9],["eko-atlantic",-55,169.1],["island-specialist",-15,150.9],["tarkwa-bay",-95,180.9],["elegushi-beach",185,180.9],["lekki-conservation",170.9,95],["lekki-mall",155,139.1],["lekki-gym",210.9,155],["lekki-car-mart",185,150.9],["lekki-estate-agency",155,169.1],["lekki-church",185,120.9],["pan-atlantic",239.1,95],["ajah-market",250.9,105],["epe-land-office",300.9,105],["obo-mansion",95,110.9],["air-obo",100.9,105],["dangote-refinery",289.1,55],["new-afrika-shrine",-115,-170.9],["allen-nights",-55,-90.9],["yaba-left-joint",-30.9,5],["admiralty-nights",145,79.1],["bourdillon-lounge",65,99.1],["lekki-rooftop",215,109.1],["quilox",115,150.9],["cubana-lagos",135,150.9],["club-57",5,169.1]];

const LEGACY_SERVICE_POINTS: readonly Row[] = [["fuel:12:3",-195,-170.9],["fuel:30:3",-15,-170.9],["fuel:28:20",-30.9,-5],["fuel:8:17",-230.9,-35],["fuel:12:25",-195,40.9],["fuel:5:32",-265,110.9],["fuel:53:6",210.9,-145],["fuel:62:27",300.9,65],["fuel:39:32",75,110.9],["fuel:46:30",145,90.9],["fuel:55:33",239.1,125],["mechanic:15:13",-165,-79.1],["mechanic:3:11",-280.9,-95],["mechanic:30:5",-10.9,-155],["mechanic:19:32",-125,110.9],["mechanic:40:3",85,-170.9],["mechanic:34:28",25,79.1],["mechanic:58:37",265,169.1]];

const LEGACY_PREMIUM_BOARDS: readonly Row[] = [["mmia-arrivals",-270,-180.6],["third-mainland-north",-16,-115],["third-mainland-south",5,75],["lekki-toll-gate",135,145],["ozumba-mbadiwe",85,136],["ikeja-allen",-177.5,-117.5],["yaba-hub",-71.45,-25],["surulere-stadium",-124,97],["balogun-market",-60,93.5],["vi-towers",80,168.55],["ajah-roundabout",245,145],["ikorodu-garage",160,-157]];

const LEGACY_AD_SPOTS: readonly Row[] = [["bs-10-16-n",-217.2,-50.12],["bs-11-12-p",-207.2,-79.88],["bs-11-20-p",-207.2,0.12],["bs-11-24-n",-207.2,29.88],["bs-11-27-p",-207.2,70.12],["bs-11-31-p",-207.2,110.12],["bs-12-16-p",-197.2,-39.88],["bs-12-4-p",-197.2,-159.88],["bs-13-29-p",-179.88,82.8],["bs-14-12-p",-177.2,-79.88],["bs-14-16-p",-177.2,-39.88],["bs-14-20-n",-177.2,-10.12],["bs-14-24-n",-177.2,29.88],["bs-15-1-n",-167.2,-200.12],["bs-15-27-n",-167.2,59.88],["bs-16-12-p",-157.2,-79.88],["bs-16-16-n",-157.2,-50.12],["bs-16-31-p",-157.2,110.12],["bs-16-8-p",-157.2,-119.88],["bs-17-10-p",-139.88,-107.2],["bs-17-2-n",-150.12,-187.2],["bs-17-20-n",-147.2,-10.12],["bs-17-25-n",-150.12,42.8],["bs-17-6-n",-150.12,-147.2],["bs-18-27-p",-137.2,70.12],["bs-18-4-n",-137.2,-170.12],["bs-18-8-n",-137.2,-130.12],["bs-2-27-n",-297.2,59.88],["bs-20-12-p",-117.2,-79.88],["bs-20-16-p",-117.2,-39.88],["bs-20-20-n",-117.2,-10.12],["bs-20-24-n",-117.2,29.88],["bs-21-10-n",-110.12,-107.2],["bs-21-5-p",-99.88,-157.2],["bs-22-16-p",-97.2,-39.88],["bs-22-8-n",-97.2,-130.12],["bs-23-12-n",-87.2,-90.12],["bs-23-20-n",-87.2,-10.12],["bs-23-24-p",-87.2,40.12],["bs-23-38-p",-87.2,180.12],["bs-24-34-n",-80.12,132.8],["bs-25-10-n",-70.12,-107.2],["bs-25-22-n",-70.12,12.8],["bs-25-32-n",-67.2,109.88],["bs-25-38-n",-67.2,169.88],["bs-25-7-p",-59.88,-137.2],["bs-26-35-p",-57.2,150.12],["bs-26-4-p",-57.2,-159.88],["bs-27-12-n",-47.2,-90.12],["bs-27-25-p",-47.2,50.12],["bs-27-38-p",-47.2,180.12],["bs-28-34-n",-40.12,132.8],["bs-29-14-n",-30.12,-67.2],["bs-29-18-n",-30.12,-27.2],["bs-29-20-p",-19.88,-7.2],["bs-29-22-n",-30.12,12.8],["bs-29-24-p",-19.88,32.8],["bs-29-29-n",-27.2,79.88],["bs-29-4-n",-27.2,-170.12],["bs-29-8-n",-27.2,-130.12],["bs-3-4-p",-287.2,-159.88],["bs-30-32-n",-17.2,109.88],["bs-30-35-n",-17.2,139.88],["bs-31-9-p",0.12,-117.2],["bs-32-29-p",2.8,90.12],["bs-34-29-n",22.8,79.88],["bs-34-35-p",22.8,150.12],["bs-34-38-p",22.8,180.12],["bs-35-31-p",32.8,110.12],["bs-36-29-p",42.8,90.12],["bs-36-35-n",42.8,139.88],["bs-36-38-n",42.8,169.88],["bs-38-29-p",62.8,90.12],["bs-38-38-p",62.8,180.12],["bs-39-31-p",72.8,110.12],["bs-4-11-n",-280.12,-97.2],["bs-4-13-n",-280.12,-77.2],["bs-4-18-n",-280.12,-27.2],["bs-4-23-n",-280.12,22.8],["bs-4-25-p",-269.88,42.8],["bs-4-28-p",-269.88,72.8],["bs-4-32-n",-280.12,112.8],["bs-4-34-n",-280.12,132.8],["bs-40-20-n",82.8,-10.12],["bs-40-29-n",82.8,79.88],["bs-41-38-p",92.8,180.12],["bs-42-20-n",102.8,-10.12],["bs-42-29-n",102.8,79.88],["bs-42-37-p",110.12,162.8],["bs-42-4-p",102.8,-159.88],["bs-42-8-p",102.8,-119.88],["bs-44-2-n",119.88,-187.2],["bs-44-6-p",130.12,-147.2],["bs-45-4-n",132.8,-170.12],["bs-46-29-p",142.8,90.12],["bs-46-38-p",142.8,180.12],["bs-47-8-n",152.8,-130.12],["bs-48-1-n",162.8,-200.12],["bs-48-37-n",159.88,162.8],["bs-49-32-n",172.8,109.88],["bs-5-16-n",-267.2,-50.12],["bs-5-20-p",-267.2,0.12],["bs-5-4-p",-267.2,-159.88],["bs-5-8-p",-267.2,-119.88],["bs-50-1-n",182.8,-200.12],["bs-50-8-p",182.8,-119.88],["bs-51-32-p",192.8,120.12],["bs-51-35-p",192.8,150.12],["bs-51-38-p",192.8,180.12],["bs-51-4-n",192.8,-170.12],["bs-53-32-p",212.8,120.12],["bs-53-35-p",212.8,150.12],["bs-53-38-n",212.8,169.88],["bs-54-1-p",222.8,-189.88],["bs-54-4-p",222.8,-159.88],["bs-55-32-n",232.8,109.88],["bs-55-38-p",232.8,180.12],["bs-56-30-p",250.12,92.8],["bs-57-38-p",252.8,180.12],["bs-57-4-n",252.8,-170.12],["bs-59-35-p",272.8,150.12],["bs-59-4-n",272.8,-170.12],["bs-59-8-p",272.8,-119.88],["bs-6-12-p",-257.2,-79.88],["bs-6-35-p",-257.2,150.12],["bs-60-38-n",282.8,169.88],["bs-61-10-n",289.88,-107.2],["bs-61-12-n",289.88,-87.2],["bs-61-15-p",300.12,-57.2],["bs-61-17-n",289.88,-37.2],["bs-61-19-p",300.12,-17.2],["bs-61-21-p",300.12,2.8],["bs-61-23-p",300.12,22.8],["bs-61-25-n",289.88,42.8],["bs-61-30-n",289.88,92.8],["bs-61-33-p",300.12,122.8],["bs-61-5-n",289.88,-157.2],["bs-61-7-p",300.12,-137.2],["bs-62-26-p",302.8,60.12],["bs-7-20-p",-247.2,0.12],["bs-7-31-p",-247.2,110.12],["bs-7-8-n",-247.2,-130.12],["bs-8-12-p",-237.2,-79.88],["bs-8-16-p",-237.2,-39.88],["bs-8-4-p",-237.2,-159.88],["bs-9-19-p",-219.88,-17.2],["bs-9-26-n",-230.12,52.8],["bs-9-28-n",-230.12,72.8],["bs-9-30-p",-219.88,92.8],["bs-9-9-n",-230.12,-117.2],["led-19-1",-174,73],["led-19-10",-123,97],["led-19-11",-174,97],["led-19-12",-162,97],["led-19-13",-138,97],["led-19-14",-126,97],["led-19-15",-177,73],["led-19-16",-177,79],["led-19-2",-162,73],["led-19-3",-150,73],["led-19-4",-138,73],["led-19-5",-126,73],["led-19-6",-123,73],["led-19-7",-123,79],["led-19-8",-123,85],["led-19-9",-123,91],["mk-11-1",-95,-77.5],["mk-11-2",-85,-77.5],["mk-11-3",-75,-77.5],["mk-11-4",-72.5,-75],["mk-11-5",-72.5,-65],["mk-11-6",-72.5,-55],["mk-11-7",-95,-52.5],["mk-11-8",-75,-52.5],["mk-17-1",-263.333,-77.5],["mk-17-2",-250,-77.5],["mk-17-3",-236.667,-77.5],["mk-17-4",-232.5,-75],["mk-17-5",-232.5,-65],["mk-17-6",-232.5,-55],["mk-17-7",-263.333,-52.5],["mk-17-8",-236.667,-52.5],["mk-2-1",-215,-157.5],["mk-2-2",-205,-157.5],["mk-2-3",-195,-157.5],["mk-2-4",-192.5,-155],["mk-2-5",-192.5,-145],["mk-2-6",-192.5,-135],["mk-2-7",-215,-132.5],["mk-2-8",-195,-132.5],["mk-26-1",-66.667,92.5],["mk-26-2",-60,92.5],["mk-26-3",-53.333,92.5],["mk-26-4",-52.5,93.333],["mk-26-5",-52.5,100],["mk-26-6",-66.667,107.5],["mk-26-7",-67.5,93.333],["mk-26-8",-67.5,100],["mk-50-1",260,102.5],["mk-50-2",266.667,102.5],["mk-50-3",267.5,103.333],["mk-50-4",267.5,110],["mk-50-5",267.5,116.667],["mk-50-6",253.333,117.5],["mk-50-7",260,117.5],["mk-50-8",266.667,117.5],["mp-25-1",142.857,-158],["mp-25-2",148.571,-158],["mp-25-3",154.286,-158],["mp-25-4",177.143,-158],["mp-31-1",-28.571,122],["mp-31-2",-25.714,122],["mp-31-3",-22.857,122],["sb-10-4-p",-212.8,-160.18],["sb-10-8-n",-212.8,-129.82],["sb-11-31-p",-202.8,109.82],["sb-12-24-p",-192.8,39.82],["sb-12-4-n",-192.8,-169.82],["sb-12-8-n",-192.8,-129.82],["sb-13-10-p",-180.18,-102.8],["sb-13-2-p",-180.18,-182.8],["sb-13-5-p",-180.18,-152.8],["sb-14-1-n",-172.8,-199.82],["sb-15-24-p",-162.8,39.82],["sb-15-31-n",-162.8,100.18],["sb-16-1-n",-152.8,-199.82],["sb-16-4-n",-152.8,-169.82],["sb-16-8-p",-152.8,-120.18],["sb-18-24-n",-132.8,30.18],["sb-18-31-p",-132.8,109.82],["sb-18-4-p",-132.8,-160.18],["sb-18-8-n",-132.8,-129.82],["sb-20-24-p",-112.8,39.82],["sb-21-11-p",-100.18,-92.8],["sb-21-13-n",-109.82,-72.8],["sb-21-15-p",-100.18,-52.8],["sb-21-17-p",-100.18,-32.8],["sb-21-19-n",-109.82,-12.8],["sb-21-22-p",-100.18,17.2],["sb-21-26-p",-100.18,57.2],["sb-21-28-n",-109.82,77.2],["sb-21-30-n",-109.82,97.2],["sb-21-5-p",-100.18,-152.8],["sb-21-7-p",-100.18,-132.8],["sb-21-9-p",-100.18,-112.8],["sb-22-4-n",-92.8,-169.82],["sb-23-38-p",-82.8,179.82],["sb-24-30-n",-79.82,97.2],["sb-24-33-n",-79.82,127.2],["sb-24-4-p",-72.8,-160.18],["sb-25-13-n",-69.82,-72.8],["sb-25-15-p",-60.18,-52.8],["sb-25-19-p",-60.18,-12.8],["sb-25-21-n",-69.82,7.2],["sb-25-23-p",-60.18,27.2],["sb-25-35-p",-62.8,149.82],["sb-25-38-p",-62.8,179.82],["sb-26-29-n",-52.8,80.18],["sb-26-4-p",-52.8,-160.18],["sb-27-35-n",-42.8,140.18],["sb-27-38-n",-42.8,170.18],["sb-27-8-n",-42.8,-129.82],["sb-28-4-p",-32.8,-160.18],["sb-29-29-p",-22.8,89.82],["sb-29-35-p",-22.8,149.82],["sb-29-38-p",-22.8,179.82],["sb-29-8-n",-22.8,-129.82],["sb-3-31-n",-282.8,100.18],["sb-30-4-n",-12.8,-169.82],["sb-31-35-p",-2.8,149.82],["sb-31-38-p",-2.8,179.82],["sb-31-5-p",-0.18,-152.8],["sb-31-7-p",-0.18,-132.8],["sb-31-9-p",-0.18,-112.8],["sb-32-29-p",7.2,89.82],["sb-34-35-p",27.2,149.82],["sb-34-38-p",27.2,179.82],["sb-35-29-p",37.2,89.82],["sb-35-31-p",37.2,109.82],["sb-36-38-n",47.2,170.18],["sb-37-33-n",50.18,127.2],["sb-38-35-n",67.2,140.18],["sb-38-38-p",67.2,179.82],["sb-39-31-p",77.2,109.82],["sb-39-4-n",77.2,-169.82],["sb-4-11-n",-279.82,-92.8],["sb-4-13-n",-279.82,-72.8],["sb-4-15-n",-279.82,-52.8],["sb-4-18-n",-279.82,-22.8],["sb-4-22-n",-279.82,17.2],["sb-4-25-p",-270.18,47.2],["sb-4-29-p",-270.18,87.2],["sb-4-33-n",-279.82,127.2],["sb-4-37-p",-270.18,167.2],["sb-4-5-n",-279.82,-152.8],["sb-4-7-p",-270.18,-132.8],["sb-4-9-n",-279.82,-112.8],["sb-40-29-p",87.2,89.82],["sb-41-38-n",97.2,170.18],["sb-41-4-n",97.2,-169.82],["sb-42-29-p",107.2,89.82],["sb-43-35-n",117.2,140.18],["sb-43-4-p",117.2,-160.18],["sb-44-38-p",127.2,179.82],["sb-45-4-n",137.2,-169.82],["sb-46-29-p",147.2,89.82],["sb-48-31-p",169.82,107.2],["sb-48-33-p",169.82,127.2],["sb-48-36-n",160.18,157.2],["sb-49-35-p",177.2,149.82],["sb-49-4-p",177.2,-160.18],["sb-51-35-p",197.2,149.82],["sb-51-4-n",197.2,-169.82],["sb-53-4-n",217.2,-169.82],["sb-54-35-n",227.2,140.18],["sb-55-4-p",237.2,-160.18],["sb-58-35-p",267.2,149.82],["sb-58-4-p",267.2,-160.18],["sb-6-31-n",-252.8,100.18],["sb-6-4-n",-252.8,-169.82],["sb-60-35-p",287.2,149.82],["sb-60-4-n",287.2,-169.82],["sb-61-12-p",299.82,-82.8],["sb-61-14-n",290.18,-62.8],["sb-61-19-n",290.18,-12.8],["sb-61-21-p",299.82,7.2],["sb-61-23-n",290.18,27.2],["sb-61-25-p",299.82,47.2],["sb-61-28-n",290.18,77.2],["sb-61-30-p",299.82,97.2],["sb-61-32-n",290.18,117.2],["sb-61-6-n",290.18,-142.8],["sb-61-9-n",290.18,-112.8],["sb-8-31-p",-232.8,109.82],["sb-8-4-p",-232.8,-160.18],["sb-8-8-p",-232.8,-120.18],["sb-9-10-p",-220.18,-102.8],["sb-9-13-p",-220.18,-72.8],["sb-9-15-n",-229.82,-52.8],["sb-9-17-n",-229.82,-32.8],["sb-9-19-p",-220.18,-12.8],["sb-9-21-n",-229.82,7.2],["sb-9-23-p",-220.18,27.2],["tt-10-20-n",-214.6,-9.97],["tt-10-31-p",-214.6,109.97],["tt-11-24-p",-204.6,39.97],["tt-11-4-n",-204.6,-169.97],["tt-12-12-n",-194.6,-89.97],["tt-12-24-n",-194.6,30.03],["tt-12-31-n",-194.6,100.03],["tt-13-10-n",-189.97,-104.6],["tt-13-11-p",-180.03,-94.6],["tt-13-13-n",-189.97,-74.6],["tt-13-14-p",-180.03,-64.6],["tt-13-17-n",-189.97,-34.6],["tt-13-2-n",-189.97,-184.6],["tt-13-21-n",-189.97,5.4],["tt-13-26-n",-189.97,55.4],["tt-13-29-n",-189.97,85.4],["tt-13-5-n",-189.97,-154.6],["tt-13-7-p",-180.03,-134.6],["tt-14-16-n",-174.6,-49.97],["tt-14-20-p",-174.6,-0.03],["tt-14-24-p",-174.6,39.97],["tt-14-27-p",-174.6,69.97],["tt-14-31-n",-174.6,100.03],["tt-14-4-p",-174.6,-160.03],["tt-15-16-p",-164.6,-40.03],["tt-16-1-p",-154.6,-190.03],["tt-16-12-n",-154.6,-89.97],["tt-16-31-n",-154.6,100.03],["tt-16-4-p",-154.6,-160.03],["tt-16-8-n",-154.6,-129.97],["tt-17-10-n",-149.97,-104.6],["tt-17-26-p",-140.03,55.4],["tt-17-9-p",-140.03,-114.6],["tt-18-12-n",-134.6,-89.97],["tt-18-16-p",-134.6,-40.03],["tt-19-24-p",-124.6,39.97],["tt-19-4-n",-124.6,-169.97],["tt-19-8-n",-124.6,-129.97],["tt-2-4-n",-294.6,-169.97],["tt-20-16-n",-114.6,-49.97],["tt-20-20-p",-114.6,-0.03],["tt-20-27-n",-114.6,60.03],["tt-20-31-p",-114.6,109.97],["tt-20-8-p",-114.6,-120.03],["tt-21-25-n",-109.97,45.4],["tt-21-29-n",-109.97,85.4],["tt-22-12-n",-94.6,-89.97],["tt-22-16-n",-94.6,-49.97],["tt-22-24-p",-94.6,39.97],["tt-23-16-p",-84.6,-40.03],["tt-23-24-n",-84.6,30.03],["tt-23-8-p",-84.6,-120.03],["tt-24-12-p",-74.6,-80.03],["tt-24-16-n",-74.6,-49.97],["tt-24-20-p",-74.6,-0.03],["tt-24-36-p",-70.03,155.4],["tt-24-37-n",-79.97,165.4],["tt-24-8-n",-74.6,-129.97],["tt-25-14-p",-60.03,-64.6],["tt-25-22-p",-60.03,15.4],["tt-25-6-n",-69.97,-144.6],["tt-25-9-n",-69.97,-114.6],["tt-26-25-n",-54.6,40.03],["tt-26-32-p",-54.6,119.97],["tt-26-35-n",-54.6,140.03],["tt-26-38-p",-54.6,179.97],["tt-26-8-p",-54.6,-120.03],["tt-27-12-p",-44.6,-80.03],["tt-27-29-p",-44.6,89.97],["tt-27-35-p",-44.6,149.97],["tt-28-12-n",-34.6,-89.97],["tt-28-25-n",-34.6,40.03],["tt-28-30-p",-30.03,95.4],["tt-28-33-n",-39.97,125.4],["tt-28-36-p",-30.03,155.4],["tt-28-37-n",-39.97,165.4],["tt-28-8-n",-34.6,-129.97],["tt-29-13-n",-29.97,-74.6],["tt-29-15-p",-20.03,-54.6],["tt-29-16-n",-29.97,-44.6],["tt-29-18-p",-20.03,-24.6],["tt-29-32-p",-24.6,119.97],["tt-29-35-n",-24.6,140.03],["tt-3-27-p",-284.6,69.97],["tt-30-38-n",-14.6,170.03],["tt-30-8-n",-14.6,-129.97],["tt-32-32-p",5.4,119.97],["tt-32-35-p",5.4,149.97],["tt-33-30-n",10.03,95.4],["tt-33-33-p",19.97,125.4],["tt-33-34-n",10.03,135.4],["tt-33-36-p",19.97,155.4],["tt-33-37-n",10.03,165.4],["tt-34-31-n",25.4,100.03],["tt-34-38-n",25.4,170.03],["tt-35-35-n",35.4,140.03],["tt-35-38-p",35.4,179.97],["tt-36-29-n",45.4,80.03],["tt-37-30-n",50.03,95.4],["tt-37-32-n",50.03,115.4],["tt-37-33-p",59.97,125.4],["tt-37-36-p",59.97,155.4],["tt-38-29-n",65.4,80.03],["tt-38-38-n",65.4,170.03],["tt-4-10-n",-279.97,-104.6],["tt-4-11-p",-270.03,-94.6],["tt-4-13-p",-270.03,-74.6],["tt-4-14-n",-279.97,-64.6],["tt-4-21-p",-270.03,5.4],["tt-4-26-n",-279.97,55.4],["tt-4-29-n",-279.97,85.4],["tt-4-32-p",-270.03,115.4],["tt-4-34-p",-270.03,135.4],["tt-4-36-n",-279.97,155.4],["tt-4-5-p",-270.03,-154.6],["tt-4-7-n",-279.97,-134.6],["tt-4-9-p",-270.03,-114.6],["tt-41-21-n",90.03,5.4],["tt-41-27-p",99.97,65.4],["tt-41-30-n",90.03,95.4],["tt-41-8-n",95.4,-129.97],["tt-42-20-p",105.4,-0.03],["tt-42-36-p",109.97,155.4],["tt-43-38-p",115.4,179.97],["tt-44-3-p",129.97,-174.6],["tt-44-38-n",125.4,170.03],["tt-44-5-p",129.97,-154.6],["tt-45-1-p",135.4,-190.03],["tt-45-8-p",135.4,-120.03],["tt-46-1-n",145.4,-199.97],["tt-46-38-n",145.4,170.03],["tt-46-8-n",145.4,-129.97],["tt-47-32-p",155.4,119.97],["tt-47-38-p",155.4,179.97],["tt-48-30-n",160.03,95.4],["tt-48-34-n",160.03,135.4],["tt-48-37-p",169.97,165.4],["tt-48-8-p",165.4,-120.03],["tt-49-1-n",175.4,-199.97],["tt-49-8-n",175.4,-129.97],["tt-5-20-n",-264.6,-9.97],["tt-5-35-p",-264.6,149.97],["tt-50-32-n",185.4,110.03],["tt-50-38-n",185.4,170.03],["tt-51-8-p",195.4,-120.03],["tt-52-33-n",200.03,125.4],["tt-52-36-n",200.03,155.4],["tt-52-6-n",200.03,-144.6],["tt-53-1-n",215.4,-199.97],["tt-54-32-n",225.4,110.03],["tt-54-38-p",225.4,179.97],["tt-54-8-p",225.4,-120.03],["tt-56-1-n",245.4,-199.97],["tt-56-33-p",249.97,125.4],["tt-56-37-n",240.03,165.4],["tt-57-8-p",255.4,-120.03],["tt-58-38-n",265.4,170.03],["tt-58-8-n",265.4,-129.97],["tt-6-16-p",-254.6,-40.03],["tt-6-35-n",-254.6,140.03],["tt-6-8-n",-254.6,-129.97],["tt-60-38-p",285.4,179.97],["tt-60-8-n",285.4,-129.97],["tt-61-10-p",299.97,-104.6],["tt-61-11-n",290.03,-94.6],["tt-61-14-p",299.97,-64.6],["tt-61-17-p",299.97,-34.6],["tt-61-20-n",290.03,-4.6],["tt-61-29-p",299.97,85.4],["tt-61-31-n",290.03,105.4],["tt-61-34-p",299.97,135.4],["tt-61-36-n",290.03,155.4],["tt-61-5-p",299.97,-154.6],["tt-7-4-n",-244.6,-169.97],["tt-8-12-n",-234.6,-89.97],["tt-8-16-n",-234.6,-49.97],["tt-8-20-p",-234.6,-0.03],["tt-8-35-p",-234.6,149.97],["tt-9-11-p",-220.03,-94.6],["tt-9-13-n",-229.97,-74.6],["tt-9-15-p",-220.03,-54.6],["tt-9-19-n",-229.97,-14.6],["tt-9-21-p",-220.03,5.4],["tt-9-23-n",-229.97,25.4],["tt-9-25-n",-229.97,45.4],["tt-9-26-p",-220.03,55.4],["tt-9-29-n",-229.97,85.4],["tt-9-35-n",-224.6,140.03],["tt-9-7-n",-229.97,-134.6],["tt-9-9-p",-220.03,-114.6]];
