import { MigrationInterface, QueryRunner } from 'typeorm';

/** Races between friends from one city to the other ("Race a friend to Abuja"). */
export class Races1791840000000 implements MigrationInterface {
  name = 'Races1791840000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "races" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "challenger_id" uuid NOT NULL, "from_city" character varying(12) NOT NULL, "to_city" character varying(12) NOT NULL, "status" character varying(12) NOT NULL, "created_at_minute" bigint NOT NULL, "started_at" bigint, "expires_at" bigint NOT NULL, "decided_at" bigint, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_races_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "races_status_expires" ON "races" ("status", "expires_at")`);
    await queryRunner.query(
      `CREATE TABLE "race_entries" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "race_id" uuid NOT NULL, "character_id" uuid NOT NULL, "status" character varying(10) NOT NULL, "finished_at" bigint, "how" character varying(12), "how_label" character varying(80), "won" boolean NOT NULL DEFAULT false, "win_claimed" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_race_entries_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE UNIQUE INDEX "race_entries_race_character" ON "race_entries" ("race_id", "character_id")`);
    await queryRunner.query(`CREATE INDEX "race_entries_character" ON "race_entries" ("character_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."race_entries_character"`);
    await queryRunner.query(`DROP INDEX "public"."race_entries_race_character"`);
    await queryRunner.query(`DROP TABLE "race_entries"`);
    await queryRunner.query(`DROP INDEX "public"."races_status_expires"`);
    await queryRunner.query(`DROP TABLE "races"`);
  }
}
