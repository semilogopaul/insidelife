import { describe, expect, it } from 'vitest';
import {
  DECOR_CATEGORIES,
  DECOR_ITEMS,
  DECOR_SHAPES,
  findDecorItem,
  findDecorVariant,
  recolourPrice,
  type DecorTier,
} from './decor.js';

describe('decor catalog', () => {
  it('has unique ids, sane prices and a few variants for every item', () => {
    const ids = DECOR_ITEMS.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of DECOR_ITEMS) {
      expect(entry.price, entry.id).toBeGreaterThan(0);
      expect(entry.price % 500, entry.id).toBe(0);
      expect(entry.variants.length, entry.id).toBeGreaterThanOrEqual(3);
      expect(new Set(entry.variants.map((variant) => variant.id)).size, entry.id).toBe(entry.variants.length);
      for (const variant of entry.variants) {
        expect(variant.hex, `${entry.id}/${variant.id}`).toMatch(/^#[0-9a-f]{6}$/i);
        expect(variant.accent, `${entry.id}/${variant.id}`).toMatch(/^#[0-9a-f]{6}$/i);
      }
      expect(entry.footprint[0], entry.id).toBeGreaterThan(0);
      expect(entry.footprint[1], entry.id).toBeGreaterThan(0);
      expect(entry.height, entry.id).toBeGreaterThan(0);
      expect(DECOR_SHAPES, entry.id).toContain(entry.shape);
      expect(DECOR_CATEGORIES.map((category) => category.id), entry.id).toContain(entry.category);
    }
  });

  it('covers every kind of decor in all three placement types and every price tier', () => {
    for (const category of DECOR_CATEGORIES) {
      expect(DECOR_ITEMS.some((entry) => entry.category === category.id), category.id).toBe(true);
    }
    for (const placement of ['floor', 'wall', 'tabletop'] as const) {
      expect(DECOR_ITEMS.some((entry) => entry.placement === placement), placement).toBe(true);
    }
    const tiers = new Set<DecorTier>(DECOR_ITEMS.map((entry) => entry.tier));
    expect([...tiers].toSorted()).toEqual(['budget', 'luxury', 'premium', 'standard']);
    expect(DECOR_ITEMS.some((entry) => entry.nigerian)).toBe(true);
    expect(DECOR_ITEMS.some((entry) => entry.category === 'beds' && entry.tier === 'luxury')).toBe(true);
  });

  it('prices tiers in order and keeps them in Lagos ranges', () => {
    const range: Record<DecorTier, readonly [number, number]> = {
      budget: [5_000, 100_000],
      standard: [20_000, 500_000],
      premium: [100_000, 1_000_000],
      luxury: [250_000, 8_000_000],
    };
    for (const entry of DECOR_ITEMS) {
      const [lo, hi] = range[entry.tier];
      expect(entry.price, entry.id).toBeGreaterThanOrEqual(lo);
      expect(entry.price, entry.id).toBeLessThanOrEqual(hi);
    }
    const average = (tier: DecorTier): number => {
      const prices = DECOR_ITEMS.filter((entry) => entry.tier === tier).map((entry) => entry.price);
      return prices.reduce((sum, price) => sum + price, 0) / prices.length;
    };
    expect(average('budget')).toBeLessThan(average('standard'));
    expect(average('standard')).toBeLessThan(average('premium'));
    expect(average('premium')).toBeLessThan(average('luxury'));
  });

  it('only gives tabletop pieces a small footprint and a surface to tables, beds, shelves and pouffes', () => {
    for (const entry of DECOR_ITEMS) {
      if (entry.placement === 'tabletop') {
        expect(entry.surface, entry.id).toBeUndefined();
        expect(Math.max(...entry.footprint), entry.id).toBeLessThanOrEqual(1);
      }
      if (entry.surface !== undefined) expect(['tables', 'beds', 'shelves', 'soft', 'aquariums']).toContain(entry.category);
      if (entry.placement === 'wall') expect(entry.hangAt, entry.id).toBeGreaterThanOrEqual(0);
    }
    expect(DECOR_ITEMS.some((entry) => entry.surface !== undefined && entry.placement === 'floor')).toBe(true);
  });

  it('looks pieces and variants up', () => {
    const rug = findDecorItem('rug-ankara');
    expect(rug?.nigerian).toBe(true);
    expect(findDecorVariant(rug!, 'royal')?.label).toBe('Royal blue');
    expect(findDecorVariant(rug!, 'nope')).toBeUndefined();
    expect(findDecorItem('nope')).toBeUndefined();
    expect(findDecorItem(null)).toBeUndefined();
  });

  it('prices a re-colour as a small share of the piece, in round amounts', () => {
    expect(recolourPrice(1_000_000)).toBe(150_000);
    expect(recolourPrice(9_500)).toBe(1_500);
    expect(recolourPrice(1_000)).toBe(1_000);
  });
});
