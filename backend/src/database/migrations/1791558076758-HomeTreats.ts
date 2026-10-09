import { MigrationInterface, QueryRunner } from 'typeorm';

export class HomeTreats1791558076758 implements MigrationInterface {
  name = 'HomeTreats1791558076758';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "home_treats" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "host_id" uuid NOT NULL, "guest_id" uuid NOT NULL, "visit_id" uuid NOT NULL, "treat_id" character varying(24) NOT NULL, "order_key" character varying(64) NOT NULL, "unit_price" bigint NOT NULL, "served_at" bigint NOT NULL, "until" bigint NOT NULL, "applied_at" bigint, "closeness" smallint NOT NULL DEFAULT '0', "thanked_at" bigint, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_a2bc521c980f543076e40649902" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "home_treats_visit" ON "home_treats"  ("visit_id") `);
    await queryRunner.query(`CREATE INDEX "home_treats_host_until" ON "home_treats"  ("host_id", "until") `);
    await queryRunner.query(
      `CREATE INDEX "home_treats_pending" ON "home_treats"  ("guest_id") WHERE "applied_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "home_treats_order" ON "home_treats"  ("host_id", "order_key", "guest_id") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."home_treats_order"`);
    await queryRunner.query(`DROP INDEX "public"."home_treats_pending"`);
    await queryRunner.query(`DROP INDEX "public"."home_treats_host_until"`);
    await queryRunner.query(`DROP INDEX "public"."home_treats_visit"`);
    await queryRunner.query(`DROP TABLE "home_treats"`);
  }
}
