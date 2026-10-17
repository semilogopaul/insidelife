/**
 * Interior decor: rugs, luxury beds, flowers and plants, aquariums, art (with plenty of Nigerian pieces), lamps,
 * cushions and throws, shelves, mirrors and tables. You buy them from the Decor store in the phone and place them in
 * rooms of a home you rent or own ("Decorate" mode). Prices are 2026 Lagos shelf prices before the world price index
 * (they are prices, not income: no INCOME_MULTIPLIER). The server charges them; the client uses the same catalog.
 */

export type DecorCategory = 'rugs' | 'beds' | 'plants' | 'aquariums' | 'art' | 'lamps' | 'soft' | 'shelves' | 'mirrors' | 'tables' | 'cabin';

export const DECOR_CATEGORIES: ReadonlyArray<{ readonly id: DecorCategory; readonly label: string; readonly emoji: string }> = [
  { id: 'rugs', label: 'Rugs', emoji: '🧶' },
  { id: 'beds', label: 'Beds', emoji: '🛏️' },
  { id: 'plants', label: 'Flowers & plants', emoji: '🪴' },
  { id: 'aquariums', label: 'Aquariums', emoji: '🐠' },
  { id: 'art', label: 'Art', emoji: '🖼️' },
  { id: 'lamps', label: 'Lamps', emoji: '🪔' },
  { id: 'soft', label: 'Cushions & throws', emoji: '🛋️' },
  { id: 'shelves', label: 'Shelves', emoji: '📚' },
  { id: 'mirrors', label: 'Mirrors', emoji: '🪞' },
  { id: 'tables', label: 'Tables', emoji: '🪑' },
  { id: 'cabin', label: 'Cabin & aviation', emoji: '✈️' },
];

/** `floor` stands on the floor; `wall` hangs on the back or left wall; `tabletop` sits on a surface (a table, a bed, a shelf). */
export type DecorPlacementType = 'floor' | 'wall' | 'tabletop';
export type DecorTier = 'budget' | 'standard' | 'premium' | 'luxury';

/**
 * Which drawing recipe the 3D room uses (`frontend/.../decor/decor-models.ts`); a recipe may use `style` to vary the
 * look (the kind of plant, the shape of a mirror).
 */
export const DECOR_SHAPES = [
  'rug-rect',
  'rug-round',
  'rug-medallion',
  'rug-stripe',
  'bed',
  'vase-flowers',
  'vase-pampas',
  'potted',
  'aquarium',
  'art-print',
  'art-canvas',
  'art-triptych',
  'art-adire',
  'art-mask',
  'art-benin',
  'art-bust',
  'art-sculpture',
  'lamp-table',
  'lamp-arc',
  'lamp-rattan',
  'cushions',
  'throw',
  'pouffe',
  'floor-cushions',
  'basket',
  'shelf-floating',
  'bookcase',
  'shelf-cube',
  'mirror',
  'table',
  'minibar',
  'bench',
  'aircraft-model',
] as const;
export type DecorShape = (typeof DECOR_SHAPES)[number];

/** A colour or finish choice. `hex` is the main colour, `accent` the second (trim, border, flowers, frame). */
export interface DecorVariant {
  readonly id: string;
  readonly label: string;
  readonly hex: string;
  readonly accent: string;
}

export interface DecorItem {
  readonly id: string;
  readonly name: string;
  readonly category: DecorCategory;
  readonly blurb: string;
  readonly placement: DecorPlacementType;
  /** Width (x) and depth (z) in metres at rotation 0; wall pieces: width along the wall, depth out from it. */
  readonly footprint: readonly [number, number];
  /** Overall height (m). */
  readonly height: number;
  readonly tier: DecorTier;
  /** 2026 naira, before the world price index. */
  readonly price: number;
  readonly shape: DecorShape;
  readonly style?: string;
  readonly variants: readonly DecorVariant[];
  /** Height of the top you can put tabletop pieces on (tables, beds, ottomans, shelves); absent = nothing sits on it. */
  readonly surface?: number;
  /** Wall pieces: how high the bottom edge hangs by default (m). */
  readonly hangAt?: number;
  readonly nigerian?: boolean;
  /**
   * Whether it may be fitted in an aircraft cabin (decor-aircraft.ts has the room rules): `cabin` is secured for flight
   * and goes in the cabin, suite, lavatory or cockpit as its placement allows; `suite` (beds) only in a suite.
   * Absent: not for aircraft (aquariums, bookcases, anything that would fly loose).
   */
  readonly aircraft?: 'cabin' | 'suite';
}

