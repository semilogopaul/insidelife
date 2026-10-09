import { describe, expect, it } from 'vitest';
import { MAX_SINGLE_TRANSFER, transferFee } from '@insidelife/shared';
import { maxSendable, nextTierHint, previewTransfer, tierLabel, tierLimitLabel } from '../services/transfer-preview';

const tier1 = { cash: 10_000_000, dailyLimit: 4_000_000, sentToday: 0, sendable: 8_000_000 };

describe('previewTransfer', () => {
  it('adds the shared fee schedule and stamp duty', () => {
    const small = previewTransfer(4_000, tier1);
    expect(small).toMatchObject({ fee: 0, stampDuty: 0, totalDebit: 4_000, problem: null });
    const mid = previewTransfer(12_500, tier1);
    expect(mid).toMatchObject({ fee: 10, stampDuty: 50, totalDebit: 12_560, remainingToday: 4_000_000, remainingAfter: 3_987_500, problem: null });
    const big = previewTransfer(60_000, tier1);
    expect(big.fee + big.stampDuty).toBe(transferFee(60_000).total);
  });

  it('counts what reaches the player against the daily limit (charges don’t count)', () => {
    expect(previewTransfer(4_000_000, { ...tier1, cash: 5_000_000 }).problem).toBeNull();
    expect(previewTransfer(4_000_001, { ...tier1, cash: 5_000_000 }).problem?.code).toBe('OVER_LIMIT');
  });

  it('reports what is left today when the limit is partly used', () => {
    const result = previewTransfer(200_000, { ...tier1, sentToday: 3_900_000 });
    expect(result.problem).toMatchObject({ code: 'OVER_LIMIT', remaining: 100_000 });
    expect(previewTransfer(100, { ...tier1, sentToday: 4_000_000 }).problem?.code).toBe('OVER_LIMIT');
  });

  it('has no daily limit at Tier 3', () => {
    expect(previewTransfer(MAX_SINGLE_TRANSFER, { cash: 1e10, dailyLimit: null, sentToday: 50_000_000, sendable: 1e10 }).problem).toBeNull();
  });

  it('won’t send starting money', () => {
    expect(previewTransfer(1_000, { ...tier1, sendable: 0 }).problem?.code).toBe('LOCKED');
    expect(previewTransfer(60_000, { ...tier1, sendable: 50_000 }).problem).toMatchObject({ code: 'LOCKED', sendable: 50_000 });
  });

  it('explains a shortfall in cash including charges', () => {
    const result = previewTransfer(10_000, { ...tier1, cash: 10_000 });
    expect(result.problem).toMatchObject({ code: 'INSUFFICIENT', shortfall: 60 });
  });

  it('enforces min and max per transfer', () => {
    expect(previewTransfer(null, tier1).problem?.code).toBe('EMPTY');
    expect(previewTransfer(50, tier1).problem?.code).toBe('TOO_SMALL');
    expect(previewTransfer(MAX_SINGLE_TRANSFER + 1, { cash: 1e9, dailyLimit: 1e9, sentToday: 0, sendable: 1e9 }).problem?.code).toBe('TOO_LARGE');
  });
});

describe('maxSendable', () => {
  it('is the smallest of the daily limit left, sendable money and cash after charges', () => {
    expect(maxSendable({ ...tier1, sentToday: 3_900_000 })).toBe(100_000);
    expect(maxSendable({ ...tier1, sendable: 250_000 })).toBe(250_000);
    const byCash = maxSendable({ ...tier1, cash: 30_000 });
    expect(byCash + transferFee(byCash).total).toBeLessThanOrEqual(30_000);
    expect(previewTransfer(byCash, { ...tier1, cash: 30_000 }).problem).toBeNull();
    expect(previewTransfer(byCash + 1, { ...tier1, cash: 30_000 }).problem).not.toBeNull();
  });

  it('is zero when nothing fits', () => {
    expect(maxSendable({ ...tier1, cash: 50 })).toBe(0);
    expect(maxSendable({ ...tier1, sentToday: 4_000_000 })).toBe(0);
    expect(maxSendable({ ...tier1, sendable: 0 })).toBe(0);
  });

  it('never exceeds the single-transfer cap', () => {
    expect(maxSendable({ cash: 1e10, dailyLimit: null, sentToday: 0, sendable: 1e10 })).toBe(MAX_SINGLE_TRANSFER);
  });
});

describe('tiers', () => {
  it('names the tier, its limit and how to reach the next one', () => {
    expect(tierLabel(1)).toBe('Tier 1');
    expect(tierLimitLabel(4_000_000)).toBe('₦4,000,000 a day');
    expect(tierLimitLabel(null)).toBe('no daily limit');
    expect(nextTierHint(1)).toMatch(/Tier 2 .*₦10,000,000 a day.*7 game days/);
    expect(nextTierHint(2)).toMatch(/no daily limit.*verified email/);
    expect(nextTierHint(3)).toBeNull();
  });
});
