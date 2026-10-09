import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Reconciler scheduling and refund states: each payment records its gateway checks (attempts, last, next) so unpaid
 * checkouts back off instead of hogging every sweep, and its refund keeps the gateway's own status (only `completed`
 * is final) plus when that last changed.
 */
export class PaymentChecks1791560000003 implements MigrationInterface {
  name = 'PaymentChecks1791560000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "payments" ADD "check_attempts" integer NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "payments" ADD "last_checked_at" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "payments" ADD "next_check_at" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "payments" ADD "refund_gateway_status" character varying(32)`);
    await queryRunner.query(`ALTER TABLE "payments" ADD "refund_updated_at" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`CREATE INDEX "payments_next_check" ON "payments" ("next_check_at") WHERE "next_check_at" IS NOT NULL`);
    // Schedule what is already waiting: unconfirmed Flutterwave checkouts from the last day and undelivered payments.
    await queryRunner.query(
      `UPDATE "payments" SET "next_check_at" = now()
        WHERE ("status" IN ('initialized', 'failed') AND "provider" = 'flutterwave' AND "created_at" > now() - interval '24 hours')
           OR ("status" = 'success' AND "fulfilled_at" IS NULL)`,
    );
    await queryRunner.query(`UPDATE "payments" SET "refund_updated_at" = now() WHERE "refund_status" IS NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE "payments" SET "refund_status" = 'refunded' WHERE "refund_status" = 'pending'`);
    await queryRunner.query(`DROP INDEX "public"."payments_next_check"`);
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "refund_updated_at"`);
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "refund_gateway_status"`);
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "next_check_at"`);
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "last_checked_at"`);
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "check_attempts"`);
  }
}
