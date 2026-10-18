import type { CityId, DistrictId } from '../catalog/geography.js';
import type { BillboardSlotId } from '../catalog/promotions.js';

/**
 * The authored layout of the drivable city: a compact, stylised Lagos on a 64 × 42 grid. Columns run west → east,
 * rows north → south (world +x is east, +z is south).
 *
 * Everything here is plain data in grid coordinates `[col, row]` (inclusive rectangles). `city-map.ts` turns it into
 * terrain, road tiles, a road graph and lots once at module load. Keep relative geography honest:
 * Mainland to the north-west, the Lagos Lagoon in the middle, the Island and the Lekki peninsula south-east,
 * the Atlantic along the south.
 *
 * Two coordinate systems: the *layout* is the uniform grid of 10 m cells the city was first built on (640 × 420 m),
 * and everything that names a thing (lot ids, home lots, ad spot ids, filling stations) is decided there, so ids never
 * depend on road widths. The *world* widens every grid line that carries a road to `ROAD_LINE_WIDTH` (four lanes);
 * other lines stay 10 m. `city-map.ts` maps layout → world (`layoutToWorld`).
 */

/** Inclusive cell rectangle `[c0, r0, c1, r1]`. */
export type CellRect = readonly [c0: number, r0: number, c1: number, r1: number];
export type CellCoord = readonly [col: number, row: number];
export type CompassSide = 'N' | 'E' | 'S' | 'W';

/** Lagos's own grid: 64 × 42 cells at the world's origin (everything Lagos is decided here and never moves). */
export const LAGOS_COLS = 64;
export const LAGOS_ROWS = 42;
/**
 * One world frame, two cities (docs/MULTI_CITY.md): Abuja's 56 × 40 grid sits `ABUJA_GAP` empty (water) cells east and
 * south of Lagos's corner, so no chunk, cell, route or minimap ever overlaps and no road ever joins them. A cell is
 * 10 m (roads widen), so the cities are ~600 m apart in the world; the real distance is a flight or an overnight bus.
 */
export const ABUJA_COLS = 56;
export const ABUJA_ROWS = 40;
export const ABUJA_GAP = 60;
/**
 * How far past a city's grid its scenery reaches (metres): scrub, trees and the flat land around it. The client never draws
 * more than ~385 m (fog far on high quality), and `CITY_SCENERY_REACH` plus that stays well inside the water between the cities,
 * so nothing of the other city is ever on screen (`abuja-city.spec.ts` and the frontend's `city-visibility.test.ts` check it).
 */
export const CITY_SCENERY_REACH: Readonly<Record<CityId, number>> = { lagos: 70, abuja: 160 };
/** Grid cell of Abuja's local `[0, 0]`. */
export const ABUJA_ORIGIN_COL = LAGOS_COLS + ABUJA_GAP;
export const ABUJA_ORIGIN_ROW = LAGOS_ROWS + ABUJA_GAP;
/** The whole grid (both cities and the water between). */
export const CITY_COLS = ABUJA_ORIGIN_COL + ABUJA_COLS;
export const CITY_ROWS = ABUJA_ORIGIN_ROW + ABUJA_ROWS;

/** Inclusive cell rectangle of a city in the grid. */
export const CITY_GRID_RECTS: Readonly<Record<CityId, CellRect>> = {
  lagos: [0, 0, LAGOS_COLS - 1, LAGOS_ROWS - 1],
  abuja: [ABUJA_ORIGIN_COL, ABUJA_ORIGIN_ROW, ABUJA_ORIGIN_COL + ABUJA_COLS - 1, ABUJA_ORIGIN_ROW + ABUJA_ROWS - 1],
};
/** Edge of one layout cell (metres); in the world, lot cells keep it and road lines widen to `ROAD_LINE_WIDTH`. */
export const CITY_CELL_SIZE = 10;
/** Lanes each way on every road (right-hand traffic: the inner lane is the fast lane). */
export const LANES_PER_DIRECTION = 2;
/** Width of one traffic lane (metres). */
export const LANE_WIDTH = 3.5;
/** Kerb to the road's centreline: two lanes each way. */
export const CARRIAGEWAY_HALF_WIDTH = LANES_PER_DIRECTION * LANE_WIDTH;
/** Pavement on the road cell between the kerb and the lot (the lot adds its own apron behind it). */
export const ROADSIDE_PAVEMENT = 1;
/** World width of a grid line (column or row) that carries a road: the carriageway plus a pavement each side. */
export const ROAD_LINE_WIDTH = 2 * (CARRIAGEWAY_HALF_WIDTH + ROADSIDE_PAVEMENT);
/** Half the carriageway in the layout (the first city's two-lane roads). */
export const LAYOUT_CARRIAGEWAY_HALF_WIDTH = 4;
/** Ajah-style roundabouts: the raised island and the outer kerb of the two-lane ring (metres from the centre). */
export const ROUNDABOUT_ISLAND_RADIUS = 5.5;
export const ROUNDABOUT_OUTER_RADIUS = 14.5;

/** District regions, painted in order (later rectangles win). Water left unpainted is assigned to the nearest district. */
const LAGOS_DISTRICT_RECTS: ReadonlyArray<readonly [DistrictId, CellRect]> = [
  ['ikeja', [0, 0, 31, 11]],
  ['yaba', [27, 5, 31, 11]],
  ['mushin', [0, 12, 16, 22]],
  ['yaba', [17, 12, 29, 25]],
  ['surulere', [8, 23, 21, 33]],
  ['ojo', [0, 23, 7, 41]],
  ['ojo', [8, 34, 11, 41]],
  ['ikorodu', [39, 0, 63, 8]],
  ['ikorodu', [59, 9, 63, 18]],
  ['epe', [59, 19, 63, 41]],
  ['lagos-island', [24, 29, 33, 34]],
  ['ikoyi', [34, 27, 42, 33]],
  ['banana-island', [38, 19, 43, 22]],
  ['victoria-island', [20, 35, 45, 41]],
  ['lekki', [46, 27, 53, 41]],
  ['ajah', [54, 27, 58, 41]],
  // Reclaimed land: OBO's waterfront estate at the end of Awolowo Road, and the refinery on the Lekki lagoon shore.
  ['ikoyi', [41, 30, 44, 34]],
  ['epe', [55, 19, 58, 26]],
];

