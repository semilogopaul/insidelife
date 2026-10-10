// Mutation testing of the server's payment and transfer decisions (StrykerJS, free and open source).
// Run from the repo root with `npm run mutation` (see docs/PRODUCTION_READINESS.md). Not part of CI: it takes minutes.
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: 'vitest',
  plugins: ['@stryker-mutator/vitest-runner'],
  vitest: { configFile: 'vitest.config.mutation.ts' },
  checkers: [],
  mutate: [
    'src/modules/payments/checkout-rules.ts',
    'src/modules/payments/topup-quote.ts',
    'src/modules/payments/flutterwave-webhook-hash.ts',
    'src/modules/payments/gateways/flutterwave.parsers.ts',
    'src/modules/wallet/transfer-rules.ts',
  ],
  coverageAnalysis: 'perTest',
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: '../reports/mutation/backend.html' },
  jsonReporter: { fileName: '../reports/mutation/backend.json' },
  thresholds: { high: 90, low: 80, break: null },
  concurrency: 4,
};
