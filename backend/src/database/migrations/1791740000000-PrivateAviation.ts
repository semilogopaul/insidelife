import { MigrationInterface, QueryRunner } from 'typeorm';

/** Private aviation: owned aircraft (liveries, names, registrations, parking) and Private Pilot Licence training. */
export class PrivateAviation1791740000000 implements MigrationInterface {
  name = 'PrivateAviation1791740000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "aircraft" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "character_id" uuid NOT NULL, "aircraft_id" character varying(40) NOT NULL, "call_name" character varying(16), "registration" character varying(8) NOT NULL, "livery_base" character varying(24) NOT NULL, "livery_accent" character varying(24) NOT NULL, "purchase_price" bigint NOT NULL, "acquired_at" bigint NOT NULL, "parked_at" character varying(24) NOT NULL, "arrives_at" bigint, "grounded_at" bigint, "arrears" bigint NOT NULL DEFAULT '0', "reinstatements" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_aircraft_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "aircraft_character" ON "aircraft" ("character_id")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "aircraft_registration" ON "aircraft" ("registration")`);
    await queryRunner.query(
      `CREATE TABLE "pilot_training" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "character_id" uuid NOT NULL, "enrolled_at" bigint NOT NULL, "lessons" integer NOT NULL DEFAULT '0', "last_lesson_day" integer, "check_rides" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_pilot_training_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE UNIQUE INDEX "pilot_training_character" ON "pilot_training" ("character_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."pilot_training_character"`);
    await queryRunner.query(`DROP TABLE "pilot_training"`);
    await queryRunner.query(`DROP INDEX "public"."aircraft_registration"`);
    await queryRunner.query(`DROP INDEX "public"."aircraft_character"`);
    await queryRunner.query(`DROP TABLE "aircraft"`);
  }
}
