import {
  CLOTHING_SLOTS,
  STARTER_WARDROBE,
  findClothing,
  type ClothingSlot,
  type Gender,
  type Outfit,
} from '@insidelife/shared';

export type OutfitCheck =
  | { readonly ok: true; readonly outfit: Outfit }
  | { readonly ok: false; readonly errors: readonly string[] };

const isSlot = (value: string): value is ClothingSlot => (CLOTHING_SLOTS as readonly string[]).includes(value);

/**
 * Validate a requested outfit against what the character owns:
 * - every slot must hold a clothing item the character owns, made for that slot;
 * - `full` (agbada, gown, suit…) overrides `top` and `bottom`, which are dropped;
 * - Lagos is not a nudist colony: you need a full outfit or both a top and a bottom.
 * Returns the normalised outfit (slots in canonical order) or player-friendly errors.
 */
export function validateOutfit(requested: Readonly<Record<string, string | undefined>>, owned: ReadonlySet<string>): OutfitCheck {
  const errors: string[] = [];
  const slots: Partial<Record<ClothingSlot, string>> = {};

  for (const [slot, itemId] of Object.entries(requested)) {
    if (itemId === undefined || itemId === '') continue;
    if (!isSlot(slot)) {
      errors.push(`"${slot}" is not a clothing slot`);
      continue;
    }
    const clothing = findClothing(itemId);
    if (!clothing) {
      errors.push(`Unknown clothing item "${itemId}"`);
      continue;
    }
    if (!owned.has(itemId)) {
      errors.push(`You don’t own ${clothing.name} — buy it first`);
      continue;
    }
    if (clothing.slot !== slot) {
      errors.push(`${clothing.name} goes in the ${clothing.slot} slot, not ${slot}`);
      continue;
    }
    slots[slot] = itemId;
  }

  if (slots.full) {
    delete slots.top;
    delete slots.bottom;
  }
  if (errors.length === 0 && !slots.full && !(slots.top && slots.bottom)) {
    errors.push('You can’t step out like that — wear a top and a bottom, or a full outfit');
  }
  if (errors.length > 0) return { ok: false, errors };

  const outfit: Partial<Record<ClothingSlot, string>> = {};
  for (const slot of CLOTHING_SLOTS) {
    const itemId = slots[slot];
    if (itemId) outfit[slot] = itemId;
  }
  return { ok: true, outfit };
}

/** Status points from what is being worn (`full` hides top and bottom). */
export function outfitStatus(outfit: Outfit): number {
  let total = 0;
  for (const slot of CLOTHING_SLOTS) {
    if (outfit.full && (slot === 'top' || slot === 'bottom')) continue;
    const itemId = outfit[slot];
    if (itemId) total += findClothing(itemId)?.status ?? 0;
  }
  return total;
}

/** Clothing ids currently worn (respecting the `full` override). */
export function wornItemIds(outfit: Outfit): ReadonlySet<string> {
  const worn = new Set<string>();
  for (const slot of CLOTHING_SLOTS) {
    if (outfit.full && (slot === 'top' || slot === 'bottom')) continue;
    const itemId = outfit[slot];
    if (itemId) worn.add(itemId);
  }
  return worn;
}

/** Starter clothing ids for a new character's cut. */
export function starterWardrobeFor(gender: Gender): readonly string[] {
  return gender === 'female' ? STARTER_WARDROBE.fem : STARTER_WARDROBE.masc;
}

/** Day-one outfit: each starter item in its own slot. */
export function starterOutfit(gender: Gender): Outfit {
  const outfit: Partial<Record<ClothingSlot, string>> = {};
  for (const itemId of starterWardrobeFor(gender)) {
    const clothing = findClothing(itemId);
    if (clothing) outfit[clothing.slot] = itemId;
  }
  return outfit;
}
