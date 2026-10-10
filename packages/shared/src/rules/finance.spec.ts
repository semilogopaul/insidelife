import { describe, expect, it } from 'vitest';
import {
  DAILY_PEER_RECEIVE_LIMIT,
  PURCHASE_HOLD_HOURS,
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

/**
 * Exact boundaries of every money rule (added after mutation testing: off-by-one changes to these comparisons
 * survived the tests above). A player one naira or one day either side must get the right answer.
 */
describe('money rules at their exact boundaries', () => {
  it('PAYE: rent relief is 20% of rent, capped at ₦500k, taken off annual pay after pension', () => {
    // ₦500k a month, 8% pension → ₦460k × 12 = ₦5.52m; rent ₦1m → relief ₦200k → taxable ₦5.32m.
    // 2.2m × 15% = 330k; 2.32m × 18% = 417.6k → 747.6k a year → 62,300 a month.
    expect(computePayslip({ gross: 500_000, pension: true, paye: true, annualRent: 1_000_000 })).toEqual({
      gross: 500_000,
      pensionEmployee: 40_000,
      pensionEmployer: 50_000,
      tax: 62_300,
      net: 500_000 - 40_000 - 62_300,
    });
    // Rent of ₦5m would be ₦1m relief: capped at ₦500k → taxable ₦5.02m → 330k + 2.02m × 18% = 693.6k → 57,800.
    expect(computePayslip({ gross: 500_000, pension: true, paye: true, annualRent: 5_000_000 }).tax).toBe(57_800);
    // No rent: taxable ₦5.52m → 330k + 2.52m × 18% = 783.6k → 65,300.
    expect(computePayslip({ gross: 500_000, pension: true, paye: true }).tax).toBe(65_300);
    expect(computePayslip({ gross: 500_000, pension: false, paye: true }).tax).toBe(Math.round(annualIncomeTax(6_000_000) / 12));
  });

  it('PAYE bands meet exactly at their edges', () => {
    expect(annualIncomeTax(800_001)).toBe(0);
    expect(annualIncomeTax(3_000_000)).toBe(330_000);
    expect(annualIncomeTax(-5)).toBe(0);
  });

  it('transfer fees switch at exactly ₦5,000, ₦50,000 and (stamp duty) ₦10,000', () => {
    expect(transferFee(4_999).fee).toBe(0);
    expect(transferFee(5_000).fee).toBe(10);
    expect(transferFee(50_000).fee).toBe(10);
    expect(transferFee(50_001).fee).toBe(50);
    expect(transferFee(9_999).stampDuty).toBe(0);
    expect(transferFee(10_000).stampDuty).toBe(50);
  });

  it('tiers unlock on exactly day 7 and day 30 (with a verified email)', () => {
    expect(transferTierFor(6, true)).toBe(1);
    expect(transferTierFor(7, false)).toBe(2);
    expect(transferTierFor(29, true)).toBe(2);
    expect(transferTierFor(30, true)).toBe(3);
    expect(transferTierFor(30, false)).toBe(2);
  });

  const peer = (overrides: Partial<PeerMoneyCheckInput> = {}) =>
    checkPeerMoney({ amount: 100_000, sentToday: 0, dailyLimit: 4_000_000, sendable: 1_000_000, receivedToday: 0, recipientHandle: 'femi', ...overrides });
  const messageOf = (result: ReturnType<typeof checkPeerMoney>): string => (result.ok ? '' : result.message);

  it('daily send limit: exactly the limit is allowed; the refusal says what is left', () => {
    expect(peer({ amount: 4_000_000, sendable: 4_000_000 }).ok).toBe(true);
    expect(peer({ sentToday: 3_900_000 }).ok).toBe(true);
    const partial = peer({ sentToday: 3_950_000 });
    expect(partial).toMatchObject({ ok: false, code: 'DAILY_LIMIT_EXCEEDED' });
    expect(messageOf(partial)).toBe('Daily limit: you can still send ₦50,000 to players today.');
    expect(messageOf(peer({ sentToday: 4_000_000 }))).toMatch(/^You’ve used today’s limit/);
    expect(messageOf(peer({ sentToday: 4_500_000 }))).toMatch(/^You’ve used today’s limit/);
  });

  it('starting money: exactly the sendable amount is allowed; the refusal says how much can go', () => {
    expect(peer({ amount: 99_999, sendable: 99_999 }).ok).toBe(true);
    expect(messageOf(peer({ sendable: 99_999 }))).toBe('You can send ₦99,999 to players: your starting money can’t be passed on.');
    expect(messageOf(peer({ sendable: 0 }))).toMatch(/^Your starting money is for you to spend in Lagos/);
  });

  it('receive cap: exactly ₦4m a day is allowed; the refusal says how much room is left', () => {
    expect(peer({ amount: 100_000, receivedToday: DAILY_PEER_RECEIVE_LIMIT - 100_000 }).ok).toBe(true);
    expect(messageOf(peer({ receivedToday: DAILY_PEER_RECEIVE_LIMIT - 60_000 }))).toBe('@femi can only receive ₦60,000 more from players today.');
    expect(messageOf(peer({ receivedToday: DAILY_PEER_RECEIVE_LIMIT }))).toBe('@femi has received all they can from players today (₦4,000,000 a day).');
    expect(messageOf(peer({ receivedToday: DAILY_PEER_RECEIVE_LIMIT + 1 }))).toMatch(/has received all they can/);
  });

  it('holds bought coins for 48 hours: spendable at once, sendable later', () => {
    expect(PURCHASE_HOLD_HOURS).toBe(48);
    const bought = { earnedTotal: 0, unearnedTotal: 3_025_000 + 2_200_000, lockedUnearned: 3_025_000, peerSentTotal: 0 };
    expect(peerSendable(bought)).toBe(2_200_000);
    expect(peerSendable({ ...bought, heldPurchases: 2_200_000 })).toBe(0);
    expect(peerSendable({ ...bought, earnedTotal: 50_000, heldPurchases: 2_200_000 })).toBe(50_000);
    expect(peerSendable({ ...bought, heldPurchases: -5 })).toBe(2_200_000);
    const held = peer({ sendable: 50_000, heldPurchases: 2_200_000, amount: 100_000 });
    expect(held).toMatchObject({ ok: false, code: 'PURCHASE_ON_HOLD' });
    expect(messageOf(held)).toBe('Coins you bought can be sent to players 48 hours after the top-up. You can send ₦50,000 now.');
    expect(messageOf(peer({ sendable: 0, heldPurchases: 2_200_000, amount: 100_000 }))).toBe('Coins you bought can be sent to players 48 hours after the top-up.');
    // More than even the held coins would cover: it's the starting money that's the problem.
    expect(peer({ sendable: 0, heldPurchases: 50_000, amount: 100_000 })).toMatchObject({ code: 'STARTER_MONEY_LOCKED' });
    // Exactly what the hold will free is still "on hold"; a naira more is the starting money.
    expect(peer({ sendable: 50_000, heldPurchases: 50_000, amount: 100_000 })).toMatchObject({ code: 'PURCHASE_ON_HOLD' });
    expect(peer({ sendable: 50_000, heldPurchases: 50_000, amount: 100_001 })).toMatchObject({ code: 'STARTER_MONEY_LOCKED' });
    expect(peer({ sendable: 100_000, heldPurchases: 2_200_000, amount: 100_000 }).ok).toBe(true);
  });

  it('sends nothing to players while a refunded top-up is still owed', () => {
    const owing = peer({ debt: 75_000 });
    expect(owing).toMatchObject({ ok: false, code: 'DEBT_OUTSTANDING' });
    expect(messageOf(owing)).toBe('You owe ₦75,000 from a refunded top-up. It comes out of money you receive; you can send money to players again once it’s repaid.');
    expect(peer({ debt: 0 }).ok).toBe(true);
    // The daily limit still comes first; the debt before anything about the amount.
    expect(peer({ debt: 75_000, sentToday: 4_000_000 })).toMatchObject({ code: 'DAILY_LIMIT_EXCEEDED' });
    expect(peer({ debt: 75_000, sendable: 0 })).toMatchObject({ code: 'DEBT_OUTSTANDING' });
  });

  it('checks the sender’s limit before starting money, and starting money before the recipient’s cap', () => {
    expect(peer({ sentToday: 4_000_000, sendable: 0, receivedToday: DAILY_PEER_RECEIVE_LIMIT })).toMatchObject({ code: 'DAILY_LIMIT_EXCEEDED' });
    expect(peer({ sendable: 0, receivedToday: DAILY_PEER_RECEIVE_LIMIT })).toMatchObject({ code: 'STARTER_MONEY_LOCKED' });
  });
});
