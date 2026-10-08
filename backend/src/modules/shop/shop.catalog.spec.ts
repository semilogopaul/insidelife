import { describe, expect, it } from 'vitest';
import {
  CLOTHING,
  CLOTHING_SLOTS,
  CLOTHING_STYLES,
  FABRIC_PATTERNS,
  ITEMS,
  STARTER_ITEMS,
  STARTER_WARDROBE,
  STORE_TIER_PRICE_RANGES,
  findClothing,
  findItem,
  venuesSelling,
  listedProducts,
} from '@insidelife/shared';

const HEX = /^#[0-9a-f]{6}$/i;

describe('shop catalog', () => {
  it('has unique ids across items and clothing', () => {
    const ids = [...ITEMS.map((item) => item.id), ...CLOTHING.map((clothing) => clothing.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has 70+ clothing items covering every style the avatar builder knows', () => {
    expect(CLOTHING.length).toBeGreaterThanOrEqual(70);
    for (const slot of CLOTHING_SLOTS) {
      for (const style of CLOTHING_STYLES[slot]) {
        expect(CLOTHING.some((clothing) => clothing.slot === slot && clothing.style === style), `${slot}/${style}`).toBe(true);
      }
    }
  });

  it('uses every fabric pattern, valid colours, and seeds for procedural prints', () => {
    for (const pattern of FABRIC_PATTERNS) expect(CLOTHING.some((clothing) => clothing.pattern === pattern), pattern).toBe(true);
    for (const clothing of CLOTHING) {
      expect(clothing.primary, clothing.id).toMatch(HEX);
      expect(clothing.secondary, clothing.id).toMatch(HEX);
      if (clothing.pattern === 'ankara' || clothing.pattern === 'adire') expect(clothing.patternSeed, clothing.id).toBeTypeOf('number');
    }
  });

  it('prices clothing inside its store tier band', () => {
    for (const clothing of CLOTHING) {
      const [low, high] = STORE_TIER_PRICE_RANGES[clothing.store];
      expect(clothing.price, clothing.id).toBeGreaterThanOrEqual(low);
      expect(clothing.price, clothing.id).toBeLessThanOrEqual(high);
    }
  });

  it('can buy every listed product in person somewhere in Lagos', () => {
    for (const product of listedProducts()) expect(venuesSelling(product).length, product.def.id).toBeGreaterThan(0);
  });

  it('gives beds a 0.2-1 sleep quality and every action tag a product', () => {
    for (const bed of ITEMS.filter((item) => item.tags.includes('bed'))) {
      expect(bed.bedQuality).toBeGreaterThanOrEqual(0.2);
      expect(bed.bedQuality).toBeLessThanOrEqual(1);
    }
    for (const tag of ['tv', 'console', 'laptop', 'phone', 'mosquito-net', 'generator', 'inverter', 'solar', 'ac', 'fridge', 'books']) {
      expect(ITEMS.some((item) => item.tags.includes(tag) && !item.unlisted), tag).toBe(true);
    }
  });

  it('starter kit references real, cheap catalog products for both cuts', () => {
    for (const id of [...STARTER_WARDROBE.masc, ...STARTER_WARDROBE.fem]) expect(findClothing(id)?.store, id).toBe('okrika');
    for (const id of STARTER_ITEMS) expect(findItem(id), id).toBeDefined();
  });
});
