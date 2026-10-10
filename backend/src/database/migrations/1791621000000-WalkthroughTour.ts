import { MigrationInterface, QueryRunner } from 'typeorm';

/** The guided walkthrough shows once per account. Accounts that already exist are marked completed (they can replay it in Me). */
export class WalkthroughTour1791621000000 implements MigrationInterface {
  name = 'WalkthroughTour1791621000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "tour_completed_at" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "users" ADD "tour_skipped" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`UPDATE "users" SET "tour_completed_at" = now()`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "tour_skipped"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "tour_completed_at"`);
  }
}
