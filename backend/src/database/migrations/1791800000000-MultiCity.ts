import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lagos + Abuja (docs/MULTI_CITY.md). Regions are gone: `characters.region_id` becomes `city_id`. Anyone who was in an
 * old out-of-town region (or whose stored region is not Lagos) is brought home to Lagos with their trip and activity
 * cleared; everyone else is in Lagos. The old per-region progression counters are dropped (the `interstate` unlock stays;
 * the new `cities` counter starts at zero). Flight bookings are new.
 */
export class MultiCity1791800000000 implements MigrationInterface {
  name = 'MultiCity1791800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "characters" RENAME COLUMN "region_id" TO "city_id"`);
    await queryRunner.query(
      `UPDATE "characters" SET "location_id" = 'home:' || "id"::text, "travel" = NULL, "activity" = NULL WHERE "city_id" <> 'lagos'`,
    );
    await queryRunner.query(`UPDATE "characters" SET "city_id" = 'lagos' WHERE "city_id" <> 'lagos'`);
    await queryRunner.query(`DELETE FROM "progression_counters" WHERE "key" = 'regions' OR "key" LIKE 'region:%'`);

    await queryRunner.query(
      `CREATE TABLE "flight_bookings" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "character_id" uuid NOT NULL, "flight_id" character varying(64) NOT NULL, "cabin" character varying(12) NOT NULL, "fare" bigint NOT NULL, "status" character varying(12) NOT NULL, "channel" character varying(8) NOT NULL, "seat" character varying(4) NOT NULL, "gate" character varying(4) NOT NULL, "booked_at" bigint NOT NULL, "depart_at" bigint NOT NULL, "arrive_at" bigint NOT NULL, "changed_from" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_flight_bookings_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "flight_bookings_character" ON "flight_bookings" ("character_id", "depart_at")`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "flight_bookings_one_seat_per_flight" ON "flight_bookings" ("character_id", "flight_id") WHERE "status" NOT IN ('changed', 'cancelled')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."flight_bookings_one_seat_per_flight"`);
    await queryRunner.query(`DROP INDEX "public"."flight_bookings_character"`);
    await queryRunner.query(`DROP TABLE "flight_bookings"`);
    await queryRunner.query(`ALTER TABLE "characters" RENAME COLUMN "city_id" TO "region_id"`);
  }
}
