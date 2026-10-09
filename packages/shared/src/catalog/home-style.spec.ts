import { describe, expect, it } from 'vitest';
import {
  HOUSE_NAME_PATTERN,
  NO_DECOR,
  NO_EXTERIOR,
  decorQuote,
  exteriorQuote,
  homeFloorArea,
} from './home-style.js';

describe('home style', () => {
  it('charges only for what changes', () => {
    const current = { ...NO_EXTERIOR, paint: 'cream' as const };
    expect(exteriorQuote('bungalow', current, { paint: 'cream' }, 1).total).toBe(0);
    const quote = exteriorQuote('bungalow', current, { paint: 'sky', gate: 'gold' }, 1);
    expect(quote.lines.map((line) => line.label)).toEqual([
      'Paint the house sky blue',
      'Paint the gate gold',
    ]);
    expect(quote.total).toBe(650_000 + 85_000);
  });

  it('prices a new roof as re-roofing, dearer for bigger houses, and follows the price index', () => {
    const bungalow = exteriorQuote('bungalow', NO_EXTERIOR, { roof: 'charcoal' }, 1).total;
    const mansion = exteriorQuote('mansion', NO_EXTERIOR, { roof: 'charcoal' }, 1).total;
    expect(mansion).toBeGreaterThan(bungalow * 3);
    expect(exteriorQuote('bungalow', NO_EXTERIOR, { roof: 'charcoal' }, 1.2).total).toBe(
      Math.round((bungalow * 1.2) / 1_000) * 1_000,
    );
  });

  it('renaming the gate plate is a small job; clearing it too', () => {
    expect(exteriorQuote('duplex', NO_EXTERIOR, { name: 'Bakare Lodge' }, 1).total).toBe(45_000);
    expect(exteriorQuote('duplex', { ...NO_EXTERIOR, name: 'Bakare Lodge' }, { name: null }, 1).total).toBe(
      45_000,
    );
  });

  it('prices floors by area and finish: marble far above cement', () => {
    const marble = decorQuote(3, NO_DECOR, { floor: 'marble' }, 1).total;
    const cement = decorQuote(3, NO_DECOR, { floor: 'cement' }, 1).total;
    expect(marble).toBe(homeFloorArea(3) * 48_000);
    expect(marble).toBeGreaterThan(cement * 15);
    expect(decorQuote(1, { paint: 'sage', floor: null }, { paint: 'sage' }, 1).total).toBe(0);
  });

  it('accepts sensible house names only', () => {
    expect(HOUSE_NAME_PATTERN.test('Bakare Lodge')).toBe(true);
    expect(HOUSE_NAME_PATTERN.test("Mama's Place")).toBe(true);
    expect(HOUSE_NAME_PATTERN.test('<script>')).toBe(false);
    expect(HOUSE_NAME_PATTERN.test('x')).toBe(false);
    expect(HOUSE_NAME_PATTERN.test('A'.repeat(25))).toBe(false);
  });
});
