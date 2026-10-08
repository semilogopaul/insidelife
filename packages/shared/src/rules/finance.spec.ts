import { describe, expect, it } from 'vitest';
import { annualIncomeTax, computePayslip, dailyTransferLimit, rentUpfront, transferFee, transferTierFor } from './finance.js';

describe('Nigeria Tax Act 2025 bands', () => {
  it('exempts the first ₦800k', () => {
    expect(annualIncomeTax(800_000)).toBe(0);
  });

  it('applies progressive bands', () => {
    // 2.2m × 15% = 330k
    expect(annualIncomeTax(3_000_000)).toBe(330_000);
    // + 9m × 18% = 1.62m → 1.95m
    expect(annualIncomeTax(12_000_000)).toBe(1_950_000);
    // + 13m × 21% (2.73m) + 25m × 23% (5.75m) + 10m × 25% (2.5m)
    expect(annualIncomeTax(60_000_000)).toBe(1_950_000 + 2_730_000 + 5_750_000 + 2_500_000);
  });
});

describe('payslip', () => {
  it('deducts pension and PAYE for a graduate trainee', () => {
    const slip = computePayslip({ gross: 300_000, pension: true, paye: true });
    expect(slip.pensionEmployee).toBe(24_000);
    expect(slip.pensionEmployer).toBe(30_000);
    expect(slip.tax).toBeGreaterThan(0);
    expect(slip.net).toBe(300_000 - 24_000 - slip.tax);
  });

  it('does not tax informal pay through PAYE', () => {
    expect(computePayslip({ gross: 150_000, pension: false, paye: false })).toMatchObject({ tax: 0, net: 150_000 });
  });
});

describe('transfers', () => {
  it('mirrors Nigerian bank fees and stamp duty', () => {
    expect(transferFee(4_000)).toEqual({ fee: 0, stampDuty: 0, total: 0 });
    expect(transferFee(20_000)).toEqual({ fee: 10, stampDuty: 50, total: 60 });
    expect(transferFee(100_000)).toEqual({ fee: 50, stampDuty: 50, total: 100 });
  });

  it('unlocks tiers with account age and verification', () => {
    expect(transferTierFor(0, true)).toBe(1);
    expect(transferTierFor(10, false)).toBe(2);
    expect(transferTierFor(40, true)).toBe(3);
    expect(dailyTransferLimit(1)).toBe(30_000);
  });
});

describe('Lagos rent upfront', () => {
  it('adds agency, legal and caution at 10% each', () => {
    expect(rentUpfront(1_000_000)).toEqual({ rent: 1_000_000, agency: 100_000, legal: 100_000, caution: 100_000, total: 1_300_000 });
  });
});
