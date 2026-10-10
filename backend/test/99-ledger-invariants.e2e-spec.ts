import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { E2E_DATABASE_URL } from './support/env.js';
import { ledgerViolations, NO_VIOLATIONS } from './support/ledger.js';

/**
 * Last file of the run: after every flow above (thousands of postings, races, refunds and claw-backs), the ledger as
 * a whole still balances. Read straight from the database, independently of the services that wrote it.
 */
let db: DataSource;

beforeAll(async () => {
  db = new DataSource({ type: 'postgres', url: E2E_DATABASE_URL });
  await db.initialize();
});

afterAll(async () => {
  await db?.destroy();
});

describe('the whole ledger after the run', () => {
  it('has no unbalanced transaction, drifted balance, negative wallet, duplicate key or money from nowhere', async () => {
    expect(await ledgerViolations(db)).toEqual(NO_VIOLATIONS);
  });

  it('every payment that was credited, refunded or clawed back did so at most once', async () => {
    const doubleCredits = await db.query(
      `SELECT p.reference, COUNT(t.id)::int AS credits
         FROM payments p JOIN ledger_transactions t ON t.idempotency_key LIKE '%:topup:' || p.reference
        GROUP BY p.reference HAVING COUNT(t.id) > 1`,
    );
    expect(doubleCredits).toEqual([]);
    const creditedButNotPaid = await db.query(
      `SELECT p.reference, p.status FROM payments p
        WHERE EXISTS (SELECT 1 FROM ledger_transactions t WHERE t.idempotency_key LIKE '%:topup:' || p.reference)
          AND p.status <> 'success'`,
    );
    expect(creditedButNotPaid).toEqual([]);
    const overRefunded = await db.query(`SELECT reference FROM payments WHERE refunded_kobo > COALESCE(paid_kobo, amount_kobo)`);
    expect(overRefunded).toEqual([]);
    const paidItemsWithoutPayment = await db.query(
      `SELECT c.id FROM promotion_campaigns c
        WHERE c.status IN ('in-review', 'approved', 'live', 'completed')
          AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.reference = c.payment_reference AND p.status = 'success')`,
    );
    expect(paidItemsWithoutPayment).toEqual([]);
  });

  it('exercised the money flows it claims to (sanity check of the run itself)', async () => {
    const [counts] = await db.query<Array<Record<string, number>>>(
      `SELECT (SELECT COUNT(*)::int FROM characters) AS characters,
              (SELECT COUNT(*)::int FROM ledger_transactions) AS postings,
              (SELECT COUNT(*)::int FROM payments WHERE status = 'success') AS paid_checkouts,
              (SELECT COUNT(*)::int FROM payments WHERE refund_status = 'refunded') AS refunded_checkouts,
              (SELECT COUNT(*)::int FROM ledger_transactions WHERE kind = 'transfer') AS transfers,
              (SELECT COUNT(*)::int FROM promotion_campaigns) AS ad_bookings,
              (SELECT COUNT(*)::int FROM promotion_club_orders) AS song_orders`,
    );
    // Printed for the report; a full run creates hundreds of players and payments (this file can also run alone).
    process.stdout.write(`Ledger after the run: ${JSON.stringify(counts)}\n`);
    expect(counts!.postings).toBeGreaterThan(0);
  });
});
