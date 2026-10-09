import { MigrationInterface, QueryRunner } from 'typeorm';

export class HomeVisits1791511768892 implements MigrationInterface {
  name = 'HomeVisits1791511768892';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "home_visits" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "host_id" uuid NOT NULL, "guest_id" uuid NOT NULL, "status" character varying(12) NOT NULL, "home" jsonb NOT NULL, "invited_at" bigint NOT NULL, "expires_at" bigint NOT NULL, "responded_at" bigint, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_3d83d4351c6c8ae26da5d51c5e8" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "home_visits_guest_status" ON "home_visits"  ("guest_id", "status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "home_visits_host_status" ON "home_visits"  ("host_id", "status") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."home_visits_host_status"`);
    await queryRunner.query(`DROP INDEX "public"."home_visits_guest_status"`);
    await queryRunner.query(`DROP TABLE "home_visits"`);
  }
}
