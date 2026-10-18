import { describe, expect, it } from 'vitest';
import { MINUTES_PER_DAY, MINUTES_PER_HOUR, startOfDay } from '@insidelife/shared';
import { checkoutLabel, nightsLabel, stayTotal } from '../services/stay-format';

const day = startOfDay(50 * MINUTES_PER_DAY);
const noon = 12 * MINUTES_PER_HOUR;

describe('stay formatting', () => {
  it('says when the room is given up', () => {
    expect(checkoutLabel(day + noon, day + 8 * MINUTES_PER_HOUR)).toBe('today at 12:00 PM');
    expect(checkoutLabel(day + MINUTES_PER_DAY + noon, day + 20 * MINUTES_PER_HOUR)).toBe('tomorrow at 12:00 PM');
    expect(checkoutLabel(day + 3 * MINUTES_PER_DAY + noon, day + 20 * MINUTES_PER_HOUR)).toBe('in 3 days at 12:00 PM');
  });

  it('previews the bill and names the nights', () => {
    expect(stayTotal(180_000, 3)).toBe(540_000);
    expect(nightsLabel(1)).toBe('1 night');
    expect(nightsLabel(4)).toBe('4 nights');
  });
});