export type TerrainPaint = 'land' | 'water' | 'sand';

/** Terrain, painted in order over an all-land grid. */
const LAGOS_TERRAIN_RECTS: ReadonlyArray<readonly [TerrainPaint, CellRect]> = [
  // Lagoon arm between Ikeja/Oworonshoki and Ikorodu (crossed by Ikorodu Road).
  ['water', [32, 0, 38, 9]],
  // The Lagos Lagoon.
  ['water', [32, 9, 58, 26]],
  ['water', [30, 10, 31, 26]],
  // Channel between Ebute-Metta and Lagos Island (Carter Bridge, Third Mainland Bridge landing).
  ['water', [22, 26, 33, 28]],
  // Harbour west of Lagos Island (Eko Bridge) opening to the sea.
  ['water', [22, 26, 23, 37]],
  ['water', [12, 34, 23, 41]],
  // Five Cowries Creek (Ikoyi ↔ VI) and the creek between Ikoyi and Lekki (Lekki-Ikoyi Link Bridge).
  ['water', [34, 34, 42, 34]],
  ['water', [43, 23, 45, 34]],
  // Banana Island sits in the lagoon.
  ['land', [38, 19, 43, 22]],
  // Reclaimed: OBO's estate (the jet apron and the creekside garden) and the Dangote Refinery on the lagoon shore.
  ['land', [43, 30, 44, 34]],
  ['land', [41, 34, 42, 34]],
  ['land', [55, 19, 58, 26]],
  // The Atlantic.
  ['water', [0, 41, 63, 41]],
  ['water', [12, 40, 63, 40]],
  // Beaches: Bar Beach (VI), Elegushi (Lekki), Ajah and Ibeju-Lekki shores, Ojo creek sand, Tarkwa Bay spit.
  ['sand', [24, 39, 63, 39]],
  ['sand', [0, 40, 11, 40]],
  ['sand', [20, 38, 23, 39]],
];

export type RoadClass = 'expressway' | 'arterial' | 'street';

export interface RoadSpec {
  readonly name: string;
  readonly class: RoadClass;
  /** Axis-aligned polyline in cell coordinates. */
  readonly points: readonly CellCoord[];
}

const road = (name: string, roadClass: RoadClass, ...points: CellCoord[]): RoadSpec => ({ name, class: roadClass, points });

/**
 * Named roads. Consecutive points must share a row or a column. Roads crossing water become bridges automatically;
 * a name change along a straight run splits the graph edge so GPS can say "Continue onto …".
 */
