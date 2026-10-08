import { STARTER_WARDROBE, findClothing, type ClothingSlot, type Gender, type Outfit } from '@insidelife/shared';

/**
 * Looks to try on in the creator preview. Preview only — the server grants the real starter wardrobe (okrika
 * basics); everything else is bought in Lagos.
 */
export const OUTFIT_PRESETS = ['everyday', 'owambe', 'corporate', 'street', 'campus'] as const;
export type OutfitPreset = (typeof OUTFIT_PRESETS)[number];

export const PRESET_LABELS: Readonly<Record<OutfitPreset, string>> = {
  everyday: 'Everyday',
  owambe: 'Owambe',
  corporate: 'Office',
  street: 'Street',
  campus: 'Campus',
};

const LOOKS: Readonly<Record<Exclude<OutfitPreset, 'everyday'>, Readonly<Record<Gender, Outfit>>>> = {
  owambe: {
    male: { full: 'aso-oke-agbada', headwear: 'abeti-aja-fila', shoes: 'suede-loafers', accessory: 'plastic-coral-beads' },
    female: { full: 'aso-oke-iro-buba', headwear: 'aso-oke-gele', shoes: 'block-heels', accessory: 'plastic-coral-beads' },
  },
  corporate: {
    male: { full: 'corporate-navy-suit', shoes: 'leather-oxfords', accessory: 'digital-watch' },
    female: { top: 'navy-blazer', bottom: 'pleated-midi-skirt', shoes: 'block-heels', accessory: 'leather-tote' },
  },
  street: {
    male: { top: 'detty-december-hoodie', bottom: 'market-joggers', shoes: 'balogun-sneakers', headwear: 'ankara-bucket-hat' },
    female: { top: 'lekki-brunch-crop', bottom: 'ripped-skinny-jeans', shoes: 'balogun-sneakers', eyewear: 'okrika-shades' },
  },
  campus: {
    male: { top: 'okrika-college-hoodie', bottom: 'okrika-jeans', shoes: 'okrika-sneakers', accessory: 'okrika-backpack', eyewear: 'reading-glasses' },
    female: { top: 'ankara-peplum-blouse', bottom: 'okrika-jeans', shoes: 'okrika-sneakers', accessory: 'okrika-backpack' },
  },
};

/** The starter wardrobe as an outfit (slot → id), using whatever the catalog says each id is. */
export function starterOutfit(gender: Gender): Outfit {
  const ids = STARTER_WARDROBE[gender === 'female' ? 'fem' : 'masc'];
  const outfit: Partial<Record<ClothingSlot, string>> = {};
  for (const id of ids) {
    const item = findClothing(id);
    if (item) outfit[item.slot] = id;
  }
  return outfit;
}

export function presetOutfit(preset: OutfitPreset, gender: Gender): Outfit {
  return preset === 'everyday' ? starterOutfit(gender) : LOOKS[preset][gender];
}