const v = (id: string, label: string, hex: string, accent: string): DecorVariant => ({ id, label, hex, accent });

const TEXTILES = [
  v('terracotta', 'Terracotta', '#b5532f', '#e8c9a0'),
  v('indigo', 'Indigo', '#2f3f7a', '#d9d2c0'),
  v('ivory', 'Ivory', '#e8dfc9', '#8a7a5a'),
  v('emerald', 'Emerald', '#1f6b4f', '#e2c46a'),
  v('gold', 'Gold', '#c49a2c', '#3b2a1a'),
  v('charcoal', 'Charcoal', '#3b3d42', '#c9c9c4'),
] as const;
const ANKARA = [
  v('sunset', 'Sunset', '#e0642c', '#2b2a6b'),
  v('royal', 'Royal blue', '#1f3c9a', '#f2b632'),
  v('forest', 'Forest', '#1d6a43', '#f0d27a'),
  v('magenta', 'Magenta', '#b02466', '#f4e3c1'),
] as const;
const WOODS = [
  v('walnut', 'Walnut', '#5a3a26', '#c9a66b'),
  v('oak', 'Oak', '#b58b57', '#6b4a2b'),
  v('ebony', 'Ebony', '#26211f', '#c9a64a'),
  v('white', 'White wash', '#ece6da', '#9b8f7a'),
] as const;
const BED_LINEN = [
  v('cream', 'Cream & gold', '#efe4cc', '#b8912f'),
  v('navy', 'Navy', '#25365c', '#d8d2c2'),
  v('blush', 'Blush', '#ecc9c9', '#8c5a5a'),
  v('grey', 'Slate grey', '#7d8288', '#e5e5e1'),
  v('burgundy', 'Burgundy', '#6e2233', '#e0c47a'),
] as const;
const FLOWERS = [
  v('roses', 'Red roses', '#c4262e', '#2f6b3a'),
  v('sunflower', 'Sunflowers', '#f2b705', '#2f6b3a'),
  v('lilies', 'White lilies', '#f6f1ea', '#3c7a43'),
  v('hibiscus', 'Hibiscus pink', '#e0457b', '#2f6b3a'),
  v('lavender', 'Lavender', '#8d70c4', '#4f7a4a'),
] as const;
const GREEN = [
  v('green', 'Natural', '#2f7d3f', '#8a5a36'),
  v('lush', 'Lush', '#1f6b3a', '#d9d2c3'),
  v('variegated', 'Variegated', '#5b9a47', '#2b2b2b'),
] as const;
const POTS = [
  v('terracotta', 'Terracotta pot', '#b5603a', '#2f7d3f'),
  v('white', 'White ceramic', '#f1ede4', '#2f7d3f'),
  v('black', 'Matte black', '#2b2b2e', '#2f7d3f'),
  v('gold', 'Gold planter', '#c49a2c', '#2f7d3f'),
] as const;
const FISH = [
  v('tropical', 'Tropical reef', '#2f9fd6', '#ff8f00'),
  v('koi', 'Koi pond', '#3e8aa0', '#e53935'),
  v('cichlid', 'Lake cichlids', '#2a6fb0', '#ffd54f'),
  v('plant', 'Planted tank', '#3b9a78', '#7bd88f'),
] as const;
const PRINTS = [
  v('lagos', 'Lagos skyline', '#2c4f7c', '#f2b632'),
  v('bridge', 'Third Mainland Bridge', '#5b7da0', '#f0c987'),
  v('eyo', 'Eyo masquerade', '#f2ede2', '#1f6b4f'),
  v('zuma', 'Zuma Rock', '#a45a32', '#e9c78a'),
  v('okada', 'Danfo at dusk', '#f6b90b', '#2b2b2b'),
] as const;
const CANVAS = [
  v('sunrise', 'Sunrise', '#e0642c', '#f2b632'),
  v('ocean', 'Ocean', '#1f5f8a', '#bfe3ee'),
  v('jungle', 'Jungle', '#1d6a43', '#e2c46a'),
  v('mono', 'Black & white', '#2b2b2e', '#efefea'),
] as const;
const METALS = [
  v('gold', 'Gold', '#c9a64a', '#fff1c0'),
  v('silver', 'Silver', '#c7cbcf', '#ffffff'),
  v('black', 'Black', '#2b2b2e', '#c9a64a'),
  v('copper', 'Copper', '#b4683c', '#f0c9a0'),
] as const;
const SHADES = [
  v('cream', 'Cream shade', '#f3e6c4', '#3b3d42'),
  v('white', 'White shade', '#f7f5ef', '#c9a64a'),
  v('navy', 'Navy shade', '#2c3f6b', '#c9a64a'),
  v('mustard', 'Mustard shade', '#d9a21c', '#2b2b2e'),
] as const;
const LEATHERS = [
  v('tan', 'Tan leather', '#a4683a', '#5b3a29'),
  v('black', 'Black leather', '#2b2b2e', '#8a8a86'),
  v('white', 'White leather', '#ece9e2', '#9b9b95'),
  v('oxblood', 'Oxblood', '#6e2233', '#3b1018'),
] as const;
const BRONZE = [
  v('bronze', 'Antique bronze', '#8a5a2b', '#c9a66b'),
  v('brass', 'Polished brass', '#c9a64a', '#fff1c0'),
  v('dark', 'Dark patina', '#3a2f26', '#8a7a5a'),
] as const;
const TERRACOTTA = [
  v('terracotta', 'Terracotta', '#b5603a', '#e8c9a0'),
  v('black', 'Black clay', '#2b2927', '#8a8a86'),
  v('gold', 'Gilded', '#c49a2c', '#fff1c0'),
] as const;

