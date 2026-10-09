import { MigrationInterface, QueryRunner } from 'typeorm';

export class AdCampaignTagline1791507802417 implements MigrationInterface {
  name = 'AdCampaignTagline1791507802417';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "promotion_campaigns" ADD "tagline" character varying(90)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "promotion_campaigns" DROP COLUMN "tagline"`);
  }
}
