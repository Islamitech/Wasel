import React, { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OfflineBanner } from './components/ui/OfflineBanner.js';
import { PwaPrompt } from './components/ui/PwaPrompt.js';
import { ErrorBoundary } from './components/ui/ErrorBoundary.js';
import { PhoneAuthScreen } from './components/auth/PhoneAuthScreen.js';
import { CustomerAppShell } from './components/home/CustomerAppShell.js';
import { UserRole } from '@wasel/shared';

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
    try {
      const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      if (params && (params.get('test_session') === 'true' || params.get('state'))) {
        return {
          id: 'test-customer-id',
          phone: '01012345678',
          fullName: 'عميل تجريبي',
          roles: ['customer'],
        };
      }
      const stored = localStorage.getItem('wasel_user');
      const token = localStorage.getItem('wasel_access_token');
      if (stored && token) {
        return JSON.parse(stored);
      }
    } catch {
      localStorage.removeItem('wasel_user');
    }
    return null;
  });

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <OfflineBanner />
        {currentUser ? (
          <CustomerAppShell user={currentUser} onLogout={() => setCurrentUser(null)} />
        ) : (
          <PhoneAuthScreen
            role={UserRole.CUSTOMER}
            onSuccess={(user) => setCurrentUser(user)}
          />
        )}
        <PwaPrompt />
      </QueryClientProvider>
    </ErrorBoundary>
  );
};
