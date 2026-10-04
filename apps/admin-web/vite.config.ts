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

      const apiUrl = process.env.VITE_API_URL;

      if (apiUrl && (apiUrl.endsWith('/v1') || apiUrl.endsWith('/v1/'))) {
        throw new Error(
          `[Build Error] VITE_API_URL must NOT end with /v1 (current: ${apiUrl}). The API client handles version prefixing automatically.`
        );
      }

      if (isProduction) {
        if (!apiUrl || !apiUrl.trim()) {
          throw new Error(
            '[Build Error] VITE_API_URL is required in production builds and cannot be empty.'
          );
        }
        if (apiUrl.includes('localhost') || apiUrl.includes('127.0.0.1')) {
          throw new Error(
            `[Build Error] VITE_API_URL cannot point to localhost or 127.0.0.1 in production builds (current: ${apiUrl}).`
          );
        }
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
