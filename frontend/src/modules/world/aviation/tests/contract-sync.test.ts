import { describe, expect, it } from 'vitest';
import { AIRCRAFT } from '@insidelife/shared';
import { AIRCRAFT_CLASS_OF, AIRCRAFT_IDS } from '../contract';

describe('3D aircraft list', () => {
  it('draws exactly the aircraft the shared catalog sells, each in its class', () => {
    expect([...AIRCRAFT_IDS].sort()).toEqual(AIRCRAFT.map((aircraft) => aircraft.id).sort());
    for (const aircraft of AIRCRAFT) expect(AIRCRAFT_CLASS_OF[aircraft.id as keyof typeof AIRCRAFT_CLASS_OF]).toBe(aircraft.class);
  });
});