const LAGOS_ROADS: readonly RoadSpec[] = [
  // ---------------------------------------------------------------- Ikeja
  road('Airport Road', 'arterial', [1, 4], [21, 4]),
  road('Ikorodu Road', 'expressway', [21, 24], [21, 4], [31, 4]),
  road('Ikorodu Road', 'expressway', [31, 4], [61, 4]),
  road('Allen Avenue', 'arterial', [4, 8], [21, 8]),
  road('Isaac John Street', 'street', [21, 8], [27, 8]),
  road('Gbagada Expressway', 'arterial', [27, 8], [31, 8]),
  road('Mobolaji Bank Anthony Way', 'arterial', [4, 4], [4, 12]),
  road('Agege Motor Road', 'arterial', [9, 4], [9, 24]),
  road('Obafemi Awolowo Way', 'arterial', [13, 12], [13, 1], [17, 1]),
  road('Opebi Road', 'street', [17, 1], [17, 12]),
  road('Oba Akran Avenue', 'street', [25, 4], [25, 12]),
  // ---------------------------------------------------------------- Mushin
  road('Ladipo Street', 'street', [4, 12], [17, 12]),
  road('Isolo Road', 'arterial', [4, 12], [4, 22]),
  road('Olosha Road', 'street', [13, 12], [13, 24]),
  road('Idi-Araba Street', 'street', [4, 16], [21, 16]),
  road('Palm Avenue', 'street', [4, 20], [21, 20]),
  // ---------------------------------------------------------------- Yaba / Ebute-Metta
  road('Jibowu Street', 'street', [17, 12], [25, 12]),
  road('Akoka Road', 'street', [25, 12], [29, 12], [29, 25], [25, 25]),
  road('Herbert Macaulay Way', 'arterial', [25, 12], [25, 25]),
  road('Carter Bridge', 'arterial', [25, 25], [25, 29]),
  road('Commercial Avenue', 'street', [21, 16], [25, 16]),
  road('Sabo Road', 'street', [21, 20], [25, 20]),
  road('Ojuelegba Road', 'arterial', [9, 24], [25, 24]),
  // ---------------------------------------------------------------- Surulere
  road('Western Avenue', 'arterial', [21, 24], [21, 31]),
  road('Eko Bridge', 'arterial', [21, 31], [24, 31]),
  road('Funsho Williams Avenue', 'arterial', [9, 31], [21, 31]),
  road('Lawanson Road', 'street', [9, 24], [9, 31]),
  road('Adeniran Ogunsanya Street', 'street', [13, 24], [13, 31]),
  road('Bode Thomas Street', 'street', [9, 27], [21, 27]),
  road('Shitta Street', 'street', [17, 24], [17, 27]),
  // ---------------------------------------------------------------- Ojo
  road('Badagry Expressway', 'expressway', [1, 31], [9, 31]),
  road('LASU-Isheri Road', 'arterial', [4, 22], [4, 39]),
  road('Ojo Barracks Road', 'street', [4, 35], [10, 35]),
  road('Iyana-Iba Road', 'street', [1, 27], [4, 27]),
  // ---------------------------------------------------------------- Ikorodu
  road('Ebute Road', 'street', [40, 8], [61, 8]),
  road('Lagos Road', 'street', [44, 1], [44, 8]),
  road('Sagamu Road', 'street', [52, 1], [52, 8]),
  road('Ijede Road', 'street', [44, 1], [57, 1]),
  road('Ikorodu-Epe Road', 'arterial', [61, 4], [61, 35]),
  // ---------------------------------------------------------------- Lagos Island
  road('Third Mainland Bridge', 'expressway', [31, 4], [31, 29]),
  road('Adeniji Adele Road', 'arterial', [24, 29], [33, 29]),
  road('Marina', 'arterial', [24, 29], [24, 35]),
  road('Broad Street', 'street', [24, 32], [33, 32]),
  road('Nnamdi Azikiwe Street', 'street', [28, 29], [28, 35]),
  road('Obalende Road', 'street', [33, 29], [33, 35]),
  // ---------------------------------------------------------------- Ikoyi & Banana Island
  road('Alfred Rewane Road', 'arterial', [33, 29], [42, 29]),
  road('Lekki-Ikoyi Link Bridge', 'arterial', [42, 29], [46, 29]),
  road('Awolowo Road', 'arterial', [33, 31], [41, 31]),
  road('Kingsway Road', 'street', [37, 29], [37, 33]),
  road('Falomo Bridge', 'arterial', [37, 33], [37, 35]),
  road('Bourdillon Road', 'street', [41, 27], [41, 31]),
  road('Banana Island Bridge', 'street', [41, 22], [41, 27]),
  road('Banana Island Road', 'street', [41, 20], [41, 22]),
  road('Ocean Parade', 'street', [39, 20], [43, 20]),
  // ---------------------------------------------------------------- Victoria Island & Eko Atlantic
  road('Ozumba Mbadiwe Avenue', 'arterial', [24, 35], [45, 35]),
  road('Eko Atlantic Boulevard', 'street', [24, 35], [24, 38]),
  road('Ahmadu Bello Way', 'arterial', [21, 38], [45, 38]),
  road('Kofo Abayomi Street', 'street', [28, 35], [28, 38]),
  road('Adetokunbo Ademola Street', 'street', [33, 35], [33, 38]),
  road('Akin Adesola Street', 'street', [37, 35], [37, 38]),
  road('Ajose Adeogun Street', 'street', [42, 35], [42, 38]),
  // ---------------------------------------------------------------- Lekki, Ajah, Epe
  road('Lekki-Epe Expressway', 'expressway', [45, 35], [61, 35]),
  road('Admiralty Road', 'street', [46, 29], [48, 29]),
  road('Admiralty Way', 'arterial', [48, 29], [48, 38]),
  road('Fola Osibo Road', 'street', [46, 32], [52, 32]),
  road('Freedom Way', 'street', [52, 32], [52, 38]),
  road('Abraham Adesanya Road', 'street', [52, 32], [56, 32]),
  road('Elegushi Beach Road', 'street', [45, 38], [61, 38]),
  road('Lakowe Road', 'street', [61, 35], [61, 38]),
  road('Addo Road', 'street', [56, 29], [56, 35]),
  road('Ado Road', 'street', [56, 35], [56, 38]),
  road('Epe Town Road', 'street', [61, 26], [63, 26]),
];

export interface RoundaboutSpec {
  readonly name: string;
  /** Centre cell (where two road lines cross); the roundabout covers the 3 × 3 block around it. */
  readonly centre: CellCoord;
}

const LAGOS_ROUNDABOUTS: readonly RoundaboutSpec[] = [{ name: 'Ajah Roundabout', centre: [56, 35] }];

/** How a venue lot looks (the renderer picks models per archetype). */
export type LotArchetype =
  | 'airport'
  | 'campus'
  | 'market'
  | 'mall'
  | 'hospital'
  | 'office-tower'
  | 'office'
  | 'government'
  | 'stadium'
  | 'park'
  | 'beach'
  | 'hotel'
  | 'club'
  | 'mosque'
  | 'church'
  | 'motor-park'
  | 'car-dealer'
  | 'shop'
  | 'school'
  | 'mansion'
  | 'jet-pad'
  | 'refinery'
  | 'aviation-terminal';

export interface VenueLotSpec {
  readonly venueId: string;
  readonly rect: CellRect;
  /** Side of the lot that faces the road (the door is on this side). */
  readonly front: CompassSide;
  /** Index of the door cell along the front (west → east or north → south). Defaults to the middle cell. */
  readonly door?: number;
  readonly archetype: LotArchetype;
}

const lot = (venueId: string, rect: CellRect, front: CompassSide, archetype: LotArchetype, door?: number): VenueLotSpec => ({
  venueId,
  rect,
  front,
  archetype,
  door,
});

