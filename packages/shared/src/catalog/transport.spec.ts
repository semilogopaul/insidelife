import { describe, expect, it } from 'vitest';
import { cityDefaultMode, modesInCity, quoteTrip, trafficMultiplier } from './transport.js';

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

describe('Abuja trips', () => {
  it('has no danfo or BRT, and Lagos has no green cab or city bus', () => {
    expect(quoteTrip('wuse', 'garki', 'danfo', calm).allowed).toBe(false);
    expect(quoteTrip('wuse', 'garki', 'brt', calm).allowed).toBe(false);
    expect(quoteTrip('ikeja', 'yaba', 'taxi', calm).allowed).toBe(false);
    expect(quoteTrip('ikeja', 'yaba', 'bus', calm).allowed).toBe(false);
    for (const mode of ['taxi', 'bus', 'bolt'] as const) expect(quoteTrip('wuse', 'garki', mode, calm).allowed).toBe(true);
    expect(modesInCity('abuja')).not.toContain('danfo');
    expect(modesInCity('lagos')).toContain('danfo');
    expect(cityDefaultMode('abuja')).toBe('bus');
  });

  it('bans okada and keke in the city centre, and lets them run between the satellite towns', () => {
    expect(quoteTrip('wuse', 'garki', 'okada', calm).allowed).toBe(false);
    expect(quoteTrip('kubwa', 'wuse', 'keke', calm).allowed).toBe(false);
    expect(quoteTrip('gwarinpa', 'gwarinpa', 'keke', calm).allowed).toBe(true);
    expect(quoteTrip('kubwa', 'kubwa', 'okada', calm).allowed).toBe(true);
    expect(quoteTrip('yaba', 'surulere', 'okada', calm).allowed).toBe(true);
  });

  it('prices the green cab between the bus and Bolt', () => {
    const bus = quoteTrip('wuse', 'jabi', 'bus', calm);
    const taxi = quoteTrip('wuse', 'jabi', 'taxi', calm);
    const bolt = quoteTrip('wuse', 'jabi', 'bolt', calm);
    expect(bus.fare).toBeLessThan(taxi.fare);
    expect(taxi.fare).toBeLessThan(bolt.fare);
  });
});
