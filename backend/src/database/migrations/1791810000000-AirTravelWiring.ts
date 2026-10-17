import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Air travel in play: flight reminders sent (bit flags per booking), the apron lookup (aircraft by terminal) and the
 * cabin's "who is on my flight" lookup (characters by the commercial flight they are aboard).
 */
export class AirTravelWiring1791810000000 implements MigrationInterface {
  name = 'AirTravelWiring1791810000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "flight_bookings" ADD "notified" smallint NOT NULL DEFAULT '0'`);
    await queryRunner.query(`CREATE INDEX "aircraft_parked_at" ON "aircraft" ("parked_at")`);
    await queryRunner.query(`CREATE INDEX "characters_flight_aboard" ON "characters" ((travel->>'flightId')) WHERE travel IS NOT NULL AND travel->>'mode' = 'flight'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."characters_flight_aboard"`);
    await queryRunner.query(`DROP INDEX "public"."aircraft_parked_at"`);
    await queryRunner.query(`ALTER TABLE "flight_bookings" DROP COLUMN "notified"`);
  }
}
