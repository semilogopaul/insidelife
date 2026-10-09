import { MigrationInterface, QueryRunner } from 'typeorm';

export class PeerMoneyLimits1791558022537 implements MigrationInterface {
  name = 'PeerMoneyLimits1791558022537';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "peer_money_days" ("character_id" uuid NOT NULL, "day" date NOT NULL, "sent" bigint NOT NULL DEFAULT '0', "received" bigint NOT NULL DEFAULT '0', CONSTRAINT "PK_3da817c27db2fa0f9cf423d6f79" PRIMARY KEY ("character_id", "day"))`,
    );
    await queryRunner.query(`ALTER TABLE "characters" ADD "locked_unearned" bigint NOT NULL DEFAULT '0'`);

    // Backfill: money already sent between players (transfers and sprays), per UTC day, on both sides.
    const peer = `
          SELECT t.character_id AS sender, t.counterparty_character_id AS recipient, (t.created_at AT TIME ZONE 'UTC')::date AS day, e.amount
            FROM ledger_transactions t
            JOIN ledger_entries e ON e.transaction_id = t.id AND e.amount > 0
            JOIN ledger_accounts a ON a.id = e.account_id AND a.owner_id = t.counterparty_character_id AND a.kind = 'cash'
           WHERE t.kind IN ('transfer', 'gift') AND t.character_id IS NOT NULL AND t.counterparty_character_id IS NOT NULL`;
    await queryRunner.query(`
          INSERT INTO peer_money_days (character_id, day, sent)
          SELECT sender, day, SUM(amount) FROM (${peer}) p GROUP BY sender, day
          ON CONFLICT (character_id, day) DO UPDATE SET sent = peer_money_days.sent + EXCLUDED.sent`);
    await queryRunner.query(`
          INSERT INTO peer_money_days (character_id, day, received)
          SELECT recipient, day, SUM(amount) FROM (${peer}) p GROUP BY recipient, day
          ON CONFLICT (character_id, day) DO UPDATE SET received = peer_money_days.received + EXCLUDED.received`);

    // Backfill: existing characters lock everything unearned except top-ups and money other players sent them
    // (starting money, free assets and the like; new characters lock exactly their starting money and free assets).
    await queryRunner.query(`
          UPDATE characters c
             SET locked_unearned = GREATEST(0, c.unearned_total - c.purchased_total - COALESCE(r.received, 0))
            FROM (SELECT id FROM characters) ids
            LEFT JOIN (SELECT character_id, SUM(received) AS received FROM peer_money_days GROUP BY character_id) r ON r.character_id = ids.id
           WHERE ids.id = c.id`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "characters" DROP COLUMN "locked_unearned"`);
    await queryRunner.query(`DROP TABLE "peer_money_days"`);
  }
}
