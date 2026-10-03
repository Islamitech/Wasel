import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.spec.ts', 'src/**/*.spec.ts'],
    testTimeout: 20000,
  },
  resolve: {
    alias: {
      '@wasel/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
});
