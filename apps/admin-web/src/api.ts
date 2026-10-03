import { createApiClient } from '@wasel/api-client';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const apiClient = createApiClient({
  baseUrl: API_BASE_URL,
  getAccessToken: () => localStorage.getItem('wasel_admin_access_token'),
  getRefreshToken: () => localStorage.getItem('wasel_admin_refresh_token'),
  onTokenRefreshed: (tokens) => {
    localStorage.setItem('wasel_admin_access_token', tokens.accessToken);
    localStorage.setItem('wasel_admin_refresh_token', tokens.refreshToken);
  },
  onAuthFailed: () => {
    localStorage.removeItem('wasel_admin_access_token');
    localStorage.removeItem('wasel_admin_refresh_token');
    localStorage.removeItem('wasel_admin_user');
    window.location.reload();
  },
});
