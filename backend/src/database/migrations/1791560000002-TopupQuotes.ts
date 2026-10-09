import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Custom top-up amounts: each top-up payment keeps the rate it was quoted (game naira per real ₦1) and every payment
 * records the real amount the gateway verified, which is what a top-up credits from.
 */
export class TopupQuotes1791560000002 implements MigrationInterface {
  name = 'TopupQuotes1791560000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "payments" ADD "topup_rate" integer`);
    await queryRunner.query(`ALTER TABLE "payments" ADD "paid_kobo" bigint`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "paid_kobo"`);
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "topup_rate"`);
  }
}
