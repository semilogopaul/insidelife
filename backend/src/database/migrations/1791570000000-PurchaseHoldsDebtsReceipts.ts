import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Chargeback protection and "tap once" purchases: what a character owes after a refunded top-up couldn't be clawed
 * back (one `character_debts` row per refund, the outstanding total and what's been repaid on `characters`), and the
 * stored results of purchases sent with a client idempotency key (`command_receipts`).
 */
export class PurchaseHoldsDebtsReceipts1791570000000 implements MigrationInterface {
  name = 'PurchaseHoldsDebtsReceipts1791570000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "character_debts" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "character_id" uuid NOT NULL, "reference" character varying(64) NOT NULL, "refund_id" character varying(40) NOT NULL, "amount" bigint NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_e711792a364269a915ac10f4dee" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "character_debts_character" ON "character_debts" ("character_id")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "character_debts_refund" ON "character_debts" ("reference", "refund_id")`);
    await queryRunner.query(
      `CREATE TABLE "command_receipts" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "character_id" uuid NOT NULL, "kind" character varying(40) NOT NULL, "key" character varying(64) NOT NULL, "request" jsonb NOT NULL, "response" jsonb NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_f8d219fd4f8644de48792b2180c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE UNIQUE INDEX "command_receipts_key" ON "command_receipts" ("character_id", "kind", "key")`);
    await queryRunner.query(`ALTER TABLE "characters" ADD "debt" bigint NOT NULL DEFAULT '0'`);
    await queryRunner.query(`ALTER TABLE "characters" ADD "debt_repaid" bigint NOT NULL DEFAULT '0'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "characters" DROP COLUMN "debt_repaid"`);
    await queryRunner.query(`ALTER TABLE "characters" DROP COLUMN "debt"`);
    await queryRunner.query(`DROP INDEX "public"."command_receipts_key"`);
    await queryRunner.query(`DROP TABLE "command_receipts"`);
    await queryRunner.query(`DROP INDEX "public"."character_debts_refund"`);
    await queryRunner.query(`DROP INDEX "public"."character_debts_character"`);
    await queryRunner.query(`DROP TABLE "character_debts"`);
  }
}
