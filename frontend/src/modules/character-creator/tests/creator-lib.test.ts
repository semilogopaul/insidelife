import { describe, expect, it } from 'vitest';
import { BACKGROUNDS, findClothing } from '@insidelife/shared';
import { BACKGROUND_TONE, LOTTERY_ORDER, backgroundFacts, backgroundPerk } from '../lib/background-facts';
import { OUTFIT_PRESETS, presetOutfit, starterOutfit } from '../lib/presets';

describe('outfit presets', () => {
  it('only reference real catalog items in the right slot', () => {
    for (const preset of OUTFIT_PRESETS) {
      for (const gender of ['male', 'female'] as const) {
        for (const [slot, id] of Object.entries(presetOutfit(preset, gender))) {
          const item = id ? findClothing(id) : undefined;
          expect(item, `${preset}/${gender}/${slot}: ${id}`).toBeDefined();
          expect(item?.slot).toBe(slot);
        }
      }
    }
  });

  it('starts everyone in the starter wardrobe', () => {
    expect(Object.keys(starterOutfit('male')).length).toBeGreaterThan(1);
    expect(Object.keys(starterOutfit('female')).length).toBeGreaterThan(1);
  });
});

describe('background facts', () => {
  it('describes every background with money, home and a perk', () => {
    for (const background of Object.values(BACKGROUNDS)) {
      const facts = backgroundFacts(background);
      expect(facts.map((fact) => fact.label)).toEqual(['Starting cash', 'Pocket money', 'You grow up in', 'The perk']);
      expect(facts.every((fact) => fact.value.length > 0)).toBe(true);
      expect(backgroundPerk(background).length).toBeGreaterThan(5);
      expect(BACKGROUND_TONE[background.id]).toBeDefined();
    }
  });

  it('orders the lottery cards from most to least common', () => {
    const weights = LOTTERY_ORDER.map((id) => BACKGROUNDS[id].weight);
    expect([...weights].sort((a, b) => b - a)).toEqual(weights);
  });
});
