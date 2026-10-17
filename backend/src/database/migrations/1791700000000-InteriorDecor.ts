import { MigrationInterface, QueryRunner } from 'typeorm';

/** Interior decor: the pieces a character owns, and where each stands in their home (or none: in the inventory). */
export class InteriorDecor1791700000000 implements MigrationInterface {
  name = 'InteriorDecor1791700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "decor_pieces" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "character_id" uuid NOT NULL, "item_id" character varying(40) NOT NULL, "variant" character varying(24) NOT NULL, "price_paid" bigint NOT NULL, "bought_at" bigint NOT NULL, "recolours" smallint NOT NULL DEFAULT '0', "home_key" character varying(64), "template_id" character varying(24), "room_id" character varying(24), "x" numeric(6,2) NOT NULL DEFAULT '0', "y" numeric(6,2) NOT NULL DEFAULT '0', "z" numeric(6,2) NOT NULL DEFAULT '0', "rot" smallint NOT NULL DEFAULT '0', "wall" character varying(8), "on_id" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_decor_pieces_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "decor_pieces_character" ON "decor_pieces" ("character_id")`);
    await queryRunner.query(
      `CREATE INDEX "decor_pieces_room" ON "decor_pieces" ("character_id", "home_key", "template_id", "room_id")`,
    );
    await queryRunner.query(`CREATE INDEX "decor_pieces_home" ON "decor_pieces" ("home_key") WHERE "template_id" IS NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."decor_pieces_home"`);
    await queryRunner.query(`DROP INDEX "public"."decor_pieces_room"`);
    await queryRunner.query(`DROP INDEX "public"."decor_pieces_character"`);
    await queryRunner.query(`DROP TABLE "decor_pieces"`);
  }
}
