import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The betting app (Odogwu Odds): slips against the house on the Lagos League (stake, legs priced at placement,
 * settled once in the bettor's own session) and per-account responsible-play settings (loss limit, self-exclusion,
 * reality check). Fixtures and results are not stored: they are a pure function of BETTING_SECRET.
 */
export class BettingLagosLeague1791612000000 implements MigrationInterface {
  name = 'BettingLagosLeague1791612000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "betting_slips" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "character_id" uuid NOT NULL, "stake" bigint NOT NULL, "potential_returns" bigint NOT NULL, "capped" boolean NOT NULL DEFAULT false, "legs" jsonb NOT NULL, "status" character varying(8) NOT NULL DEFAULT 'open', "payout" bigint NOT NULL DEFAULT '0', "placed_at" bigint NOT NULL, "placed_day" integer NOT NULL, "settles_at" bigint NOT NULL, "settled_at" bigint, "settled_day" integer, "idempotency_key" character varying(64) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_b7fbea16d62f0c849470a94af9f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "betting_slips_due" ON "betting_slips"  ("character_id", "settles_at") WHERE "status" = 'open'`,
    );
    await queryRunner.query(
      `CREATE INDEX "betting_slips_character_day" ON "betting_slips"  ("character_id", "placed_day") `,
    );
    await queryRunner.query(
      `CREATE INDEX "betting_slips_character_placed" ON "betting_slips"  ("character_id", "placed_at") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "betting_slips_idempotency" ON "betting_slips"  ("character_id", "idempotency_key") `,
    );
    await queryRunner.query(
      `CREATE TABLE "betting_profiles" ("user_id" uuid NOT NULL, "daily_loss_limit" bigint, "pending_loss_limit" bigint, "pending_limit_at" TIMESTAMP WITH TIME ZONE, "excluded_until" TIMESTAMP WITH TIME ZONE, "reality_check_minutes" integer NOT NULL DEFAULT '30', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_3e3813434ee4dacb1bdf1092b0b" PRIMARY KEY ("user_id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "betting_profiles"`);
    await queryRunner.query(`DROP INDEX "public"."betting_slips_idempotency"`);
    await queryRunner.query(`DROP INDEX "public"."betting_slips_character_placed"`);
    await queryRunner.query(`DROP INDEX "public"."betting_slips_character_day"`);
    await queryRunner.query(`DROP INDEX "public"."betting_slips_due"`);
    await queryRunner.query(`DROP TABLE "betting_slips"`);
  }
}
