import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
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
  plugins: [
    validateApiUrlPlugin(),
    react(),

    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'واصل - توصيل وخدمات حدائق الأهرام',
        short_name: 'واصل',
        description: 'منصة مشاوير وتوصيل ونقل البضائع في حدائق الأهرام والجيزة',
        theme_color: '#12302b',
        background_color: '#ffffff',
        display: 'standalone',
        dir: 'rtl',
        lang: 'ar',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/v1/catalog') || url.pathname.startsWith('/v1/regions'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'wasel-api-catalog-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24, // 24 hours
              },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@wasel/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
      '@wasel/api-client': path.resolve(__dirname, '../../packages/api-client/src/index.ts'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          query: ['@tanstack/react-query'],
          i18n: ['i18next', 'react-i18next'],
        },
      },
    },
  },
  server: {
    port: 5173,
  },
});
