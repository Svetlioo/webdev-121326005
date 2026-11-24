import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      // The course gate: every rule in the service layer is tested, 80% of the rest.
      thresholds: {
        lines: 80,
        'src/services/**': { lines: 100, functions: 100, branches: 100, statements: 100 },
      },
    },
  },
});
