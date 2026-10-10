import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cars get a fuel tank and can break down: litres in the tank (null for cars bought before tanks existed, read as
 * full) and the game minute a car broke down (it won't move until a mechanic sees it).
 */
export class VehicleFuelTanks1791600435105 implements MigrationInterface {
  name = 'VehicleFuelTanks1791600435105';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "owned_vehicles" ADD "fuel_litres" real`);
    await queryRunner.query(`ALTER TABLE "owned_vehicles" ADD "broken_down_at" bigint`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "owned_vehicles" DROP COLUMN "broken_down_at"`);
    await queryRunner.query(`ALTER TABLE "owned_vehicles" DROP COLUMN "fuel_litres"`);
  }
}
