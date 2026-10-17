import { MigrationInterface, QueryRunner } from 'typeorm';

/** "What's new" announcements: the last one each account has seen (null for everyone, so existing players see it too). */
export class WhatsNewAnnouncements1791830000000 implements MigrationInterface {
  name = 'WhatsNewAnnouncements1791830000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "last_announcement_seen" character varying(64)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "last_announcement_seen"`);
  }
}