const SKIES = [
  v('cloudscape', 'Above the clouds', '#4f86c6', '#f6f1e6'),
  v('runway', 'Runway at dusk', '#2b2f3a', '#f2b632'),
  v('wing', 'Wing at sunrise', '#d97b3a', '#f4e3c1'),
] as const;

const item = (
  id: string,
  name: string,
  category: DecorCategory,
  placement: DecorPlacementType,
  footprint: readonly [number, number],
  height: number,
  tier: DecorTier,
  price: number,
  shape: DecorShape,
  variants: readonly DecorVariant[],
  blurb: string,
  more: Partial<Pick<DecorItem, 'style' | 'surface' | 'hangAt' | 'nigerian'>> = {},
): DecorItem => ({ id, name, category, placement, footprint, height, tier, price, shape, variants, blurb, ...more });

const CATALOG: readonly DecorItem[] = [
  // Rugs
  item('rug-raffia-round', 'Woven raffia round rug', 'rugs', 'floor', [1.4, 1.4], 0.02, 'budget', 22_000, 'rug-round', TEXTILES, 'Hand-woven raffia from Ibadan market. Light, cool, cheap.'),
  item('rug-shaggy', 'Shaggy lounge rug', 'rugs', 'floor', [2, 1.4], 0.03, 'standard', 68_000, 'rug-rect', TEXTILES, 'Deep pile for bare feet in front of the sofa.'),
  item('rug-runner', 'Hallway runner', 'rugs', 'floor', [2.2, 0.7], 0.02, 'budget', 38_000, 'rug-stripe', TEXTILES, 'Long and narrow, for beside the bed or along a wall.'),
  item('rug-ankara', 'Ankara-print floor mat', 'rugs', 'floor', [1.6, 1], 0.02, 'standard', 45_000, 'rug-stripe', ANKARA, 'Bold wax-print stripes, made by a Surulere weaver.', { nigerian: true }),
  item('rug-persian', 'Persian-style rug', 'rugs', 'floor', [2.4, 1.7], 0.025, 'premium', 420_000, 'rug-medallion', TEXTILES, 'Imported, medallion pattern, wool pile.'),
  item('rug-silk-grand', 'Hand-knotted silk rug', 'rugs', 'floor', [3.2, 2.2], 0.025, 'luxury', 2_600_000, 'rug-medallion', TEXTILES, 'Months of knotting. Guests will not wear shoes on it.'),

  // Beds (floor pieces: sleeping still uses the bed you bought in the shop; these dress the room)
  item('bed-single-guest', 'Single guest bed', 'beds', 'floor', [1, 2], 0.9, 'budget', 95_000, 'bed', BED_LINEN, 'A neat single, for the guest room.', { style: 'single', surface: 0.52 }),
  item('bed-divan-queen', 'Divan bed, queen', 'beds', 'floor', [1.7, 2.1], 1, 'standard', 260_000, 'bed', BED_LINEN, 'Divan base with a padded headboard.', { style: 'divan', surface: 0.56 }),
  item('bed-tufted-king', 'Tufted king bed', 'beds', 'floor', [2, 2.2], 1.35, 'premium', 950_000, 'bed', BED_LINEN, 'Button-tufted velvet headboard, solid frame.', { style: 'tufted', surface: 0.58 }),
  item('bed-canopy-four-poster', 'Four-poster canopy bed', 'beds', 'floor', [2.1, 2.3], 2.2, 'luxury', 2_800_000, 'bed', BED_LINEN, 'Carved posts with sheer drapes. Banana Island bedroom energy.', { style: 'canopy', surface: 0.6 }),
  item('bed-royal-gold', 'Royal gold-trim bed', 'beds', 'floor', [2.2, 2.4], 1.6, 'luxury', 6_500_000, 'bed', BED_LINEN, 'Gilded scrollwork and a headboard like a throne.', { style: 'royal', surface: 0.6 }),

  // Flowers & plants
  item('flowers-vase', 'Fresh flowers in a vase', 'plants', 'tabletop', [0.25, 0.25], 0.55, 'budget', 9_500, 'vase-flowers', FLOWERS, 'A bunch from the Lekki flower stalls. Fresh weekly in your imagination.'),
  item('plant-snake', 'Snake plant', 'plants', 'floor', [0.4, 0.4], 0.9, 'budget', 12_000, 'potted', POTS, 'Hard to kill, good air.', { style: 'snake' }),
  item('plant-orchid', 'Orchid in a pot', 'plants', 'tabletop', [0.25, 0.25], 0.5, 'standard', 28_000, 'potted', POTS, 'White blooms on a curved stem.', { style: 'orchid' }),
  item('plant-areca-palm', 'Areca palm', 'plants', 'floor', [0.8, 0.8], 1.9, 'standard', 48_000, 'potted', POTS, 'Feathery fronds to fill a corner.', { style: 'palm' }),
  item('plant-fiddle-fig', 'Fiddle-leaf fig', 'plants', 'floor', [0.6, 0.6], 1.7, 'standard', 65_000, 'potted', POTS, 'Big glossy leaves. Dramatic in a bright corner.', { style: 'fiddle' }),
  item('plant-bonsai', 'Bonsai on a stand', 'plants', 'tabletop', [0.35, 0.35], 0.45, 'premium', 150_000, 'potted', POTS, 'Twenty years of patient pruning.', { style: 'bonsai' }),
  item('plant-olive-tree', 'Indoor olive tree', 'plants', 'floor', [0.7, 0.7], 2, 'premium', 260_000, 'potted', POTS, 'Silvery leaves on a twisting trunk.', { style: 'olive' }),
  item('vase-pampas', 'Pampas grass in a floor vase', 'plants', 'floor', [0.4, 0.4], 1.4, 'standard', 38_000, 'vase-pampas', TERRACOTTA, 'Tall dried plumes in a clay urn.'),

  // Aquariums
  item('aquarium-nano', 'Nano fish tank', 'aquariums', 'tabletop', [0.5, 0.3], 0.35, 'budget', 85_000, 'aquarium', FISH, 'A few guppies and a lamp. Calming.', { style: 'nano' }),
  item('aquarium-cabinet-3ft', 'Aquarium on cabinet, 3ft', 'aquariums', 'floor', [0.95, 0.45], 1.25, 'standard', 420_000, 'aquarium', FISH, 'Glass tank on a wooden cabinet with filter and LED strip.', { style: 'cabinet', surface: 0.62 }),
  item('aquarium-reef-6ft', 'Reef aquarium, 6ft', 'aquariums', 'floor', [1.9, 0.6], 1.45, 'luxury', 3_400_000, 'aquarium', FISH, 'Coral, clownfish and a sump. Someone comes monthly to service it.', { style: 'reef' }),

  // Art
  item('art-print-framed', 'Framed print', 'art', 'wall', [0.6, 0.04], 0.8, 'budget', 14_000, 'art-print', PRINTS, 'Prints of Lagos and Naija, glazed and framed.', { hangAt: 1.2, nigerian: true }),
  item('art-canvas-abstract', 'Abstract canvas', 'art', 'wall', [1, 0.05], 0.8, 'standard', 65_000, 'art-canvas', CANVAS, 'Big, bold, painted on Yaba Left.', { hangAt: 1.2 }),
  item('art-adire-hanging', 'Adire indigo wall hanging', 'art', 'wall', [1, 0.03], 1.3, 'standard', 48_000, 'art-adire', TEXTILES.slice(0, 3), 'Hand-dyed Abeokuta adire cloth on a bamboo pole.', { hangAt: 0.9, nigerian: true }),
  item('art-triptych', 'Three-panel canvas', 'art', 'wall', [1.8, 0.05], 0.8, 'premium', 180_000, 'art-triptych', CANVAS, 'One scene across three stretched canvases.', { hangAt: 1.2 }),
  item('art-yoruba-mask', 'Carved Yoruba mask', 'art', 'wall', [0.35, 0.12], 0.7, 'premium', 120_000, 'art-mask', WOODS, 'Hand-carved Gelede-style mask, Oshogbo workshop.', { hangAt: 1.1, nigerian: true }),
  item('art-ife-head', 'Ife head', 'art', 'tabletop', [0.3, 0.3], 0.45, 'premium', 320_000, 'art-bust', BRONZE, 'Replica of the 12th-century Ife bronze head.', { nigerian: true }),
  item('art-benin-plaque', 'Benin bronze plaque', 'art', 'wall', [0.5, 0.05], 0.6, 'luxury', 850_000, 'art-benin', BRONZE, 'Cast in the lost-wax method by a Benin City guild family.', { hangAt: 1.2, nigerian: true }),
  item('art-steel-sculpture', 'Abstract steel sculpture', 'art', 'floor', [0.6, 0.6], 1.5, 'luxury', 1_800_000, 'art-sculpture', METALS, 'Polished curves on a marble plinth.'),
  item('art-oil-portrait', 'Gallery oil portrait', 'art', 'wall', [1.2, 0.07], 1.5, 'luxury', 7_500_000, 'art-canvas', CANVAS, 'Large oil painting in a gilded frame, with a gallery certificate.', { style: 'gilded', hangAt: 0.9, nigerian: true }),

  // Lamps
  item('lamp-bedside', 'Bedside table lamp', 'lamps', 'tabletop', [0.3, 0.3], 0.5, 'budget', 16_000, 'lamp-table', SHADES, 'Warm light for reading.'),
  item('lamp-rattan', 'Rattan floor lamp', 'lamps', 'floor', [0.5, 0.5], 1.6, 'standard', 55_000, 'lamp-rattan', SHADES, 'Woven shade that throws a soft pattern.'),
  item('lamp-arc-floor', 'Arc floor lamp', 'lamps', 'floor', [0.6, 0.6], 2.1, 'standard', 95_000, 'lamp-arc', METALS, 'Leans over the sofa from a heavy base.'),
  item('lamp-crystal', 'Crystal table lamp', 'lamps', 'tabletop', [0.35, 0.35], 0.65, 'luxury', 280_000, 'lamp-table', SHADES, 'Cut crystal base, silk shade.', { style: 'crystal' }),

  // Cushions & throws
  item('cushions-scatter', 'Scatter cushions (set of 3)', 'soft', 'tabletop', [0.7, 0.35], 0.25, 'budget', 24_000, 'cushions', TEXTILES, 'Put them on the bed, a bench or an ottoman.'),
  item('throw-knit', 'Chunky knit throw', 'soft', 'tabletop', [0.9, 0.6], 0.12, 'standard', 32_000, 'throw', TEXTILES, 'Thrown over the edge, as if just used.'),
  item('pouffe-leather', 'Leather pouffe', 'soft', 'floor', [0.55, 0.55], 0.4, 'standard', 35_000, 'pouffe', LEATHERS, 'A footrest that doubles as a seat or a tray stand.', { surface: 0.4 }),
  item('floor-cushion-pile', 'Floor cushion pile', 'soft', 'floor', [1, 1], 0.3, 'standard', 40_000, 'floor-cushions', ANKARA, 'Big floor cushions for the relaxed crowd.', { nigerian: true }),
  item('basket-throws', 'Woven basket with throws', 'soft', 'floor', [0.5, 0.5], 0.5, 'budget', 28_000, 'basket', TEXTILES, 'Raffia basket, blankets spilling out.'),

  // Shelves
  item('shelf-floating', 'Floating wall shelf', 'shelves', 'wall', [1, 0.26], 0.05, 'budget', 18_000, 'shelf-floating', WOODS, 'Put a vase or a lamp on it.', { surface: 0.05, hangAt: 1.3 }),
  item('shelf-cube-unit', 'Cube display unit', 'shelves', 'wall', [1.2, 0.3], 1.2, 'standard', 85_000, 'shelf-cube', WOODS, 'Wall-mounted cubes with books and ornaments.', { hangAt: 0.9 }),
  item('bookcase-tall', 'Tall bookcase', 'shelves', 'floor', [0.9, 0.35], 1.9, 'standard', 120_000, 'bookcase', WOODS, 'Five shelves, a handful of books on each.'),

  // Mirrors
  item('mirror-round-gold', 'Round gold mirror', 'mirrors', 'wall', [0.8, 0.04], 0.8, 'standard', 45_000, 'mirror', METALS, 'Slim round frame.', { style: 'round', hangAt: 1.1 }),
  item('mirror-arch-floor', 'Arched floor mirror', 'mirrors', 'floor', [0.7, 0.25], 1.9, 'standard', 120_000, 'mirror', METALS, 'Full-length, leans against the wall.', { style: 'arch' }),
  item('mirror-sunburst', 'Sunburst mirror', 'mirrors', 'wall', [1, 0.05], 1, 'premium', 390_000, 'mirror', METALS, 'Metal rays around a convex glass.', { style: 'sunburst', hangAt: 1.0 }),
  item('mirror-grand-gilded', 'Grand gilded mirror', 'mirrors', 'wall', [1.2, 0.08], 1.8, 'luxury', 1_900_000, 'mirror', METALS, 'Carved gilt frame, floor to ceiling-ish.', { style: 'grand', hangAt: 0.4 }),

  // Tables
  item('table-side', 'Side table', 'tables', 'floor', [0.5, 0.5], 0.55, 'budget', 22_000, 'table', WOODS, 'A small table beside the sofa or bed.', { style: 'side', surface: 0.55 }),
  item('table-console', 'Console table', 'tables', 'floor', [1.2, 0.35], 0.8, 'standard', 85_000, 'table', WOODS, 'Slim table for a wall: lamps and flowers.', { style: 'console', surface: 0.8 }),
  item('table-coffee-marble', 'Marble coffee table', 'tables', 'floor', [1.1, 0.6], 0.42, 'premium', 180_000, 'table', WOODS, 'White marble top on gold legs.', { style: 'coffee', surface: 0.42 }),

  // Cabin & aviation: made for aircraft (flame-retardant, strapped down, nothing that can fly loose).
  item('cabin-rug', 'Aviation-grade cabin carpet', 'cabin', 'floor', [1.8, 0.9], 0.02, 'standard', 85_000, 'rug-rect', TEXTILES, 'Flame-retardant wool, taped down by the avionics shop at MMIA.'),
  item('cabin-bench', 'Upholstered lounge bench', 'cabin', 'floor', [1.1, 0.45], 0.45, 'standard', 160_000, 'bench', LEATHERS, 'Bolted to the floor rail. Seat cushions and throws sit on it.', { surface: 0.45 }),
  item('cabin-cushions', 'Monogrammed seat cushions', 'cabin', 'tabletop', [0.7, 0.35], 0.25, 'standard', 60_000, 'cushions', TEXTILES, 'A belted pair, embroidered with the registration.'),
  item('cabin-throw', 'Cashmere seat throw', 'cabin', 'tabletop', [0.9, 0.6], 0.12, 'premium', 140_000, 'throw', TEXTILES, 'For the cold hours at flight level 410.'),
  item('cabin-minibar', 'Cabin minibar', 'cabin', 'floor', [0.9, 0.5], 1, 'premium', 650_000, 'minibar', WOODS, 'Latched drawers and a chilled drawer. Glasses stay in their racks until you land.', { surface: 0.95 }),
  item('cabin-lamp', 'Weighted cabin lamp', 'cabin', 'tabletop', [0.3, 0.3], 0.5, 'standard', 48_000, 'lamp-table', SHADES, 'Heavy base, low shade, never tips in turbulence.'),
  item('cabin-flowers', 'Flowers in a secured vase', 'cabin', 'tabletop', [0.25, 0.25], 0.55, 'standard', 24_000, 'vase-flowers', FLOWERS, 'Wedged in a weighted vase with a strap, still fresh on landing.'),
  item('cabin-model', 'Aircraft model on a stand', 'cabin', 'tabletop', [0.4, 0.4], 0.2, 'premium', 180_000, 'aircraft-model', METALS, 'A desk model of your own plane, in polished metal.'),
  item('cabin-print', 'Aviation print, framed', 'cabin', 'wall', [0.6, 0.04], 0.8, 'budget', 22_000, 'art-print', SKIES, 'Shatterproof glazing, fixed at all four corners.', { hangAt: 1.1 }),
];