/** Every in-city venue gets an authored lot. Venues of both cities are laid out here (Abuja's after Lagos's). */
const LAGOS_VENUE_LOTS: readonly VenueLotSpec[] = [
  // Ikeja
  lot('mmia-airport', [1, 0, 8, 3], 'S', 'airport'),
  lot('alausa-secretariat', [14, 2, 16, 3], 'S', 'government'),
  lot('computer-village', [10, 5, 12, 7], 'S', 'market'),
  lot('ikeja-city-mall', [14, 5, 16, 7], 'S', 'mall'),
  lot('ikeja-cinema', [18, 5, 20, 6], 'N', 'shop'),
  lot('cbt-ikeja', [10, 9, 10, 9], 'N', 'shop'),
  lot('berger-car-market', [22, 1, 24, 3], 'S', 'car-dealer'),
  lot('ikeja-gra-lounge', [22, 5, 22, 5], 'N', 'club'),
  lot('lasuth', [5, 9, 7, 11], 'N', 'hospital'),
  // Yaba
  lot('unilag', [26, 13, 28, 19], 'W', 'campus', 4),
  lot('yabatech', [22, 21, 24, 23], 'N', 'campus'),
  lot('yaba-market', [22, 13, 24, 15], 'S', 'market'),
  lot('yaba-hub', [22, 17, 24, 19], 'E', 'office'),
  lot('cbt-yaba', [18, 13, 18, 13], 'N', 'shop'),
  lot('yaba-gym', [19, 17, 19, 17], 'N', 'shop'),
  lot('yaba-salon', [18, 21, 18, 21], 'N', 'shop'),
  // Mushin
  lot('luth', [10, 17, 12, 19], 'N', 'hospital'),
  lot('mushin-market', [5, 13, 8, 15], 'S', 'market'),
  lot('mushin-pharmacy', [14, 17, 14, 17], 'W', 'shop'),
  // Surulere
  lot('national-stadium', [14, 28, 19, 30], 'S', 'stadium'),
  lot('shitta-amala', [18, 25, 18, 25], 'N', 'shop'),
  lot('surulere-clinic', [11, 26, 11, 26], 'S', 'hospital'),
  lot('surulere-school', [10, 28, 12, 30], 'S', 'school'),
  lot('surulere-church', [15, 25, 16, 26], 'N', 'church'),
  // Ojo
  lot('lasu', [5, 36, 10, 39], 'W', 'campus', 2),
  // Ikorodu
  lot('ikorodu-garage', [46, 5, 49, 7], 'N', 'motor-park'),
  // Lagos Island
  lot('balogun-market', [25, 30, 26, 31], 'S', 'market'),
  lot('marina', [25, 33, 26, 34], 'W', 'office-tower'),
  lot('lagos-general-hospital', [29, 30, 30, 31], 'N', 'hospital'),
  lot('freedom-park', [31, 33, 32, 34], 'S', 'park'),
  lot('central-mosque', [31, 30, 32, 31], 'S', 'mosque'),
  lot('cms-motor-park', [29, 33, 30, 34], 'N', 'motor-park'),
  // Ikoyi
  lot('ikoyi-club', [38, 27, 40, 28], 'S', 'park'),
  lot('immigration-ikoyi', [34, 30, 36, 30], 'S', 'government'),
  lot('ikoyi-fine-dining', [38, 32, 38, 32], 'N', 'shop'),
  lot('ikoyi-estate-agency', [34, 32, 34, 32], 'N', 'shop'),
  // Victoria Island
  lot('eko-hotel', [34, 36, 35, 37], 'N', 'hotel', 1),
  lot('the-vault', [38, 36, 39, 36], 'N', 'club'),
  lot('vi-lounge', [40, 36, 41, 36], 'N', 'club'),
  lot('eko-atlantic', [25, 36, 26, 37], 'S', 'office-tower', 1),
  lot('island-specialist', [29, 36, 31, 37], 'N', 'hospital'),
  lot('tarkwa-bay', [21, 39, 23, 39], 'N', 'beach'),
  // Lekki
  lot('elegushi-beach', [49, 39, 51, 39], 'N', 'beach'),
  lot('lekki-conservation', [49, 27, 53, 30], 'W', 'park', 3),
  lot('lekki-mall', [46, 33, 47, 34], 'S', 'mall'),
  lot('lekki-gym', [53, 36, 53, 36], 'W', 'shop'),
  lot('lekki-car-mart', [49, 36, 51, 37], 'N', 'car-dealer'),
  lot('lekki-estate-agency', [47, 37, 47, 37], 'S', 'shop'),
  lot('lekki-church', [49, 33, 51, 34], 'N', 'church'),
  // Ajah
  lot('pan-atlantic', [54, 28, 55, 31], 'E', 'campus', 2),
  lot('ajah-market', [57, 31, 58, 32], 'W', 'market', 0),
  // Epe & Ibeju-Lekki
  lot('epe-land-office', [62, 30, 63, 31], 'W', 'shop', 1),
  // Showcase places, appended last so every earlier lot keeps its index (ad spot ids use lot indices). Their doors face
  // a bend or a junction, where no roadside ad spot stands, so the generated ad inventory is unchanged.
  // OBO's estate: the mansion's gate on the Awolowo/Bourdillon bend, the jet's apron gate beside it.
  lot('obo-mansion', [41, 32, 44, 34], 'N', 'mansion', 0),
  lot('air-obo', [42, 31, 44, 31], 'W', 'jet-pad'),
  // Dangote Refinery's visitor centre and gate, on the Ikorodu-Epe Road junction; the works fill the shore behind it.
  lot('dangote-refinery', [60, 26, 60, 26], 'E', 'refinery'),
  // Polanco, the Victoria Island car dealer: a showroom on the waterfront strip south of Ahmadu Bello Way.
  lot('polanco-motors', [27, 39, 29, 39], 'N', 'car-dealer'),
  // Yaba Left Joint used to take whatever filler lot hashed to it; pinned where it stood so the Yaba campus can claim cells.
  lot('yaba-left-joint', [28, 21, 28, 21], 'E', 'club'),
  // Lagos institutions added after the first campuses. Each stands on infill and office cells (never on houses, so every
  // `homeLotOf` result is unchanged), with its door at a road end, tee or bend where no roadside ad spot stands, so the
  // generated ad inventory is unchanged too.
  lot('fce-akoka', [26, 20, 27, 20], 'W', 'campus', 0),
  lot('lasustech', [41, 1, 43, 1], 'E', 'campus', 2),
  lot('caleb', [39, 6, 40, 7], 'S', 'campus', 1),
  lot('anchor', [1, 16, 3, 17], 'E', 'campus', 0),
  lot('augustine', [62, 35, 63, 38], 'W', 'campus', 0),
  lot('ekounimed', [5, 27, 8, 27], 'W', 'campus', 0),
  // Multi-city: the General Aviation Terminal beside the airport, on infill cells (no house, no filler building another
  // venue could have taken), its door at the Obafemi Awolowo Way bend where no roadside ad spot stands.
  lot('mmia-gat', [9, 0, 12, 1], 'E', 'aviation-terminal', 1),
  // Hotels (docs/MULTI_CITY.md, hotels). Victoria Island has no free land, so Eko Hotel and Eko Atlantic each give up their
  // eastern column (their doors are the same cells as before: the default door of a 3-wide lot is its middle column, and now
  // `door: 1` names that same column) and the Federal Palace and The Lagos Continental stand on those columns. The others take
  // infill cells behind an office cell at a bend (no door on a straight road, so no filling station or ad spot is displaced).
  lot('federal-palace-hotel', [36, 36, 36, 37], 'N', 'hotel'),
  lot('lagos-continental-hotel', [27, 36, 27, 37], 'S', 'hotel'),
  lot('the-wheatbaker', [37, 27, 37, 28], 'S', 'hotel'),
  lot('radisson-blu-ikeja', [21, 1, 21, 3], 'S', 'hotel'),
  lot('four-points-lekki', [48, 27, 48, 28], 'S', 'hotel'),
];

