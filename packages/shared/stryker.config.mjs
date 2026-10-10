// Mutation testing of the money rules shared by server and client (StrykerJS, free and open source).
// Run from the repo root with `npm run mutation` (see docs/PRODUCTION_READINESS.md). Not part of CI: it takes minutes.
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: 'vitest',
  plugins: ['@stryker-mutator/vitest-runner'],
  vitest: { configFile: 'vitest.config.ts' },
  checkers: [],
  mutate: ['src/rules/finance.ts', 'src/catalog/payments.ts'],
  coverageAnalysis: 'perTest',
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: '../../reports/mutation/shared.html' },
  jsonReporter: { fileName: '../../reports/mutation/shared.json' },
  thresholds: { high: 90, low: 80, break: null },
  concurrency: 4,
};
