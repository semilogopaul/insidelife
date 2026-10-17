import { describe, expect, it } from 'vitest';
import { AIRCRAFT, LIVERY_COLOURS, type AircraftCatalogEntryDto, type OwnedAircraftDto, type PilotTrainingDto } from '@insidelife/shared';
import { servicesAt } from '@/common/places/services';
import {
  airframeFor,
  cabinDecorEntry,
  formatFlightTime,
  lessonProgress,
  liveryHex,
  nameProblem,
  nextTrainingStep,
  purchaseLines,
  purchaseTotal,
  registrationDraft,
  registrationFull,
  registrationProblem,
  sortFleet,
} from '../services/hangar-rules';

const training: PilotTrainingDto = {
  licence: false,
  enrolled: true,
  lessons: 3,
  lessonsRequired: 16,
  checkRideAttempts: 0,
  enrolFee: 6_000_000,
  lessonFee: 1_400_000,
  checkRideFee: 2_500_000,
  nextLessonAt: null,
  inProgress: null,
  endsAt: null,
  atSchool: true,
  schoolVenueId: 'mmia-gat',
  minAge: 18,
};

describe('airframes', () => {
  it('every aircraft class has a silhouette', () => {
    expect(AIRCRAFT.map((aircraft) => airframeFor(aircraft.class))).toEqual(['piston', 'twin', 'turboprop', 'turboprop', 'jet', 'jet', 'jet', 'airliner']);
  });

  it('knows every palette colour and falls back to white for a bad id', () => {
    for (const colour of LIVERY_COLOURS) expect(liveryHex(colour.id)).toBe(colour.hex);
    expect(liveryHex('chartreuse')).toBe('#f5f7fa');
  });
});

describe('flight times', () => {
  it('reads as hours and minutes', () => {
    expect(formatFlightTime(45)).toBe('45m');
    expect(formatFlightTime(120)).toBe('2h');
    expect(formatFlightTime(167.4)).toBe('2h 47m');
  });
});

describe('names and registrations as you type', () => {
  it('turns whatever you type into three upper-case letters', () => {
    expect(registrationDraft('tol')).toBe('TOL');
    expect(registrationDraft('5N-tolu')).toBe('TOL');
    expect(registrationDraft('t0l9x')).toBe('TLX');
    expect(registrationFull('tol')).toBe('5N-TOL');
  });

  it('flags short, rude and malformed ones; blank is fine', () => {
    expect(registrationProblem('')).toBeNull();
    expect(registrationProblem('TO')).not.toBeNull();
    expect(registrationProblem('SEX')).not.toBeNull();
    expect(registrationProblem('TOL')).toBeNull();
    expect(nameProblem('')).toBeNull();
    expect(nameProblem('Air Tolu')).toBeNull();
    expect(nameProblem('Air-Tolu')).not.toBeNull();
    expect(nameProblem('x'.repeat(17))).not.toBeNull();
  });
});

describe('buying', () => {
  const entry = { aircraft: AIRCRAFT[0]!, price: 210_000_000, ferryFee: 1_500_000 } as AircraftCatalogEntryDto;

  it('adds the ferry flight only when you are not at the sales desk', () => {
    expect(purchaseTotal(entry, true)).toBe(210_000_000);
    expect(purchaseTotal(entry, false)).toBe(211_500_000);
    expect(purchaseLines(entry, true, 'mmia-gat')).toHaveLength(1);
    expect(purchaseLines(entry, false, 'naia-gat')).toHaveLength(2);
  });
});

describe('licence steps', () => {
  it('walks enrol, lesson, wait, check-ride, done', () => {
    expect(nextTrainingStep({ ...training, enrolled: false, lessons: 0 }, 100)).toBe('enrol');
    expect(nextTrainingStep(training, 100)).toBe('lesson');
    expect(nextTrainingStep({ ...training, nextLessonAt: 500 }, 100)).toBe('wait');
    expect(nextTrainingStep({ ...training, nextLessonAt: 500 }, 600)).toBe('lesson');
    expect(nextTrainingStep({ ...training, inProgress: 'lesson', endsAt: 200 }, 100)).toBe('busy');
    expect(nextTrainingStep({ ...training, lessons: 16 }, 100)).toBe('check-ride');
    expect(nextTrainingStep({ ...training, licence: true }, 100)).toBe('licensed');
  });

  it('reports progress as a share', () => {
    expect(lessonProgress(training)).toBeCloseTo(3 / 16);
    expect(lessonProgress({ ...training, lessons: 20 })).toBe(1);
  });
});

describe('fleet order', () => {
  const plane = (id: string, value: number, flyBlocker: string | null) => ({ id, value, flyBlocker }) as OwnedAircraftDto;
  it('lists aircraft you can fly now first, then by value', () => {
    expect(sortFleet([plane('a', 5, 'grounded'), plane('b', 1, null), plane('c', 9, null)]).map((p) => p.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('place services', () => {
  it('the GAT has a sales desk, a flight school and your aircraft (Hangar app), plus commercial flights', () => {
    const services = servicesAt({ kind: 'venue', venueType: 'aviation-terminal' } as never);
    expect(services.map((service) => service.id)).toEqual(['aircraft-sales', 'flight-school', 'my-aircraft', 'gat-flights']);
    const app = (id: string) => services.find((service) => service.id === id)?.opens;
    for (const id of ['aircraft-sales', 'flight-school', 'my-aircraft']) expect(app(id)).toMatchObject({ app: 'hangar' });
    expect(app('gat-flights')).toMatchObject({ app: 'flights' });
  });
});

describe('decorate cabin entry', () => {
  it('is offered only aboard your plane with its cabin on screen', () => {
    expect(cabinDecorEntry('p1', 'aircraft:p1', 'p1')).toBe('decorate');
    expect(cabinDecorEntry('p1', 'aircraft:p1', null)).toBe('step-in');
    expect(cabinDecorEntry('p1', 'aircraft:p1', 'p2')).toBe('step-in');
    expect(cabinDecorEntry('p1', 'mmia-gat', 'p1')).toBeNull();
    expect(cabinDecorEntry('p1', 'aircraft:p2', 'p2')).toBeNull();
    expect(cabinDecorEntry('p1', undefined, null)).toBeNull();
  });
});
