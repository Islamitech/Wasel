import {
  AuthTokensDto,
  RequestOtpResponse,
  RefreshTokenResponse,
  RegionDto,
  VehicleTypeDto,
  ServiceActionDto,
  ValueTierDto,
  UserDto,
  ApiClientError,
} from './types.js';
import { UserRole } from '@wasel/shared';

export interface ApiClientConfig {
  baseUrl: string;
  getAccessToken?: () => string | null;
  getRefreshToken?: () => string | null;
  onTokenRefreshed?: (tokens: RefreshTokenResponse) => void;
  onAuthFailed?: () => void;
}

export class WaselApiClient {
  private readonly baseUrl: string;
  private readonly getAccessToken?: () => string | null;
  private readonly getRefreshToken?: () => string | null;
  private readonly onTokenRefreshed?: (tokens: RefreshTokenResponse) => void;
  private readonly onAuthFailed?: () => void;
  private isRefreshing = false;

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.getAccessToken = config.getAccessToken;
    this.getRefreshToken = config.getRefreshToken;
    this.onTokenRefreshed = config.onTokenRefreshed;
    this.onAuthFailed = config.onAuthFailed;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    retryOnUnauthorized = true,
  ): Promise<T> {
    const url = `${this.baseUrl}/v1${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    const headers = new Headers(options.headers || {});
    headers.set('Content-Type', 'application/json');

    const token = this.getAccessToken?.();
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (response.status === 401 && retryOnUnauthorized && this.getRefreshToken) {
      const refreshToken = this.getRefreshToken();
      if (refreshToken && !this.isRefreshing) {
        this.isRefreshing = true;
        try {
          const refreshed = await this.auth.refresh(refreshToken);
          this.onTokenRefreshed?.(refreshed);
          this.isRefreshing = false;
          // Retry original request with new access token
          headers.set('Authorization', `Bearer ${refreshed.accessToken}`);
          return this.request<T>(endpoint, { ...options, headers }, false);
        } catch {
          this.isRefreshing = false;
          this.onAuthFailed?.();
        }
      }
    }

    if (!response.ok) {
      let errorBody: any;
      try {
        errorBody = await response.json();
      } catch {
        errorBody = { message: response.statusText, statusCode: response.status };
      }

      const detailedMsg =
        Array.isArray(errorBody?.details) && errorBody.details[0]?.message
          ? errorBody.details[0].message
          : errorBody?.message || 'Request failed';

      const err: ApiClientError = {
        statusCode: response.status,
        errorCode: errorBody?.errorCode || 'UNKNOWN_ERROR',
        message: detailedMsg,
        details: errorBody?.details,
      };
      throw err;
    }

    return response.json() as Promise<T>;
  }

  // Domain endpoint groupings
  readonly auth = {
    requestOtp: (phone: string, role = UserRole.CUSTOMER) =>
      this.request<RequestOtpResponse>('/auth/otp/request', {
        method: 'POST',
        body: JSON.stringify({ phone, role }),
      }),

    verifyOtp: (phone: string, code: string, deviceInfo = 'Web Browser', role = UserRole.CUSTOMER) =>
      this.request<AuthTokensDto>('/auth/otp/verify', {
        method: 'POST',
        body: JSON.stringify({ phone, code, deviceInfo, role }),
      }),

    adminLogin: (email: string, pass: string, deviceInfo = 'Admin Web') =>
      this.request<AuthTokensDto>('/auth/admin/login', {
        method: 'POST',
        body: JSON.stringify({ email, password: pass, deviceInfo }),
      }),

    refresh: (refreshToken: string) =>
      this.request<RefreshTokenResponse>('/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      }, false),

    logout: (refreshToken?: string, allDevices = false) =>
      this.request<{ success: boolean; message: string }>('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken, allDevices }),
      }),

    getMe: () => this.request<UserDto>('/auth/me'),

    checkAdminAccess: () =>
      this.request<{ authorized: boolean; user: any; message: string }>(
        '/auth/admin/protected-check',
      ),
  };

  readonly regions = {
    list: () => this.request<RegionDto[]>('/regions'),
  };

  readonly catalog = {
    getVehicleTypes: (regionId?: string) =>
      this.request<VehicleTypeDto[]>(`/catalog/vehicle-types${regionId ? `?regionId=${regionId}` : ''}`),

    getServiceActions: (regionId?: string) =>
      this.request<ServiceActionDto[]>(`/catalog/service-actions${regionId ? `?regionId=${regionId}` : ''}`),

    getValueTiers: (regionId?: string) =>
      this.request<ValueTierDto[]>(`/catalog/value-tiers${regionId ? `?regionId=${regionId}` : ''}`),
  };

  readonly admin = {
    getOverview: () => this.request<any>('/admin/overview'),

    updateSetting: (key: string, value: Record<string, any>, regionId?: string) =>
      this.request<{ success: boolean; message: string }>('/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({ key, value, regionId }),
      }),
  };
}

export function createApiClient(config: ApiClientConfig): WaselApiClient {
  return new WaselApiClient(config);
}
