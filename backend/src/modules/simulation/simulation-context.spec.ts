import type { EntityManager } from 'typeorm';
import { GameRuleException } from '../../common/exceptions/domain.exception.js';
import type { CharacterEntity } from '../characters/entities/character.entity.js';
import type { LedgerService } from '../ledger/ledger.service.js';
import type { PostingResult } from '../ledger/interfaces/ledger.interfaces.js';
import type { WorldService } from '../world/world.service.js';
import { CharacterWallet, SimulationContext } from './simulation-context.js';

const ACCOUNTS = { cash: 'cash-1', savings: 'savings-1', pension: 'pension-1', usd: 'usd-1' } as const;

/** A wallet whose ledger has already seen some keys (a repeat inside the same game minute). */
function walletWith(usedKeys: readonly string[]): { wallet: CharacterWallet; debited: string[] } {
  const character = { id: 'char-1', settledAt: 1_000, seed: 'seed' } as CharacterEntity;
  const ctx = new SimulationContext(character, {} as EntityManager, {} as WorldService, 1_000);
  const debited: string[] = [];
  const ledger = {
    debit: async (_manager: EntityManager, input: { idempotencyKey: string; amount: number }): Promise<PostingResult> => {
      const applied = !usedKeys.includes(input.idempotencyKey);
      if (applied) debited.push(input.idempotencyKey);
      return { transactionId: 't', applied, balances: applied ? new Map([[ACCOUNTS.cash, 900]]) : new Map() };
    },
  } as unknown as LedgerService;
  const wallet = new CharacterWallet(ctx, ledger, ACCOUNTS, 1_000);
  ctx.bindWallet(wallet);
  return { wallet, debited };
}

describe('CharacterWallet.pay with refuseRepeat', () => {
  it('charges normally the first time', async () => {
    const { wallet, debited } = walletWith([]);
    await wallet.pay(100, 'property', 'Land', 'land:epe:c-of-o:1000', { refuseRepeat: 'Too soon' });
    expect(debited).toEqual(['char-1:land:epe:c-of-o:1000']);
    expect(wallet.cash).toBe(900);
  });

  it('refuses a repeated key instead of letting the caller deliver for free', async () => {
    const { wallet } = walletWith(['char-1:land:epe:c-of-o:1000']);
    await expect(wallet.pay(100, 'property', 'Land', 'land:epe:c-of-o:1000', { refuseRepeat: 'You just bought land there' })).rejects.toThrow(GameRuleException);
    await expect(wallet.pay(100, 'property', 'Land', 'land:epe:c-of-o:1000', { refuseRepeat: 'You just bought land there' })).rejects.toMatchObject({
      errorCode: 'TOO_SOON',
      message: 'You just bought land there',
    });
    expect(wallet.cash).toBe(1_000);
  });

  it('keeps the old behaviour (a silent no-op) without it, for replays that must be harmless', async () => {
    const { wallet } = walletWith(['char-1:salary:12']);
    await expect(wallet.pay(100, 'purchase', 'Replay', 'salary:12')).resolves.toBeUndefined();
    expect(wallet.cash).toBe(1_000);
  });
});

/** A wallet owing `debt` from a refunded top-up, over a ledger that just tracks the cash balance. */
function owingWallet(debt: number, cash: number) {
  const character = { id: 'char-1', settledAt: 1_000, seed: 'seed', debt, debtRepaid: 0, purchasedTotal: 2_000, unearnedTotal: 2_000, earnedTotal: 0 } as CharacterEntity;
  const ctx = new SimulationContext(character, {} as EntityManager, {} as WorldService, 1_000);
  let balance = cash;
  const keys = new Set<string>();
  const debits: Array<{ key: string; amount: number; sink: string }> = [];
  const ledger = {
    systemAccount: (name: string) => `system:${name}`,
    post: async (_manager: EntityManager, input: { idempotencyKey: string; legs: ReadonlyArray<{ accountId: string; amount: number }> }): Promise<PostingResult> => {
      if (keys.has(input.idempotencyKey)) return { transactionId: 't', applied: false, balances: new Map() };
      keys.add(input.idempotencyKey);
      balance += input.legs.find((leg) => leg.accountId === ACCOUNTS.cash)?.amount ?? 0;
      return { transactionId: 't', applied: true, balances: new Map([[ACCOUNTS.cash, balance]]) };
    },
    debit: async (_manager: EntityManager, input: { idempotencyKey: string; amount: number; sink: string }): Promise<PostingResult> => {
      if (keys.has(input.idempotencyKey)) return { transactionId: 't', applied: false, balances: new Map() };
      keys.add(input.idempotencyKey);
      balance -= input.amount;
      debits.push({ key: input.idempotencyKey, amount: input.amount, sink: input.sink });
      return { transactionId: 't', applied: true, balances: new Map([[ACCOUNTS.cash, balance]]) };
    },
  } as unknown as LedgerService;
  const wallet = new CharacterWallet(ctx, ledger, ACCOUNTS, cash);
  ctx.bindWallet(wallet);
  return { ctx, wallet, character, debits };
}

