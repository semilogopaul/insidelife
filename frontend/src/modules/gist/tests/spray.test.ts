import { describe, expect, it } from 'vitest';
import { addNotes, bundleAmount, bundleFor, efccWarning, validateSpray } from '../services/spray';

describe('note bundles', () => {
  it('counts ₦1,000 and ₦500 notes', () => {
    expect(bundleAmount({ thousands: 12, fiveHundreds: 1 })).toBe(12_500);
    expect(bundleFor(12_750)).toEqual({ thousands: 12, fiveHundreds: 1 });
    expect(bundleFor(-5)).toEqual({ thousands: 0, fiveHundreds: 0 });
  });

  it('folds pairs of ₦500 notes into ₦1,000s and never goes negative', () => {
    expect(addNotes({ thousands: 1, fiveHundreds: 1 }, 500, 1)).toEqual({ thousands: 2, fiveHundreds: 0 });
    expect(addNotes({ thousands: 0, fiveHundreds: 0 }, 1_000, -3)).toEqual({ thousands: 0, fiveHundreds: 0 });
    expect(addNotes({ thousands: 2, fiveHundreds: 0 }, 1_000, 5)).toEqual({ thousands: 7, fiveHundreds: 0 });
  });
});

describe('validateSpray', () => {
  it('needs at least one ₦500 note and whole notes', () => {
    expect(validateSpray(0, 1_000_000, 0)).toMatchObject({ ok: false, code: 'TOO_SMALL' });
    expect(validateSpray(1_250, 1_000_000, 0)).toMatchObject({ ok: false, code: 'NOT_WHOLE_NOTES' });
    expect(validateSpray(1_500, 1_000_000, 0)).toEqual({ ok: true });
  });

  it('caps a single spray, the party total and your cash', () => {
    expect(validateSpray(1_000_500, 5_000_000, 0)).toMatchObject({ ok: false, code: 'TOO_LARGE' });
    expect(validateSpray(20_000, 10_000, 0)).toMatchObject({ ok: false, code: 'NO_CASH' });
    expect(validateSpray(500_000, 10_000_000, 4_800_000)).toMatchObject({ ok: false, code: 'PARTY_CAP' });
  });
});

describe('efccWarning', () => {
  it('stays quiet up to ₦500k', () => {
    expect(efccWarning(0, 500_000)).toBeNull();
    expect(efccWarning(400_000, 50_000)).toBeNull();
  });
  it('warns when a spray crosses a ₦500k line, and keeps a softer warning after', () => {
    expect(efccWarning(450_000, 100_000)).toMatch(/EFCC fit carry you/);
    expect(efccWarning(600_000, 10_000)).toMatch(/EFCC is watching/);
    expect(efccWarning(990_000, 20_000)).toMatch(/EFCC fit carry you/);
  });
});
