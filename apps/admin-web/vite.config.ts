import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

function validateApiUrlPlugin() {
  return {
    name: 'validate-api-url',
    buildStart() {
      const isProduction =
        process.env.APP_ENV === 'production' ||
        process.env.VERCEL_ENV === 'production';

      const apiUrl =
        process.env.VITE_API_URL ||
        (isProduction ? 'https://waselapi-production.up.railway.app' : 'http://localhost:3000');

      if (apiUrl && (apiUrl.endsWith('/v1') || apiUrl.endsWith('/v1/'))) {
        throw new Error(
          `[Build Error] VITE_API_URL must NOT end with /v1 (current: ${apiUrl}). The API client handles version prefixing automatically.`
        );
      }
    },
  };
}

export default defineConfig({
  plugins: [validateApiUrlPlugin(), react()],

  resolve: {
    alias: {
      '@wasel/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
      '@wasel/api-client': path.resolve(__dirname, '../../packages/api-client/src/index.ts'),
    },
  },
  server: {
    port: 5175,
  },
});
