import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Paying in US dollars. A payment now records what it charges in its own currency's minor units (`amount_minor`:
 * kobo for NGN, cents for USD) next to its naira value (`amount_kobo`, what reports and daily caps count), and a dollar
 * payment keeps the ₦ per $1 it was converted at. What the gateway verified and refunded is in the payment's currency
 * (`paid_minor`, `refunded_minor`, renamed from `paid_kobo` / `refunded_kobo`: every existing row is NGN, so the values
 * are unchanged). Ad bookings and club orders snapshot their charge the same way.
 *
 * The checks make a mismatched row impossible: a naira payment charges exactly its naira value; a dollar payment has
 * a rate and its naira value is exactly cents × rate.
 */
export class DollarPayments1791610000000 implements MigrationInterface {
  name = 'DollarPayments1791610000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "payments" ADD "amount_minor" bigint`);
    await queryRunner.query(`UPDATE "payments" SET "amount_minor" = "amount_kobo"`);
    await queryRunner.query(`ALTER TABLE "payments" ALTER COLUMN "amount_minor" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "payments" RENAME COLUMN "paid_kobo" TO "paid_minor"`);
    await queryRunner.query(`ALTER TABLE "payments" RENAME COLUMN "refunded_kobo" TO "refunded_minor"`);
    await queryRunner.query(`ALTER TABLE "payments" ADD "ngn_per_usd" integer`);
    await queryRunner.query(`ALTER TABLE "payments" ADD CONSTRAINT "payments_currency" CHECK ("currency" IN ('NGN', 'USD'))`);
    await queryRunner.query(`ALTER TABLE "payments" ADD CONSTRAINT "payments_charge_matches_value" CHECK (("currency" = 'NGN' AND "ngn_per_usd" IS NULL AND "amount_minor" = "amount_kobo") OR ("currency" = 'USD' AND "ngn_per_usd" BETWEEN 500 AND 5000 AND "amount_kobo" = "amount_minor" * "ngn_per_usd"))`);

    for (const table of ['promotion_campaigns', 'promotion_club_orders']) {
      await queryRunner.query(`ALTER TABLE "${table}" ADD "currency" character varying(3) NOT NULL DEFAULT 'NGN'`);
      await queryRunner.query(`ALTER TABLE "${table}" ADD "charge_minor" bigint`);
      await queryRunner.query(`UPDATE "${table}" SET "charge_minor" = "amount_kobo"`);
      await queryRunner.query(`ALTER TABLE "${table}" ALTER COLUMN "charge_minor" SET NOT NULL`);
      await queryRunner.query(`ALTER TABLE "${table}" ADD "ngn_per_usd" integer`);
      await queryRunner.query(`ALTER TABLE "${table}" ADD CONSTRAINT "${table}_charge" CHECK (("currency" = 'NGN' AND "ngn_per_usd" IS NULL AND "charge_minor" = "amount_kobo") OR ("currency" = 'USD' AND "ngn_per_usd" BETWEEN 500 AND 5000 AND "charge_minor" * "ngn_per_usd" >= "amount_kobo"))`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['promotion_club_orders', 'promotion_campaigns']) {
      await queryRunner.query(`ALTER TABLE "${table}" DROP CONSTRAINT "${table}_charge"`);
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "ngn_per_usd"`);
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "charge_minor"`);
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "currency"`);
    }
    await queryRunner.query(`ALTER TABLE "payments" DROP CONSTRAINT "payments_charge_matches_value"`);
    await queryRunner.query(`ALTER TABLE "payments" DROP CONSTRAINT "payments_currency"`);
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "ngn_per_usd"`);
    await queryRunner.query(`ALTER TABLE "payments" RENAME COLUMN "refunded_minor" TO "refunded_kobo"`);
    await queryRunner.query(`ALTER TABLE "payments" RENAME COLUMN "paid_minor" TO "paid_kobo"`);
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "amount_minor"`);
  }
}
