import { MigrationInterface, QueryRunner } from 'typeorm';

export class ChatRequestsAndMedia1791504708791 implements MigrationInterface {
  name = 'ChatRequestsAndMedia1791504708791';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "chat_dm_threads" ADD "accepted" boolean NOT NULL DEFAULT true`);
    await queryRunner.query(`ALTER TABLE "chat_dm_threads" ADD "declined_at" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(
      `ALTER TABLE "chat_messages" ADD "kind" character varying(8) NOT NULL DEFAULT 'text'`,
    );
    await queryRunner.query(`ALTER TABLE "chat_messages" ADD "media_key" character varying(96)`);
    await queryRunner.query(`ALTER TABLE "chat_messages" ADD "media_type" character varying(32)`);
    await queryRunner.query(`ALTER TABLE "chat_messages" ADD "media_bytes" integer`);
    await queryRunner.query(`ALTER TABLE "chat_messages" ADD "duration_ms" integer`);
    await queryRunner.query(`ALTER TABLE "chat_messages" ADD "width" smallint`);
    await queryRunner.query(`ALTER TABLE "chat_messages" ADD "height" smallint`);
    await queryRunner.query(`CREATE INDEX "chat_messages_created" ON "chat_messages"  ("created_at") `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."chat_messages_created"`);
    await queryRunner.query(`ALTER TABLE "chat_messages" DROP COLUMN "height"`);
    await queryRunner.query(`ALTER TABLE "chat_messages" DROP COLUMN "width"`);
    await queryRunner.query(`ALTER TABLE "chat_messages" DROP COLUMN "duration_ms"`);
    await queryRunner.query(`ALTER TABLE "chat_messages" DROP COLUMN "media_bytes"`);
    await queryRunner.query(`ALTER TABLE "chat_messages" DROP COLUMN "media_type"`);
    await queryRunner.query(`ALTER TABLE "chat_messages" DROP COLUMN "media_key"`);
    await queryRunner.query(`ALTER TABLE "chat_messages" DROP COLUMN "kind"`);
    await queryRunner.query(`ALTER TABLE "chat_dm_threads" DROP COLUMN "declined_at"`);
    await queryRunner.query(`ALTER TABLE "chat_dm_threads" DROP COLUMN "accepted"`);
  }
}
