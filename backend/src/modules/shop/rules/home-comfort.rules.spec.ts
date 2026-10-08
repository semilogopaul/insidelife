import { describe, expect, it } from 'vitest';
import { MAX_FURNITURE_COMFORT, NO_BED_QUALITY, findItem, type ItemDefinition } from '@insidelife/shared';
import { aggregateHomeComfort, belongingsStatus, capabilityTags, type OwnedForComfort } from './home-comfort.rules.js';

const def = (id: string): ItemDefinition => {
  const item = findItem(id);
  if (!item) throw new RangeError(`missing catalog item ${id}`);
  return item;
};
const owned = (id: string, condition = 100): OwnedForComfort => ({ def: def(id), condition });
const comfortFor = (raw: number): number => Math.round(MAX_FURNITURE_COMFORT * (1 - Math.exp(-raw / MAX_FURNITURE_COMFORT)) * 10) / 10;

describe('aggregateHomeComfort', () => {
  it('gives nothing (and a mat on the floor) for an empty room', () => {
    expect(aggregateHomeComfort([])).toEqual({ comfort: 0, bedQuality: NO_BED_QUALITY, power: 'none' });
  });

  it('only counts the best item per group (two beds don’t stack)', () => {
    const bonus = aggregateHomeComfort([owned('bed-foam-mattress'), owned('bed-orthopedic')]);
    expect(bonus.comfort).toBe(comfortFor(def('bed-orthopedic').comfort));
    expect(bonus.bedQuality).toBe(def('bed-orthopedic').bedQuality);
  });

  it('sums across groups with diminishing returns', () => {
    const items = ['bed-spring', 'sofa-fabric', 'fan-standing', 'tv-32', 'rug-persian'].map((id) => owned(id));
    const raw = items.reduce((sum, item) => sum + item.def.comfort, 0);
    const bonus = aggregateHomeComfort(items);
    expect(bonus.comfort).toBe(comfortFor(raw));
    expect(bonus.comfort).toBeLessThan(raw);
  });

  it('never reaches the 15-point cap, however rich the house', () => {
    const everything = ['bed-super-king', 'sofa-italian', 'dining-set', 'rug-persian', 'plants-snake', 'wardrobe-wooden', 'ac-split', 'fridge-double', 'cooker-gas', 'washing-machine', 'tv-75', 'ps5', 'sound-system', 'mosquito-net', 'books-african-classics', 'lantern-rechargeable'];
    const bonus = aggregateHomeComfort(everything.map((id) => owned(id)));
    expect(bonus.comfort).toBeGreaterThan(13);
    expect(bonus.comfort).toBeLessThanOrEqual(MAX_FURNITURE_COMFORT);
  });

  it('picks the best working power backup: solar > inverter > generator', () => {
    expect(aggregateHomeComfort([owned('gen-small')]).power).toBe('generator');
    expect(aggregateHomeComfort([owned('gen-diesel'), owned('inverter')]).power).toBe('inverter');
    expect(aggregateHomeComfort([owned('inverter'), owned('solar'), owned('gen-small')]).power).toBe('solar');
  });

  it('ignores faulty items for comfort, sleep and power', () => {
    const bonus = aggregateHomeComfort([owned('bed-orthopedic', 10), owned('solar', 5), owned('bed-foam-mattress', 80)]);
    expect(bonus.bedQuality).toBe(def('bed-foam-mattress').bedQuality);
    expect(bonus.power).toBe('none');
    expect(bonus.comfort).toBe(comfortFor(def('bed-foam-mattress').comfort));
  });
});

describe('belongings status and tags', () => {
  it('counts the best status item per group and drops faulty items', () => {
    const items = [owned('phone-tecno-spark'), owned('phone-iphone-17-pro-max'), owned('tv-75'), owned('ps5', 3)];
    expect(belongingsStatus(items)).toBe(def('phone-iphone-17-pro-max').status + def('tv-75').status);
  });

  it('exposes capability tags only for working items', () => {
    const tags = capabilityTags([owned('tv-32'), owned('laptop-hp-uk', 12), owned('mosquito-net')]);
    expect(tags.toSorted()).toEqual(['mosquito-net', 'tv']);
  });
});
