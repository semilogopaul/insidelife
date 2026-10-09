import { MigrationInterface, QueryRunner } from 'typeorm';

export class VenueSprays1791546556413 implements MigrationInterface {
  name = 'VenueSprays1791546556413';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "social_venue_sprays" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "venue_id" character varying(64) NOT NULL, "night" integer NOT NULL, "from_id" uuid NOT NULL, "to_id" uuid, "amount" bigint NOT NULL, "game_minute" bigint NOT NULL, "idempotency_key" character varying(64) NOT NULL, "ledger_transaction_id" uuid, "fine" bigint NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_9879fbb97bcfe0d2f051d612fcc" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "social_venue_sprays_night" ON "social_venue_sprays"  ("venue_id", "night", "from_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "social_venue_sprays_idempotency" ON "social_venue_sprays"  ("from_id", "idempotency_key") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."social_venue_sprays_idempotency"`);
    await queryRunner.query(`DROP INDEX "public"."social_venue_sprays_night"`);
    await queryRunner.query(`DROP TABLE "social_venue_sprays"`);
  }
}
