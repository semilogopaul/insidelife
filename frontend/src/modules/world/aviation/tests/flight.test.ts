import { describe, expect, it } from 'vitest';
import { AIRCRAFT_CLASSES } from '../contract';
import { PHASE_CAPTION, flightAt, flightDistance, flightProfile, phaseStarts, type FlightPhase } from '../flight/flight-timeline';

const ORDER: FlightPhase[] = ['takeoff', 'climb', 'cruise', 'descent', 'landing'];

describe('flight timeline', () => {
  it('shares every flight between five phases that add up to the whole', () => {
    for (const cls of AIRCRAFT_CLASSES) {
      const shares = flightProfile(cls).shares;
      expect(Object.values(shares).reduce((a, b) => a + b, 0), cls).toBeCloseTo(1, 6);
      const starts = phaseStarts(cls);
      expect(ORDER.map((phase) => starts[phase]), cls).toEqual([...ORDER.map((phase) => starts[phase])].sort((a, b) => a - b));
      expect(Object.keys(PHASE_CAPTION)).toEqual(ORDER);
    }
  });

  it('takes off, climbs, cruises, descends and lands, in that order, on the ground at both ends', () => {
    for (const cls of AIRCRAFT_CLASSES) {
      const seen: FlightPhase[] = [];
      let last = -1;
      let peak = 0;
      for (let i = 0; i <= 200; i++) {
        const state = flightAt(i / 200, cls);
        if (seen[seen.length - 1] !== state.phase) seen.push(state.phase);
        peak = Math.max(peak, state.altitude);
        expect(state.altitude, cls).toBeGreaterThanOrEqual(0);
        expect(state.altitude, cls).toBeLessThanOrEqual(1);
        expect(state.k).toBeGreaterThanOrEqual(0);
        expect(state.k).toBeLessThanOrEqual(1);
        last = state.altitude;
      }
      expect(seen, cls).toEqual(ORDER);
      expect(peak, cls).toBe(1);
      expect(flightAt(0, cls).altitude).toBe(0);
      expect(last).toBeLessThan(0.01);
    }
  });

  it('climbs steadily and descends steadily (no yo-yo), and fades the city in the climb', () => {
    for (const cls of AIRCRAFT_CLASSES) {
      const climb = flightProfile(cls).shares;
      const up = climb.takeoff + climb.climb;
      const down = up + climb.cruise;
      let previous = 0;
      for (let i = 0; i <= 100; i++) {
        const altitude = flightAt((i / 100) * up, cls).altitude;
        expect(altitude, `${cls} up ${i}`).toBeGreaterThanOrEqual(previous - 1e-9);
        previous = altitude;
      }
      for (let i = 0; i <= 100; i++) {
        const altitude = flightAt(down + (i / 100) * (1 - down), cls).altitude;
        expect(altitude, `${cls} down ${i}`).toBeLessThanOrEqual(previous + 1e-9);
        previous = altitude;
      }
      expect(flightAt(0, cls).city).toBe(1);
      expect(flightAt(up, cls).city).toBeLessThan(0.05);
      expect(flightAt(1, cls).city).toBeGreaterThan(0.9);
      // Clouds build in the climb and are thickest on the way through.
      expect(flightAt(0, cls).cloud).toBe(0);
      expect(Math.max(...Array.from({ length: 50 }, (_, i) => flightAt((i / 49) * up, cls).cloud))).toBeGreaterThan(0.5);
    }
  });

  it('pitches the nose up in the climb, not on the ground, and levels in the cruise', () => {
    for (const cls of AIRCRAFT_CLASSES) {
      const shares = flightProfile(cls).shares;
      expect(flightAt(0, cls).pitch).toBe(0);
      expect(flightAt(shares.takeoff + shares.climb * 0.3, cls).pitch).toBeGreaterThan(0.03);
      expect(flightAt(shares.takeoff + shares.climb + shares.cruise * 0.5, cls).pitch).toBe(0);
    }
  });

  it('differs by class: jets cruise higher and faster than pistons', () => {
    expect(flightProfile('long-range-jet').cruise).toBeGreaterThan(flightProfile('piston-single').cruise);
    expect(flightProfile('long-range-jet').speed).toBeGreaterThan(flightProfile('piston-single').speed);
    expect(flightProfile('midsize-jet').climbPitch).toBeGreaterThan(flightProfile('piston-twin').climbPitch);
  });

  it('flies a monotonic distance that grows with the duration, from zero', () => {
    for (const cls of AIRCRAFT_CLASSES) {
      expect(flightDistance(0, cls, 20)).toBe(0);
      let previous = 0;
      for (let i = 1; i <= 50; i++) {
        const d = flightDistance(i / 50, cls, 20);
        expect(d, cls).toBeGreaterThan(previous);
        previous = d;
      }
      expect(flightDistance(1, cls, 40)).toBeCloseTo(flightDistance(1, cls, 20) * 2, 3);
    }
  });
});
