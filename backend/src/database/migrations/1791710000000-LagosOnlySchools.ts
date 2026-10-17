import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Every school is in Lagos now. Anything stored against an institution (or campus venue) that left the catalog moves
 * to its Lagos equivalent, so no player loses an enrolment, an admission, a degree or their place on the map.
 * Every Lagos target offers every course its source offered, so stored course ids stay valid.
 */
const REMAP: ReadonlyArray<readonly [from: string, to: string]> = [
  ['ui', 'unilag'],
  ['oau', 'unilag'],
  ['unn', 'lasu'],
  ['abu', 'lasu'],
  ['covenant', 'pan-atlantic'],
  ['babcock', 'caleb'],
  ['aun', 'caleb'],
  ['abuad', 'anchor'],
  ['nile', 'anchor'],
  ['bowen', 'augustine'],
];

const MAP_VALUES = REMAP.map(([from, to]) => `('${from}', '${to}')`).join(', ');
const MAP = `(VALUES ${MAP_VALUES}) AS m("from_id", "to_id")`;

export class LagosOnlySchools1791710000000 implements MigrationInterface {
  name = 'LagosOnlySchools1791710000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['education_enrolments', 'education_admission_applications', 'education_exam_registrations']) {
      await queryRunner.query(`UPDATE "${table}" t SET "institution_id" = m."to_id" FROM ${MAP} WHERE t."institution_id" = m."from_id"`);
    }
    // Characters standing at (or travelling to) a removed campus are now at its Lagos replacement, back in Lagos.
    await queryRunner.query(
      `UPDATE "characters" c SET "location_id" = m."to_id", "region_id" = 'lagos' FROM ${MAP} WHERE c."location_id" = m."from_id"`,
    );
    for (const [from, to] of REMAP) {
      await queryRunner.query(
        `UPDATE "characters" SET "travel" = REPLACE("travel"::text, '"${from}"', '"${to}"')::jsonb WHERE "travel" IS NOT NULL AND ("travel"->>'toLocationId' = '${from}' OR "travel"->>'fromLocationId' = '${from}')`,
      );
      await queryRunner.query(
        `UPDATE "characters" SET "activity" = REPLACE("activity"::text, '"${from}"', '"${to}"')::jsonb WHERE "activity" IS NOT NULL AND "activity"::text LIKE '%"${from}"%'`,
      );
    }
  }

  public async down(): Promise<void> {
    // Irreversible: the removed institutions no longer exist in the catalog, and the merged rows cannot be told apart.
  }
}