/** Landmark lots that are not venues (the renderer puts something iconic there and no filler building). */
export interface LandmarkSpec {
  readonly id: string;
  readonly rect: CellRect;
  readonly front: CompassSide;
}

const LAGOS_LANDMARKS: readonly LandmarkSpec[] = [
  { id: 'vi-towers', rect: [39, 37, 40, 37], front: 'S' },
  { id: 'lekki-toll-plaza', rect: [44, 36, 44, 36], front: 'N' },
  // The jet apron's waterfront (OBO's estate) and the refinery works behind the visitor centre.
  { id: 'obo-apron', rect: [43, 30, 44, 30], front: 'S' },
  { id: 'dangote-works', rect: [55, 19, 59, 26], front: 'E' },
];

export type BillboardMount = 'pole' | 'wall' | 'roof' | 'gantry';

export interface BillboardSpec {
  readonly slotId: BillboardSlotId;
  /** Cell the board stands in (reserved: no filler building there). */
  readonly cell: CellCoord;
  /** Offset from the cell centre in layout metres (mapped to the world with the cell, like everything else). */
  readonly offset: readonly [dx: number, dz: number];
  /** Direction the advert faces (towards the viewers). */
  readonly faces: CompassSide | 'NW' | 'NE' | 'SW' | 'SE';
  readonly mount: BillboardMount;
  /** Height of the bottom edge above the ground (metres). */
  readonly elevation: number;
  /** Width of the advert in metres (height follows the format's aspect). */
  readonly width: number;
}

/**
 * Physical boards for the promotions catalog's slot ids (BILLBOARD_SLOT_IDS). Sized to read on a phone (most about
 * 1.4–1.9× the first city's area) where they fit. Three stay as they were: the Lekki toll gantry spans its one road
 * cell, and Third Mainland North and Surulere already reach the buildings beside them. Never move a board's cell or
 * offset: the street spots are picked around these positions, so moving one reshuffles spot ids that bookings point at.
 * `ad-placements.spec.ts` checks the ids, and that faces keep clear of each other, the carriageway and doors.
 */
const LAGOS_BILLBOARD_SPECS: readonly BillboardSpec[] = [
  { slotId: 'mmia-arrivals', cell: [4, 3], offset: [5, -5.6], faces: 'S', mount: 'roof', elevation: 12.4, width: 17.5 },
  { slotId: 'third-mainland-north', cell: [30, 9], offset: [-1, 0], faces: 'N', mount: 'pole', elevation: 6.5, width: 12 },
  { slotId: 'third-mainland-south', cell: [32, 28], offset: [0, 0], faces: 'S', mount: 'pole', elevation: 7, width: 16 },
  { slotId: 'lekki-toll-gate', cell: [45, 35], offset: [0, 0], faces: 'W', mount: 'gantry', elevation: 7, width: 9 },
  { slotId: 'ozumba-mbadiwe', cell: [40, 34], offset: [0, 1], faces: 'S', mount: 'pole', elevation: 6, width: 16.5 },
  { slotId: 'ikeja-allen', cell: [14, 9], offset: [-2.5, -2.5], faces: 'NW', mount: 'pole', elevation: 5, width: 7.5 },
  { slotId: 'yaba-hub', cell: [24, 18], offset: [3.55, 0], faces: 'E', mount: 'wall', elevation: 4.5, width: 7 },
  { slotId: 'surulere-stadium', cell: [19, 30], offset: [1, 2], faces: 'S', mount: 'pole', elevation: 5.5, width: 12 },
  { slotId: 'balogun-market', cell: [26, 30], offset: [-5, -1.5], faces: 'S', mount: 'roof', elevation: 9, width: 7 },
  { slotId: 'vi-towers', cell: [39, 37], offset: [5, 3.55], faces: 'S', mount: 'wall', elevation: 16, width: 8 },
  { slotId: 'ajah-roundabout', cell: [56, 35], offset: [0, 0], faces: 'W', mount: 'pole', elevation: 4.5, width: 7.5 },
  { slotId: 'ikorodu-garage', cell: [47, 5], offset: [5, -2], faces: 'N', mount: 'gantry', elevation: 6, width: 15 },
];

/** Share of frontage lots that are homes (the rest are shops/offices/flats) per district. */
export const HOME_SHARE: Readonly<Record<DistrictId, number>> = {
  ikeja: 0.45,
  ikorodu: 0.75,
  mushin: 0.6,
  surulere: 0.65,
  yaba: 0.45,
  ojo: 0.75,
  'lagos-island': 0.3,
  ikoyi: 0.75,
  'banana-island': 1,
  'victoria-island': 0.25,
  lekki: 0.7,
  ajah: 0.75,
  epe: 0.8,
  'abuja-cbd': 0.2,
  maitama: 0.8,
  asokoro: 0.9,
  wuse: 0.4,
  garki: 0.55,
  jabi: 0.5,
  gwarinpa: 0.8,
  kubwa: 0.75,
  lugbe: 0.7,
};

