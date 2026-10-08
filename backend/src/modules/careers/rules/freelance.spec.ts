import { FREELANCE_MAX_RATE, freelanceHourlyRate, freelancePay } from './freelance.js';

describe('freelance pay', () => {
  it('scales with tech skill and caps for the very best', () => {
    expect(freelanceHourlyRate(20)).toBeLessThan(freelanceHourlyRate(60));
    expect(freelanceHourlyRate(60)).toBeLessThan(freelanceHourlyRate(90));
    expect(freelanceHourlyRate(100)).toBe(FREELANCE_MAX_RATE);
  });

  it('pays a 4-hour gig at tech 20 a few thousand naira, not a fortune', () => {
    const pay = freelancePay(20, 4, 1, 1);
    expect(pay).toBeGreaterThan(8_000);
    expect(pay).toBeLessThan(15_000);
    // Rounded to the nearest ₦100.
    expect(freelancePay(100, 4, 1.25, 1.25)).toBeLessThanOrEqual(FREELANCE_MAX_RATE * 4 * 1.25 * 1.25 + 100);
  });
});
