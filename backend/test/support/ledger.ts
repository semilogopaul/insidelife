import type { DataSource } from 'typeorm';

export interface LedgerViolations {
  /** Transactions whose entries don't sum to zero (per currency), or that have fewer than two legs. */
  readonly unbalanced: readonly unknown[];
  /** Accounts whose balance (plus not-yet-rolled-up system deltas) differs from the sum of their entries. */
  readonly driftedBalances: readonly unknown[];
  /** Player accounts below zero. */
  readonly negative: readonly unknown[];
  readonly duplicateKeys: readonly unknown[];
  /** Σ every NGN balance ≠ 0: money appeared or vanished outside double entry. */
  readonly moneySupply: readonly unknown[];
  /** Characters whose purchased total isn't their net top-up flow (credits from system:topup − claw-backs to it). */
  readonly purchasedMismatch: readonly unknown[];
  /** Characters whose lifetime totals contradict each other (purchased > unearned, locked > unearned, negatives). */
  readonly inconsistentTotals: readonly unknown[];
}

/**
 * The ledger's invariants, checked with SQL against the database (independently of the services that wrote it).
 * Every list must be empty.
 */
export async function ledgerViolations(dataSource: DataSource): Promise<LedgerViolations> {
  const q = <T>(sql: string): Promise<T[]> => dataSource.query<T[]>(sql);
  const [unbalanced, driftedBalances, negative, duplicateKeys, moneySupply, purchasedMismatch, inconsistentTotals] = await Promise.all([
    q(`SELECT t.id, t.kind, t.idempotency_key, a.currency, SUM(e.amount)::bigint AS sum, COUNT(e.id)::int AS legs
         FROM ledger_transactions t
         LEFT JOIN ledger_entries e ON e.transaction_id = t.id
         LEFT JOIN ledger_accounts a ON a.id = e.account_id
        GROUP BY t.id, t.kind, t.idempotency_key, a.currency
       HAVING COALESCE(SUM(e.amount), 0) <> 0 OR COUNT(e.id) < 2`),
    q(`SELECT a.id, a.code, a.kind, a.owner_id, a.balance::bigint AS balance, COALESCE(e.total, 0)::bigint AS entries, COALESCE(d.total, 0)::bigint AS pending
         FROM ledger_accounts a
         LEFT JOIN (SELECT account_id, SUM(amount) AS total FROM ledger_entries GROUP BY account_id) e ON e.account_id = a.id
         LEFT JOIN (SELECT account_id, SUM(amount) AS total FROM ledger_system_deltas GROUP BY account_id) d ON d.account_id = a.id
        WHERE a.balance + COALESCE(d.total, 0) <> COALESCE(e.total, 0)`),
    q(`SELECT id, owner_id, kind, balance FROM ledger_accounts WHERE NOT allow_negative AND balance < 0`),
    q(`SELECT idempotency_key, COUNT(*)::int AS n FROM ledger_transactions GROUP BY idempotency_key HAVING COUNT(*) > 1`),
    q(`SELECT SUM(a.balance + COALESCE(d.total, 0))::bigint AS total
         FROM ledger_accounts a
         LEFT JOIN (SELECT account_id, SUM(amount) AS total FROM ledger_system_deltas GROUP BY account_id) d ON d.account_id = a.id
        WHERE a.currency = 'NGN'
       HAVING SUM(a.balance + COALESCE(d.total, 0)) <> 0`),
    q(`WITH topup AS (SELECT id FROM ledger_accounts WHERE code = 'system:topup'),
            flows AS (
              SELECT player.owner_id AS character_id, SUM(pe.amount) AS net
                FROM ledger_entries te
                JOIN topup ON topup.id = te.account_id
                JOIN ledger_entries pe ON pe.transaction_id = te.transaction_id AND pe.account_id <> te.account_id
                JOIN ledger_accounts player ON player.id = pe.account_id AND player.owner_id IS NOT NULL
               GROUP BY player.owner_id)
       SELECT c.id, c.handle, c.purchased_total::bigint AS purchased_total, COALESCE(f.net, 0)::bigint AS net_topups
         FROM characters c LEFT JOIN flows f ON f.character_id = c.id
        WHERE c.purchased_total <> COALESCE(f.net, 0)`),
    q(`SELECT id, handle, earned_total, unearned_total, locked_unearned, purchased_total
         FROM characters
        WHERE earned_total < 0 OR unearned_total < 0 OR purchased_total < 0 OR locked_unearned < 0
           OR purchased_total > unearned_total OR locked_unearned > unearned_total`),
  ]);
  return { unbalanced, driftedBalances, negative, duplicateKeys, moneySupply, purchasedMismatch, inconsistentTotals };
}

/** Flatten for an `expect(...).toEqual(NO_VIOLATIONS)` that prints what's wrong. */
export const NO_VIOLATIONS: LedgerViolations = {
  unbalanced: [],
  driftedBalances: [],
  negative: [],
  duplicateKeys: [],
  moneySupply: [],
  purchasedMismatch: [],
  inconsistentTotals: [],
};

/** Sum of a character's cash entries by ledger kind (what left or arrived, by reason). */
export async function cashFlowsByKind(dataSource: DataSource, characterId: string): Promise<Record<string, number>> {
  const rows = await dataSource.query<Array<{ kind: string; total: string }>>(
    `SELECT t.kind, SUM(e.amount)::bigint AS total
       FROM ledger_entries e
       JOIN ledger_accounts a ON a.id = e.account_id AND a.owner_id = $1 AND a.kind = 'cash'
       JOIN ledger_transactions t ON t.id = e.transaction_id
      GROUP BY t.kind`,
    [characterId],
  );
  return Object.fromEntries(rows.map((row) => [row.kind, Number(row.total)]));
}

/** Postings whose idempotency key starts with `<characterId>:<prefix>` (e.g. `topup:<reference>`). */
export async function postingsWithKey(dataSource: DataSource, keyPrefix: string): Promise<Array<{ id: string; kind: string; idempotency_key: string }>> {
  return dataSource.query(`SELECT id, kind, idempotency_key FROM ledger_transactions WHERE idempotency_key LIKE $1 ORDER BY created_at`, [`${keyPrefix}%`]);
}
