import {
  CLOTHING_SLOTS,
  CLOTHING_STYLES,
  findClothing,
  type ClothingDefinition,
  type ClothingSlot,
  type ClothingStyle,
  type Outfit,
} from '@insidelife/shared';
import { normalizeHex } from '../materials/color-utils';

/** Clothing definitions per slot, after lookup. `full` always wins over `top` + `bottom`. */
export type ResolvedOutfit = Readonly<Partial<Record<ClothingSlot, ClothingDefinition>>>;

/** Resolves a clothing id; return `undefined` for unknown ids (the avatar simply skips that slot). */
export type ClothingLookup = (id: string) => ClothingDefinition | undefined;

/** Default lookup: the shop catalog. Never throws. */
export const catalogLookup: ClothingLookup = (id) => {
  try {
    return findClothing(id);
  } catch {
    return undefined;
  }
};

/**
 * Turn an outfit (ids per slot) into renderable definitions.
 * - `overrides` (already-resolved definitions, e.g. a shop preview) win over ids.
 * - Unknown ids and definitions filed under the wrong slot are ignored.
 * - `full` removes `top` and `bottom`.
 */
export function resolveOutfit(outfit: Outfit, lookup: ClothingLookup = catalogLookup, overrides?: ResolvedOutfit): ResolvedOutfit {
  const result: Partial<Record<ClothingSlot, ClothingDefinition>> = {};
  for (const slot of CLOTHING_SLOTS) {
    const override = overrides?.[slot];
    if (override && override.slot === slot) {
      result[slot] = override;
      continue;
    }
    const id = outfit[slot];
    if (!id) continue;
    const definition = lookup(id);
    if (definition && definition.slot === slot) result[slot] = definition;
  }
  if (result.full) {
    delete result.top;
    delete result.bottom;
  }
  return result;
}

/** A style the builder knows for the slot (unknown styles fall back to the slot's first style). */
export function knownStyle<S extends ClothingSlot>(slot: S, style: string): ClothingStyle<S> {
  const styles = CLOTHING_STYLES[slot] as readonly string[];
  return (styles.includes(style) ? style : styles[0]) as ClothingStyle<S>;
}

/** Stable key of everything that changes the avatar's geometry/materials for this outfit. */
export function outfitKey(outfit: ResolvedOutfit): string {
  return CLOTHING_SLOTS.map((slot) => {
    const item = outfit[slot];
    if (!item) return '-';
    return [knownStyle(slot, item.style), item.pattern, normalizeHex(item.primary), normalizeHex(item.secondary), item.patternSeed ?? 0, item.cut].join(':');
  }).join('/');
}

/** Clothing a character with no top/bottom wears (keeps everyone decent and readable). */
export const BASE_LAYER: Readonly<{ top: ClothingDefinition; bottom: ClothingDefinition }> = {
  top: {
    id: 'base-singlet',
    name: 'Singlet',
    slot: 'top',
    style: 'tee',
    pattern: 'solid',
    primary: '#ecebe6',
    secondary: '#d4d2cb',
    price: 0,
    status: 0,
    store: 'okrika',
    cut: 'unisex',
  },
  bottom: {
    id: 'base-shorts',
    name: 'Shorts',
    slot: 'bottom',
    style: 'shorts',
    pattern: 'solid',
    primary: '#4c5560',
    secondary: '#3a424b',
    price: 0,
    status: 0,
    store: 'okrika',
    cut: 'unisex',
  },
};

/** Fill missing top/bottom with the base layer (unless a full outfit covers them). */
export function withBaseLayer(outfit: ResolvedOutfit): ResolvedOutfit {
  if (outfit.full) return outfit;
  return { ...outfit, top: outfit.top ?? BASE_LAYER.top, bottom: outfit.bottom ?? BASE_LAYER.bottom };
}
