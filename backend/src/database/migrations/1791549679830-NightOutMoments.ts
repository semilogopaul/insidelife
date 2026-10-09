import { MigrationInterface, QueryRunner } from 'typeorm';

export class NightOutMoments1791549679830 implements MigrationInterface {
  name = 'NightOutMoments1791549679830';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "social_night_moments" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "venue_id" character varying(64) NOT NULL, "night" integer NOT NULL, "item_id" character varying(32) NOT NULL, "kind" character varying(24) NOT NULL, "from_id" uuid NOT NULL, "from_handle" character varying(20) NOT NULL, "from_first_name" character varying(40) NOT NULL, "to_id" uuid, "to_handle" character varying(20), "to_first_name" character varying(40), "message" character varying(80), "price" bigint NOT NULL, "clout" integer NOT NULL DEFAULT '0', "starts_at" TIMESTAMP WITH TIME ZONE NOT NULL, "ends_at" TIMESTAMP WITH TIME ZONE NOT NULL, "game_minute" bigint NOT NULL, "idempotency_key" character varying(64) NOT NULL, "recipient_mood" smallint NOT NULL DEFAULT '0', "recipient_applied" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_b676679d2a89b333f7ab5bb7dda" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "social_night_moments_pending" ON "social_night_moments"  ("to_id") WHERE "recipient_applied" = false`,
    );
    await queryRunner.query(
      `CREATE INDEX "social_night_moments_venue_ends" ON "social_night_moments"  ("venue_id", "ends_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "social_night_moments_sender_night" ON "social_night_moments"  ("from_id", "night") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "social_night_moments_idempotency" ON "social_night_moments"  ("from_id", "idempotency_key") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."social_night_moments_idempotency"`);
    await queryRunner.query(`DROP INDEX "public"."social_night_moments_sender_night"`);
    await queryRunner.query(`DROP INDEX "public"."social_night_moments_venue_ends"`);
    await queryRunner.query(`DROP INDEX "public"."social_night_moments_pending"`);
    await queryRunner.query(`DROP TABLE "social_night_moments"`);
  }
}