// =================================================================================================================
// Abuja (docs/MULTI_CITY.md): a 56 × 40 grid, north up, in the same world frame as Lagos (see ABUJA_ORIGIN_*).
// The outer two cells are scrub (sand); blocks are 4 cells apart so every lot has road frontage. Coordinates below
// are Abuja-local; `A()` puts them in the world grid. Kubwa and Gwarinpa to the north-west, Jabi/Utako and Wuse in the
// north, Maitama north-east, the Central Area in the middle, Asokoro to the east under Aso Rock, Garki to the south
// and Lugbe with the airport in the south-west.
// =================================================================================================================

const A = (col: number, row: number): CellCoord => [ABUJA_ORIGIN_COL + col, ABUJA_ORIGIN_ROW + row];
const aRect = (c0: number, r0: number, c1: number, r1: number): CellRect => [ABUJA_ORIGIN_COL + c0, ABUJA_ORIGIN_ROW + r0, ABUJA_ORIGIN_COL + c1, ABUJA_ORIGIN_ROW + r1];

const ABUJA_DISTRICT_RECTS: ReadonlyArray<readonly [DistrictId, CellRect]> = [
  ['kubwa', aRect(0, 0, 13, 9)],
  ['gwarinpa', aRect(0, 10, 13, 21)],
  ['jabi', aRect(14, 0, 25, 21)],
  ['wuse', aRect(26, 0, 37, 15)],
  ['maitama', aRect(38, 0, 55, 15)],
  ['abuja-cbd', aRect(26, 16, 41, 25)],
  ['asokoro', aRect(42, 16, 55, 39)],
  ['garki', aRect(26, 26, 41, 39)],
  ['lugbe', aRect(0, 22, 25, 39)],
];

const ABUJA_TERRAIN_RECTS: ReadonlyArray<readonly [TerrainPaint, CellRect]> = [
  // Dry scrub around the city (the water beyond it is the world's edge).
  ['sand', aRect(0, 0, ABUJA_COLS - 1, 1)],
  ['sand', aRect(0, ABUJA_ROWS - 2, ABUJA_COLS - 1, ABUJA_ROWS - 1)],
  ['sand', aRect(0, 2, 1, ABUJA_ROWS - 3)],
  ['sand', aRect(ABUJA_COLS - 2, 2, ABUJA_COLS - 1, ABUJA_ROWS - 3)],
  // Jabi Lake.
  ['water', aRect(17, 9, 19, 11)],
];

const aH = (row: number, c0: number, c1: number, name: string, roadClass: RoadClass = 'street'): RoadSpec => road(name, roadClass, A(c0, row), A(c1, row));
const aV = (col: number, r0: number, r1: number, name: string, roadClass: RoadClass = 'street'): RoadSpec => road(name, roadClass, A(col, r0), A(col, r1));

const ABUJA_ROADS: readonly RoadSpec[] = [
  // ---------------------------------------------------------------- east-west
  aH(4, 4, 12, 'Byazhin Road'),
  aH(4, 12, 24, 'Wole Soyinka Street'),
  aH(4, 24, 36, 'Aminu Kano Crescent'),
  aH(4, 36, 52, 'Gana Street'),
  aH(8, 4, 28, 'Kubwa Expressway', 'expressway'),
  aH(8, 28, 52, 'Ibrahim Babangida Boulevard', 'arterial'),
  aH(12, 4, 12, '3rd Avenue'),
  aH(12, 12, 24, 'Jabi Lake Road'),
  aH(12, 24, 36, 'Adetokunbo Ademola Street'),
  aH(12, 36, 52, 'Aguiyi Ironsi Street'),
  aH(16, 4, 12, '6th Avenue'),
  aH(16, 12, 24, 'Utako District Road'),
  aH(16, 24, 40, 'Constitution Avenue'),
  aH(16, 40, 52, 'Kwame Nkrumah Crescent'),
  aH(20, 4, 52, 'Ahmadu Bello Way', 'arterial'),
  aH(24, 4, 24, 'FHA Road'),
  aH(24, 24, 40, 'Independence Avenue'),
  aH(24, 40, 52, 'Julius Nyerere Crescent'),
  aH(28, 28, 40, 'Sokode Crescent'),
  aH(28, 40, 52, 'Samuel Ogbemudia Street'),
  aH(31, 4, 28, 'Airport Road', 'expressway'),
  aH(36, 4, 52, 'Outer Southern Expressway', 'expressway'),
  // ---------------------------------------------------------------- north-south
  aV(4, 4, 8, 'Arab Road'),
  aV(4, 8, 20, '1st Avenue'),
  aV(4, 20, 36, 'Sauka Road'),
  aV(8, 4, 8, 'Gado Nasko Road'),
  aV(8, 8, 24, '12th Avenue'),
  aV(12, 4, 8, 'Dutse Alhaji Road'),
  aV(12, 8, 24, 'Gwarinpa Estate Road'),
  aV(16, 4, 20, 'Ibrahim Babangida Way'),
  aV(16, 20, 31, 'Karmo Road'),
  aV(20, 4, 20, 'Mohammed Buhari Way'),
  aV(20, 20, 24, 'Chika Road'),
  aV(24, 4, 20, 'Chief Hassan Avenue'),
  aV(24, 20, 31, 'Pyakasa Road'),
  aV(28, 4, 20, 'Herbert Macaulay Way', 'arterial'),
  aV(28, 20, 31, 'Airport Road', 'expressway'),
  aV(28, 31, 36, 'Gwani Street'),
  aV(32, 4, 16, 'Aminu Kano Street'),
  aV(32, 16, 26, 'Shehu Shagari Way'),
  aV(32, 26, 36, 'Gimbiya Street'),
  aV(36, 4, 16, 'Zambezi Crescent'),
  aV(36, 16, 26, 'Moshood Abiola Way'),
  aV(36, 26, 36, 'Okigwe Street'),
  aV(40, 4, 16, 'Mississippi Street'),
  aV(40, 16, 26, 'Tafawa Balewa Way', 'arterial'),
  aV(40, 26, 36, 'Kano Street'),
  aV(44, 4, 16, 'Nile Street'),
  aV(44, 16, 36, 'Nelson Mandela Street'),
  aV(48, 4, 16, 'Danube Street'),
  aV(48, 16, 36, 'Jos Street'),
  aV(52, 4, 36, 'Murtala Muhammed Expressway', 'expressway'),
];

