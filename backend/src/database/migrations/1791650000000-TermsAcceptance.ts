import { MigrationInterface, QueryRunner } from 'typeorm';

/** New accounts record when they agreed to the Terms of Service and Privacy Policy, and which version. */
export class TermsAcceptance1791650000000 implements MigrationInterface {
  name = 'TermsAcceptance1791650000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "terms_accepted_at" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "users" ADD "terms_version" character varying(32)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "terms_version"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "terms_accepted_at"`);
  }
}
