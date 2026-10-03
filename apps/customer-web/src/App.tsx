import React, { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OfflineBanner } from './components/ui/OfflineBanner.js';
import { PwaPrompt } from './components/ui/PwaPrompt.js';
import { ErrorBoundary } from './components/ui/ErrorBoundary.js';
import { PhoneAuthScreen } from './components/auth/PhoneAuthScreen.js';
import { HomeShell } from './components/home/HomeShell.js';
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
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('wasel_user');
    const token = localStorage.getItem('wasel_access_token');
    if (stored && token) {
      try {
        setCurrentUser(JSON.parse(stored));
      } catch {
        localStorage.removeItem('wasel_user');
      }
    }
    setLoading(false);
  }, []);

  if (loading) {
    return null;
  }

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <OfflineBanner />
        {currentUser ? (
          <HomeShell user={currentUser} onLogout={() => setCurrentUser(null)} />
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
