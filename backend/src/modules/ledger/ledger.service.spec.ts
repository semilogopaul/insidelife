import type { DataSource, EntityManager } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import type { MetricsService } from '../../metrics/metrics.service.js';
import { LedgerService } from './ledger.service.js';

const ACCOUNTS = [
  { id: 'a-cash', kind: 'cash', currency: 'NGN', balance: 1_000 },
  { id: 'a-savings', kind: 'savings', currency: 'NGN', balance: 200 },
  { id: 'a-pension', kind: 'pension', currency: 'NGN', balance: 0 },
  { id: 'a-usd', kind: 'usd', currency: 'USD', balance: 5 },
];

/** A transaction's manager that serves the character's accounts and records what the ledger asked. */
function fakeManager() {
  const balances = new Map(ACCOUNTS.map((account) => [account.id, account.balance]));
  const reads = { accounts: 0, locked: 0, finds: 0 };
  const accountsQuery = {
    where: () => accountsQuery,
    orderBy: () => accountsQuery,
    setLock: () => ((reads.locked += 1), accountsQuery),
    getMany: async () => ((reads.accounts += 1), ACCOUNTS.map((account) => ({ ...account, balance: balances.get(account.id)! }))),
  };
  const insertQuery = {
    insert: () => insertQuery,
    into: () => insertQuery,
    values: () => insertQuery,
    orIgnore: () => insertQuery,
    returning: () => insertQuery,
    execute: async () => ({ raw: [{ id: 'tx-1' }] }),
  };
  const manager = {
    getRepository: () => ({ createQueryBuilder: () => accountsQuery }),
    createQueryBuilder: () => insertQuery,
    create: (_target: unknown, values: unknown) => values,
    find: vi.fn(async () => ((reads.finds += 1), [...ACCOUNTS, { id: 'sys-burn', kind: 'system', currency: 'NGN', balance: 0 }])),
    query: vi.fn(async (_sql: string, [amount, id]: [number, string]) => {
      balances.set(id, balances.get(id)! + amount);
      return [{ balance: String(balances.get(id)) }];
    }),
    insert: vi.fn(async () => undefined),
  } as unknown as EntityManager;
  return { manager, reads };
}

function ledger(): LedgerService {
  const service = new LedgerService({} as DataSource, { moneyFlow: { inc: vi.fn() } } as unknown as MetricsService);
  (service as unknown as { systemIds: Map<string, string> }).systemIds.set('burn', 'sys-burn');
  return service;
}

const debit = (service: LedgerService, manager: EntityManager, amount: number) =>
  service.debit(manager, { kind: 'purchase', memo: 'x', idempotencyKey: `k-${amount}`, gameMinute: 1, characterId: 'c1', accountId: 'a-cash', amount });

describe('LedgerService balances within a session', () => {
  it('locks the accounts once and answers ids and balances from that read', async () => {
    const { manager, reads } = fakeManager();
    const service = ledger();
    const { accounts, balances } = await service.lockCharacterAccounts(manager, 'c1');
    expect(accounts).toEqual({ cash: 'a-cash', savings: 'a-savings', pension: 'a-pension', usd: 'a-usd' });
    expect(balances).toEqual({ cash: 1_000, savings: 200, pension: 0, usd: 5 });
    expect(reads).toMatchObject({ accounts: 1, locked: 1 });
    // The rows are locked: nothing but this transaction's postings can move them.
    expect(await service.balances(manager, 'c1')).toEqual(balances);
    expect(reads.accounts).toBe(1);
  });

  it('reads again after a posting, then reuses that read', async () => {
    const { manager, reads } = fakeManager();
    const service = ledger();
    await service.lockCharacterAccounts(manager, 'c1');
    await debit(service, manager, 300);
    expect(await service.balances(manager, 'c1')).toMatchObject({ cash: 700 });
    expect(reads.accounts).toBe(2);
    expect(await service.balances(manager, 'c1')).toMatchObject({ cash: 700 });
    expect(reads.accounts).toBe(2);
  });

  it('never reuses an unlocked read, nor a read from another transaction', async () => {
    const service = ledger();
    const first = fakeManager();
    await service.balances(first.manager, 'c1');
    await service.balances(first.manager, 'c1');
    expect(first.reads.accounts).toBe(2);
    await service.lockCharacterAccounts(first.manager, 'c1');
    const second = fakeManager();
    await service.balances(second.manager, 'c1');
    expect(second.reads.accounts).toBe(1);
  });

  it('checks posting currencies from accounts it has seen, and looks up only unknown ones', async () => {
    const { manager, reads } = fakeManager();
    const service = ledger();
    await debit(service, manager, 10); // nothing seen yet: one lookup
    expect(reads.finds).toBe(1);
    await debit(service, manager, 20); // both legs known now
    expect(reads.finds).toBe(1);
  });
});
