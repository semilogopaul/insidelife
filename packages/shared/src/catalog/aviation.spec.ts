import { describe, expect, it } from 'vitest';
import { MINUTES_PER_DAY } from '../time/calendar.js';
import { findAction } from './actions.js';
import {
  AIRCRAFT,
  AIRCRAFT_CLASS_INFO,
  GAT_ROUTE_KM,
  LIVERY_COLOURS,
  PILOT_TRAINING,
  aircraftBrokerOffer,
  aircraftFerryFee,
  aircraftMarketValue,
  aircraftMonthlyCosts,
  aircraftNameIssue,
  aircraftNeedsLicence,
  checkRidePassChance,
  findAircraft,
  flightFuelCost,
  flightMinutes,
  gatDistanceKm,
  isValidLivery,
  normaliseAircraftName,
  normaliseRegistration,
  registrationIssue,
} from './aviation.js';

describe('aircraft catalog (docs/MULTI_CITY.md)', () => {
  it('has the eight aircraft with the contract ids, classes and prices', () => {
    expect(AIRCRAFT.map((aircraft) => [aircraft.id, aircraft.class, aircraft.price])).toEqual([
      ['cessna-172', 'piston-single', 200_000_000],
      ['piper-seneca', 'piston-twin', 600_000_000],
      ['king-air-350', 'turboprop', 4_000_000_000],
      ['pilatus-pc12', 'turboprop', 7_000_000_000],
      ['phenom-300e', 'light-jet', 15_000_000_000],
      ['challenger-350', 'midsize-jet', 35_000_000_000],
      ['gulfstream-g650', 'long-range-jet', 95_000_000_000],
      ['boeing-bbj', 'airliner-jet', 150_000_000_000],
    ]);
  });

  it('piston planes and turboprops need a licence, jets come with a crew', () => {
    for (const aircraft of AIRCRAFT) {
      const jet = aircraft.class.endsWith('jet');
      expect(aircraftNeedsLicence(aircraft)).toBe(!jet);
      expect(AIRCRAFT_CLASS_INFO[aircraft.class].crewSalaryPerMonth > 0).toBe(jet);
    }
  });

  it('every aircraft can make the Lagos-Abuja hop and its numbers are sane', () => {
    for (const aircraft of AIRCRAFT) {
      expect(aircraft.rangeKm).toBeGreaterThan(GAT_ROUTE_KM);
      expect(aircraft.seats).toBeGreaterThanOrEqual(4);
      expect(aircraft.fuelType).toBe(aircraft.class.startsWith('piston') ? 'avgas' : 'jet-a1');
    }
  });

  it('costs grow with the class and a faster aircraft flies the route sooner', () => {
    const hangar = AIRCRAFT.map((aircraft) => AIRCRAFT_CLASS_INFO[aircraft.class].hangarFeePerMonth);
    expect(hangar).toEqual([...hangar].sort((x, y) => x - y));
    const slow = flightMinutes(findAircraft('cessna-172')!, GAT_ROUTE_KM);
    const fast = flightMinutes(findAircraft('phenom-300e')!, GAT_ROUTE_KM);
    expect(slow).toBeGreaterThan(fast);
    expect(fast).toBeGreaterThan(60);
  });
});

describe('running costs', () => {
  const cessna = findAircraft('cessna-172')!;
  const g650 = findAircraft('gulfstream-g650')!;

  it('values depreciate with age and never fall below the floor', () => {
    const fresh = aircraftMarketValue(cessna, 0);
    expect(fresh).toBe(cessna.price);
    expect(aircraftMarketValue(cessna, 360 * 5)).toBeLessThan(fresh);
    expect(aircraftMarketValue(g650, 360 * 100)).toBe(g650.price * 0.3);
    expect(aircraftMarketValue(cessna, 0, 1.2)).toBe(cessna.price * 1.2);
  });

  it('a broker pays between 88% and 95% of value', () => {
    expect(aircraftBrokerOffer(1_000_000_000, 0)).toBe(880_000_000);
    expect(aircraftBrokerOffer(1_000_000_000, 0.999)).toBeLessThanOrEqual(950_000_000);
  });

  it('month-end bill: hangar by class, maintenance as a share of value, crew for jets only', () => {
    const piston = aircraftMonthlyCosts(cessna, cessna.price);
    expect(piston.hangar).toBe(250_000);
    expect(piston.crew).toBe(0);
    expect(piston.maintenance).toBe(Math.round((cessna.price * 0.04) / 12 / 100) * 100);
    expect(piston.total).toBe(piston.hangar + piston.maintenance);
    const jet = aircraftMonthlyCosts(g650, g650.price);
    expect(jet.crew).toBe(9_000_000);
    expect(jet.total).toBe(jet.hangar + jet.maintenance + jet.crew);
    expect(aircraftMonthlyCosts(cessna, cessna.price, 1.5).hangar).toBe(375_000);
  });

  it('fuel is charged by distance and fuel type', () => {
    expect(flightFuelCost(cessna, 0, 900)).toBe(0);
    const near = flightFuelCost(cessna, 200, 900);
    const far = flightFuelCost(cessna, GAT_ROUTE_KM, 900);
    expect(far).toBeGreaterThan(near);
    expect(far).toBeGreaterThan(0);
    expect(flightFuelCost(g650, GAT_ROUTE_KM, 900)).toBeGreaterThan(far);
  });

  it('ferry fee has a floor and scales with the price', () => {
    expect(aircraftFerryFee(cessna)).toBe(1_500_000);
    expect(aircraftFerryFee(g650)).toBeGreaterThan(aircraftFerryFee(cessna));
  });

  it('only Lagos <-> Abuja GATs have a distance', () => {
    expect(gatDistanceKm('mmia-gat', 'naia-gat')).toBe(GAT_ROUTE_KM);
    expect(gatDistanceKm('naia-gat', 'mmia-gat')).toBe(GAT_ROUTE_KM);
    expect(gatDistanceKm('mmia-gat', 'mmia-gat')).toBe(0);
    expect(gatDistanceKm('mmia-gat', 'kano-gat')).toBe(0);
  });
});