const ABUJA_VENUE_LOTS: readonly VenueLotSpec[] = [
  // Lugbe: the airport (door on Airport Road) and the General Aviation Terminal beside it.
  lot('naia-airport', aRect(5, 25, 15, 30), 'S', 'airport'),
  lot('naia-gat', aRect(17, 26, 23, 30), 'S', 'aviation-terminal'),
  // Jabi / Utako
  lot('jabi-lake-mall', aRect(17, 13, 19, 15), 'S', 'mall'),
  lot('utako-motor-park', aRect(21, 13, 23, 15), 'S', 'motor-park'),
  // Wuse
  lot('wuse-market', aRect(29, 9, 31, 11), 'S', 'market'),
  // Maitama
  lot('maitama-realty', aRect(41, 5, 43, 7), 'S', 'shop'),
  // Central Area
  lot('national-hospital-abuja', aRect(33, 17, 35, 19), 'S', 'hospital'),
  lot('central-area-towers', aRect(29, 21, 31, 23), 'N', 'office-tower'),
  // Garki
  lot('garki-buka', aRect(33, 29, 33, 29), 'N', 'shop'),
  lot('garki-police-command', aRect(29, 29, 31, 31), 'N', 'government'),

  // ----- The full city: ~60 real places added after the skeleton (the lots above keep their indices) -----
  // Central Business District: ministries, banks, the national mosque and church, Eagle Square, the Galleria.
  lot('silverbird-galleria', aRect(29, 17, 31, 18), 'N', 'mall'),
  lot('silverbird-cinemas-abuja', aRect(29, 19, 31, 19), 'S', 'shop'),
  lot('eagle-square', aRect(37, 17, 39, 19), 'N', 'park'),
  lot('national-mosque', aRect(33, 21, 35, 23), 'S', 'mosque'),
  lot('national-christian-centre', aRect(37, 21, 39, 23), 'S', 'church'),
  lot('federal-secretariat', aRect(26, 17, 27, 19), 'E', 'government'),
  lot('nnpc-towers', aRect(26, 21, 27, 23), 'E', 'office-tower'),
  lot('cbn-hq', aRect(29, 25, 31, 25), 'N', 'office-tower'),
  lot('us-embassy-abuja', aRect(33, 25, 35, 25), 'N', 'government'),
  lot('ceddi-plaza', aRect(37, 25, 39, 25), 'N', 'mall'),
  // Maitama: embassies, the Hilton, Millennium Park.
  lot('transcorp-hilton', aRect(45, 5, 47, 7), 'N', 'hotel'),
  lot('millennium-park', aRect(49, 5, 51, 7), 'N', 'park'),
  lot('uk-high-commission', aRect(41, 9, 43, 11), 'W', 'government'),
  lot('canada-high-commission', aRect(45, 9, 47, 11), 'S', 'government'),
  lot('maitama-district-hospital', aRect(49, 9, 51, 11), 'S', 'hospital'),
  lot('jevinik-restaurant', aRect(41, 13, 42, 13), 'N', 'shop'),
  lot('medplus-maitama', aRect(45, 13, 45, 13), 'N', 'shop'),
  // Wuse: Banex, nightlife, the shops of Wuse 2.
  lot('banex-plaza', aRect(33, 9, 35, 11), 'S', 'market'),
  lot('play-imperial', aRect(29, 5, 31, 6), 'N', 'club'),
  lot('sheraton-abuja', aRect(33, 5, 35, 7), 'N', 'hotel'),
  lot('healthplus-wuse', aRect(29, 13, 29, 13), 'N', 'shop'),
  lot('wuse-fitness', aRect(31, 13, 31, 13), 'N', 'shop'),
  lot('yahuza-suya', aRect(33, 13, 33, 13), 'N', 'shop'),
  lot('wuse-salon', aRect(35, 13, 35, 13), 'N', 'shop'),
  lot('wuse-police-division', aRect(33, 15, 35, 15), 'S', 'government'),
  lot('gtbank-wuse', aRect(26, 5, 27, 6), 'E', 'office'),
  lot('rhapsodys-abuja', aRect(26, 9, 27, 10), 'E', 'shop'),
  lot('cue-bar', aRect(29, 15, 31, 15), 'S', 'club'),
  // Garki: the old market, hospital, Force Headquarters.
  lot('garki-market', aRect(29, 26, 31, 27), 'S', 'market'),
  lot('garki-hospital', aRect(33, 26, 35, 27), 'S', 'hospital'),
  lot('garki-central-mosque', aRect(37, 26, 39, 27), 'S', 'mosque'),
  lot('jamb-cbt-garki', aRect(35, 29, 35, 29), 'E', 'shop'),
  lot('force-headquarters', aRect(37, 29, 39, 31), 'E', 'government'),
  lot('garki-pharmacy', aRect(33, 31, 33, 31), 'W', 'shop'),
  lot('first-bank-garki', aRect(35, 31, 35, 31), 'E', 'office'),
  lot('garki-gym', aRect(33, 33, 34, 33), 'W', 'shop'),
  lot('garki-salon', aRect(33, 35, 34, 35), 'W', 'shop'),
  lot('garki-auto-mart', aRect(37, 33, 39, 35), 'S', 'car-dealer'),
  // Jabi / Utako: the lake, the universities, offices.
  lot('jabi-lake-park', aRect(21, 9, 23, 11), 'W', 'park'),
  lot('baze-university', aRect(17, 5, 19, 7), 'N', 'campus'),
  lot('nile-university', aRect(21, 5, 23, 7), 'N', 'campus'),
  lot('brains-and-hammers', aRect(17, 17, 18, 17), 'N', 'shop'),
  lot('jabi-lake-lounge', aRect(19, 17, 19, 17), 'N', 'club'),
  lot('access-bank-utako', aRect(21, 17, 22, 17), 'N', 'office'),
  lot('jabi-auto-gallery', aRect(17, 19, 19, 19), 'S', 'car-dealer'),
  // Gwarinpa and Kubwa: estates and satellite-town basics.
  lot('gwarinpa-general-hospital', aRect(5, 13, 7, 15), 'E', 'hospital'),
  lot('rccg-gwarinpa', aRect(9, 13, 11, 15), 'E', 'church'),
  lot('gwarinpa-central-mosque', aRect(5, 17, 7, 19), 'E', 'mosque'),
  lot('gwarinpa-school', aRect(9, 17, 11, 19), 'E', 'school'),
  lot('gwarinpa-buka', aRect(5, 11, 5, 11), 'S', 'shop'),
  lot('kubwa-market', aRect(5, 5, 7, 7), 'S', 'market'),
  lot('kubwa-general-hospital', aRect(9, 5, 11, 7), 'S', 'hospital'),
  lot('kubwa-pharmacy', aRect(9, 9, 9, 9), 'N', 'shop'),
  // Lugbe / Airport Road: the University of Abuja, the Glory Dome, the market.
  lot('university-of-abuja', aRect(6, 32, 14, 35), 'N', 'campus'),
  lot('dunamis-glory-dome', aRect(17, 32, 24, 35), 'N', 'church'),
  lot('lugbe-market', aRect(5, 22, 7, 23), 'S', 'market'),
  // Asokoro: the National Assembly in the shadow of Aso Rock, the Abuja Club.
  lot('national-assembly', aRect(45, 17, 47, 19), 'S', 'government'),
  lot('abuja-club', aRect(45, 21, 47, 23), 'N', 'park'),
  lot('asokoro-district-hospital', aRect(49, 21, 51, 23), 'N', 'hospital'),
];

