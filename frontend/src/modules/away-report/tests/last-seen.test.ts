import { beforeEach, describe, expect, it } from 'vitest';
import { readLastSeen, writeLastSeen } from '../services/last-seen';

describe('last seen is per character', () => {
  beforeEach(() => window.localStorage.clear());

  it("a new character on the same device starts with no absence (never another account's)", () => {
    writeLastSeen('old-character', 1_000);
    expect(readLastSeen('old-character')).toBe(1_000);
    expect(readLastSeen('new-character')).toBeNull();
  });
});
