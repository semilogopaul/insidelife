import { describe, expect, it } from 'vitest';
import { INJECTION_RULES, injectionAvailableAt, treatmentSuccessChance } from './health.js';

describe('injections', () => {
  it('work more often than tablets, capped', () => {
    const tablets = treatmentSuccessChance('malaria', 'moderate', 'hospital-public', { diagnosed: true });
    const injection = treatmentSuccessChance('malaria', 'moderate', 'hospital-public', {
      diagnosed: true,
      method: 'injection',
    });
    expect(injection).toBeGreaterThan(tablets);
    expect(injection).toBeLessThanOrEqual(INJECTION_RULES.maxSuccess);
  });

  it('are given at hospitals, not by pharmacists', () => {
    expect(injectionAvailableAt('hospital-public')).toBe(true);
    expect(injectionAvailableAt('hospital-private')).toBe(true);
    expect(injectionAvailableAt('pharmacy')).toBe(false);
    const pharmacy = treatmentSuccessChance('malaria', 'mild', 'pharmacy', { diagnosed: true });
    expect(
      treatmentSuccessChance('malaria', 'mild', 'pharmacy', { diagnosed: true, method: 'injection' }),
    ).toBe(pharmacy);
  });

  it('can’t make an untreatable case treatable', () => {
    expect(
      treatmentSuccessChance('malaria', 'critical', 'pharmacy', { diagnosed: true, method: 'injection' }),
    ).toBe(0);
  });
});