describe('CharacterWallet.collectDebt', () => {
  it('takes what it can from cash back to system:topup, keyed by what was repaid before', async () => {
    const { ctx, wallet, character, debits } = owingWallet(500, 300);
    await wallet.collectDebt();
    expect(debits).toEqual([{ key: 'char-1:debt-repayment:0', amount: 300, sink: 'topup' }]);
    expect(wallet.cash).toBe(0);
    expect(character).toMatchObject({ debt: 200, debtRepaid: 300, purchasedTotal: 1_700, unearnedTotal: 1_700 });
    expect(ctx.notifications.at(-1)).toMatchObject({ title: 'Part of your debt repaid', amount: -300 });
    // Nothing left in cash: nothing more to take.
    await wallet.collectDebt();
    expect(debits).toHaveLength(1);
  });

  it('repays the rest from the next money in, before it can be spent, then stops', async () => {
    const { ctx, wallet, character, debits } = owingWallet(500, 0);
    await wallet.receive(1_000, 'salary', 'Pay', 'salary:1', { income: 'earned' });
    expect(debits).toEqual([{ key: 'char-1:debt-repayment:0', amount: 500, sink: 'topup' }]);
    expect(wallet.cash).toBe(500);
    expect(character).toMatchObject({ debt: 0, debtRepaid: 500, earnedTotal: 1_000 });
    expect(ctx.notifications.at(-1)).toMatchObject({ title: 'Debt repaid ✓', tone: 'good' });
    await wallet.receive(1_000, 'salary', 'Pay', 'salary:2', { income: 'earned' });
    expect(debits).toHaveLength(1);
    expect(wallet.cash).toBe(1_500);
  });

  it('owes nothing, takes nothing', async () => {
    const { wallet, debits } = owingWallet(0, 1_000);
    await wallet.collectDebt();
    expect(debits).toEqual([]);
    expect(wallet.cash).toBe(1_000);
  });
});

describe('SimulationContext.once ("tap once" receipts)', () => {
  function contextWithReceipts() {
    const receipts = new Map<string, { request: unknown; response: unknown }>();
    const manager = {
      query: async (sql: string, params: unknown[]) => {
        const [characterId, kind, key, request, response] = params as string[];
        if (sql.startsWith('SELECT')) {
          const found = receipts.get(`${characterId}|${kind}|${key}`);
          return found ? [found] : [];
        }
        // Postgres jsonb reorders keys: store the request with its keys reversed to prove the comparison ignores order.
        if (sql.startsWith('INSERT')) {
          const reordered = Object.fromEntries(Object.entries(JSON.parse(request) as Record<string, unknown>).toReversed());
          receipts.set(`${characterId}|${kind}|${key}`, { request: reordered, response: JSON.parse(response) });
        }
        return [];
      },
    } as unknown as EntityManager;
    const ctx = new SimulationContext({ id: 'char-1', settledAt: 1_000, seed: 'seed' } as CharacterEntity, manager, {} as WorldService, 1_000);
    return { ctx, receipts };
  }

  it('runs once per key and hands a retry the first result', async () => {
    const { ctx } = contextWithReceipts();
    let runs = 0;
    const buy = async () => ({ order: ++runs });
    const request = { itemId: 'rice', quantity: 2 };
    await expect(ctx.once('shop-purchase', 'key-00000001', request, buy)).resolves.toEqual({ order: 1 });
    await expect(ctx.once('shop-purchase', 'key-00000001', { quantity: 2, itemId: 'rice' }, buy)).resolves.toEqual({ order: 1 });
    expect(runs).toBe(1);
    // A new key (or no key) is a new purchase; the same key on another command is its own receipt.
    await expect(ctx.once('shop-purchase', 'key-00000002', request, buy)).resolves.toEqual({ order: 2 });
    await expect(ctx.once('shop-purchase', undefined, request, buy)).resolves.toEqual({ order: 3 });
    await expect(ctx.once('vehicle-purchase', 'key-00000001', request, buy)).resolves.toEqual({ order: 4 });
  });

  it('refuses the same key for a different request', async () => {
    const { ctx } = contextWithReceipts();
    await ctx.once('shop-purchase', 'key-00000001', { itemId: 'rice', quantity: 1 }, async () => 'ok');
    await expect(ctx.once('shop-purchase', 'key-00000001', { itemId: 'rice', quantity: 5 }, async () => 'again')).rejects.toMatchObject({
      errorCode: 'IDEMPOTENCY_KEY_REUSED',
    });
  });

  it('stores nothing when the command fails, so a retry runs it again', async () => {
    const { ctx, receipts } = contextWithReceipts();
    await expect(
      ctx.once('land', 'key-00000001', { districtId: 'epe' }, async () => {
        throw new GameRuleException('INSUFFICIENT_FUNDS', 'Not enough');
      }),
    ).rejects.toThrow('Not enough');
    expect(receipts.size).toBe(0);
    await expect(ctx.once('land', 'key-00000001', { districtId: 'epe' }, async () => 'bought')).resolves.toBe('bought');
  });
});
