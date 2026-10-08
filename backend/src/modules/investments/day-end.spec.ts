import { MINUTES_PER_DAY } from '@insidelife/shared';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { DepositsService } from './deposits.service.js';
import { InvestmentDepositEntity } from './entities/deposit.entity.js';
import { PonziStakeEntity } from './entities/ponzi-stake.entity.js';
import { PonziService } from './ponzi.service.js';

/** A settle-like context: memo cache that outlives days, an idempotent wallet, recorded notifications. */
function fakeContext(rows: { stakes?: PonziStakeEntity[]; deposits?: InvestmentDepositEntity[] }) {
  const cache = new Map<string, unknown>();
  const applied = new Set<string>();
  const notifications: string[] = [];
  let cash = 0;
  const ctx = {
    character: { id: 'char-1' },
    time: 0,
    world: { economy: () => ({ moneyMarketRate: 0.09 }) },
    manager: {
      find: async (entity: unknown) => (entity === PonziStakeEntity ? (rows.stakes ?? []) : (rows.deposits ?? [])).filter((row) => row.status === 'active'),
      save: async <T>(row: T) => row,
    },
    wallet: {
      get cash() {
        return cash;
      },
      receive: async (amount: number, _kind: string, _memo: string, key: string) => {
        if (applied.has(key)) return;
        applied.add(key);
        cash += amount;
      },
      tryPay: async (amount: number, _kind: string, _memo: string, key: string) => {
        if (!applied.has(key)) {
          applied.add(key);
          cash -= amount;
        }
        return true;
      },
    },
    memo: async <T>(key: string, loader: () => Promise<T>): Promise<T> => {
      if (!cache.has(key)) cache.set(key, await loader());
      return cache.get(key) as T;
    },
    invalidate: (key: string) => {
      for (const cached of cache.keys()) if (cached === key || cached.startsWith(`${key}:`)) cache.delete(cached);
    },
    notify: (draft: { title: string }) => notifications.push(draft.title),
    report: () => undefined,
  } as unknown as SimulationContext;
  return { ctx, notifications, cash: () => cash };
}

const stake = (overrides: Partial<PonziStakeEntity>): PonziStakeEntity =>
  Object.assign(new PonziStakeEntity(), {
    id: 's',
    characterId: 'char-1',
    scheme: 'Scheme',
    amount: 100_000,
    promisedPayout: 200_000,
    joinedAt: 0,
    payoutAt: 30 * MINUTES_PER_DAY,
    collapseAt: 10 * MINUTES_PER_DAY,
    status: 'active',
    resolvedAt: null,
    ...overrides,
  });

describe('day-end hooks across a long settle', () => {
  it('resolves each ponzi stake once even though the memoised list spans many days', async () => {
    const stakes = [stake({ id: 'crash', scheme: 'Crash' }), stake({ id: 'lucky', scheme: 'Lucky', collapseAt: 35 * MINUTES_PER_DAY })];
    const { ctx, notifications, cash } = fakeContext({ stakes });
    const ponzi = new PonziService();
    for (let day = 0; day < 60; day++) await ponzi.onDayEnd(ctx, day);
    expect(notifications).toEqual(['Crash don crash!', 'Lucky actually paid?!']);
    expect(stakes.map((s) => s.status)).toEqual(['collapsed', 'paid']);
    expect(cash()).toBe(200_000);
  });

  it('pays a maturing deposit once and accrues the fund daily', async () => {
    const base = { characterId: 'char-1', idempotencyKey: 'k', accrued: 0, closedAt: null, interestPaid: 0, withholdingTax: 0, penalty: 0, status: 'active' as const };
    const tbill = Object.assign(new InvestmentDepositEntity(), {
      ...base,
      id: 'tbill',
      product: 'tbill',
      principal: 360_000,
      annualRate: 0.1,
      tenorDays: 91,
      startedAt: 0,
      maturesAt: 91 * MINUTES_PER_DAY,
      lastAccrualDay: null,
    });
    const fund = Object.assign(new InvestmentDepositEntity(), {
      ...base,
      id: 'fund',
      product: 'money-market',
      principal: 360_000,
      annualRate: 0.09,
      tenorDays: null,
      startedAt: 0,
      maturesAt: null,
      lastAccrualDay: 0,
    });
    const { ctx, notifications, cash } = fakeContext({ deposits: [tbill, fund] });
    const deposits = new DepositsService();
    for (let day = 0; day < 120; day++) await deposits.onDayEnd(ctx, day);
    expect(notifications).toEqual(['Treasury bill matured']);
    expect(tbill).toMatchObject({ status: 'matured', interestPaid: 9_100, withholdingTax: 910 });
    expect(cash()).toBe(360_000 + 9_100 - 910);
    // 119 accrual days (day 0 was the purchase day) at 9% on ₦360k = ₦90/day.
    expect(fund.accrued).toBeCloseTo(119 * 90, 6);
  });
});
