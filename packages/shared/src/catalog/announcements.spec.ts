import { describe, expect, it } from 'vitest';
import { advancesAnnouncement, ANNOUNCEMENTS, pendingAnnouncement, type Announcement } from './announcements.js';

const make = (id: string): Announcement => ({ id, title: id, body: [], actions: [], hero: 'jet-abuja' });
const CATALOG = [make('a'), make('b')];

describe('announcements', () => {
  it('ships the private jets announcement with its four buttons', () => {
    const first = ANNOUNCEMENTS[0]!;
    expect(first.actions.map((action) => [action.label, action.app, action.param])).toEqual([
      ['Open Hangar', 'hangar', undefined],
      ['Book a flight', 'flights', undefined],
      ['Race a friend', 'flights', 'race'],
      ['Top up', 'bank', 'topup'],
    ]);
  });
  it('has unique ids', () => {
    expect(new Set(ANNOUNCEMENTS.map((a) => a.id)).size).toBe(ANNOUNCEMENTS.length);
  });
  it('shows the newest to anyone who has not seen it, once', () => {
    expect(pendingAnnouncement(null, CATALOG)?.id).toBe('b');
    expect(pendingAnnouncement('a', CATALOG)?.id).toBe('b');
    expect(pendingAnnouncement('b', CATALOG)).toBeNull();
    expect(pendingAnnouncement(null, [])).toBeNull();
  });
  it('only moves forward', () => {
    expect(advancesAnnouncement(null, 'a', CATALOG)).toBe(true);
    expect(advancesAnnouncement('a', 'b', CATALOG)).toBe(true);
    expect(advancesAnnouncement('b', 'a', CATALOG)).toBe(false);
    expect(advancesAnnouncement('b', 'b', CATALOG)).toBe(false);
    expect(advancesAnnouncement(null, 'zzz', CATALOG)).toBe(false);
  });
});
