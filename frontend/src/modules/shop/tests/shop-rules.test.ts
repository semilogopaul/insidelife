import { describe, expect, it } from 'vitest';
import { findClothing, type ActionDefinition } from '@insidelife/shared';
import {
  filterProducts,
  maxBuyable,
  buyLimit,
  outfitClout,
  outfitProblems,
  productPerks,
  purchaseLines,
  sameOutfit,
  setSlot,
  unlocksFor,
  wornSlots,
} from '../services/shop-rules';

describe('what items unlock', () => {
  it('maps capability tags to the actions they unlock', () => {
    expect(unlocksFor({ tags: ['tv'] })).toEqual(['Watch Nollywood']);
    expect(unlocksFor({ tags: ['laptop'] })).toEqual(
      expect.arrayContaining(['Learn to code', 'Freelance gig']),
    );
    expect(unlocksFor({ tags: ['console'] })).toEqual(['Play FIFA']);
    expect(unlocksFor({ tags: ['bed'] })).toEqual([]);
  });

  it('adds power backup and mosquito-net perks', () => {
    expect(unlocksFor({ tags: ['generator'], power: 'generator' })).toContain('NEPA backup: generator');
    expect(unlocksFor({ tags: ['mosquito-net'] })).toContain('Fewer malaria bites');
  });

  it('works against any action list (pure)', () => {
    const actions = [
      { label: 'Blend smoothies', requires: { itemTag: 'blender' } },
    ] as unknown as ActionDefinition[];
    expect(unlocksFor({ tags: ['blender'] }, actions)).toEqual(['Blend smoothies']);
  });

  it('lists comfort, sleep and clout perks', () => {
    const product = { status: 2, clothing: null, item: { comfort: 4, bedQuality: 0.55 } } as Parameters<
      typeof productPerks
    >[0];
    expect(productPerks(product)).toEqual(['+4 comfort', 'Sleep 55%', '+2 clout']);
  });
});

describe('buying', () => {
  it('adds the 10% delivery fee online and nothing in store', () => {
    const online = purchaseLines({ price: 373_500, deliveryFee: 37_350, inStoreHere: false }, 1);
    expect(online.total).toBe(410_850);
    expect(online.lines.reduce((sum, line) => sum + line.amount, 0)).toBe(online.total);
    const inStore = purchaseLines({ price: 373_500, deliveryFee: 37_350, inStoreHere: true }, 2);
    expect(inStore.total).toBe(747_000);
    expect(inStore.lines).toHaveLength(1);
  });

  it('caps quantity at what you may still own', () => {
    expect(maxBuyable({ maxQuantity: 4, owned: 1 })).toBe(3);
    expect(maxBuyable({ maxQuantity: 50, owned: 0 })).toBe(10);
    expect(maxBuyable({ maxQuantity: 1, owned: 1 })).toBe(0);
  });

  it('filters by category, clothing tier and shelf, cheapest first', () => {
    const p = (
      id: string,
      category: 'clothing' | 'computers',
      store: 'okrika' | 'mall',
      price: number,
      inStoreHere = false,
    ) => ({ id, category, store, price, inStoreHere });
    const all = [
      p('a', 'clothing', 'mall', 50_000),
      p('b', 'clothing', 'okrika', 3_000),
      p('c', 'computers', 'mall', 900_000, true),
      p('d', 'computers', 'mall', 380_000),
    ];
    expect(
      filterProducts(all, { category: 'clothing', tier: 'all', hereOnly: false }).map((x) => x.id),
    ).toEqual(['b', 'a']);
    expect(
      filterProducts(all, { category: 'clothing', tier: 'mall', hereOnly: false }).map((x) => x.id),
    ).toEqual(['a']);
    expect(
      filterProducts(all, { category: 'computers', tier: 'okrika', hereOnly: false }).map((x) => x.id),
    ).toEqual(['d', 'c']);
    expect(
      filterProducts(all, { category: 'computers', tier: 'all', hereOnly: true }).map((x) => x.id),
    ).toEqual(['c']);
  });
});

describe('wardrobe', () => {
  it('requires a top and a bottom unless wearing a full outfit', () => {
    expect(outfitProblems({ top: 't', bottom: 'b' })).toEqual([]);
    expect(outfitProblems({ full: 'agbada' })).toEqual([]);
    expect(outfitProblems({ top: 't' })).toHaveLength(1);
    expect(outfitProblems({ shoes: 's' })).toHaveLength(2);
  });

  it('edits slots immutably and compares outfits by content', () => {
    const outfit = { top: 't', bottom: 'b' };
    const next = setSlot(outfit, 'shoes', 's');
    expect(outfit).toEqual({ top: 't', bottom: 'b' });
    expect(next).toEqual({ top: 't', bottom: 'b', shoes: 's' });
    expect(setSlot(next, 'shoes', null)).toEqual(outfit);
    expect(sameOutfit({ top: 't', bottom: 'b' }, { bottom: 'b', top: 't' })).toBe(true);
    expect(sameOutfit({ top: 't' }, { top: 't', shoes: 's' })).toBe(false);
  });

  it('counts clout from visible pieces only (a full outfit hides top and bottom)', () => {
    const lookup = (id: string) =>
      ({ t: { status: 1 }, b: { status: 2 }, agbada: { status: 10 }, s: { status: 3 } })[id];
    expect(outfitClout({ top: 't', bottom: 'b', shoes: 's' }, lookup)).toBe(6);
    expect(outfitClout({ top: 't', bottom: 'b', full: 'agbada', shoes: 's' }, lookup)).toBe(13);
    expect(wornSlots({ top: 't', full: 'agbada' })).toEqual(['full']);
    expect(outfitClout({ top: 'okrika-white-tee' }, (id) => findClothing(id))).toBe(
      findClothing('okrika-white-tee')?.status ?? 0,
    );
  });
});

describe('buyLimit reasons', () => {
  const base = { name: 'Fridge', maxQuantity: 1, owned: 0, item: null, clothing: null } as never as Parameters<typeof buyLimit>[0];
  it('allows buying when under the cap', () => {
    expect(buyLimit(base, 0)).toEqual({ limit: 1, reason: null });
  });
  it('explains the real cap when owned', () => {
    expect(buyLimit({ ...base, owned: 1 }, 0).reason).toMatch(/only keep one/);
  });
  it('explains a full kitchen for groceries', () => {
    const food = { ...base, item: { meals: 3 } } as never as Parameters<typeof buyLimit>[0];
    expect(buyLimit(food, 999).reason).toMatch(/kitchen is full/);
  });
});
