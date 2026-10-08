import type { EntityManager } from 'typeorm';
import { DAILY_WELCOME_MAX_CASH, DAILY_WELCOME_MOOD_MINUTES, MINUTES_PER_DAY, type LedgerKind } from '@insidelife/shared';
import type { CharacterEntity, MoodModifier } from '../characters/entities/character.entity.js';
import { CharacterWallet, SimulationContext, type ReceiveOptions } from '../simulation/simulation-context.js';
import type { WorldService } from '../world/world.service.js';
import { dailyWelcomeGift, lagosDay, nextLagosMidnight } from './progression.rules.js';
import { DAILY_WELCOME_MODIFIER_ID, DailyWelcomeService } from './services/daily-welcome.service.js';
import {
  DailyWelcomeClaimStore,
  type DailyWelcomeClaimDraft,
  type DailyWelcomeClaimRecord,
} from './services/daily-welcome-claims.store.js';

const at = (iso: string): number => Date.parse(iso);

describe('Lagos calendar', () => {
  it('rolls the day over at Lagos midnight (23:00 UTC), not UTC midnight', () => {
    expect(lagosDay(at('2026-10-08T22:59:59Z')).date).toBe('2026-10-08');
    expect(lagosDay(at('2026-10-08T23:00:00Z')).date).toBe('2026-10-09');
    expect(lagosDay(at('2026-10-09T00:30:00Z')).date).toBe('2026-10-09');
  });

  it('knows the Lagos weekday', () => {
    expect(lagosDay(at('2026-10-08T12:00:00Z')).weekday).toBe(4); // Thursday
    expect(lagosDay(at('2026-10-10T23:30:00Z')).weekday).toBe(0); // already Sunday in Lagos
  });

  it('computes the next reset at the following Lagos midnight', () => {
    expect(new Date(nextLagosMidnight(at('2026-10-08T12:00:00Z'))).toISOString()).toBe('2026-10-08T23:00:00.000Z');
    expect(new Date(nextLagosMidnight(at('2026-10-08T23:00:00Z'))).toISOString()).toBe('2026-10-09T23:00:00.000Z');
    expect(new Date(nextLagosMidnight(at('2026-12-31T23:30:00Z'))).toISOString()).toBe('2027-01-01T23:00:00.000Z');
  });
});

describe('dailyWelcomeGift', () => {
  it('is deterministic per character and day, capped and in whole ₦500 notes', () => {
    for (let offset = 0; offset < 14; offset++) {
      const day = lagosDay(at('2026-10-01T12:00:00Z') + offset * 86_400_000);
      const gift = dailyWelcomeGift('seed-abc', day);
      expect(dailyWelcomeGift('seed-abc', day)).toEqual(gift);
      expect(gift.cash).toBeLessThanOrEqual(DAILY_WELCOME_MAX_CASH);
      expect(gift.cash).toBeGreaterThan(0);
      expect(gift.cash % 500).toBe(0);
      expect(gift.flavour.weekday).toBe(day.weekday);
    }
    expect(dailyWelcomeGift('seed-abc', lagosDay(at('2026-10-11T12:00:00Z'))).flavour.id).toBe('mamas-sunday-rice');
  });
});

/** In-memory stand-in for the unique (user, Lagos date) index. */
class MemoryClaims extends DailyWelcomeClaimStore {
  readonly rows = new Map<string, DailyWelcomeClaimDraft>();

  override async tryInsert(_manager: EntityManager, draft: DailyWelcomeClaimDraft): Promise<boolean> {
    const key = `${draft.userId}:${draft.realDate}`;
    if (this.rows.has(key)) return false;
    this.rows.set(key, draft);
    return true;
  }

  override async find(_manager: EntityManager, userId: string, realDate: string): Promise<DailyWelcomeClaimRecord | null> {
    return this.rows.get(`${userId}:${realDate}`) ?? null;
  }
}

interface Receipt {
  readonly amount: number;
  readonly kind: LedgerKind;
  readonly key: string;
  readonly income: ReceiveOptions['income'];
}

function contextFor(characterId: string, time: number, receipts: Receipt[], moodModifiers: MoodModifier[] = []): SimulationContext {
  const character = { id: characterId, seed: `seed-${characterId}`, settledAt: time, firstName: 'Tolu', moodModifiers } as unknown as CharacterEntity;
  const ctx = new SimulationContext(character, {} as EntityManager, {} as WorldService, time);
  const wallet = {
    receive: async (amount: number, kind: LedgerKind, _memo: string, key: string, options: ReceiveOptions): Promise<void> => {
      receipts.push({ amount, kind, key, income: options.income });
    },
  } as unknown as CharacterWallet;
  ctx.bindWallet(wallet);
  return ctx;
}

