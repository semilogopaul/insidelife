import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Promotions you can see working:
 * - **Club schedule**: club orders hold a schedule lane (`lane`); every scheduled play is a row in
 *   `promotion_club_plays` (unique per slot) with its audience; orders keep plays, different listeners and the total
 *   audience.
 * - **Views**: campaigns keep different viewers (`unique_viewers`); `promotion_audience` holds keyed, per-promotion
 *   hashes of who saw or heard what (unique counts only).
 * - **Block length**: campaigns record the block they were sold in (`block_days`, 7 or 3).
 * - **Notices**: live / ended notices are sent once (`live_notified_at`, `ended_notified_at`), "your song is on" at most
 *   every half hour (`play_notice_at`). Items already running or finished are marked as told, so nobody gets a flood.
 * - **Club song price** (owner's rule, Oct 2026): ₦5,000 a day, stored per week like every rate (₦35,000). An older
 *   `club-song` override was a price for 7 days under the old ₦5,000-a-song rule, so it is dropped and the new default
 *   applies; ops can set a new one in Ad prices.
 */
export class PromotionSchedulesAndViews1791583793851 implements MigrationInterface {
  name = 'PromotionSchedulesAndViews1791583793851';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "promotion_club_plays" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "slot_index" bigint NOT NULL, "order_id" uuid NOT NULL, "track_id" uuid NOT NULL, "venue_id" character varying(64) NOT NULL, "game_minute" bigint NOT NULL, "starts_at" TIMESTAMP WITH TIME ZONE NOT NULL, "ends_at" TIMESTAMP WITH TIME ZONE NOT NULL, "audience" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_891ebd70b790c510a8d24b54ca5" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "promotion_club_plays_venue_starts" ON "promotion_club_plays" ("venue_id", "starts_at")`);
    await queryRunner.query(`CREATE INDEX "promotion_club_plays_order_starts" ON "promotion_club_plays" ("order_id", "starts_at")`);
    await queryRunner.query(`CREATE INDEX "promotion_club_plays_starts" ON "promotion_club_plays" ("starts_at")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "promotion_club_plays_slot" ON "promotion_club_plays" ("slot_index")`);
    await queryRunner.query(
      `CREATE TABLE "promotion_audience" ("subject_id" uuid NOT NULL, "viewer_hash" character varying(24) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_21f6387d82d02efaf96a385230a" PRIMARY KEY ("subject_id", "viewer_hash"))`,
    );
    await queryRunner.query(`CREATE INDEX "promotion_audience_created" ON "promotion_audience" ("created_at")`);
    await queryRunner.query(`ALTER TABLE "promotion_campaigns" ADD "block_days" smallint NOT NULL DEFAULT '7'`);
    await queryRunner.query(`ALTER TABLE "promotion_campaigns" ADD "unique_viewers" integer NOT NULL DEFAULT '0'`);
    await queryRunner.query(`ALTER TABLE "promotion_campaigns" ADD "live_notified_at" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "promotion_campaigns" ADD "ended_notified_at" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "promotion_club_orders" ADD "lane" smallint`);
    await queryRunner.query(`ALTER TABLE "promotion_club_orders" ADD "listeners" integer NOT NULL DEFAULT '0'`);
    await queryRunner.query(`ALTER TABLE "promotion_club_orders" ADD "audience" integer NOT NULL DEFAULT '0'`);
    await queryRunner.query(`ALTER TABLE "promotion_club_orders" ADD "play_notice_at" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "promotion_club_orders" ADD "live_notified_at" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "promotion_club_orders" ADD "ended_notified_at" TIMESTAMP WITH TIME ZONE`);

    // Already running or finished before this release: told already (by the approval notice), no new notices.
    const today = `(now() AT TIME ZONE 'Africa/Lagos')::date`;
    for (const table of ['promotion_campaigns', 'promotion_club_orders']) {
      await queryRunner.query(`UPDATE "${table}" SET "live_notified_at" = now() WHERE "status" IN ('approved', 'live', 'completed') AND "start_date" <= ${today}`);
      await queryRunner.query(`UPDATE "${table}" SET "ended_notified_at" = now() WHERE "status" = 'completed' OR ("paid_at" IS NOT NULL AND "end_date" <= ${today})`);
    }
    await queryRunner.query(`DELETE FROM "ad_rates" WHERE "key" = 'club-song'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "promotion_club_orders" DROP COLUMN "ended_notified_at"`);
    await queryRunner.query(`ALTER TABLE "promotion_club_orders" DROP COLUMN "live_notified_at"`);
    await queryRunner.query(`ALTER TABLE "promotion_club_orders" DROP COLUMN "play_notice_at"`);
    await queryRunner.query(`ALTER TABLE "promotion_club_orders" DROP COLUMN "audience"`);
    await queryRunner.query(`ALTER TABLE "promotion_club_orders" DROP COLUMN "listeners"`);
    await queryRunner.query(`ALTER TABLE "promotion_club_orders" DROP COLUMN "lane"`);
    await queryRunner.query(`ALTER TABLE "promotion_campaigns" DROP COLUMN "ended_notified_at"`);
    await queryRunner.query(`ALTER TABLE "promotion_campaigns" DROP COLUMN "live_notified_at"`);
    await queryRunner.query(`ALTER TABLE "promotion_campaigns" DROP COLUMN "unique_viewers"`);
    await queryRunner.query(`ALTER TABLE "promotion_campaigns" DROP COLUMN "block_days"`);
    await queryRunner.query(`DROP INDEX "public"."promotion_audience_created"`);
    await queryRunner.query(`DROP TABLE "promotion_audience"`);
    await queryRunner.query(`DROP INDEX "public"."promotion_club_plays_slot"`);
    await queryRunner.query(`DROP INDEX "public"."promotion_club_plays_starts"`);
    await queryRunner.query(`DROP INDEX "public"."promotion_club_plays_order_starts"`);
    await queryRunner.query(`DROP INDEX "public"."promotion_club_plays_venue_starts"`);
    await queryRunner.query(`DROP TABLE "promotion_club_plays"`);
  }
}
