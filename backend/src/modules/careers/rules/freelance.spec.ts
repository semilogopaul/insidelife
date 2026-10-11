import { ACTION_PACE, boosted, MINUTES_PER_HOUR, findAction } from '@insidelife/shared';
import { FREELANCE_MAX_RATE, freelanceHourlyRate, freelancePay } from './freelance.js';

describe('freelance pay', () => {
  it('scales with tech skill and caps for the very best', () => {
    expect(freelanceHourlyRate(20)).toBeLessThan(freelanceHourlyRate(60));
    expect(freelanceHourlyRate(60)).toBeLessThan(freelanceHourlyRate(90));
    expect(freelanceHourlyRate(100)).toBe(FREELANCE_MAX_RATE);
  });

  it('pays the longest gig (4 effective hours) at tech 20 a few thousand naira, not a fortune', () => {
    // The longest gig is 2 game hours, which counts as 4 effective hours (game hours × ACTION_PACE).
    const longest = Math.max(...(findAction('freelance')?.durations ?? []));
    expect((longest / MINUTES_PER_HOUR) * ACTION_PACE).toBe(4);
    const pay = freelancePay(20, 4, 1, 1);
    expect(pay).toBeGreaterThan(boosted(8_000));
    expect(pay).toBeLessThan(boosted(15_000));
    // Rounded to the nearest ₦100.
    expect(freelancePay(100, 4, 1.25, 1.25)).toBeLessThanOrEqual(FREELANCE_MAX_RATE * 4 * 1.25 * 1.25 + 100);
  });
});
