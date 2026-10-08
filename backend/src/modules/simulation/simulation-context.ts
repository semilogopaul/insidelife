import type { EntityManager } from 'typeorm';
import {
  rngFor,
  yearsBetween,
  type GameMinute,
  type LedgerKind,
  type NotificationDto,
  type Rng,
} from '@insidelife/shared';
import { InsufficientFundsException } from '../../common/exceptions/domain.exception.js';
import type { CharacterEntity } from '../characters/entities/character.entity.js';
import type { LedgerService } from '../ledger/ledger.service.js';
import type { CharacterAccounts, SystemAccount } from '../ledger/interfaces/ledger.interfaces.js';
import type { LedgerMetadata } from '../ledger/entities/ledger-transaction.entity.js';
import type { NotificationDraft } from '../notifications/notifications.service.js';
import type { WorldService } from '../world/world.service.js';

type AccountKind = keyof CharacterAccounts;

/** How incoming money is classified for the self-made rich list. */
export type IncomeClass = 'earned' | 'unearned' | 'purchased' | 'neutral';

export interface PayOptions {
  readonly sink?: SystemAccount;
  readonly account?: AccountKind;
  readonly counterpartyCharacterId?: string;
  readonly metadata?: LedgerMetadata;
}

export interface ReceiveOptions {
  readonly source?: SystemAccount;
  readonly account?: AccountKind;
  readonly income: IncomeClass;
  readonly metadata?: LedgerMetadata;
  /** Tax withheld at source (interest WHT, PAYE). Posted gross → net + tax in one balanced posting. */
  readonly withheld?: number;
}

/**
 * The character's wallet inside a simulation transaction. Every posting gets a deterministic idempotency key
 * (`<characterId>:<key>`), so replaying a settlement can never pay a salary twice.
 */
interface Accrual {
  readonly kind: LedgerKind;
  readonly label: string;
  readonly sink: SystemAccount;
  amount: number;
  days: number;
  readonly firstKey: string;
  lastKey: string;
}

export class CharacterWallet {
  private cashBalance: number;
  /** Small recurring charges (daily living costs) batched into one posting per kind until the next posting or flush. */
  private readonly accruals = new Map<string, Accrual>();

  constructor(
    private readonly ctx: SimulationContext,
    private readonly ledger: LedgerService,
    readonly accounts: CharacterAccounts,
    initialCash: number,
  ) {
    this.cashBalance = initialCash;
  }

  get cash(): number {
    return this.cashBalance;
  }

  canAfford(amount: number): boolean {
    return this.cashBalance >= amount;
  }

  /**
   * Batch a small recurring charge (e.g. daily living costs). Deducted from the in-memory balance now and posted as
   * one ledger entry per kind on the next posting or `flush()`. Returns false when it can't be afforded.
   */
  tryAccrue(amount: number, kind: LedgerKind, label: string, key: string, sink: SystemAccount = 'burn'): boolean {
    const rounded = Math.round(amount);
    if (rounded <= 0) return true;
    if (!this.canAfford(rounded)) return false;
    this.cashBalance -= rounded;
    const group = `${kind}:${label}:${sink}`;
    const existing = this.accruals.get(group);
    if (existing) {
      existing.amount += rounded;
      existing.days += 1;
      existing.lastKey = key;
    } else {
      this.accruals.set(group, { kind, label, sink, amount: rounded, days: 1, firstKey: key, lastKey: key });
    }
    return true;
  }

  /** Post all batched charges. Called before any other posting and at the end of every settle/command. */
  async flush(): Promise<void> {
    if (this.accruals.size === 0) return;
    const pending = [...this.accruals.values()];
    this.accruals.clear();
    for (const accrual of pending) {
      const result = await this.ledger.debit(this.ctx.manager, {
        kind: accrual.kind,
        memo: accrual.days > 1 ? `${accrual.label} (${accrual.days} days)` : accrual.label,
        idempotencyKey: `${this.ctx.character.id}:accrued:${accrual.firstKey}..${accrual.lastKey}`,
        gameMinute: this.ctx.time,
        characterId: this.ctx.character.id,
        accountId: this.accounts.cash,
        amount: accrual.amount,
        sink: accrual.sink,
      });
      this.sync(result.balances);
    }
  }

