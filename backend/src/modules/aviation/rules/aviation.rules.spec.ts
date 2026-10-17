import { describe, expect, it } from 'vitest';
import { findAircraft, normaliseRegistration, rngFor } from '@insidelife/shared';
import { flyBlocker, randomRegistration, type FlyCheck } from './aviation.rules.js';

const cessna = findAircraft('cessna-172')!;
const phenom = findAircraft('phenom-300e')!;

const ready: FlyCheck = {
  aircraft: cessna,
  parkedAt: 'mmia-gat',
  arrivesAt: null,
  grounded: false,
  now: 1_000,
  locationId: 'mmia-gat',
  travelling: false,
  licenceHeld: true,
};

describe('flyBlocker', () => {
  it('lets a licensed owner fly from the aircraft’s own GAT', () => {
    expect(flyBlocker(ready)).toBeNull();
  });

  it('needs the licence for piston planes and turboprops, never for crewed jets', () => {
    expect(flyBlocker({ ...ready, licenceHeld: false })).toMatch(/Private Pilot Licence/);
    expect(flyBlocker({ ...ready, aircraft: findAircraft('king-air-350')!, licenceHeld: false })).toMatch(/Private Pilot Licence/);
    expect(flyBlocker({ ...ready, aircraft: phenom, licenceHeld: false })).toBeNull();
  });

  it('must be at the aircraft’s terminal and not travelling', () => {
    expect(flyBlocker({ ...ready, locationId: 'mmia-airport' })).toMatch(/another terminal/);
    expect(flyBlocker({ ...ready, parkedAt: 'naia-gat' })).toMatch(/another terminal/);
    expect(flyBlocker({ ...ready, travelling: true })).toMatch(/on the move/);
  });

  it('refuses while the aircraft is in the air or grounded', () => {
    expect(flyBlocker({ ...ready, arrivesAt: 1_001 })).toMatch(/in the air/);
    expect(flyBlocker({ ...ready, arrivesAt: 1_000 })).toBeNull();
    expect(flyBlocker({ ...ready, grounded: true })).toMatch(/Grounded/);
  });
});

describe('randomRegistration', () => {
  it('is deterministic for a seed and always a valid 5N- registration', () => {
    const first = randomRegistration(rngFor('seed', 'reg', 1));
    expect(randomRegistration(rngFor('seed', 'reg', 1))).toBe(first);
    for (let index = 0; index < 200; index++) {
      const registration = randomRegistration(rngFor('seed', 'reg', index));
      expect(normaliseRegistration(registration)).toBe(registration);
    }
  });
});
