import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The sleep clock: when each character last had a real sleep. Ten game days past it they collapse (the autopilot no
 * longer puts a player at the controls to bed). Existing characters start a fresh clock at their last settle.
 */
export class SleepClock1791570000000 implements MigrationInterface {
  name = 'SleepClock1791570000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "characters" ADD "last_slept_at" bigint`);
    await queryRunner.query(`UPDATE "characters" SET "last_slept_at" = "settled_at"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "characters" DROP COLUMN "last_slept_at"`);
  }
}
