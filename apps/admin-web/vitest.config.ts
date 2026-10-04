import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 20000,
    include: ['tests/no-backdoors.spec.ts', 'tests/**/*.unit.spec.ts', 'tests/**/*.test.ts'],
    exclude: ['tests/smoke.spec.ts', 'tests/e2e/**'],
  },
  resolve: {
    alias: {
      '@wasel/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
      '@wasel/api-client': path.resolve(__dirname, '../../packages/api-client/src/index.ts'),
    },
  },
});
