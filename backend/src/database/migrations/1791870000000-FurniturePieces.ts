import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * One furniture model. Furniture bought in the shop (beds, sofas, TVs…) becomes a piece like any decor piece: it stands
 * in a room, can be moved, turned, re-finished, stored and sold. `inventory_item_id` links a piece to the shop stack
 * (condition, wear and the price paid stay there); `settled` says whether the piece has been put somewhere on purpose.
 *
 * Existing players keep everything: every unit in a furniture stack gets an unsettled piece, and the server puts it where
 * its template slot used to be the first time the character is loaded (see `DecorService.reconcile`). Decor pieces
 * already standing in rooms (and cabin pieces) are untouched and keep their spots.
 */
export class FurniturePieces1791870000000 implements MigrationInterface {
  name = 'FurniturePieces1791870000000';

  /** Shop furniture products and the first finish of each (frozen: the catalog may change later, this must not). */
  private static readonly PRODUCTS: ReadonlyArray<readonly [string, string]> = [
    ['bed-foam-mattress', 'indigo'],
    ['bed-spring', 'burgundy'],
    ['bed-orthopedic', 'cream'],
    ['bed-super-king', 'ivory-gold'],
    ['chairs-plastic', 'white-red'],
    ['sofa-fabric', 'green'],
    ['sofa-leather', 'brown'],
    ['sofa-italian', 'ivory'],
    ['dining-set', 'gold'],
    ['rug-persian', 'burgundy'],
    ['plants-snake', 'standard'],
    ['wardrobe-wooden', 'mahogany'],
    ['desk-study', 'teak'],
    ['tv-32', 'standard'],
    ['tv-55', 'standard'],
    ['tv-75', 'standard'],
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "decor_pieces" ADD "inventory_item_id" uuid`);
    await queryRunner.query(`ALTER TABLE "decor_pieces" ADD "settled" boolean NOT NULL DEFAULT true`);
    await queryRunner.query(`CREATE INDEX "decor_pieces_stack" ON "decor_pieces" ("inventory_item_id") WHERE "inventory_item_id" IS NOT NULL`);

    await FurniturePieces1791870000000.backfill(queryRunner);
  }

  /**
   * One unsettled piece for every unit in a furniture stack that has none (what a player owned before this migration;
   * the e2e suite replays it to prove existing belongings survive).
   */
  public static async backfill(queryRunner: Pick<QueryRunner, 'query'>): Promise<void> {
    const values = FurniturePieces1791870000000.PRODUCTS.map((_, index) => `($${index * 2 + 1}, $${index * 2 + 2})`).join(', ');
    const params = FurniturePieces1791870000000.PRODUCTS.flat();
    await queryRunner.query(
      `INSERT INTO "decor_pieces" ("character_id", "item_id", "variant", "price_paid", "bought_at", "recolours", "settled", "inventory_item_id")
       SELECT i."character_id", 'home-' || i."item_id", p."variant", i."unit_price", i."acquired_at", 0, false, i."id"
         FROM "inventory_items" i
         JOIN (VALUES ${values}) AS p("item_id", "variant") ON p."item_id" = i."item_id"
         CROSS JOIN LATERAL generate_series(1, i."quantity") AS n
        WHERE NOT EXISTS (SELECT 1 FROM "decor_pieces" d WHERE d."inventory_item_id" = i."id")`,
      params,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Furniture pieces are the shop's stacks seen from the room: the stacks remain, the pieces go.
    await queryRunner.query(`DELETE FROM "decor_pieces" WHERE "inventory_item_id" IS NOT NULL`);
    await queryRunner.query(`DROP INDEX "public"."decor_pieces_stack"`);
    await queryRunner.query(`ALTER TABLE "decor_pieces" DROP COLUMN "settled"`);
    await queryRunner.query(`ALTER TABLE "decor_pieces" DROP COLUMN "inventory_item_id"`);
  }
}