describe('livery, names and registrations', () => {
  it('has a palette with pinks and a validator', () => {
    expect(LIVERY_COLOURS.filter((colour) => colour.id.includes('pink')).length).toBeGreaterThanOrEqual(3);
    expect(new Set(LIVERY_COLOURS.map((colour) => colour.id)).size).toBe(LIVERY_COLOURS.length);
    for (const colour of LIVERY_COLOURS) expect(colour.hex).toMatch(/^#[0-9a-f]{6}$/);
    expect(isValidLivery({ base: 'hot-pink', accent: 'arctic-white' })).toBe(true);
    expect(isValidLivery({ base: 'hot-pink', accent: 'chartreuse' })).toBe(false);
  });

  it('names: 2 to 16 characters, letters digits and spaces', () => {
    expect(aircraftNameIssue('Air Tolu')).toBeNull();
    expect(aircraftNameIssue('A')).not.toBeNull();
    expect(aircraftNameIssue('A'.repeat(17))).not.toBeNull();
    expect(aircraftNameIssue('A'.repeat(16))).toBeNull();
    expect(aircraftNameIssue('Air-Tolu')).not.toBeNull();
    expect(aircraftNameIssue('Air  Tolu')).not.toBeNull();
    expect(aircraftNameIssue('Ọba')).not.toBeNull();
    expect(normaliseAircraftName('  Air Tolu ')).toBe('AIR TOLU');
  });

  it('registrations are 5N- and three letters', () => {
    expect(normaliseRegistration('tol')).toBe('5N-TOL');
    expect(normaliseRegistration('5n-tol')).toBe('5N-TOL');
    expect(normaliseRegistration('5NTOL')).toBe('5N-TOL');
    expect(normaliseRegistration('TO')).toBeNull();
    expect(normaliseRegistration('TOLU')).toBeNull();
    expect(normaliseRegistration('T0L')).toBeNull();
    expect(registrationIssue('tol')).toBeNull();
    expect(registrationIssue('sex')).not.toBeNull();
    expect(registrationIssue('12')).not.toBeNull();
  });
});

describe('Private Pilot Licence', () => {
  it('has lesson and check-ride system actions', () => {
    expect(findAction(PILOT_TRAINING.lessonActionId)).toMatchObject({ system: true, durations: [PILOT_TRAINING.lessonMinutes] });
    expect(findAction(PILOT_TRAINING.checkRideActionId)).toMatchObject({ system: true, durations: [PILOT_TRAINING.checkRideMinutes] });
  });

  it('takes weeks: one lesson a day and sixteen lessons', () => {
    expect(PILOT_TRAINING.lessonsRequired).toBeGreaterThanOrEqual(10);
    expect(PILOT_TRAINING.lessonsRequired * MINUTES_PER_DAY).toBeGreaterThanOrEqual(14 * MINUTES_PER_DAY);
  });

  it('check-ride chance is bounded and rewards extra lessons', () => {
    const base = { intellect: 30, hustle: 30, mood: 50, extraLessons: 0 };
    expect(checkRidePassChance(base)).toBeGreaterThan(0.3);
    expect(checkRidePassChance({ ...base, extraLessons: 4 })).toBeGreaterThan(checkRidePassChance(base));
    expect(checkRidePassChance({ intellect: 100, hustle: 100, mood: 100, extraLessons: 50 })).toBe(0.93);
    expect(checkRidePassChance({ intellect: 0, hustle: 0, mood: 0, extraLessons: 0 })).toBeCloseTo(0.4, 5);
  });
});
