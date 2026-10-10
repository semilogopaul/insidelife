import { describe, expect, it } from 'vitest';
import { clockAt, gameMinuteAt, nextRescaleAfter, parseClockRescales, realMsAt, wholeGameMinuteAt, type GameClockConfig } from './clock.js';

const EPOCH = Date.parse('2026-10-01T00:00:00.000Z');
const BASE: GameClockConfig = { epochRealMs: EPOCH, epochGameMinute: 360, scale: 120 };
const SWITCH = Date.parse('2026-10-12T09:00:00.000Z');

describe('clock re-anchoring (GAME_TIME_RESCALES)', () => {
  const rescales = parseClockRescales('2026-10-12T09:00:00Z@60');

  it('keeps the game minute continuous at the switch, then runs at the new speed', () => {
    const before = gameMinuteAt(clockAt(BASE, rescales, SWITCH - 1), SWITCH - 1);
    const at = gameMinuteAt(clockAt(BASE, rescales, SWITCH), SWITCH);
    expect(at - before).toBeCloseTo(120 / 60_000, 9);
    expect(at).toBeCloseTo(gameMinuteAt(BASE, SWITCH), 9);
    // One real minute later: 60 game minutes, not 120.
    const later = SWITCH + 60_000;
    expect(gameMinuteAt(clockAt(BASE, rescales, later), later) - at).toBeCloseTo(60, 9);
  });

  it('never moves time backwards across any number of changes', () => {
    const chain = parseClockRescales('2026-10-05T00:00:00Z@60, 2026-10-07T12:00:00Z@240,2026-10-09T00:00:00Z@60');
    let previous = Number.NEGATIVE_INFINITY;
    for (let t = EPOCH; t < EPOCH + 12 * 86_400_000; t += 3_600_000 + 7) {
      const minute = wholeGameMinuteAt(clockAt(BASE, chain, t), t);
      expect(minute).toBeGreaterThanOrEqual(previous);
      previous = minute;
    }
  });

  it('maps game minutes back to real time on the running piece', () => {
    const clock = clockAt(BASE, rescales, SWITCH + 5_000);
    const minute = gameMinuteAt(clock, SWITCH + 5_000);
    expect(realMsAt(clock, minute)).toBeCloseTo(SWITCH + 5_000, 3);
  });

  it('names the next change for clients to switch on time', () => {
    expect(nextRescaleAfter(rescales, SWITCH - 1)).toEqual({ atRealMs: SWITCH, scale: 60 });
    expect(nextRescaleAfter(rescales, SWITCH)).toBeNull();
  });

  it('rejects malformed or out-of-order entries and accepts none', () => {
    expect(parseClockRescales(undefined)).toEqual([]);
    expect(parseClockRescales(' ')).toEqual([]);
    expect(() => parseClockRescales('tomorrow@60')).toThrow(RangeError);
    expect(() => parseClockRescales('2026-10-12T09:00:00Z@0')).toThrow(RangeError);
    expect(() => parseClockRescales('2026-10-12T09:00:00Z')).toThrow(RangeError);
    expect(() => parseClockRescales('2026-10-12T09:00:00Z@60,2026-10-11T09:00:00Z@120')).toThrow(RangeError);
  });
});
