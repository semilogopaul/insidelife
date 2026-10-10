import { describe, expect, it } from 'vitest';
import { TRANSPORT } from '@insidelife/shared';
import { rankRides, rideAdvice } from '../services/ride-ranking';
import { TOUR_STEPS } from '../services/steps';

describe('ride ranking', () => {
  it('danfo is slowest and okada fastest, in normal and rush-hour traffic', () => {
    for (const level of ['normal', 'rush'] as const) {
      const ranked = rankRides(level);
      expect(ranked[0]!.mode).toBe('okada');
      expect(ranked[ranked.length - 1]!.mode).toBe('danfo');
      expect(ranked.some((ride) => ride.mode === 'walk')).toBe(false);
    }
  });

  it('the BRT beats Bolt at rush hour, and Bolt is not the fastest', () => {
    const rush = rankRides('rush').map((ride) => ride.mode);
    expect(rush.indexOf('brt')).toBeLessThan(rush.indexOf('bolt'));
    expect(rush[0]).not.toBe('bolt');
  });

  it('the copy names the data’s fastest, slowest and bridge-banned modes', () => {
    const rush = rankRides('rush');
    const text = rideAdvice();
    expect(text).toContain(`${rush[0]!.label} is fastest`);
    expect(text).toContain(`${rush[rush.length - 1]!.label} is the slowest`);
    expect(text).toContain(`${TRANSPORT.okada.label} and ${TRANSPORT.keke.label} can’t use the bridges`);
    expect(TOUR_STEPS.find((step) => step.id === 'map-ride')!.body({ touch: false, stickSide: null })).toContain(text);
  });
});
