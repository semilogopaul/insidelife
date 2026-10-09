import { describe, expect, it } from 'vitest';
import { HOST_TREAT_IDS, HOST_TREAT_KINDS, HOST_TREATS, HOSTING_RULES, findHostTreat, treatServings } from './hosting.js';

describe('hosting catalog', () => {
  it('defines every treat id once, in a known section, with a guest notification', () => {
    expect(HOST_TREATS.map((treat) => treat.id)).toEqual([...HOST_TREAT_IDS]);
    for (const treat of HOST_TREATS) {
      expect(HOST_TREAT_KINDS).toContain(treat.kind);
      expect(treat.served, treat.id).toContain('{host}');
      expect(treat.lasts, treat.id).toBeGreaterThan(0);
      expect(findHostTreat(treat.id)).toBe(treat);
    }
  });

  it('charges cash for everything but the pantry pot, and keeps alcohol 18+', () => {
    for (const treat of HOST_TREATS) {
      if (treat.pantryMeals) expect(treat.price, treat.id).toBe(0);
      else expect(treat.price, treat.id).toBeGreaterThan(0);
    }
    for (const id of ['beer', 'palm-wine', 'champagne'] as const) expect(findHostTreat(id)?.adultsOnly).toBe(true);
    for (const id of ['soft-drinks', 'jollof-chicken', 'cake'] as const) expect(findHostTreat(id)?.adultsOnly).toBeFalsy();
  });

  it('keeps per-treat clout and closeness inside the daily caps', () => {
    for (const treat of HOST_TREATS) {
      expect(treat.clout).toBeLessThanOrEqual(HOSTING_RULES.maxCloutPerDay);
      expect(treat.closeness).toBeLessThanOrEqual(HOSTING_RULES.maxClosenessPerDay);
    }
  });

  it('counts servings: everyone includes the host, packs go to guests, a cake is one', () => {
    expect(treatServings('everyone', 3)).toBe(4);
    expect(treatServings('guest', 3)).toBe(3);
    expect(treatServings('once', 3)).toBe(1);
    expect(treatServings('everyone', 0)).toBe(0);
  });
});