describe('DailyWelcomeService', () => {
  it('grants once per Lagos calendar day per account, with unearned cash and a mood boost', async () => {
    const claims = new MemoryClaims();
    const service = new DailyWelcomeService(claims);
    const receipts: Receipt[] = [];
    const morning = at('2026-10-08T09:00:00Z'); // 10:00 in Lagos
    const ctx = contextFor('char-1', 50 * MINUTES_PER_DAY, receipts);

    const first = await service.claim(ctx, 'user-1', morning);
    expect(first.status).toBe('granted');
    expect(first.realDate).toBe('2026-10-08');
    expect(first.cash).toBeGreaterThan(0);
    expect(first.cash).toBeLessThanOrEqual(DAILY_WELCOME_MAX_CASH);
    expect(first.nextResetAt).toBe('2026-10-08T23:00:00.000Z');
    expect(first.mood).toMatchObject({ until: 50 * MINUTES_PER_DAY + DAILY_WELCOME_MOOD_MINUTES });
    expect(receipts).toEqual([{ amount: first.cash, kind: 'gift', key: 'daily-welcome:2026-10-08', income: 'unearned' }]);
    expect(ctx.character.moodModifiers.filter((modifier) => modifier.id === DAILY_WELCOME_MODIFIER_ID)).toHaveLength(1);
    expect(ctx.notifications).toHaveLength(1);

    // 23:30 Lagos time, same Lagos day (22:30 UTC): already claimed, nothing paid.
    const late = await service.claim(contextFor('char-1', 51 * MINUTES_PER_DAY, receipts), 'user-1', at('2026-10-08T22:30:00Z'));
    expect(late).toMatchObject({ status: 'already-claimed', realDate: '2026-10-08', cash: first.cash, mood: null });
    expect(late.flavour.id).toBe(first.flavour.id);
    expect(receipts).toHaveLength(1);

    // A new life (heir / new character) on the same account and day can't double-dip.
    const heir = await service.claim(contextFor('char-2', 52 * MINUTES_PER_DAY, receipts), 'user-1', at('2026-10-08T22:45:00Z'));
    expect(heir.status).toBe('already-claimed');
    expect(receipts).toHaveLength(1);

    // 00:30 Lagos time the next day (23:30 UTC) is a new day.
    const next = await service.claim(contextFor('char-1', 53 * MINUTES_PER_DAY, receipts), 'user-1', at('2026-10-08T23:30:00Z'));
    expect(next.status).toBe('granted');
    expect(next.realDate).toBe('2026-10-09');
    expect(receipts.map((receipt) => receipt.key)).toEqual(['daily-welcome:2026-10-08', 'daily-welcome:2026-10-09']);
  });

  it('replaces an old welcome boost instead of stacking it', async () => {
    const receipts: Receipt[] = [];
    const leftover: MoodModifier = { id: DAILY_WELCOME_MODIFIER_ID, label: 'Yesterday', value: 9, until: 99_999 };
    const other: MoodModifier = { id: 'just-paid', label: 'Just got paid', value: 5, until: 99_999 };
    const ctx = contextFor('char-9', 10 * MINUTES_PER_DAY, receipts, [leftover, other]);
    await new DailyWelcomeService(new MemoryClaims()).claim(ctx, 'user-9', at('2026-10-11T08:00:00Z'));
    const ids = ctx.character.moodModifiers.map((modifier) => modifier.id).toSorted();
    expect(ids).toEqual(['daily-welcome', 'just-paid']);
    expect(ctx.character.moodModifiers.find((modifier) => modifier.id === DAILY_WELCOME_MODIFIER_ID)?.label).toBe('Mama’s Sunday rice');
  });

  it('reports status without claiming', async () => {
    const claims = new MemoryClaims();
    const service = new DailyWelcomeService(claims);
    const ctx = contextFor('char-3', 0, []);
    expect((await service.status(ctx, 'user-3', at('2026-10-08T10:00:00Z'))).claimedToday).toBe(false);
    await service.claim(ctx, 'user-3', at('2026-10-08T10:00:00Z'));
    expect(await service.status(ctx, 'user-3', at('2026-10-08T20:00:00Z'))).toEqual({
      claimedToday: true,
      realDate: '2026-10-08',
      nextResetAt: '2026-10-08T23:00:00.000Z',
    });
  });
});