/**
 * Which pieces are fit for an aircraft cabin (see `DecorItem.aircraft` and decor-aircraft.ts). Kept in one table so the
 * rule is easy to audit: soft, fixed or wall-hung things only; beds only in a suite.
 */
const AIRCRAFT_FIT: Readonly<Record<string, 'cabin' | 'suite'>> = {
  'rug-raffia-round': 'cabin',
  'rug-shaggy': 'cabin',
  'rug-runner': 'cabin',
  'rug-ankara': 'cabin',
  'rug-persian': 'cabin',
  'rug-silk-grand': 'cabin',
  'bed-single-guest': 'suite',
  'bed-divan-queen': 'suite',
  'bed-tufted-king': 'suite',
  'bed-canopy-four-poster': 'suite',
  'bed-royal-gold': 'suite',
  'plant-orchid': 'cabin',
  'art-print-framed': 'cabin',
  'art-canvas-abstract': 'cabin',
  'art-adire-hanging': 'cabin',
  'art-triptych': 'cabin',
  'art-yoruba-mask': 'cabin',
  'art-benin-plaque': 'cabin',
  'art-oil-portrait': 'cabin',
  'lamp-bedside': 'cabin',
  'cushions-scatter': 'cabin',
  'throw-knit': 'cabin',
  'mirror-round-gold': 'cabin',
  'mirror-sunburst': 'cabin',
  'shelf-floating': 'cabin',
  'table-side': 'cabin',
  'cabin-rug': 'cabin',
  'cabin-bench': 'cabin',
  'cabin-cushions': 'cabin',
  'cabin-throw': 'cabin',
  'cabin-minibar': 'cabin',
  'cabin-lamp': 'cabin',
  'cabin-flowers': 'cabin',
  'cabin-model': 'cabin',
  'cabin-print': 'cabin',
};

