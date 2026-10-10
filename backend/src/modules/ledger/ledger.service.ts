import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { In, type DataSource, type EntityManager } from 'typeorm';
import { assertSafeNaira, type LedgerEntryDto, type LedgerKind, type Paginated } from '@insidelife/shared';
import { DomainException, InsufficientFundsException } from '../../common/exceptions/domain.exception.js';
import { MetricsService } from '../../metrics/metrics.service.js';
import { LedgerAccountEntity, type LedgerAccountKind, type LedgerCurrency } from './entities/ledger-account.entity.js';
import { LedgerEntryEntity } from './entities/ledger-entry.entity.js';
import { LedgerSystemDeltaEntity } from './entities/ledger-system-delta.entity.js';
import { LedgerTransactionEntity } from './entities/ledger-transaction.entity.js';
import {
  SYSTEM_ACCOUNTS,
  type CharacterAccounts,
  type PostingInput,
  type PostingResult,
  type SystemAccount,
} from './interfaces/ledger.interfaces.js';

const CHARACTER_ACCOUNT_KINDS: ReadonlyArray<{ kind: Exclude<LedgerAccountKind, 'system'>; currency: LedgerCurrency }> = [
  { kind: 'cash', currency: 'NGN' },
  { kind: 'savings', currency: 'NGN' },
  { kind: 'pension', currency: 'NGN' },
  { kind: 'usd', currency: 'USD' },
];

const SYSTEM_CURRENCY: Readonly<Record<SystemAccount, LedgerCurrency>> = {
  mint: 'NGN',
  burn: 'NGN',
  tax: 'NGN',
  fees: 'NGN',
  topup: 'NGN',
  market: 'NGN',
  fxNgn: 'NGN',
  fxUsd: 'USD',
};

const FAUCET_SYSTEMS = new Set<string>([SYSTEM_ACCOUNTS.mint, SYSTEM_ACCOUNTS.topup]);
const SINK_SYSTEMS = new Set<string>([SYSTEM_ACCOUNTS.burn, SYSTEM_ACCOUNTS.tax, SYSTEM_ACCOUNTS.fees]);

export type CharacterBalances = Readonly<Record<Exclude<LedgerAccountKind, 'system'>, number>>;

/** Bound on the remembered account currencies (four per character; cleared and refilled when exceeded). */
const MAX_REMEMBERED_ACCOUNTS = 100_000;

function accountIds(accounts: readonly LedgerAccountEntity[]): CharacterAccounts {
  const byKind = new Map(accounts.map((account) => [account.kind, account.id]));
  const pick = (kind: Exclude<LedgerAccountKind, 'system'>): string => {
    const id = byKind.get(kind);
    if (!id) throw new DomainException('LEDGER_ACCOUNT_MISSING', 'Wallet is not set up yet');
    return id;
  };
  return { cash: pick('cash'), savings: pick('savings'), pension: pick('pension'), usd: pick('usd') };
}

function balancesOf(accounts: readonly LedgerAccountEntity[]): CharacterBalances {
  const balanceOf = (kind: LedgerAccountKind): number => accounts.find((a) => a.kind === kind)?.balance ?? 0;
  return { cash: balanceOf('cash'), savings: balanceOf('savings'), pension: balanceOf('pension'), usd: balanceOf('usd') };
}

class UnbalancedPostingException extends DomainException {
  constructor() {
    super('LEDGER_UNBALANCED', 'Ledger posting does not balance');
  }
}

/**
 * Double-entry ledger. All money in the game moves through `post`, inside the caller's transaction.
 *
 * Guarantees:
 * - each posting balances per currency;
 * - an idempotency key is applied at most once (`INSERT … ON CONFLICT DO NOTHING`);
 * - player balances never go negative (conditional UPDATE + CHECK constraint), so double-spends fail atomically;
 * - player accounts are updated in id order to minimise deadlocks;
 * - system accounts (mint, burn, tax…) are never locked: their legs are appended to `ledger_system_deltas` and rolled
 *   up into the balance every few seconds, so concurrent players never contend on those hot rows.
 */
