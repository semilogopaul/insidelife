import { MigrationInterface, QueryRunner } from 'typeorm';

export class CharacterHomeProperty1791510157458 implements MigrationInterface {
  name = 'CharacterHomeProperty1791510157458';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "characters" ADD "home_property_id" uuid`);
    // Owners already living in their own house.
    await queryRunner.query(
      `UPDATE "characters" c SET "home_property_id" = b."property_id" FROM "housing_residences" r JOIN "housing_buildings" b ON b."id" = r."building_id" WHERE r."character_id" = c."id" AND r."kind" = 'owned'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "characters" DROP COLUMN "home_property_id"`);
  }
}
