import {
  BODY_TYPES,
  CLOTHING,
  EYE_STYLES,
  HAIR_COLORS,
  SKIN_TONES,
  createRng,
  type Appearance,
  type BodyType,
  type ClothingDefinition,
  type ClothingSlot,
  type FacialHair,
  type Gender,
  type HairStyle,
  type Outfit,
  type Rng,
} from '@insidelife/shared';
import type { ResolvedOutfit } from './outfit';

/** Dress codes for ambient characters. */
export const OUTFIT_THEMES = ['casual', 'street', 'owambe', 'corporate', 'worship', 'mosque', 'medic', 'club', 'gym', 'campus', 'market', 'uniform'] as const;
export type OutfitTheme = (typeof OUTFIT_THEMES)[number];

const MALE_HAIR: readonly HairStyle[] = ['lowcut', 'lowcut', 'fade', 'fade', 'bald', 'afro', 'twists', 'locs', 'cornrows'];
const FEMALE_HAIR: readonly HairStyle[] = ['braids', 'braids', 'bone-straight', 'bun', 'puff', 'afro', 'twists', 'locs', 'cornrows', 'big-afro', 'lowcut'];
const BEARDS: readonly FacialHair[] = ['none', 'none', 'none', 'stubble', 'stubble', 'moustache', 'goatee', 'full-beard'];

/** A plausible Lagosian appearance. */
export function randomAppearance(rng: Rng, gender: Gender): Appearance {
  const bodyType = rng.weighted<BodyType>([
    { value: 'slim', weight: 3 },
    { value: 'average', weight: 4 },
    { value: gender === 'female' ? 'curvy' : 'broad', weight: 3 },
    { value: gender === 'female' ? 'broad' : 'curvy', weight: 0.5 },
  ]);
  const dyed = rng.chance(gender === 'female' ? 0.18 : 0.06);
  return {
    bodyType: BODY_TYPES.includes(bodyType) ? bodyType : 'average',
    height: Math.round(rng.float(0.94, 1.07) * 100) / 100,
    skinTone: rng.weighted(SKIN_TONES.map((_, index) => ({ value: index, weight: index <= 4 ? 3 : index === 5 ? 2 : 1 }))),
    hairStyle: rng.pick(gender === 'female' ? FEMALE_HAIR : MALE_HAIR),
    hairColor: dyed ? rng.int(3, HAIR_COLORS.length - 1) : rng.int(0, 2),
    facialHair: gender === 'male' ? rng.pick(BEARDS) : 'none',
    eyeStyle: rng.pick(EYE_STYLES),
  };
}

type ThemeRule = Readonly<Partial<Record<ClothingSlot, { readonly styles: readonly string[]; readonly chance?: number }>>> & {
  /** Probability of wearing a `full` outfit instead of top + bottom. */
  readonly fullChance?: number;
};

