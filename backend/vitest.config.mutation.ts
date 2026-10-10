import { defineConfig } from 'vitest/config';

/** Unit tests that cover the payment and money-transfer decisions, for mutation testing (stryker.config.mjs). */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['src/modules/payments/**/*.spec.ts', 'src/modules/wallet/**/*.spec.ts'],
  },
});
