import { hourIndex, secondsLeftInHour, ViewDeduper, type DedupeStore } from './view-deduper.js';

/** In-memory stand-in for Redis sets with expiry. */
class MemoryStore implements DedupeStore {
  readonly sets = new Map<string, { members: Set<string>; expiresAt: number }>();
  now = 0;

  async addMembers(entries: ReadonlyArray<{ key: string; member: string }>, ttlSeconds: number): Promise<boolean[]> {
    return entries.map(({ key, member }) => {
      let set = this.sets.get(key);
      if (!set || set.expiresAt <= this.now) {
        set = { members: new Set(), expiresAt: 0 };
        this.sets.set(key, set);
      }
      set.expiresAt = this.now + ttlSeconds * 1000;
      if (set.members.has(member)) return false;
      set.members.add(member);
      return true;
    });
  }
}

const HOUR = 3_600_000;
const T0 = Date.parse('2026-10-08T10:05:00Z');

describe('ViewDeduper', () => {
  let store: MemoryStore;
  let deduper: ViewDeduper;

  beforeEach(() => {
    store = new MemoryStore();
    store.now = T0;
    deduper = new ViewDeduper(store, 'test-secret');
  });

  it('counts a viewer once per campaign per hour', async () => {
    expect(await deduper.firstSeen('impression', 'user-1', ['a', 'b'], T0)).toEqual(['a', 'b']);
    expect(await deduper.firstSeen('impression', 'user-1', ['a', 'b', 'c'], T0 + 10 * 60_000)).toEqual(['c']);
  });

  it('collapses repeats inside one batch', async () => {
    expect(await deduper.firstSeen('impression', 'user-1', ['a', 'a', 'b', 'a'], T0)).toEqual(['a', 'b']);
  });

  it('counts different viewers separately', async () => {
    expect(await deduper.firstSeen('impression', 'user-1', ['a'], T0)).toEqual(['a']);
    expect(await deduper.firstSeen('impression', 'user-2', ['a'], T0)).toEqual(['a']);
  });

  it('counts again in the next real hour', async () => {
    await deduper.firstSeen('impression', 'user-1', ['a'], T0);
    const nextHour = T0 + HOUR;
    store.now = nextHour;
    expect(await deduper.firstSeen('impression', 'user-1', ['a'], nextHour)).toEqual(['a']);
  });

  it('keeps impressions, clicks and plays apart', async () => {
    await deduper.firstSeen('impression', 'user-1', ['a'], T0);
    expect(await deduper.firstSeen('click', 'user-1', ['a'], T0)).toEqual(['a']);
    expect(await deduper.firstSeen('click', 'user-1', ['a'], T0)).toEqual([]);
  });

  it('stores no user ids: members are opaque, hour-scoped hashes', async () => {
    await deduper.firstSeen('impression', 'user-1', ['a'], T0);
    const [key, entry] = [...store.sets.entries()][0] ?? ['', { members: new Set<string>() }];
    const [member] = [...entry.members];
    expect(key).toBe(`promo:impression:${hourIndex(T0)}:a`);
    expect(member).not.toContain('user-1');
    expect(member).toHaveLength(11);
    expect(deduper.viewerToken('user-1', hourIndex(T0))).not.toBe(deduper.viewerToken('user-1', hourIndex(T0) + 1));
    expect(new ViewDeduper(store, 'other-secret').viewerToken('user-1', 1)).not.toBe(deduper.viewerToken('user-1', 1));
  });

  it('expires keys shortly after the hour ends', () => {
    expect(secondsLeftInHour(Date.parse('2026-10-08T10:59:00Z'))).toBe(120);
    expect(secondsLeftInHour(Date.parse('2026-10-08T10:00:00Z'))).toBe(3_660);
  });
});
