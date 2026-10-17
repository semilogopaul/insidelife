import { describe, expect, it } from 'vitest';
import { DECOR_CATEGORIES, DECOR_ITEMS, DECOR_MAX_OWNED, type DecorPieceDto } from '@insidelife/shared';
import { maxBuyable, ownedCounts, shelf, summarise } from '../services/decor-rules';

const piece = (id: string, itemId: string, placed: boolean): DecorPieceDto => ({
  id,
  itemId,
  variant: 'x',
  recolours: 0,
  spot: placed ? { templateId: 'home-flat', roomId: 'living', x: 0, z: 0, y: 0, rot: 0, wall: null, onId: null } : null,
});

describe('decor store rules', () => {
  it('lays out each shelf cheapest tier first, and covers the whole catalog', () => {
    const prices = Object.fromEntries(DECOR_ITEMS.map((item) => [item.id, item.price]));
    const all = DECOR_CATEGORIES.flatMap((category) => shelf(category.id, prices));
    expect(all.map((item) => item.id).toSorted()).toEqual(DECOR_ITEMS.map((item) => item.id).toSorted());
    const rugs = shelf('rugs', prices);
    expect(rugs[0]!.tier).toBe('budget');
    expect(rugs.at(-1)!.tier).toBe('luxury');
  });

  it('caps a purchase by the per-purchase limit and the room left in the collection', () => {
    expect(maxBuyable(0)).toBe(6);
    expect(maxBuyable(DECOR_MAX_OWNED - 2)).toBe(2);
    expect(maxBuyable(DECOR_MAX_OWNED)).toBe(0);
  });

  it('counts what you own and what is on display', () => {
    const pieces = [piece('a', 'rug-ankara', true), piece('b', 'rug-ankara', false), piece('c', 'plant-snake', true)];
    expect(summarise(pieces)).toEqual({ total: 3, placed: 2, stored: 1 });
    expect(ownedCounts(pieces).get('rug-ankara')).toBe(2);
    expect(summarise([])).toEqual({ total: 0, placed: 0, stored: 0 });
  });
});
