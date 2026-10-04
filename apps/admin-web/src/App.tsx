import React, { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from './components/ui/ErrorBoundary.js';
import { AdminAuthScreen } from './components/auth/AdminAuthScreen.js';
import { AdminDashboard } from './components/dashboard/AdminDashboard.js';
import { AdminUser } from './types/admin.js';

const queryClient = new QueryClient();

export const App: React.FC = () => {
  const [currentAdmin, setCurrentAdmin] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('wasel_admin_user');
      const token = localStorage.getItem('wasel_admin_access_token');
      if (stored && token) {
        setCurrentAdmin(JSON.parse(stored) as AdminUser);
      }
    } catch {
      localStorage.removeItem('wasel_admin_user');
    } finally {
      setLoading(false);
    }
  }, []);


  if (loading) return null;

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        {currentAdmin ? (
          <AdminDashboard
            user={currentAdmin}
            onLogout={() => {
              localStorage.removeItem('wasel_admin_user');
              localStorage.removeItem('wasel_admin_access_token');
              localStorage.removeItem('wasel_admin_refresh_token');
              setCurrentAdmin(null);
            }}
          />
        ) : (
          <AdminAuthScreen onSuccess={(user) => setCurrentAdmin(user)} />
        )}
      </QueryClientProvider>
    </ErrorBoundary>
  );
};
