import { describe, expect, it } from 'vitest';
import type { AuthSessionDto } from '@insidelife/shared';
import { destinationFor } from '../hooks/use-auth';

const session = (hasCharacter: boolean): AuthSessionDto => ({
  accessToken: 't',
  accessTokenExpiresAt: 0,
  user: { id: 'u', email: 'a@b.c', emailVerified: true, hasCharacter },
});

describe('destinationFor', () => {
  it('returns to safe next paths, even without a character outside the game', () => {
    expect(destinationFor(session(false), '/admin/moderation')).toBe('/admin/moderation');
    expect(destinationFor(session(true), '/payments/callback?reference=x')).toBe('/payments/callback?reference=x');
  });

  it('sends players without a character to the creator before the game', () => {
    expect(destinationFor(session(false), '/play')).toBe('/create');
    expect(destinationFor(session(false), null)).toBe('/create');
    expect(destinationFor(session(true), null)).toBe('/play');
  });

  it('ignores unsafe redirects', () => {
    expect(destinationFor(session(true), '//evil.example')).toBe('/play');
    expect(destinationFor(session(true), 'https://evil.example')).toBe('/play');
  });
});