const ABUJA_LANDMARKS: readonly LandmarkSpec[] = [
  // Aso Rock: the granite monolith over Asokoro that the whole capital is laid out around (drawn by `abuja-geometry.ts`).
  { id: 'aso-rock', rect: aRect(49, 17, 51, 19), front: 'S' },
];
const ABUJA_BILLBOARD_SPECS: readonly BillboardSpec[] = [
  { slotId: 'abuja-airport-road', cell: A(26, 32), offset: [0, -2], faces: 'N', mount: 'pole', elevation: 6.5, width: 9 },
  { slotId: 'abuja-ibb-boulevard', cell: A(39, 7), offset: [0, 1.5], faces: 'S', mount: 'pole', elevation: 6.5, width: 9 },
  { slotId: 'abuja-central-area', cell: A(41, 19), offset: [0, 1.5], faces: 'S', mount: 'pole', elevation: 6.5, width: 9 },
  { slotId: 'abuja-jabi-lake', cell: A(25, 9), offset: [-1.5, 0], faces: 'W', mount: 'pole', elevation: 5.5, width: 8 },
  { slotId: 'abuja-wuse-banex', cell: A(37, 13), offset: [-1.5, 0], faces: 'W', mount: 'pole', elevation: 5.5, width: 8 },
];
const ABUJA_ROUNDABOUTS: readonly RoundaboutSpec[] = [];

// ----- Everything, both cities ---------------------------------------------------------------------------------------

export const DISTRICT_RECTS: ReadonlyArray<readonly [DistrictId, CellRect]> = [...LAGOS_DISTRICT_RECTS, ...ABUJA_DISTRICT_RECTS];
export const ROADS: readonly RoadSpec[] = [...LAGOS_ROADS, ...ABUJA_ROADS];
export const ROUNDABOUTS: readonly RoundaboutSpec[] = [...LAGOS_ROUNDABOUTS, ...ABUJA_ROUNDABOUTS];
/** Lagos's lots first, then Abuja's: lot indices of Lagos never depend on Abuja. */
export const VENUE_LOTS: readonly VenueLotSpec[] = [...LAGOS_VENUE_LOTS, ...ABUJA_VENUE_LOTS];
export const LANDMARKS: readonly LandmarkSpec[] = [...LAGOS_LANDMARKS, ...ABUJA_LANDMARKS];
export const BILLBOARD_SPECS: readonly BillboardSpec[] = [...LAGOS_BILLBOARD_SPECS, ...ABUJA_BILLBOARD_SPECS];

/**
 * Terrain, painted in order: all water, then each city's land, then the authored rectangles. (Lagos's rectangles were
 * painted over an all-land grid; they still land on the same cells.)
 */
export const TERRAIN_RECTS: ReadonlyArray<readonly [TerrainPaint, CellRect]> = [
  ['water', [0, 0, CITY_COLS - 1, CITY_ROWS - 1]],
  ['land', CITY_GRID_RECTS.lagos],
  ['land', CITY_GRID_RECTS.abuja],
  ...LAGOS_TERRAIN_RECTS,
  ...ABUJA_TERRAIN_RECTS,
];

/** The city a grid cell is in (cells in the water between them count by which side of the midpoint they are on). */
export function cityOfCell(col: number, row: number): CityId {
  return col >= ABUJA_ORIGIN_COL - ABUJA_GAP / 2 && row >= ABUJA_ORIGIN_ROW - ABUJA_GAP / 2 ? 'abuja' : 'lagos';
}
