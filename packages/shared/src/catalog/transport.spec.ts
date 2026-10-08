import { describe, expect, it } from 'vitest';
import { quoteTrip, trafficMultiplier } from './transport.js';

const calm = { hour: 13, weekend: true, raining: false, priceIndex: 1 } as const;
const rush = { hour: 8, weekend: false, raining: false, priceIndex: 1 } as const;

describe('Lagos trips', () => {
  it('makes rush hour much slower', () => {
    expect(trafficMultiplier(8, false, false)).toBeGreaterThan(2);
    const offPeak = quoteTrip('surulere', 'victoria-island', 'danfo', calm);
    const peak = quoteTrip('surulere', 'victoria-island', 'danfo', rush);
    expect(peak.minutes).toBeGreaterThan(offPeak.minutes * 1.5);
  });

  it('lets okada weave through traffic but bans it on the bridges', () => {
    const okadaMainland = quoteTrip('yaba', 'surulere', 'okada', rush);
    const danfoMainland = quoteTrip('yaba', 'surulere', 'danfo', rush);
    expect(okadaMainland.minutes).toBeLessThan(danfoMainland.minutes);
    expect(quoteTrip('yaba', 'ikoyi', 'okada', rush).allowed).toBe(false);
  });

  it('prices Bolt far above danfo and surges in the rain', () => {
    const danfo = quoteTrip('ikeja', 'lekki', 'danfo', calm);
    const bolt = quoteTrip('ikeja', 'lekki', 'bolt', calm);
    const boltRain = quoteTrip('ikeja', 'lekki', 'bolt', { ...calm, raining: true });
    expect(bolt.fare).toBeGreaterThan(danfo.fare * 4);
    expect(boltRain.fare).toBeGreaterThan(bolt.fare);
  });

  it('refuses long treks', () => {
    expect(quoteTrip('ikorodu', 'ajah', 'walk', calm).allowed).toBe(false);
  });
});