export const DECOR_ITEMS: readonly DecorItem[] = CATALOG.map((entry) => {
  const fit = AIRCRAFT_FIT[entry.id];
  return fit ? { ...entry, aircraft: fit } : entry;
});

const BY_ID = new Map(DECOR_ITEMS.map((entry) => [entry.id, entry]));
export const findDecorItem = (id: string | null | undefined): DecorItem | undefined => (id ? BY_ID.get(id) : undefined);
export const findDecorVariant = (item: DecorItem, variantId: string | null | undefined): DecorVariant | undefined =>
  item.variants.find((variant) => variant.id === variantId);
export const defaultDecorVariant = (item: DecorItem): DecorVariant => item.variants[0]!;

/** Most you can buy in one go. */
export const DECOR_MAX_PER_PURCHASE = 6;
/** Most decor pieces a character can own. */
export const DECOR_MAX_OWNED = 160;
/** Most pieces in one room. */
export const DECOR_MAX_PER_ROOM = 24;
/** Re-colouring a piece to another variant costs this share of its price (a tailor / painter's visit). */
export const DECOR_RECOLOUR_SHARE = 0.15;

/** What the shop charges for one (world price index applied by the server through `price`). */
export const recolourPrice = (price: number): number => Math.max(1_000, Math.round((price * DECOR_RECOLOUR_SHARE) / 500) * 500);
