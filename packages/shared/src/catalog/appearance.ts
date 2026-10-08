/**
 * Character appearance and clothing.
 *
 * Characters are procedurally built chibi figures (see the frontend `avatar` module), so every option here maps to
 * a geometry variant or a material parameter — no baked textures. Colours are hex strings.
 */

export const GENDERS = ['male', 'female'] as const;
export type Gender = (typeof GENDERS)[number];

export const BODY_TYPES = ['slim', 'average', 'curvy', 'broad'] as const;
export type BodyType = (typeof BODY_TYPES)[number];

/** Nigerian-first skin palette, deepest to lightest. */
export const SKIN_TONES = [
  '#2f1b14',
  '#3f251a',
  '#523020',
  '#653c27',
  '#7c4b30',
  '#98603e',
  '#b57a52',
  '#d29c74',
] as const;

export const HAIR_STYLES = [
  'lowcut',
  'fade',
  'afro',
  'big-afro',
  'twists',
  'locs',
  'braids',
  'cornrows',
  'bone-straight',
  'bun',
  'puff',
  'bald',
] as const;
export type HairStyle = (typeof HAIR_STYLES)[number];

export const HAIR_STYLE_LABELS: Readonly<Record<HairStyle, string>> = {
  lowcut: 'Low cut',
  fade: 'Fade',
  afro: 'Afro',
  'big-afro': 'Big afro',
  twists: 'Twists',
  locs: 'Locs',
  braids: 'Knotless braids',
  cornrows: 'Cornrows',
  'bone-straight': 'Bone straight',
  bun: 'Bun',
  puff: 'Afro puff',
  bald: 'Clean shave',
};

export const HAIR_COLORS = [
  '#14100e',
  '#2b1d16',
  '#4a2e1f',
  '#7a3b1d',
  '#b8823d',
  '#6d1f2e',
  '#8d8d8d',
  '#25407a',
] as const;

export const FACIAL_HAIR = ['none', 'stubble', 'moustache', 'goatee', 'full-beard'] as const;
export type FacialHair = (typeof FACIAL_HAIR)[number];

export const EYE_STYLES = ['round', 'almond', 'sleepy', 'bright'] as const;
export type EyeStyle = (typeof EYE_STYLES)[number];

export interface Appearance {
  readonly bodyType: BodyType;
  /** 0.92 – 1.08 */
  readonly height: number;
  /** Index into SKIN_TONES. */
  readonly skinTone: number;
  readonly hairStyle: HairStyle;
  /** Index into HAIR_COLORS. */
  readonly hairColor: number;
  readonly facialHair: FacialHair;
  readonly eyeStyle: EyeStyle;
}

export const CLOTHING_SLOTS = ['top', 'bottom', 'full', 'shoes', 'headwear', 'eyewear', 'accessory'] as const;
export type ClothingSlot = (typeof CLOTHING_SLOTS)[number];

/** Geometry variants the avatar builder knows how to draw, per slot. */
export const CLOTHING_STYLES = {
  top: ['tee', 'polo', 'shirt', 'hoodie', 'blazer', 'tank', 'blouse', 'jersey', 'crop'],
  bottom: ['jeans', 'chinos', 'shorts', 'joggers', 'skirt', 'wrapper', 'trousers'],
  full: ['agbada', 'kaftan', 'senator', 'buba-iro', 'gown', 'suit', 'scrubs', 'uniform', 'jumpsuit'],
  shoes: ['sneakers', 'loafers', 'sandals', 'slides', 'heels', 'boots', 'oxfords'],
  headwear: ['fila', 'gele', 'cap', 'beanie', 'bucket-hat', 'durag', 'beret', 'hard-hat', 'hijab'],
  eyewear: ['glasses', 'sunglasses', 'aviators'],
  accessory: ['chain', 'watch', 'beads', 'bag', 'headphones'],
} as const satisfies Readonly<Record<ClothingSlot, readonly string[]>>;
export type ClothingStyle<S extends ClothingSlot = ClothingSlot> = (typeof CLOTHING_STYLES)[S][number];

export const FABRIC_PATTERNS = ['solid', 'ankara', 'aso-oke', 'lace', 'stripes', 'denim', 'adire', 'check'] as const;
export type FabricPattern = (typeof FABRIC_PATTERNS)[number];

export const STORE_TIERS = ['okrika', 'market', 'mall', 'designer'] as const;
export type StoreTier = (typeof STORE_TIERS)[number];

export interface ClothingDefinition {
  readonly id: string;
  readonly name: string;
  readonly slot: ClothingSlot;
  readonly style: string;
  readonly pattern: FabricPattern;
  /** Base colour. */
  readonly primary: string;
  /** Pattern / trim colour. */
  readonly secondary: string;
  /** Seed for procedural patterns (ankara, adire) so the same item always looks the same. */
  readonly patternSeed?: number;
  readonly price: number;
  /** Status (clout) while worn. */
  readonly status: number;
  readonly store: StoreTier;
  /** Purely a shop filter; anyone can wear anything. */
  readonly cut: 'masc' | 'fem' | 'unisex';
}

/** What a character is wearing: clothing item ids per slot. `full` overrides `top` + `bottom`. */
export type Outfit = Readonly<Partial<Record<ClothingSlot, string>>>;
