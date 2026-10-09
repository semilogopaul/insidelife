import { describe, expect, it } from 'vitest';
import type { AuthUserDto } from '@insidelife/shared';
import { destinationFor } from '../lib/destination';

const user = (hasCharacter: boolean, mustVerifyEmail = false): AuthUserDto => ({
  id: 'u',
  email: 'a@b.c',
  emailVerified: !mustVerifyEmail,
  mustVerifyEmail,
  hasCharacter,
});

describe('destinationFor', () => {
  it('returns to safe next paths, even without a character outside the game', () => {
    expect(destinationFor(user(false), '/refunds')).toBe('/refunds');
    expect(destinationFor(user(true), '/payments/callback?reference=x')).toBe('/payments/callback?reference=x');
  });

  it('sends players without a character to the creator before the game', () => {
    expect(destinationFor(user(false), '/play')).toBe('/create');
    expect(destinationFor(user(false), null)).toBe('/create');
    expect(destinationFor(user(true), null)).toBe('/play');
  });

  it('ignores unsafe redirects', () => {
    expect(destinationFor(user(true), '//evil.example')).toBe('/play');
    expect(destinationFor(user(true), 'https://evil.example')).toBe('/play');
  });

  it('never asks for a code while verification is optional, even with an unconfirmed email', () => {
    const optional: AuthUserDto = { ...user(false), emailVerified: false, mustVerifyEmail: false };
    expect(destinationFor(optional, null)).toBe('/create');
  });

  it('asks for the email code first when the server requires it, keeping where the player was headed', () => {
    expect(destinationFor(user(true, true), null)).toBe('/verify-email');
    expect(destinationFor(user(false, true), '/play')).toBe('/verify-email?next=%2Fplay');
    expect(destinationFor(user(true, true), '//evil.example')).toBe('/verify-email');
    // Once verified, never loop back to the code screen.
    expect(destinationFor(user(true), '/verify-email')).toBe('/play');
  });
});