@Injectable()
export class LedgerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(LedgerService.name);
  private readonly systemIds = new Map<SystemAccount, string>();
  /** Accounts whose rows this transaction locked, with their balances (null = re-read: a posting may have moved them). */
  private readonly locked = new WeakMap<EntityManager, Map<string, CharacterBalances | null>>();
  /** Currency of every account seen so far (an account's currency never changes), so postings needn't look it up. */
  private readonly currencies = new Map<string, LedgerCurrency>();

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly metrics: MetricsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    for (const [key, code] of Object.entries(SYSTEM_ACCOUNTS) as Array<[SystemAccount, string]>) {
      await this.dataSource
        .createQueryBuilder()
        .insert()
        .into(LedgerAccountEntity)
        .values({ ownerId: null, kind: 'system', code, currency: SYSTEM_CURRENCY[key], balance: 0, allowNegative: true })
        .orIgnore()
        .execute();
      const account = await this.dataSource.getRepository(LedgerAccountEntity).findOneByOrFail({ code });
      this.systemIds.set(key, account.id);
      this.rememberCurrencies([account]);
    }
    this.logger.log('System ledger accounts ready');
  }

  systemAccount(key: SystemAccount): string {
    const id = this.systemIds.get(key);
    if (!id) throw new DomainException('LEDGER_NOT_READY', 'Ledger is starting up, try again');
    return id;
  }

  async openCharacterAccounts(manager: EntityManager, characterId: string): Promise<CharacterAccounts> {
    await manager
      .createQueryBuilder()
      .insert()
      .into(LedgerAccountEntity)
      .values(
        CHARACTER_ACCOUNT_KINDS.map(({ kind, currency }) => ({
          ownerId: characterId,
          kind,
          currency,
          balance: 0,
          allowNegative: false,
          code: null,
        })),
      )
      .orIgnore()
      .execute();
    return this.characterAccounts(manager, characterId);
  }

  async characterAccounts(manager: EntityManager, characterId: string): Promise<CharacterAccounts> {
    const accounts = await manager.find(LedgerAccountEntity, { where: { ownerId: characterId } });
    this.rememberCurrencies(accounts);
    return accountIds(accounts);
  }

  /**
   * The character's accounts locked `FOR UPDATE` for the rest of the transaction (in id order, like before): their ids
   * and balances from one read. While the lock is held, a balance can only change through `post` on this same
   * transaction, so later `balances` calls in it are answered from this read until the next posting.
   */
  async lockCharacterAccounts(manager: EntityManager, characterId: string): Promise<{ readonly accounts: CharacterAccounts; readonly balances: CharacterBalances }> {
    const rows = await this.loadAccounts(manager, characterId, true);
    const accounts = accountIds(rows);
    const balances = balancesOf(rows);
    this.heldBalances(manager).set(characterId, balances);
    return { accounts, balances };
  }

  /** Balances by account kind, optionally locking the rows for the rest of the transaction. */
  async balances(manager: EntityManager, characterId: string, lock = false): Promise<CharacterBalances> {
    const held = this.locked.get(manager);
    const known = held?.get(characterId);
    if (known) return known;
    const balances = balancesOf(await this.loadAccounts(manager, characterId, lock));
    // Rows this transaction has locked can't change under it: keep the answer until its next posting.
    if (lock || held?.has(characterId)) this.heldBalances(manager).set(characterId, balances);
    return balances;
  }

  private heldBalances(manager: EntityManager): Map<string, CharacterBalances | null> {
    let held = this.locked.get(manager);
    if (!held) {
      held = new Map();
      this.locked.set(manager, held);
    }
    return held;
  }

  private async loadAccounts(manager: EntityManager, characterId: string, lock: boolean): Promise<LedgerAccountEntity[]> {
    const query = manager
      .getRepository(LedgerAccountEntity)
      .createQueryBuilder('account')
      .where('account.owner_id = :characterId', { characterId })
      .orderBy('account.id', 'ASC');
    if (lock) query.setLock('pessimistic_write');
    const accounts = await query.getMany();
    this.rememberCurrencies(accounts);
    return accounts;
  }

  private rememberCurrencies(accounts: readonly LedgerAccountEntity[]): void {
    if (this.currencies.size > MAX_REMEMBERED_ACCOUNTS) this.currencies.clear();
    for (const account of accounts) this.currencies.set(account.id, account.currency);
  }

  async post(manager: EntityManager, input: PostingInput): Promise<PostingResult> {
    const legs = input.legs.filter((leg) => leg.amount !== 0);
    for (const leg of legs) assertSafeNaira(leg.amount);
    if (legs.length < 2) throw new UnbalancedPostingException();
    // Balances read earlier in this transaction may be about to change.
    const held = this.locked.get(manager);
    if (held) for (const characterId of held.keys()) held.set(characterId, null);

    let currencyOf: ReadonlyMap<string, LedgerCurrency> = this.currencies;
    if (legs.some((leg) => !this.currencies.has(leg.accountId))) {
      const accounts = await manager.find(LedgerAccountEntity, { where: { id: In(legs.map((leg) => leg.accountId)) } });
      this.rememberCurrencies(accounts);
      currencyOf = new Map(accounts.map((account) => [account.id, account.currency]));
    }
    const sums = new Map<LedgerCurrency, number>();
    for (const leg of legs) {
      const currency = currencyOf.get(leg.accountId);
      if (!currency) throw new DomainException('LEDGER_ACCOUNT_MISSING', 'Wallet account not found');
      sums.set(currency, (sums.get(currency) ?? 0) + leg.amount);
    }
    if ([...sums.values()].some((sum) => sum !== 0)) throw new UnbalancedPostingException();

    const inserted = await manager
      .createQueryBuilder()
      .insert()
      .into(LedgerTransactionEntity)
      .values(
        manager.create(LedgerTransactionEntity, {
          idempotencyKey: input.idempotencyKey,
          kind: input.kind,
          memo: input.memo.slice(0, 200),
          gameMinute: input.gameMinute,
          characterId: input.characterId ?? null,
          counterpartyCharacterId: input.counterpartyCharacterId ?? null,
          metadata: input.metadata ?? {},
        }),
      )
      .orIgnore()
      .returning(['id'])
      .execute();

    const transactionId = (inserted.raw as Array<{ id: string }>)[0]?.id;
    if (!transactionId) {
      const existing = await manager.findOneByOrFail(LedgerTransactionEntity, { idempotencyKey: input.idempotencyKey });
      return { transactionId: existing.id, applied: false, balances: new Map() };
    }

    const balances = new Map<string, number>();
    const ordered = legs.toSorted((a, b) => a.accountId.localeCompare(b.accountId));
    const systemLegs = ordered.filter((leg) => this.isSystemAccount(leg.accountId));
    for (const leg of ordered) {
      if (this.isSystemAccount(leg.accountId)) continue;
      const rows = (await manager.query(
        `UPDATE ledger_accounts
            SET balance = balance + $1, updated_at = now()
          WHERE id = $2 AND (allow_negative OR balance + $1 >= 0)
      RETURNING balance`,
        [leg.amount, leg.accountId],
      )) as [Array<{ balance: string }>, number] | Array<{ balance: string }>;
      const resultRows = Array.isArray(rows[0]) ? (rows[0] as Array<{ balance: string }>) : (rows as Array<{ balance: string }>);
      const row = resultRows[0];
      if (!row) throw new InsufficientFundsException(-leg.amount);
      balances.set(leg.accountId, Number(row.balance));
    }

    await manager.insert(
      LedgerEntryEntity,
      ordered.map((leg) => ({
        transactionId,
        accountId: leg.accountId,
        amount: leg.amount,
        balanceAfter: balances.get(leg.accountId) ?? null,
      })),
    );
    if (systemLegs.length > 0) {
      await manager.insert(
        LedgerSystemDeltaEntity,
        systemLegs.map((leg) => ({ accountId: leg.accountId, amount: leg.amount })),
      );
    }

    this.recordFlow(input.kind, ordered);
    return { transactionId, applied: true, balances };
  }

  /**
   * Fold committed system-account deltas into their balances (exactly once: each delta row is deleted as it's
   * applied; rows from transactions still in flight are invisible and wait for the next run). Safe to run anywhere,
   * any number of times, concurrently.
   */
  async rollUpSystemBalances(): Promise<number> {
    const rows = (await this.dataSource.query(
      `WITH moved AS (DELETE FROM ledger_system_deltas RETURNING account_id, amount),
            totals AS (SELECT account_id, SUM(amount) AS total, COUNT(*) AS n FROM moved GROUP BY account_id)
       UPDATE ledger_accounts a
          SET balance = a.balance + totals.total, updated_at = now()
         FROM totals
        WHERE a.id = totals.account_id
    RETURNING totals.n`,
    )) as [Array<{ n: string }>, number] | Array<{ n: string }>;
    const result = Array.isArray(rows[0]) ? (rows[0] as Array<{ n: string }>) : (rows as Array<{ n: string }>);
    return result.reduce((sum, row) => sum + Number(row.n), 0);
  }

  /** Up-to-date balance of a system account (rolls pending deltas up first). */
  async systemBalance(key: SystemAccount): Promise<number> {
    await this.rollUpSystemBalances();
    const account = await this.dataSource.getRepository(LedgerAccountEntity).findOneByOrFail({ id: this.systemAccount(key) });
    return account.balance;
  }

  private isSystemAccount(accountId: string): boolean {
    for (const id of this.systemIds.values()) if (id === accountId) return true;
    return false;
  }

  /** Mint naira into a character account (salary, rewards). */
  credit(
    manager: EntityManager,
    params: Omit<PostingInput, 'legs'> & { readonly accountId: string; readonly amount: number; readonly source?: SystemAccount },
  ): Promise<PostingResult> {
    const { accountId, amount, source = 'mint', ...rest } = params;
    return this.post(manager, {
      ...rest,
      legs: [
        { accountId: this.systemAccount(source), amount: -amount },
        { accountId, amount },
      ],
    });
  }

  /** Remove naira from a character account into a sink (purchases, bills, tax). */
  debit(
    manager: EntityManager,
    params: Omit<PostingInput, 'legs'> & { readonly accountId: string; readonly amount: number; readonly sink?: SystemAccount },
  ): Promise<PostingResult> {
    const { accountId, amount, sink = 'burn', ...rest } = params;
    return this.post(manager, {
      ...rest,
      legs: [
        { accountId, amount: -amount },
        { accountId: this.systemAccount(sink), amount },
      ],
    });
  }

  /** Cash-account statement, newest first, cursor = ISO createdAt of the last item. */
  async statement(characterId: string, cursor: string | null, limit: number): Promise<Paginated<LedgerEntryDto>> {
    const manager = this.dataSource.manager;
    const accounts = await this.characterAccounts(manager, characterId);
    const params: unknown[] = [accounts.cash, limit + 1];
    let cursorClause = '';
    if (cursor) {
      params.push(new Date(cursor));
      cursorClause = 'AND e.created_at < $3';
    }
    const rows = (await manager.query(
      `SELECT e.id, e.amount, e.balance_after, e.created_at, t.kind, t.memo, t.game_minute,
              c.handle AS counterparty
         FROM ledger_entries e
         JOIN ledger_transactions t ON t.id = e.transaction_id
    LEFT JOIN characters c
           ON c.id = CASE WHEN t.counterparty_character_id = $${params.length + 1} THEN t.character_id ELSE t.counterparty_character_id END
        WHERE e.account_id = $1 ${cursorClause}
     ORDER BY e.created_at DESC, e.id DESC
        LIMIT $2`,
      [...params, characterId],
    )) as Array<{
      id: string;
      amount: string;
      balance_after: string;
      created_at: Date;
      kind: LedgerKind;
      memo: string;
      game_minute: string;
      counterparty: string | null;
    }>;

    const page = rows.slice(0, limit);
    return {
      items: page.map((row) => ({
        id: row.id,
        kind: row.kind,
        amount: Number(row.amount),
        balanceAfter: Number(row.balance_after),
        memo: row.memo,
        gameMinute: Number(row.game_minute),
        createdAt: row.created_at.toISOString(),
        counterparty: row.counterparty,
      })),
      nextCursor: rows.length > limit ? (page[page.length - 1]?.created_at.toISOString() ?? null) : null,
    };
  }

  /** Sum of debits from a character's cash account for a kind since a real timestamp (daily transfer limits). */
  async sumOutflowSince(manager: EntityManager, characterId: string, kind: LedgerKind, since: Date): Promise<number> {
    const accounts = await this.characterAccounts(manager, characterId);
    const rows = (await manager.query(
      `SELECT COALESCE(SUM(-e.amount), 0) AS total
         FROM ledger_entries e
         JOIN ledger_transactions t ON t.id = e.transaction_id
        WHERE e.account_id = $1 AND e.amount < 0 AND t.kind = $2 AND e.created_at >= $3`,
      [accounts.cash, kind, since],
    )) as Array<{ total: string }>;
    return Number(rows[0]?.total ?? 0);
  }

  private recordFlow(kind: LedgerKind, legs: readonly { accountId: string; amount: number }[]): void {
    for (const leg of legs) {
      const code = [...this.systemIds.entries()].find(([, id]) => id === leg.accountId)?.[0];
      if (!code) continue;
      const systemCode = SYSTEM_ACCOUNTS[code];
      if (FAUCET_SYSTEMS.has(systemCode) && leg.amount < 0) this.metrics.moneyFlow.inc({ direction: 'faucet', kind }, -leg.amount);
      if (SINK_SYSTEMS.has(systemCode) && leg.amount > 0) this.metrics.moneyFlow.inc({ direction: 'sink', kind }, leg.amount);
    }
  }
}
