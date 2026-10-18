import { MigrationInterface, QueryRunner } from 'typeorm';

/** A car belongs to the city it is parked in, and can ride a car carrier to the other one. */
export class CarsBelongToACity1791850000000 implements MigrationInterface {
  name = 'CarsBelongToACity1791850000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "owned_vehicles" ADD "city_id" character varying(12) NOT NULL DEFAULT 'lagos'`);
    await queryRunner.query(`ALTER TABLE "owned_vehicles" ADD "shipping_to" character varying(12)`);
    // Cars already owned stay where their owner lives (a car is parked at home).
    await queryRunner.query(
      `UPDATE "owned_vehicles" v SET "city_id" = CASE WHEN c."home_district_id" IN ('abuja-cbd','maitama','asokoro','wuse','garki','jabi','gwarinpa','kubwa','lugbe') THEN 'abuja' ELSE 'lagos' END FROM "characters" c WHERE c."id" = v."character_id"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "owned_vehicles" DROP COLUMN "shipping_to"`);
    await queryRunner.query(`ALTER TABLE "owned_vehicles" DROP COLUMN "city_id"`);
  }
}
