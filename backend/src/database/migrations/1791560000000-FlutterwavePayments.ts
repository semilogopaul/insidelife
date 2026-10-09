import { MigrationInterface, QueryRunner } from 'typeorm';

/** Flutterwave payments: longer provider names, the gateway transaction id, and refund tracking. */
export class FlutterwavePayments1791560000000 implements MigrationInterface {
  name = 'FlutterwavePayments1791560000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "payments" ALTER COLUMN "provider" TYPE character varying(16)`);
    await queryRunner.query(`ALTER TABLE "payments" ADD "gateway_transaction_id" character varying(32)`);
    await queryRunner.query(`ALTER TABLE "payments" ADD "refund_status" character varying(12)`);
    await queryRunner.query(`ALTER TABLE "payments" ADD "refund_reason" character varying(200)`);
    await queryRunner.query(`ALTER TABLE "payments" ADD "refunded_kobo" bigint NOT NULL DEFAULT '0'`);
    await queryRunner.query(`ALTER TABLE "payments" ADD "refund_id" character varying(40)`);
    await queryRunner.query(`ALTER TABLE "payments" ADD "refunded_at" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "payments" ADD "refund_failure" character varying(200)`);
    await queryRunner.query(`ALTER TABLE "payments" ADD "flag_reason" character varying(200)`);
    await queryRunner.query(
      `CREATE INDEX "payments_gateway_transaction" ON "payments" ("gateway_transaction_id") WHERE "gateway_transaction_id" IS NOT NULL`,
    );
    await queryRunner.query(`CREATE INDEX "payments_refund_status" ON "payments" ("refund_status") WHERE "refund_status" IS NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."payments_refund_status"`);
    await queryRunner.query(`DROP INDEX "public"."payments_gateway_transaction"`);
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "flag_reason"`);
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "refund_failure"`);
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "refunded_at"`);
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "refund_id"`);
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "refunded_kobo"`);
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "refund_reason"`);
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "refund_status"`);
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "gateway_transaction_id"`);
    await queryRunner.query(`ALTER TABLE "payments" ALTER COLUMN "provider" TYPE character varying(10)`);
  }
}
