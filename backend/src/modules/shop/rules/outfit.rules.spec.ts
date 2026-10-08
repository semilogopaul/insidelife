import { describe, expect, it } from 'vitest';
import { findClothing } from '@insidelife/shared';
import { outfitStatus, starterOutfit, starterWardrobeFor, validateOutfit, wornItemIds } from './outfit.rules.js';

const owned = new Set([
  'okrika-white-tee',
  'okrika-jeans',
  'rubber-slides',
  'aso-oke-agbada',
  'abeti-aja-fila',
  'gold-aviators',
  'coral-beads',
]);

describe('validateOutfit', () => {
  it('accepts owned items in their own slots and returns them in canonical slot order', () => {
    const check = validateOutfit({ shoes: 'rubber-slides', bottom: 'okrika-jeans', top: 'okrika-white-tee' }, owned);
    expect(check).toEqual({ ok: true, outfit: { top: 'okrika-white-tee', bottom: 'okrika-jeans', shoes: 'rubber-slides' } });
    if (check.ok) expect(Object.keys(check.outfit)).toEqual(['top', 'bottom', 'shoes']);
  });

  it('lets a full outfit override top and bottom', () => {
    const check = validateOutfit(
      { top: 'okrika-white-tee', bottom: 'okrika-jeans', full: 'aso-oke-agbada', headwear: 'abeti-aja-fila', eyewear: 'gold-aviators' },
      owned,
    );
    expect(check).toEqual({ ok: true, outfit: { full: 'aso-oke-agbada', headwear: 'abeti-aja-fila', eyewear: 'gold-aviators' } });
  });

  it('rejects clothing the character does not own', () => {
    const check = validateOutfit({ top: 'okrika-white-tee', bottom: 'okrika-jeans', accessory: 'swiss-gold-watch' }, owned);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.errors).toEqual(['You don’t own Swiss Gold Watch (Oga Patapata) — buy it first']);
  });

  it('rejects an item placed in the wrong slot', () => {
    const check = validateOutfit({ top: 'okrika-jeans', bottom: 'okrika-jeans' }, owned);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.errors[0]).toContain('goes in the bottom slot, not top');
  });

  it('rejects unknown items and unknown slots', () => {
    const check = validateOutfit({ top: 'okrika-white-tee', bottom: 'okrika-jeans', cape: 'okrika-jeans', shoes: 'gucci-flip-flops' }, owned);
    expect(check.ok).toBe(false);
    if (!check.ok) {
      expect(check.errors).toContain('"cape" is not a clothing slot');
      expect(check.errors).toContain('Unknown clothing item "gucci-flip-flops"');
    }
  });

  it('refuses to send the avatar out half-dressed', () => {
    const check = validateOutfit({ top: 'okrika-white-tee', shoes: 'rubber-slides' }, owned);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.errors[0]).toContain('wear a top and a bottom, or a full outfit');
  });

  it('ignores empty slots', () => {
    expect(validateOutfit({ top: 'okrika-white-tee', bottom: 'okrika-jeans', headwear: '' }, owned).ok).toBe(true);
  });
});

describe('outfit status and worn items', () => {
  it('sums status of worn items, hiding top and bottom under a full outfit', () => {
    const outfit = { top: 'okrika-white-tee', bottom: 'okrika-jeans', full: 'aso-oke-agbada', accessory: 'coral-beads' };
    const expected = (findClothing('aso-oke-agbada')?.status ?? 0) + (findClothing('coral-beads')?.status ?? 0);
    expect(outfitStatus(outfit)).toBe(expected);
    expect([...wornItemIds(outfit)].toSorted()).toEqual(['aso-oke-agbada', 'coral-beads']);
  });
});

describe('starter wardrobe', () => {
  it.each(['male', 'female'] as const)('dresses a new %s character in a top, a bottom and shoes they own', (gender) => {
    const outfit = starterOutfit(gender);
    expect(outfit.top).toBeDefined();
    expect(outfit.bottom).toBeDefined();
    expect(outfit.shoes).toBeDefined();
    expect(validateOutfit(outfit, new Set(starterWardrobeFor(gender))).ok).toBe(true);
  });
});