  /** Charge the character; throws InsufficientFundsException when they can't afford it (use for player commands). */
  async pay(amount: number, kind: LedgerKind, memo: string, key: string, options: PayOptions = {}): Promise<void> {
    const rounded = Math.round(amount);
    if (rounded <= 0) return;
    const account = options.account ?? 'cash';
    if (account === 'cash' && !this.canAfford(rounded)) throw new InsufficientFundsException(rounded);
    await this.flush();
    const result = await this.ledger.debit(this.ctx.manager, {
      kind,
      memo,
      idempotencyKey: `${this.ctx.character.id}:${key}`,
      gameMinute: this.ctx.time,
      characterId: this.ctx.character.id,
      counterpartyCharacterId: options.counterpartyCharacterId ?? null,
      metadata: options.metadata,
      accountId: this.accounts[account],
      amount: rounded,
      sink: options.sink ?? 'burn',
    });
    this.sync(result.balances);
  }

  /** Charge if affordable; returns false instead of throwing (use inside the simulation for bills). */
  async tryPay(amount: number, kind: LedgerKind, memo: string, key: string, options: PayOptions = {}): Promise<boolean> {
    const rounded = Math.round(amount);
    if (rounded <= 0) return true;
    if ((options.account ?? 'cash') === 'cash' && !this.canAfford(rounded)) return false;
    await this.pay(rounded, kind, memo, key, options);
    return true;
  }

  /**
   * Credit income. With `withheld`, the gross amount leaves the source, the tax goes to `system:tax` and only the net
   * reaches the character, in one posting; only the net counts toward earned/unearned totals.
   */
  async receive(amount: number, kind: LedgerKind, memo: string, key: string, options: ReceiveOptions): Promise<void> {
    const gross = Math.round(amount);
    if (gross <= 0) return;
    const withheld = Math.min(gross, Math.max(0, Math.round(options.withheld ?? 0)));
    const net = gross - withheld;
    await this.flush();
    const source = this.ledger.systemAccount(options.source ?? (options.income === 'purchased' ? 'topup' : 'mint'));
    const legs = [
      { accountId: source, amount: -gross },
      { accountId: this.accounts[options.account ?? 'cash'], amount: net },
      ...(withheld > 0 ? [{ accountId: this.ledger.systemAccount('tax'), amount: withheld }] : []),
    ];
    const result = await this.ledger.post(this.ctx.manager, {
      kind,
      memo,
      idempotencyKey: `${this.ctx.character.id}:${key}`,
      gameMinute: this.ctx.time,
      characterId: this.ctx.character.id,
      metadata: withheld > 0 ? { ...options.metadata, gross, withheld } : options.metadata,
      legs,
    });
    if (!result.applied) return;
    this.sync(result.balances);
    const character = this.ctx.character;
    if (options.income === 'earned') character.earnedTotal = Number(character.earnedTotal) + net;
    if (options.income === 'unearned' || options.income === 'purchased') character.unearnedTotal = Number(character.unearnedTotal) + net;
    if (options.income === 'purchased') character.purchasedTotal = Number(character.purchasedTotal) + net;
  }

  /** Realised investment gains (the sale proceeds themselves are neutral). */
  recordEarnedGain(amount: number): void {
    const rounded = Math.round(amount);
    if (rounded <= 0) return;
    this.ctx.character.earnedTotal = Number(this.ctx.character.earnedTotal) + rounded;
  }

