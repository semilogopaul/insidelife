import { describe, expect, it } from 'vitest';
import { visitCardCompact } from '../components/VisitCards';

describe('visitCardCompact', () => {
  it('folds the card into a chip on the move, so it never sits over the road', () => {
    for (const mode of ['driving', 'riding']) {
      expect(visitCardCompact(mode, true, { status: 'accepted' })).toBe(true);
      expect(visitCardCompact(mode, false, { status: 'invited' })).toBe(true);
    }
    expect(visitCardCompact('walking', true, { status: 'accepted' })).toBe(true);
  });

  it('keeps an invite open to answer on foot, and the full card inside on a big screen', () => {
    expect(visitCardCompact('walking', false, { status: 'invited' })).toBe(false);
    expect(visitCardCompact('inside', true, { status: 'accepted' })).toBe(false);
    // Phones fold it inside too (the host view was five layers deep).
    expect(visitCardCompact('inside', false, { status: 'accepted' })).toBe(true);
  });
});
