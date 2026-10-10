import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fobes, the Lagos Rich List: daily snapshots for risers and fallers (the top 100 plus viewers), and indexes so the
 * rich lists (and the self-made leaderboard) read the top of the table instead of sorting every character. The
 * self-made index is an expression (it mirrors `SELF_MADE_SQL`), declared on the entity with `synchronize: false`.
 */
export class FobesRichList1791603138642 implements MigrationInterface {
  name = 'FobesRichList1791603138642';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "fobes_snapshots" ("day" integer NOT NULL, "character_id" uuid NOT NULL, "net_worth" bigint NOT NULL, "rank" integer, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_7582bdc9a80e0575be283a7de5a" PRIMARY KEY ("day", "character_id"))`,
    );
    await queryRunner.query(`CREATE INDEX "fobes_snapshots_character_day" ON "fobes_snapshots"  ("character_id", "day") `);
    await queryRunner.query(`CREATE INDEX "characters_net_worth_ranked" ON "characters"  ("net_worth") WHERE "alive" = true AND "hidden_at" IS NULL`);
    await queryRunner.query(
      `CREATE INDEX "characters_self_made_ranked" ON "characters" ((GREATEST(0, "net_worth" - "unearned_total"))) WHERE "alive" = true AND "hidden_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."characters_self_made_ranked"`);
    await queryRunner.query(`DROP INDEX "public"."characters_net_worth_ranked"`);
    await queryRunner.query(`DROP INDEX "public"."fobes_snapshots_character_day"`);
    await queryRunner.query(`DROP TABLE "fobes_snapshots"`);
  }
}
