import { BaseSequencer, type TestSpecification } from 'vitest/node';
import { defineConfig } from 'vitest/config';

/** Spec files run one after another in name order (00-…, 01-…), so a run reads like the report. */
class ByName extends BaseSequencer {
  override async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    return files.toSorted((a, b) => a.moduleId.localeCompare(b.moduleId));
  }
}

/**
 * End-to-end suite: boots the real AppModule in-process against a fresh Postgres database and a dedicated Redis DB
 * (see test/support/env.ts). `npm run test:e2e` needs Postgres and Redis running (`npm run dev:infra`).
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    globalSetup: ['./test/global-setup.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    sequence: { sequencer: ByName },
  },
});
