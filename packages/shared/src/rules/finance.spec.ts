import { describe, expect, it } from 'vitest';
import {
  DAILY_PEER_RECEIVE_LIMIT,
  annualIncomeTax,
  checkPeerMoney,
  computePayslip,
  dailyTransferLimit,
  peerSendable,
  rentUpfront,
  transferFee,
  transferTierFor,
  type PeerMoneyCheckInput,
} from './finance.js';

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
    expect(dailyTransferLimit(1)).toBe(4_000_000);
    expect(dailyTransferLimit(2)).toBe(10_000_000);
    expect(dailyTransferLimit(3)).toBeNull();
  });
});

describe('player-to-player money', () => {
  const check = (overrides: Partial<PeerMoneyCheckInput> = {}) => {
    const result = checkPeerMoney({ amount: 100_000, sentToday: 0, dailyLimit: 4_000_000, sendable: 1_000_000, receivedToday: 0, recipientHandle: 'femi', ...overrides });
    return result.ok ? 'OK' : result.code;
  };

  it('starting money can be spent but never passed on', () => {
    const fresh = { earnedTotal: 0, unearnedTotal: 4_150_000, lockedUnearned: 4_150_000, peerSentTotal: 0 };
    expect(peerSendable(fresh)).toBe(0);
    expect(peerSendable({ ...fresh, earnedTotal: 300_000 })).toBe(300_000);
    // Top-ups (part of unearned) and money players sent you can be passed on; what you already sent is used up.
    expect(peerSendable({ ...fresh, unearnedTotal: 4_150_000 + 200_000 + 1_000_000, peerSentTotal: 500_000 })).toBe(700_000);
    expect(peerSendable({ ...fresh, peerSentTotal: 1 })).toBe(0);
  });

  it('applies the sender’s tier limit (none at tier 3)', () => {
    expect(check({ sentToday: 3_950_000 })).toBe('DAILY_LIMIT_EXCEEDED');
    expect(check({ sentToday: 3_900_000 })).toBe('OK');
    expect(check({ sentToday: 50_000_000, dailyLimit: null, sendable: 1e12 })).toBe('OK');
  });

  it('won’t send starting money', () => {
    expect(check({ sendable: 0 })).toBe('STARTER_MONEY_LOCKED');
    expect(check({ sendable: 99_999 })).toBe('STARTER_MONEY_LOCKED');
  });

  it('caps what one player can receive from players in a day', () => {
    expect(check({ receivedToday: DAILY_PEER_RECEIVE_LIMIT - 100_000 })).toBe('OK');
    expect(check({ receivedToday: DAILY_PEER_RECEIVE_LIMIT - 99_999 })).toBe('RECIPIENT_DAILY_LIMIT');
  });
});

describe('Lagos rent upfront', () => {
  it('adds agency, legal and caution at 10% each', () => {
    expect(rentUpfront(1_000_000)).toEqual({ rent: 1_000_000, agency: 100_000, legal: 100_000, caution: 100_000, total: 1_300_000 });
  });
});
