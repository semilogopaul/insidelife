import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ×60 pacing: every action now lasts half the game minutes it did (same real time, same effect), so saved daily habits
 * follow the catalog: 2h of study becomes 1h, a 45-minute home workout 25 minutes. Ship with the catalog change.
 */
export class PaceHabits1791570000001 implements MigrationInterface {
  name = 'PaceHabits1791570000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(this.rescale(`CASE WHEN (h->>'durationMinutes')::int = 45 THEN 25 ELSE (h->>'durationMinutes')::int / 2 END`));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(this.rescale(`CASE WHEN (h->>'durationMinutes')::int = 25 THEN 45 ELSE (h->>'durationMinutes')::int * 2 END`));
  }

  private rescale(minutes: string): string {
    return `UPDATE "characters" SET "habits" = (
        SELECT COALESCE(jsonb_agg(jsonb_set(h, '{durationMinutes}', to_jsonb(${minutes})) ORDER BY ord), '[]'::jsonb)
          FROM jsonb_array_elements("habits") WITH ORDINALITY AS e(h, ord)
      )
      WHERE jsonb_array_length("habits") > 0`;
  }
}
