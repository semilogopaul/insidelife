import { findVenue } from '@insidelife/shared';
import { canEnterVenue, PLAY_NOTICE_EVERY_MS, PLAY_NOTICE_FRESH_MS, shouldAnnouncePlay, type PlayNoticeInput } from './play-notice.rules.js';

const NOW = Date.parse('2026-10-09T21:00:00Z');
const input = (patch: Partial<PlayNoticeInput> = {}): PlayNoticeInput => ({ firstPlay: false, startedAt: NOW - 5_000, now: NOW, lastNoticeAt: null, ownerOnline: true, canEnter: true, ...patch });

describe('"your song is on now" notices', () => {
  it('always announces the first play of a run', () => {
    expect(shouldAnnouncePlay(input({ firstPlay: true, ownerOnline: false, canEnter: false, lastNoticeAt: NOW - 1_000 }))).toBe(true);
  });

  it('then only while the artist is online, at a club they can get into, at most every half hour', () => {
    expect(shouldAnnouncePlay(input())).toBe(true);
    expect(shouldAnnouncePlay(input({ ownerOnline: false }))).toBe(false);
    expect(shouldAnnouncePlay(input({ canEnter: false }))).toBe(false);
    expect(shouldAnnouncePlay(input({ lastNoticeAt: NOW - PLAY_NOTICE_EVERY_MS + 60_000 }))).toBe(false);
    expect(shouldAnnouncePlay(input({ lastNoticeAt: NOW - PLAY_NOTICE_EVERY_MS }))).toBe(true);
  });

  it('stays quiet about plays that started a while ago (catching up after a restart)', () => {
    expect(shouldAnnouncePlay(input({ firstPlay: true, startedAt: NOW - PLAY_NOTICE_FRESH_MS - 1 }))).toBe(false);
  });

  it('knows who gets past the door', () => {
    const quilox = findVenue('quilox');
    expect(quilox?.minStatus).toBeGreaterThan(0);
    expect(canEnterVenue(quilox, 0)).toBe(false);
    expect(canEnterVenue(quilox, quilox?.minStatus ?? 0)).toBe(true);
    expect(canEnterVenue(findVenue('yaba-left-joint'), 0)).toBe(true);
    expect(canEnterVenue(undefined, 999)).toBe(false);
  });
});
