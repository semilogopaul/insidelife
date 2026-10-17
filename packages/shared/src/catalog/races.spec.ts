import { describe, expect, it } from 'vitest';
import { formatRaceTime, raceDecided, raceHowOf, racePlaces, RACE_DURATION_MINUTES, RACE_INVITE_MINUTES } from './races.js';

describe('raceHowOf', () => {
  it('tells the ways between the cities apart', () => {
    expect(raceHowOf('coach', false)).toBe('coach');
    expect(raceHowOf('flight', true)).toBe('commercial');
    expect(raceHowOf('flight', false)).toBe('private');
    expect(raceHowOf('walk', false)).toBeNull();
    expect(raceHowOf('danfo', false)).toBeNull();
  });
});

describe('racePlaces', () => {
  it('ranks by arrival and leaves out racers still on their way', () => {
    const places = racePlaces([
      { id: 'a', finishedAt: 300 },
      { id: 'b', finishedAt: 120 },
      { id: 'c', finishedAt: null },
    ]);
    expect(places.get('b')).toBe(1);
    expect(places.get('a')).toBe(2);
    expect(places.has('c')).toBe(false);
  });

  it('shares a place in a dead heat and skips the next one', () => {
    const places = racePlaces([
      { id: 'a', finishedAt: 100 },
      { id: 'b', finishedAt: 100 },
      { id: 'c', finishedAt: 150 },
    ]);
    expect([places.get('a'), places.get('b'), places.get('c')]).toEqual([1, 1, 3]);
  });
});

describe('raceDecided', () => {
  it('is not decided before anybody arrives', () => {
    expect(raceDecided([], [])).toBe(false);
    expect(raceDecided([], [100])).toBe(false);
  });

  it('is decided when the rest are not on a trip that beats the best arrival', () => {
    expect(raceDecided([100], [])).toBe(true);
    expect(raceDecided([100], [101, 400])).toBe(true);
  });

  it('waits for an unsettled racer whose landing is earlier (or level)', () => {
    expect(raceDecided([120], [100])).toBe(false);
    expect(raceDecided([120], [120])).toBe(false);
  });
});

describe('formatRaceTime', () => {
  it('writes minutes and hours', () => {
    expect(formatRaceTime(5)).toBe('5m');
    expect(formatRaceTime(72)).toBe('1h 12m');
    expect(formatRaceTime(605)).toBe('10h 05m');
  });
});

describe('race windows', () => {
  it('give a running race longer than an unanswered invitation', () => {
    expect(RACE_DURATION_MINUTES).toBeGreaterThan(RACE_INVITE_MINUTES);
  });
});
