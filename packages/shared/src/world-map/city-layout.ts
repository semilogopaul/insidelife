import type { DistrictId } from '../catalog/geography.js';
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

export const CITY_COLS = 64;
export const CITY_ROWS = 42;
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
export const DISTRICT_RECTS: ReadonlyArray<readonly [DistrictId, CellRect]> = [
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
export const TERRAIN_RECTS: ReadonlyArray<readonly [TerrainPaint, CellRect]> = [
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
export const ROADS: readonly RoadSpec[] = [
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

export const ROUNDABOUTS: readonly RoundaboutSpec[] = [{ name: 'Ajah Roundabout', centre: [56, 35] }];

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
  | 'refinery';

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

/** Every in-city venue gets an authored lot. Out-of-town venues (with `regionId`) are not in the city. */
export const VENUE_LOTS: readonly VenueLotSpec[] = [
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
  lot('eko-hotel', [34, 36, 36, 37], 'N', 'hotel'),
  lot('the-vault', [38, 36, 39, 36], 'N', 'club'),
  lot('vi-lounge', [40, 36, 41, 36], 'N', 'club'),
  lot('eko-atlantic', [25, 36, 27, 37], 'S', 'office-tower'),
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
];

/** Landmark lots that are not venues (the renderer puts something iconic there and no filler building). */
export interface LandmarkSpec {
  readonly id: string;
  readonly rect: CellRect;
  readonly front: CompassSide;
}

export const LANDMARKS: readonly LandmarkSpec[] = [
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
export const BILLBOARD_SPECS: readonly BillboardSpec[] = [
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
};
