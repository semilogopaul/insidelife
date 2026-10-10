import { describe, expect, it } from 'vitest';
import { HIDDEN_GRACE_MS, PING_EVERY_MS, PlayPresence, WATCHING_MS } from './play-state';

describe('PlayPresence', () => {
  it('reports playing on open, then at most every 45 s while the player is touching the game', () => {
    const presence = new PlayPresence(0, true);
    expect(presence.start()).toBe('playing');
    presence.sent('playing', 0);
    expect(presence.input(1_000)).toBeNull();
    expect(presence.input(PING_EVERY_MS)).toBe('playing');
  });

  it('keeps a player who is just watching at the controls for a while, then lets the autopilot back', () => {
    const presence = new PlayPresence(0, true);
    presence.sent('playing', 0);
    expect(presence.tick(PING_EVERY_MS)).toBe('playing');
    presence.sent('playing', PING_EVERY_MS);
    expect(presence.tick(WATCHING_MS + PING_EVERY_MS)).toBeNull();
  });

  it('ignores a quick tab switch, reports away after a long one, and playing again on return', () => {
    const presence = new PlayPresence(0, true);
    presence.sent('playing', 0);
    expect(presence.visibility(false, 10_000)).toBeNull();
    expect(presence.tick(10_000 + HIDDEN_GRACE_MS - 1)).toBeNull();
    expect(presence.tick(10_000 + HIDDEN_GRACE_MS)).toBe('away');
    presence.sent('away', 10_000 + HIDDEN_GRACE_MS);
    expect(presence.tick(10_000 + 2 * HIDDEN_GRACE_MS)).toBeNull();
    expect(presence.visibility(true, 200_000)).toBe('playing');
  });

  it('says away once when the page goes, and any touch afterwards reports playing at once', () => {
    const presence = new PlayPresence(0, true);
    presence.sent('playing', 0);
    expect(presence.leave()).toBe('away');
    presence.sent('away', 1_000);
    expect(presence.leave()).toBeNull();
    expect(presence.input(2_000)).toBe('playing');
  });

  it('stays quiet in a tab that opens hidden', () => {
    const presence = new PlayPresence(0, false);
    expect(presence.start()).toBeNull();
    expect(presence.input(5_000)).toBeNull();
  });
});
