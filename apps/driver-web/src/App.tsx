import React, { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OfflineBanner } from './components/ui/OfflineBanner.js';
import { PwaPrompt } from './components/ui/PwaPrompt.js';
import { ErrorBoundary } from './components/ui/ErrorBoundary.js';
import { DriverAuthScreen } from './components/auth/DriverAuthScreen.js';
import { DriverHomeShell } from './components/home/DriverHomeShell.js';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<any>(() => {
    // STRICT GUARD: Test backdoor only exists in test mode (dead-code-eliminated in production)
    if (import.meta.env.MODE === 'test') {
      try {
        const params =
          typeof window !== 'undefined'
            ? new URLSearchParams(window.location.search)
            : null;
        if (params && (params.get('test_session') === 'true' || params.get('state'))) {
          return {
            id: 'test-driver-id',
            phone: '01012345678',
            fullName: 'كابتن تجريبي',
            roles: ['driver'],
          };
        }
      } catch {
        // ignore
      }
    }

    try {
      const stored = localStorage.getItem('wasel_driver_user');
      const token = localStorage.getItem('wasel_driver_access_token');
      if (stored && token) {
        return JSON.parse(stored);
      }
    } catch {
      localStorage.removeItem('wasel_driver_user');
    }
    return null;
  });

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <OfflineBanner />
        {currentUser ? (
          <DriverHomeShell
            user={currentUser}
            onLogout={() => setCurrentUser(null)}
          />
        ) : (
          <DriverAuthScreen onSuccess={(user) => setCurrentUser(user)} />
        )}
        <PwaPrompt />
      </QueryClientProvider>
    </ErrorBoundary>
  );
};
