import { MigrationInterface, QueryRunner } from 'typeorm';

export class CharacterPantry1791509560533 implements MigrationInterface {
  name = 'CharacterPantry1791509560533';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "characters" ADD "pantry_meals" integer NOT NULL DEFAULT '0'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "characters" DROP COLUMN "pantry_meals"`);
  }
}
