import { VISIT_RULES } from '@insidelife/shared';
import { describe, expect, it } from 'vitest';
import { canEnter, hostOf, isOpenVisit, normaliseHandle, visitExpiry } from './visits.rules.js';

describe('visit rules', () => {
  it('keeps invites and accepted visits open until they expire', () => {
    expect(isOpenVisit({ status: 'invited', expiresAt: 100 }, 99)).toBe(true);
    expect(isOpenVisit({ status: 'accepted', expiresAt: 100 }, 100)).toBe(false);
    expect(isOpenVisit({ status: 'declined', expiresAt: 500 }, 1)).toBe(false);
    expect(isOpenVisit({ status: 'ended', expiresAt: 500 }, 1)).toBe(false);
  });

  it('lets a guest in only once they accepted', () => {
    expect(canEnter({ status: 'invited', expiresAt: 100 }, 10)).toBe(false);
    expect(canEnter({ status: 'accepted', expiresAt: 100 }, 10)).toBe(true);
    expect(canEnter({ status: 'accepted', expiresAt: 100 }, 100)).toBe(false);
  });

  it('parses hosts and handles', () => {
    expect(hostOf('home:abc')).toBe('abc');
    expect(hostOf('ikeja-city-mall')).toBeNull();
    expect(normaliseHandle(' @Tolu_B ')).toBe('tolu_b');
    expect(visitExpiry(10)).toBe(10 + VISIT_RULES.ttlMinutes);
  });
});
