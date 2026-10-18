import { MigrationInterface, QueryRunner } from 'typeorm';

/** Hotel rooms: a stay is a temporary home until checkout. */
export class HotelStays1791860000000 implements MigrationInterface {
  name = 'HotelStays1791860000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "hotel_stays" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "character_id" uuid NOT NULL, "venue_id" character varying(64) NOT NULL, "nights" integer NOT NULL, "nightly_rate" bigint NOT NULL, "total_paid" bigint NOT NULL, "started_at" bigint NOT NULL, "checkout_at" bigint NOT NULL, "status" character varying(8) NOT NULL DEFAULT 'active', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_hotel_stays_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "hotel_stays_character" ON "hotel_stays" ("character_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."hotel_stays_character"`);
    await queryRunner.query(`DROP TABLE "hotel_stays"`);
  }
}
