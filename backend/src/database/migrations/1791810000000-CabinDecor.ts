import { MigrationInterface, QueryRunner } from 'typeorm';

/** Cabin decor: a decor piece can be fitted in one of the owner's aircraft instead of a home. */
export class CabinDecor1791810000000 implements MigrationInterface {
  name = 'CabinDecor1791810000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "decor_pieces" ADD "aircraft_id" uuid`);
    await queryRunner.query(`CREATE INDEX "decor_pieces_aircraft" ON "decor_pieces" ("aircraft_id") WHERE "aircraft_id" IS NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."decor_pieces_aircraft"`);
    await queryRunner.query(`ALTER TABLE "decor_pieces" DROP COLUMN "aircraft_id"`);
  }
}
