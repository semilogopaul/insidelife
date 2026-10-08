import { describe, expect, it } from 'vitest';
import { venueEntrance } from '@insidelife/shared';
import { nearestVenueOfTypes } from '../services/directions';
import { formatProgress, progressRatio } from '../services/progress-format';

describe('nearestVenueOfTypes', () => {
  it('picks the closest open venue of the requested type', () => {
    const yaba = venueEntrance('cbt-yaba')!.position;
    const nearest = nearestVenueOfTypes(['cbt-centre'], yaba, 10);
    expect(nearest?.venue.id).toBe('cbt-yaba');
    expect(nearest?.open).toBe(true);
  });

  it('prefers an open venue over a closer closed one', () => {
    const yaba = venueEntrance('cbt-yaba')!.position;
    const nearest = nearestVenueOfTypes(['cbt-centre', 'hospital-public'], yaba, 2);
    expect(nearest?.open).toBe(true);
    expect(nearest?.venue.type).toBe('hospital-public');
  });

  it('returns null when nothing matches', () => {
    expect(nearestVenueOfTypes([], { x: 0, z: 0 }, 12)).toBeNull();
  });
});

describe('formatProgress', () => {
  it('formats by unit', () => {
    expect(formatProgress({ current: 3, target: 10, unit: 'count' })).toBe('3 / 10');
    expect(formatProgress({ current: 120_000, target: 500_000, unit: 'naira' })).toBe('₦120k / ₦500k');
    expect(formatProgress({ current: 17, target: 18, unit: 'years' })).toBe('17 / 18 years');
    expect(formatProgress({ current: 0, target: 1, unit: 'step' })).toBeNull();
  });
  it('caps the ratio at 1', () => {
    expect(progressRatio({ current: 15, target: 10, unit: 'count' })).toBe(1);
    expect(progressRatio(null)).toBe(0);
  });
});