  /** Move money between the character's own accounts (cash ↔ savings, cash → pension). */
  async move(from: AccountKind, to: AccountKind, amount: number, kind: LedgerKind, memo: string, key: string): Promise<void> {
    const rounded = Math.round(amount);
    if (rounded <= 0) return;
    if (from === 'cash' && !this.canAfford(rounded)) throw new InsufficientFundsException(rounded);
    await this.flush();
    const result = await this.ledger.post(this.ctx.manager, {
      kind,
      memo,
      idempotencyKey: `${this.ctx.character.id}:${key}`,
      gameMinute: this.ctx.time,
      characterId: this.ctx.character.id,
      legs: [
        { accountId: this.accounts[from], amount: -rounded },
        { accountId: this.accounts[to], amount: rounded },
      ],
    });
    this.sync(result.balances);
  }

  /**
   * Refresh the cached cash balance from a posting made directly through LedgerService (transfers between players,
   * inheritance). Pass the `balances` map from the PostingResult.
   */
  sync(balances: ReadonlyMap<string, number>): void {
    const cash = balances.get(this.accounts.cash);
    if (cash !== undefined) this.cashBalance = cash;
  }

  /** Count the value of free assets (starter car, gifts in kind) as unearned so the self-made rich list stays honest. */
  recordUnearnedAsset(value: number): void {
    const rounded = Math.max(0, Math.round(value));
    this.ctx.character.unearnedTotal = Number(this.ctx.character.unearnedTotal) + rounded;
  }
}

export interface AwayLine {
  readonly label: string;
  readonly amount?: number;
  readonly tone: 'good' | 'bad' | 'neutral';
}

/**
 * Everything a simulation system needs while working on one locked character: the entity, the transaction, the
 * world, the wallet, deterministic randomness and outboxes for notifications and post-commit effects.
 */
export class SimulationContext {
  /** The simulation's current time; advances as the engine walks the timeline. */
  time: GameMinute;
  readonly notifications: NotificationDraft[] = [];
  readonly awayLines: AwayLine[] = [];
  private readonly afterCommitHooks: Array<() => void | Promise<void>> = [];
  private readonly cache = new Map<string, Promise<unknown>>();
  wallet!: CharacterWallet;

  constructor(
    readonly character: CharacterEntity,
    readonly manager: EntityManager,
    readonly world: WorldService,
    readonly now: GameMinute,
  ) {
    this.time = character.settledAt;
  }

  bindWallet(wallet: CharacterWallet): void {
    this.wallet = wallet;
  }

  /** Deterministic RNG keyed by this character's seed plus the given parts. */
  rng(...parts: ReadonlyArray<string | number>): Rng {
    return rngFor(this.character.seed, ...parts);
  }

  /** Age in whole years at the simulation's current time. */
  get age(): number {
    return yearsBetween(this.character.bornAt, this.time);
  }

  notify(draft: Omit<NotificationDraft, 'gameMinute'> & { readonly gameMinute?: number }): void {
    this.notifications.push({ ...draft, gameMinute: draft.gameMinute ?? this.time });
  }

  /** Line for the "While you were away" report. */
  report(line: AwayLine): void {
    this.awayLines.push(line);
  }

  /**
   * Memoise domain state for the rest of this transaction. The promise itself is cached, so concurrent callers (the
   * snapshot builds its parts in parallel) share one load instead of racing.
   */
  memo<T>(key: string, loader: () => Promise<T>): Promise<T> {
    const cached = this.cache.get(key) as Promise<T> | undefined;
    if (cached) return cached;
    const pending = loader().catch((error: unknown) => {
      this.cache.delete(key);
      throw error;
    });
    this.cache.set(key, pending);
    return pending;
  }

  /** Drop a memoised value after mutating the underlying state. */
  invalidate(key: string): void {
    for (const cached of this.cache.keys()) if (cached === key || cached.startsWith(`${key}:`)) this.cache.delete(cached);
  }

  /** Run after the transaction commits (realtime pushes, cache busting). */
  afterCommit(hook: () => void | Promise<void>): void {
    this.afterCommitHooks.push(hook);
  }

  get pendingAfterCommit(): ReadonlyArray<() => void | Promise<void>> {
    return this.afterCommitHooks;
  }
}

export type PushedNotifications = readonly NotificationDto[];
