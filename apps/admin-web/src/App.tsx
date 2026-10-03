import React, { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from './components/ui/ErrorBoundary.js';
import { AdminAuthScreen } from './components/auth/AdminAuthScreen.js';
import { AdminDashboard } from './components/dashboard/AdminDashboard.js';

const queryClient = new QueryClient();

export const App: React.FC = () => {
  const [currentAdmin, setCurrentAdmin] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('wasel_admin_user');
    const token = localStorage.getItem('wasel_admin_access_token');
    if (stored && token) {
      try {
        setCurrentAdmin(JSON.parse(stored));
      } catch {
        localStorage.removeItem('wasel_admin_user');
      }
    }
    setLoading(false);
  }, []);

  if (loading) return null;

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        {currentAdmin ? (
          <AdminDashboard user={currentAdmin} onLogout={() => setCurrentAdmin(null)} />
        ) : (
          <AdminAuthScreen onSuccess={(user) => setCurrentAdmin(user)} />
        )}
      </QueryClientProvider>
    </ErrorBoundary>
  );
};
