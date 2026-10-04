import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import boundariesPlugin from 'eslint-plugin-boundaries';

export default [
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/.turbo/**',
      '**/build/**',
      '**/playwright-report/**',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      boundaries: boundariesPlugin,
    },
    settings: {
      'import/resolver': {
        typescript: true,
        node: true,
      },
      'boundaries/elements': [
        {
          type: 'module',
          pattern: '**/modules/*',
          capture: ['moduleName'],
        },
      ],
      'boundaries/ignore': ['**/*.spec.ts', '**/*.test.ts'],
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'boundaries/entry-point': [
        'error',
        {
          default: 'allow',
          policies: [
            {
              target: { element: { type: 'module' } },
              disallow: '!index.ts',
              message:
                'Forbidden cross-module deep import: Modules must be accessed via their entry-point index.ts facade only.',
            },
          ],
        },
      ],
    },
  },
  {
    // Legacy allowlist for pre-existing codebase files pending scheduled cleanup:
    // - apps/api: 73 warnings (scheduled for Phase 2 API cleanup)
    // - packages/api-client: 81 warnings (scheduled for Phase 3 cleanup)
    // - apps/driver-web: 57 warnings (scheduled for Phase 4 cleanup)
    // - apps/admin-web: 7 warnings
    // ALL NEW FILES will NOT match this list and will fail with ESLint error if `any` is introduced.
    files: [
      '**/apps/admin-web/src/App.tsx',
      '**/apps/admin-web/src/components/auth/AdminAuthScreen.tsx',
      '**/apps/admin-web/src/components/dashboard/AdminDashboard.tsx',
      '**/apps/api/src/common/events/event-bus.service.ts',
      '**/apps/api/src/common/events/outbox-processor.service.ts',
      '**/apps/api/src/common/filters/global-exception.filter.ts',
      '**/apps/api/src/common/interceptors/idempotency.interceptor.ts',
      '**/apps/api/src/common/settings/settings.service.ts',
      '**/apps/api/src/common/storage/s3-storage.service.ts',
      '**/apps/api/src/database/database.service.ts',
      '**/apps/api/src/database/migrate.ts',
      '**/apps/api/src/main.ts',
      '**/apps/api/src/modules/admin/admin.controller.ts',
      '**/apps/api/src/modules/admin/admin.service.ts',
      '**/apps/api/src/modules/agreements/agreements.service.ts',
      '**/apps/api/src/modules/audit/audit.service.ts',
      '**/apps/api/src/modules/catalog/catalog.service.ts',
      '**/apps/api/src/modules/health/health.controller.ts',
      '**/apps/api/src/modules/identity/guards/jwt-auth.guard.ts',
      '**/apps/api/src/modules/identity/identity.controller.ts',
      '**/apps/api/src/modules/identity/identity.service.ts',
      '**/apps/api/src/modules/matching/matching.service.ts',
      '**/apps/api/src/modules/messaging/messaging.service.ts',
      '**/apps/api/src/modules/orders/orders.service.ts',
      '**/apps/api/src/modules/realtime/realtime.controller.ts',
      '**/apps/api/src/modules/realtime/realtime.gateway.ts',
      '**/apps/api/src/modules/realtime/realtime.service.ts',
      '**/apps/api/src/modules/verification/verification.service.ts',
      '**/apps/api/src/worker.ts',
      '**/apps/api/test/identity.spec.ts',
      '**/apps/api/test/test-harness.ts',
      '**/apps/customer-web/src/App.tsx',
      '**/apps/customer-web/src/components/auth/PhoneAuthScreen.tsx',
      '**/apps/customer-web/src/components/home/CustomerAppShell.tsx',
      '**/apps/customer-web/src/components/home/HomeShell.tsx',
      '**/apps/customer-web/src/components/sheet/TrackingSheet.tsx',
      '**/apps/customer-web/src/components/task/VoiceRecorder.tsx',
      '**/apps/customer-web/src/services/errors/errorTaxonomy.ts',
      '**/apps/customer-web/src/services/map/MapLibreProvider.ts',
      '**/apps/customer-web/src/services/map/index.ts',
      '**/apps/customer-web/tests/components/authComponent.spec.tsx',
      '**/apps/customer-web/tests/components/sheetStates.spec.tsx',
      '**/apps/customer-web/tests/customerStateMachine.spec.ts',
      '**/apps/customer-web/tests/e2e/customerFlows.spec.ts',
      '**/apps/customer-web/tests/e2e/pwaValidation.spec.ts',
      '**/apps/customer-web/tests/e2e/visualSnapshots.spec.ts',
      '**/apps/customer-web/tests/setup.ts',
      '**/apps/driver-web/src/App.tsx',
      '**/apps/driver-web/src/components/auth/DriverAuthScreen.tsx',
      '**/apps/driver-web/src/components/chat/DriverChatModal.tsx',
      '**/apps/driver-web/src/components/home/DriverHomeShell.tsx',
      '**/apps/driver-web/src/components/sheet/OnboardingSheet.tsx',
      '**/apps/driver-web/src/components/sheet/RunSheet.tsx',
      '**/apps/driver-web/src/machines/driverStateMachine.ts',
      '**/apps/driver-web/src/services/audio/soundNotifier.ts',
      '**/apps/driver-web/src/services/errors/errorTaxonomy.ts',
      '**/apps/driver-web/src/services/location/locationTracker.ts',
      '**/apps/driver-web/src/services/map/MapLibreProvider.ts',
      '**/apps/driver-web/src/services/map/index.ts',
      '**/apps/driver-web/src/services/push/pushNotification.ts',
      '**/apps/driver-web/src/services/storage/driverStorage.ts',
      '**/apps/driver-web/src/services/storage/offlineQueue.ts',
      '**/apps/driver-web/src/services/wakelock/wakeLock.ts',
      '**/apps/driver-web/src/types/driver.ts',
      '**/apps/driver-web/tests/components/onboardingComponent.spec.tsx',
      '**/apps/driver-web/tests/components/sheetStates.spec.tsx',
      '**/apps/driver-web/tests/driverStateMachine.spec.ts',
      '**/apps/driver-web/tests/e2e/driverFlows.real.spec.ts',
      '**/apps/driver-web/tests/e2e/driverFlows.spec.ts',
      '**/apps/driver-web/tests/e2e/visualSnapshots.spec.ts',
      '**/apps/driver-web/tests/setup.ts',
      '**/packages/api-client/src/client.ts',
      '**/packages/api-client/src/types.ts',
      '**/scripts/check-schema-drift.ts',
      '**/scripts/test-real-postgis.ts',
      '**/scripts/verify-rls.ts',
      '**/supabase/tests/run-db-tests.ts',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
];
