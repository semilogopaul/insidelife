import { describe, expect, it } from 'vitest';
import { ACTIONS, findAction, type ActionDefinition } from '../catalog/actions.js';
import { quoteTrip } from '../catalog/transport.js';
import { NEED_KEYS, driftNeed } from '../needs/needs.js';
import { ACTION_PACE, TUNED_TIME_SCALE, actionHours } from './pacing.js';
import { DEFAULT_PROFILE_CONTEXT, actionProfile, idleHomeProfile, sleepProfile } from './profiles.js';

/** Durations (game minutes) at ×120, before the pacing change: each action must last as long in real seconds now. */
const AT_X120: Readonly<Record<string, readonly number[]>> = {
  explore: [60], 'write-exam': [180], treatment: [30, 60, 120, 180, 240, 480], 'driving-test': [120], 'hang-around': [90],
  nap: [60, 120], 'home-meal': [30], cook: [60], 'order-food': [45], 'eat-buka': [45], 'street-food': [20],
  'fine-dining': [120], shower: [20], 'watch-tv': [60, 120], 'visit-hangout': [60, 120, 180], scroll: [30, 60],
  'play-games': [60, 120], cinema: [150], 'window-shop': [60], 'beach-day': [120, 180], 'park-chill': [60, 120],
  lounge: [120, 180], 'club-night': [240], 'club-dance': [60, 120], 'club-bottle': [120], 'club-vip-table': [240],
  'club-bottle-parade': [60], 'buy-a-round': [60], 'lounge-cocktails': [120], 'live-band': [60, 120], 'beach-cabana': [180],
  'jet-ski': [60], 'horse-ride': [60], 'meet-people': [60], 'call-family': [30], worship: [120], gym: [90], jog: [60],
  'home-workout': [45], study: [60, 120, 180], 'learn-code': [60, 120, 180], 'practice-craft': [60, 120],
  'make-content': [60, 120], 'manage-business': [120, 240], freelance: [120, 240],
  // Added at ×60 (twice their game minutes here).
  'obo-hangout': [60, 120], 'obo-big-screen': [60, 120], 'obo-art-selfie': [30], 'obo-gallery': [60], 'obo-movie': [150],
  'obo-vip-screening': [150], 'obo-chef-table': [60], 'obo-fifa': [60, 120], 'obo-snooker': [60], 'obo-arcade': [30, 60],
  'obo-listen': [60, 120], 'obo-record': [120], 'obo-suite-rest': [60, 120], 'obo-freshen-up': [20], 'obo-drip': [30],
  'air-obo-cabin': [60], 'air-obo-champagne': [60], 'air-obo-captain': [30], 'air-obo-selfie': [30], 'air-obo-toilet': [20],
  'football-training': [120, 180], 'football-match': [180],
  'flight-lesson': [120], 'check-ride': [180],
  'refinery-tour': [120], 'refinery-learn': [60, 120], 'refinery-gift-shop': [30], 'refinery-view': [60],
};
const realSeconds = (gameMinutes: number, scale: number): number => (gameMinutes / scale) * 60;

describe('×60 pacing', () => {
  it('is tuned for ×60 with actions at twice the routine pace', () => {
    expect(TUNED_TIME_SCALE).toBe(60);
    expect(ACTION_PACE).toBe(120 / TUNED_TIME_SCALE);
  });

  it('keeps every action about as long in real seconds as it was at ×120', () => {
    for (const action of ACTIONS as readonly ActionDefinition[]) {
      if (action.id === 'sleep') continue;
      const before = AT_X120[action.id];
      expect(before, `${action.id} is listed`).toBeDefined();
      expect(action.durations).toHaveLength(before!.length);
      action.durations.forEach((minutes, index) => {
        expect(Number.isInteger(minutes)).toBe(true);
        expect(minutes).toBeGreaterThanOrEqual(10);
        const ratio = realSeconds(minutes, 60) / realSeconds(before![index]!, 120);
        expect(ratio, `${action.id} ${minutes}`).toBeGreaterThanOrEqual(1);
        expect(ratio, `${action.id} ${minutes}`).toBeLessThanOrEqual(1.12);
      });
    }
  });

  it('gives each action the same effect per run: its own drift runs at the pace', () => {
    for (const action of ACTIONS as readonly ActionDefinition[]) {
      if (action.id === 'sleep' || action.id === 'nap' || action.id === 'home-meal') continue;
      const profile = actionProfile(action, true, DEFAULT_PROFILE_CONTEXT);
      for (const need of NEED_KEYS) {
        const own = action.drift[need];
        if (own) expect(profile[need].rate, `${action.id}.${need}`).toBeCloseTo(own.rate * ACTION_PACE, 9);
        else expect(profile[need]).toEqual(idleHomeProfile(DEFAULT_PROFILE_CONTEXT)[need]);
      }
    }
    // An hour of study now (two effective hours) teaches what two hours did at ×120.
    expect(actionHours({ startedAt: 0, endsAt: 60 })).toBe(2);
  });

  it('makes a full night’s rest 3 game hours, even on a mat; naps are shorter and don’t fill you up', () => {
    const sleep = findAction('sleep')!;
    expect(sleep.durations).toEqual([180]);
    const mat = sleepProfile({ ...DEFAULT_PROFILE_CONTEXT, bedQuality: 0 });
    expect(driftNeed(0, mat.energy, 3)).toBe(100);
    const nap = findAction('nap')!;
    expect(Math.max(...nap.durations)).toBeLessThan(180);
    expect(driftNeed(0, actionProfile(nap, true, DEFAULT_PROFILE_CONTEXT).energy, Math.max(...nap.durations) / 60)).toBeLessThan(60);
  });

  it('keeps a booked ride as long in real seconds as before', () => {
    const conditions = { hour: 12, weekend: false, raining: false, priceIndex: 1, fareMultiplier: 1 };
    const trip = quoteTrip('yaba', 'lekki', 'danfo', conditions);
    expect(trip.allowed).toBe(true);
    // Unpaced, the same trip is distance / speed (+ bridge) game hours.
    const unpaced = (trip.distance / 17) * 60 + 15;
    expect(trip.minutes).toBeGreaterThan(unpaced / 2 - 15);
    expect(trip.minutes).toBeLessThan(unpaced / 2 + 15);
  });
});