const THEMES: Readonly<Record<OutfitTheme, Readonly<Record<Gender, ThemeRule>>>> = {
  casual: {
    male: { top: { styles: ['tee', 'polo', 'shirt', 'jersey'] }, bottom: { styles: ['jeans', 'chinos', 'shorts', 'joggers'] }, shoes: { styles: ['sneakers', 'slides', 'sandals'] }, headwear: { styles: ['cap'], chance: 0.2 }, accessory: { styles: ['watch', 'chain'], chance: 0.25 } },
    female: { top: { styles: ['tee', 'blouse', 'shirt'] }, bottom: { styles: ['jeans', 'skirt', 'wrapper'] }, shoes: { styles: ['sneakers', 'sandals', 'slides'] }, headwear: { styles: ['hijab'], chance: 0.12 }, accessory: { styles: ['bag', 'beads'], chance: 0.35 }, full: { styles: ['gown', 'jumpsuit'] }, fullChance: 0.2 },
  },
  street: {
    male: { top: { styles: ['hoodie', 'tee', 'jersey'] }, bottom: { styles: ['joggers', 'jeans'] }, shoes: { styles: ['sneakers'] }, headwear: { styles: ['cap', 'bucket-hat', 'durag', 'beanie'], chance: 0.6 }, accessory: { styles: ['chain', 'headphones'], chance: 0.6 }, eyewear: { styles: ['sunglasses'], chance: 0.25 } },
    female: { top: { styles: ['crop', 'hoodie', 'tee'] }, bottom: { styles: ['jeans', 'joggers', 'skirt'] }, shoes: { styles: ['sneakers'] }, headwear: { styles: ['bucket-hat', 'cap'], chance: 0.3 }, accessory: { styles: ['headphones', 'bag', 'chain'], chance: 0.5 }, eyewear: { styles: ['sunglasses'], chance: 0.3 } },
  },
  owambe: {
    male: { full: { styles: ['agbada', 'kaftan', 'senator'] }, fullChance: 1, shoes: { styles: ['loafers', 'sandals', 'oxfords'] }, headwear: { styles: ['fila'], chance: 0.75 }, accessory: { styles: ['beads', 'watch'], chance: 0.5 }, eyewear: { styles: ['aviators', 'sunglasses'], chance: 0.2 } },
    female: { full: { styles: ['buba-iro', 'gown'] }, fullChance: 1, shoes: { styles: ['heels', 'sandals'] }, headwear: { styles: ['gele'], chance: 0.9 }, accessory: { styles: ['beads', 'bag'], chance: 0.7 } },
  },
  corporate: {
    male: { full: { styles: ['suit'] }, fullChance: 0.55, top: { styles: ['shirt', 'blazer', 'polo'] }, bottom: { styles: ['trousers', 'chinos'] }, shoes: { styles: ['oxfords', 'loafers'] }, accessory: { styles: ['watch'], chance: 0.6 }, eyewear: { styles: ['glasses'], chance: 0.25 } },
    female: { full: { styles: ['suit', 'gown'] }, fullChance: 0.45, top: { styles: ['blouse', 'blazer', 'shirt'] }, bottom: { styles: ['skirt', 'trousers'] }, shoes: { styles: ['heels'] }, accessory: { styles: ['bag', 'watch'], chance: 0.6 }, eyewear: { styles: ['glasses'], chance: 0.2 } },
  },
  worship: {
    male: { full: { styles: ['suit', 'senator', 'kaftan', 'agbada'] }, fullChance: 0.85, top: { styles: ['shirt'] }, bottom: { styles: ['trousers'] }, shoes: { styles: ['oxfords', 'loafers'] }, headwear: { styles: ['fila'], chance: 0.2 } },
    female: { full: { styles: ['buba-iro', 'gown'] }, fullChance: 0.9, shoes: { styles: ['heels', 'sandals'] }, headwear: { styles: ['gele'], chance: 0.8 }, accessory: { styles: ['bag', 'beads'], chance: 0.4 } },
  },
  mosque: {
    male: { full: { styles: ['kaftan'] }, fullChance: 1, shoes: { styles: ['sandals', 'slides'] }, headwear: { styles: ['fila'], chance: 0.85 } },
    female: { full: { styles: ['buba-iro', 'gown', 'kaftan'] }, fullChance: 1, shoes: { styles: ['sandals', 'slides'] }, headwear: { styles: ['hijab'], chance: 1 } },
  },
  medic: {
    male: { full: { styles: ['scrubs'] }, fullChance: 1, shoes: { styles: ['sneakers'] } },
    female: { full: { styles: ['scrubs'] }, fullChance: 1, shoes: { styles: ['sneakers'] } },
  },
  club: {
    male: { top: { styles: ['tee', 'shirt', 'blazer', 'hoodie', 'jersey'] }, bottom: { styles: ['jeans', 'joggers'] }, shoes: { styles: ['sneakers', 'loafers'] }, accessory: { styles: ['chain', 'watch'], chance: 0.7 }, eyewear: { styles: ['sunglasses', 'aviators'], chance: 0.35 }, headwear: { styles: ['cap', 'durag', 'bucket-hat'], chance: 0.3 } },
    female: { full: { styles: ['gown', 'jumpsuit'] }, fullChance: 0.5, top: { styles: ['crop', 'blouse'] }, bottom: { styles: ['skirt', 'jeans'] }, shoes: { styles: ['heels', 'sneakers'] }, accessory: { styles: ['bag', 'chain'], chance: 0.6 }, eyewear: { styles: ['sunglasses'], chance: 0.2 } },
  },
  gym: {
    male: { top: { styles: ['tank', 'tee'] }, bottom: { styles: ['shorts', 'joggers'] }, shoes: { styles: ['sneakers'] }, accessory: { styles: ['headphones', 'watch'], chance: 0.4 } },
    female: { top: { styles: ['crop', 'tank', 'tee'] }, bottom: { styles: ['joggers', 'shorts'] }, shoes: { styles: ['sneakers'] }, accessory: { styles: ['headphones', 'watch'], chance: 0.4 } },
  },
  campus: {
    male: { top: { styles: ['tee', 'shirt', 'hoodie', 'polo'] }, bottom: { styles: ['jeans', 'chinos', 'joggers'] }, shoes: { styles: ['sneakers', 'slides'] }, accessory: { styles: ['bag', 'headphones'], chance: 0.55 }, eyewear: { styles: ['glasses'], chance: 0.3 } },
    female: { top: { styles: ['tee', 'blouse', 'shirt', 'hoodie'] }, bottom: { styles: ['jeans', 'skirt'] }, shoes: { styles: ['sneakers', 'sandals'] }, headwear: { styles: ['hijab'], chance: 0.15 }, accessory: { styles: ['bag'], chance: 0.6 }, eyewear: { styles: ['glasses'], chance: 0.3 }, full: { styles: ['gown'] }, fullChance: 0.15 },
  },
  market: {
    male: { top: { styles: ['tee', 'tank', 'shirt', 'jersey'] }, bottom: { styles: ['shorts', 'trousers', 'jeans'] }, shoes: { styles: ['slides', 'sandals'] }, full: { styles: ['kaftan'] }, fullChance: 0.2, headwear: { styles: ['cap', 'fila'], chance: 0.3 } },
    female: { top: { styles: ['blouse', 'tee'] }, bottom: { styles: ['wrapper', 'skirt'] }, shoes: { styles: ['slides', 'sandals'] }, full: { styles: ['buba-iro'] }, fullChance: 0.4, headwear: { styles: ['gele', 'hijab', 'hijab'], chance: 0.4 } },
  },
  uniform: {
    male: { full: { styles: ['uniform'] }, fullChance: 1, shoes: { styles: ['boots', 'sneakers'] } },
    female: { full: { styles: ['uniform'] }, fullChance: 1, shoes: { styles: ['boots', 'sneakers'] } },
  },
};

