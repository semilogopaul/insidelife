import { describe, expect, it } from 'vitest';
import { MAX_SINGLE_TRANSFER, transferFee } from '@insidelife/shared';
import { maxSendable, nextTierHint, previewTransfer, tierLabel } from '../services/transfer-preview';

const tier1 = { cash: 1_000_000, dailyLimit: 30_000, sentToday: 0 };

describe('previewTransfer', () => {
  it('adds the shared fee schedule and stamp duty', () => {
    const small = previewTransfer(4_000, tier1);
    expect(small).toMatchObject({ fee: 0, stampDuty: 0, totalDebit: 4_000, problem: null });
    const mid = previewTransfer(12_500, tier1);
    expect(mid).toMatchObject({ fee: 10, stampDuty: 50, totalDebit: 12_560, remainingToday: 30_000, remainingAfter: 17_440, problem: null });
    const big = previewTransfer(60_000, { ...tier1, dailyLimit: 200_000 });
    expect(big.fee + big.stampDuty).toBe(transferFee(60_000).total);
  });

  it('counts charges against the daily limit, like the server', () => {
    // ₦29,950 + ₦60 charges = ₦30,010 > ₦30,000.
    const result = previewTransfer(29_950, tier1);
    expect(result.problem?.code).toBe('OVER_LIMIT');
    expect(previewTransfer(29_940, tier1).problem).toBeNull();
  });

  it('reports what is left today when the limit is partly used', () => {
    const result = previewTransfer(20_000, { ...tier1, sentToday: 25_000 });
    expect(result.problem).toMatchObject({ code: 'OVER_LIMIT', remaining: 5_000 });
    expect(previewTransfer(100, { ...tier1, sentToday: 30_000 }).problem?.code).toBe('OVER_LIMIT');
  });

  it('explains a shortfall in cash including charges', () => {
    const result = previewTransfer(10_000, { ...tier1, cash: 10_000 });
    expect(result.problem).toMatchObject({ code: 'INSUFFICIENT', shortfall: 60 });
  });

  it('enforces min and max per transfer', () => {
    expect(previewTransfer(null, tier1).problem?.code).toBe('EMPTY');
    expect(previewTransfer(50, tier1).problem?.code).toBe('TOO_SMALL');
    expect(previewTransfer(MAX_SINGLE_TRANSFER + 1, { cash: 1e9, dailyLimit: 1e9, sentToday: 0 }).problem?.code).toBe('TOO_LARGE');
  });
});

describe('maxSendable', () => {
  it('finds the largest amount that fits the limit with its charges', () => {
    const max = maxSendable(tier1);
    expect(max).toBe(29_940);
    expect(previewTransfer(max, tier1).problem).toBeNull();
    expect(previewTransfer(max + 1, tier1).problem).not.toBeNull();
  });

  it('is limited by cash too, and is zero when nothing fits', () => {
    expect(maxSendable({ cash: 4_000, dailyLimit: 30_000, sentToday: 0 })).toBe(4_000);
    expect(maxSendable({ cash: 50, dailyLimit: 30_000, sentToday: 0 })).toBe(0);
    expect(maxSendable({ cash: 1e9, dailyLimit: 30_000, sentToday: 30_000 })).toBe(0);
  });

  it('never exceeds the single-transfer cap', () => {
    const max = maxSendable({ cash: 1e10, dailyLimit: 1e10, sentToday: 0 });
    expect(max).toBe(MAX_SINGLE_TRANSFER);
  });
});

describe('tiers', () => {
  it('names the tier and how to reach the next one', () => {
    expect(tierLabel(1)).toBe('Tier 1');
    expect(nextTierHint(1)).toMatch(/Tier 2 .*7 game days/);
    expect(nextTierHint(2)).toMatch(/verified email/);
    expect(nextTierHint(3)).toBeNull();
  });
});
