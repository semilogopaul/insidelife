import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * One-time prompts per account: the welcome note (and which button the player pressed) and the featured-places
 * prompt. Accounts that already exist never see the welcome note, so it is marked seen for them.
 */
export class WelcomeAndFeaturedPrompts1791610000000 implements MigrationInterface {
  name = 'WelcomeAndFeaturedPrompts1791610000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "welcome_seen_at" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "users" ADD "welcome_reaction" character varying(24)`);
    await queryRunner.query(`ALTER TABLE "users" ADD "featured_seen_at" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`UPDATE "users" SET "welcome_seen_at" = now()`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "featured_seen_at"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "welcome_reaction"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "welcome_seen_at"`);
  }
}