function wearable(gender: Gender): (item: ClothingDefinition) => boolean {
  const own = gender === 'female' ? 'fem' : 'masc';
  return (item) => item.cut === 'unisex' || item.cut === own;
}

function pickItem(rng: Rng, slot: ClothingSlot, styles: readonly string[], gender: Gender): ClothingDefinition | undefined {
  const fits = wearable(gender);
  const pool = CLOTHING.filter((item) => item.slot === slot && styles.includes(item.style) && fits(item));
  const fallback = pool.length > 0 ? pool : CLOTHING.filter((item) => item.slot === slot && styles.includes(item.style));
  return fallback.length > 0 ? rng.pick(fallback) : undefined;
}

export interface NpcLook {
  readonly gender: Gender;
  readonly appearance: Appearance;
  readonly clothing: ResolvedOutfit;
  /** The same outfit as catalog ids. */
  readonly outfit: Outfit;
}

/** Deterministic look for an ambient character: same seed + theme → same person. */
export function npcLook(seed: string, theme: OutfitTheme, gender?: Gender): NpcLook {
  const rng = createRng(`npc:${seed}`);
  const g: Gender = gender ?? (rng.chance(0.5) ? 'female' : 'male');
  const appearance = randomAppearance(rng, g);
  const rule = THEMES[theme][g];
  const clothing: Partial<Record<ClothingSlot, ClothingDefinition>> = {};
  const roll = (slot: ClothingSlot): void => {
    const entry = rule[slot];
    if (!entry || !rng.chance(entry.chance ?? 1)) return;
    const item = pickItem(rng, slot, entry.styles, g);
    if (item) clothing[slot] = item;
  };
  if (rule.full && rng.chance(rule.fullChance ?? 0)) roll('full');
  else {
    roll('top');
    roll('bottom');
  }
  for (const slot of ['shoes', 'headwear', 'eyewear', 'accessory'] as const) roll(slot);
  const outfit: Partial<Record<ClothingSlot, string>> = {};
  for (const [slot, item] of Object.entries(clothing) as Array<[ClothingSlot, ClothingDefinition]>) outfit[slot] = item.id;
  return { gender: g, appearance, clothing, outfit };
}
