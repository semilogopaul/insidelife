import { describe, expect, it } from 'vitest';
import { accentFor, luminance, mixHex, normalizeHex, parseHex, shadeHex, toHex } from '../materials/color-utils';
import { FABRIC_TILE_METRES, fabricAverageColor, fabricKey, normalizeFabricSpec } from '../materials/fabric-patterns';

describe('color utils', () => {
  it('round-trips hex colours and normalises short forms', () => {
    expect(toHex(parseHex('#1d4E89'))).toBe('#1d4e89');
    expect(normalizeHex('#fff')).toBe('#ffffff');
    expect(normalizeHex('not a colour')).toBe('#808080');
  });

  it('mixes and shades', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(shadeHex('#808080', 1)).toBe('#ffffff');
    expect(shadeHex('#808080', -1)).toBe('#000000');
  });

  it('orders luminance and finds a contrasting accent', () => {
    expect(luminance('#ffffff')).toBeGreaterThan(luminance('#2f1b14'));
    expect(accentFor('#101010', '#202020')).toBe('#f3e6c4');
  });
});

describe('fabric cache keys', () => {
  it('is stable across colour spellings and defaults', () => {
    const a = fabricKey(normalizeFabricSpec({ pattern: 'ankara', primary: '#E35D1C', secondary: '#1d4e89', patternSeed: 1101 }));
    const b = fabricKey(normalizeFabricSpec({ pattern: 'ankara', primary: '#e35d1c', secondary: '#1D4E89', patternSeed: 1101 }));
    expect(a).toBe(b);
  });

  it('distinguishes seeds for seeded prints only', () => {
    const ankara = (seed: number) => fabricKey(normalizeFabricSpec({ pattern: 'ankara', primary: '#e35d1c', secondary: '#1d4e89', patternSeed: seed }));
    const stripes = (seed: number) => fabricKey(normalizeFabricSpec({ pattern: 'stripes', primary: '#1f4e79', secondary: '#f1f1f1', patternSeed: seed }));
    expect(ankara(1)).not.toBe(ankara(2));
    expect(stripes(1)).toBe(stripes(2));
  });

  it('includes the variant (pinstripe suits vs striped polos)', () => {
    const base = { pattern: 'stripes', primary: '#212121', secondary: '#b0bec5' } as const;
    expect(fabricKey(normalizeFabricSpec(base))).not.toBe(fabricKey(normalizeFabricSpec({ ...base, variant: 'pinstripe' })));
  });

  it('averages prints for the crowd LOD and tiles every pattern', () => {
    const spec = normalizeFabricSpec({ pattern: 'aso-oke', primary: '#4a148c', secondary: '#d4af37' });
    expect(fabricAverageColor(spec)).not.toBe(spec.primary);
    for (const metres of Object.values(FABRIC_TILE_METRES)) expect(metres).toBeGreaterThan(0);
  });
});
