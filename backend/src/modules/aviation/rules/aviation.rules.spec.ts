import { describe, expect, it } from 'vitest';
import { aircraftLocationId, findAircraft, normaliseRegistration, rngFor } from '@insidelife/shared';
import { boardBlocker, flyBlocker, randomRegistration, type FlyCheck } from './aviation.rules.js';

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

describe('flying from aboard', () => {
  const id = '11111111-1111-4111-8111-111111111111';

  it('counts standing aboard the aircraft as being at its terminal', () => {
    expect(flyBlocker({ ...ready, aircraftId: id, locationId: aircraftLocationId(id) })).toBeNull();
  });

  it('does not count being aboard a different aircraft', () => {
    expect(flyBlocker({ ...ready, aircraftId: id, locationId: aircraftLocationId('22222222-2222-4222-8222-222222222222') })).toMatch(/another terminal/);
    expect(flyBlocker({ ...ready, locationId: aircraftLocationId(id) })).toMatch(/another terminal/);
  });
});

describe('boardBlocker', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const at = { aircraftId: id, parkedAt: 'mmia-gat', arrivesAt: null, now: 1_000, locationId: 'mmia-gat', travelling: false } as const;

  it('lets the owner board from the terminal the aircraft is parked at, or once already aboard', () => {
    expect(boardBlocker(at)).toBeNull();
    expect(boardBlocker({ ...at, locationId: aircraftLocationId(id) })).toBeNull();
  });

  it('needs the right terminal, a parked aircraft and no trip under way', () => {
    expect(boardBlocker({ ...at, locationId: 'mmia-airport' })).toMatch(/another terminal/);
    expect(boardBlocker({ ...at, locationId: 'naia-gat' })).toMatch(/another terminal/);
    expect(boardBlocker({ ...at, arrivesAt: 1_001 })).toMatch(/in the air/);
    expect(boardBlocker({ ...at, travelling: true })).toMatch(/on the move/);
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
