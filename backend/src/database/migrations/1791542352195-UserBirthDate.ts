import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserBirthDate1791542352195 implements MigrationInterface {
  name = 'UserBirthDate1791542352195';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "birth_date" date`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "birth_date"`);
  }
}
