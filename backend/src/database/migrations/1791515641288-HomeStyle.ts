import { MigrationInterface, QueryRunner } from 'typeorm';

export class HomeStyle1791515641288 implements MigrationInterface {
  name = 'HomeStyle1791515641288';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "housing_buildings" ADD "exterior" jsonb`);
    await queryRunner.query(`ALTER TABLE "housing_buildings" ADD "interior" jsonb`);
    await queryRunner.query(`ALTER TABLE "housing_leases" ADD "decor" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "housing_leases" DROP COLUMN "decor"`);
    await queryRunner.query(`ALTER TABLE "housing_buildings" DROP COLUMN "interior"`);
    await queryRunner.query(`ALTER TABLE "housing_buildings" DROP COLUMN "exterior"`);
  }
}
