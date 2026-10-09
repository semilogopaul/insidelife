import type { LedgerKind } from '@insidelife/shared';
import type { LedgerAccountKind } from '../entities/ledger-account.entity.js';
import type { LedgerMetadata } from '../entities/ledger-transaction.entity.js';

export const SYSTEM_ACCOUNTS = {
  /** Money created by the game: salaries, rewards, investment gains. */
  mint: 'system:mint',
  /** Money destroyed by the game: purchases, living costs. */
  burn: 'system:burn',
  tax: 'system:tax',
  fees: 'system:fees',
  /** Real-money top-ups (Flutterwave) come in here; refunded top-ups clawed back go out to it. */
  topup: 'system:topup',
  /** Counterparty for investment trades; its balance is the market's net position. */
  market: 'system:market',
  /** Currency exchange desks. */
  fxNgn: 'system:fx-ngn',
  fxUsd: 'system:fx-usd',
} as const;
export type SystemAccount = keyof typeof SYSTEM_ACCOUNTS;

export interface PostingLeg {
  readonly accountId: string;
  /** Positive credits the account, negative debits it. */
  readonly amount: number;
}

export interface PostingInput {
  readonly kind: LedgerKind;
  readonly idempotencyKey: string;
  readonly memo: string;
  readonly gameMinute: number;
  readonly characterId?: string | null;
  readonly counterpartyCharacterId?: string | null;
  readonly metadata?: LedgerMetadata;
  readonly legs: readonly PostingLeg[];
}

export interface PostingResult {
  readonly transactionId: string;
  /** False when the idempotency key was already used (nothing applied this time). */
  readonly applied: boolean;
  readonly balances: ReadonlyMap<string, number>;
}

export type CharacterAccounts = Readonly<Record<Exclude<LedgerAccountKind, 'system'>, string>>;
