import React, { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OfflineBanner } from './components/ui/OfflineBanner.js';
import { PwaPrompt } from './components/ui/PwaPrompt.js';
import { ErrorBoundary } from './components/ui/ErrorBoundary.js';
import { DriverAuthScreen } from './components/auth/DriverAuthScreen.js';
import { DriverHomeShell } from './components/home/DriverHomeShell.js';

const queryClient = new QueryClient();

export const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('wasel_driver_user');
    const token = localStorage.getItem('wasel_driver_access_token');
    if (stored && token) {
      try {
        setCurrentUser(JSON.parse(stored));
      } catch {
        localStorage.removeItem('wasel_driver_user');
      }
    }
    setLoading(false);
  }, []);

  if (loading) return null;

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <OfflineBanner />
        {currentUser ? (
          <DriverHomeShell user={currentUser} onLogout={() => setCurrentUser(null)} />
        ) : (
          <DriverAuthScreen onSuccess={(user) => setCurrentUser(user)} />
        )}
        <PwaPrompt />
      </QueryClientProvider>
    </ErrorBoundary>
  );
};
