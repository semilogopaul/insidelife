import { MigrationInterface, QueryRunner } from 'typeorm';

/** Ops overrides of the catalog ad prices (one row per overridden rate key). */
export class AdRates1791560000001 implements MigrationInterface {
  name = 'AdRates1791560000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "ad_rates" ("key" character varying(40) NOT NULL, "price_kobo" bigint NOT NULL, "updated_by" uuid, "reason" character varying(300), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_9dd49eacdc1ce2563d5ff0770b0" PRIMARY KEY ("key"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "ad_rates"`);
  }
}
