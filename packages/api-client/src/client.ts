import {
  AuthTokensDto,
  RequestOtpResponse,
  RefreshTokenResponse,
  RegionDto,
  UserDto,
  ApiClientError,
  SseOptions,
  SseSubscription,
  UserRole,
  CreateOrderDto,
  UpdateOrderDto,
  CreateOrderStopDto,
  CancelOrderDto,
  OrderListQueryDto,
  CreateOfferDto,
  CounterOfferDto,
  StopArrivalDto,
  CreateInvoiceDto,
  RecordPaymentReceiptDto,
  DisputeInvoiceDto,
  DriverLocationPointDto,
  DriverPresenceDto,
  CreateAmendmentDto,
  CancelAgreementDto,
  DriverProfileCreateDto,
  RegisterVehicleDto,
  SubmitDocumentDto,
  AdminGrantSubscriptionDto,
  SendMessageDto,
  CreateRatingDto,
  CreateDisputeDto,
  DisputeEventDto,
  ResolveDisputeDto,
  AdminPricingRuleDto,
  AdminEscalationRuleDto,
  SearchPlacesQueryDto,
  SuggestPlaceDto,
} from './types.js';

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

  public async request<T>(
    endpoint: string,
    options: RequestInit & { idempotencyKey?: string } = {},
    retryOnUnauthorized = true,
  ): Promise<T> {
    const url = `${this.baseUrl}/v1${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    const headers = new Headers(options.headers || {});
    if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

    if (options.idempotencyKey) {
      headers.set('Idempotency-Key', options.idempotencyKey);
    }

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
        i18nKey: errorBody?.i18nKey,
        details: errorBody?.details,
      };
      throw err;
    }

    if (response.status === 204) {
      return undefined as any;
    }

    return response.json() as Promise<T>;
  }

  // 1. Auth & Identity
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
      this.request<RefreshTokenResponse>(
        '/auth/refresh',
        {
          method: 'POST',
          body: JSON.stringify({ refreshToken }),
        },
        false,
      ),

    logout: (refreshToken?: string, allDevices = false) =>
      this.request<{ success: boolean; message: string }>('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken, allDevices }),
      }),

    getMe: () => this.request<UserDto>('/me'),

    updateMe: (dto: { fullName?: string; email?: string; language?: string; regionId?: string }) =>
      this.request<UserDto>('/me', {
        method: 'PATCH',
        body: JSON.stringify(dto),
      }),

    registerDevice: (deviceToken: string, platform = 'web', userAgent?: string) =>
      this.request<{ success: boolean; message: string }>('/me/devices', {
        method: 'POST',
        body: JSON.stringify({ deviceToken, platform, userAgent }),
      }),

    getCustomerProfile: () => this.request<any>('/me/customer'),

    getDriverProfile: () => this.request<any>('/me/driver'),

    checkAdminAccess: () =>
      this.request<{ authorized: boolean; user: any; message: string }>('/auth/admin/protected-check'),
  };

  // 2. Regions & Catalog
  readonly regions = {
    list: () => this.request<RegionDto[]>('/regions'),
  };

  readonly catalog = {
    getUnified: (regionId?: string) =>
      this.request<any>(`/catalog${regionId ? `?regionId=${regionId}` : ''}`),

    searchPlaces: (query: SearchPlacesQueryDto) => {
      const params = new URLSearchParams();
      if (query.q) params.set('q', query.q);
      if (query.near) params.set('near', query.near);
      if (query.limit) params.set('limit', String(query.limit));
      return this.request<any[]>(`/places?${params.toString()}`);
    },

    suggestPlace: (dto: SuggestPlaceDto) =>
      this.request<any>('/places', {
        method: 'POST',
        body: JSON.stringify(dto),
      }),

    getVehicleTypes: (regionId?: string) =>
      this.request<any[]>(`/catalog/vehicle-types${regionId ? `?regionId=${regionId}` : ''}`),

    getServiceActions: (regionId?: string) =>
      this.request<any[]>(`/catalog/service-actions${regionId ? `?regionId=${regionId}` : ''}`),

    getValueTiers: (regionId?: string) =>
      this.request<any[]>(`/catalog/value-tiers${regionId ? `?regionId=${regionId}` : ''}`),
  };

  // 3. Driver Onboarding, Documents & Verification
  readonly driver = {
    createProfile: (dto: DriverProfileCreateDto) =>
      this.request<any>('/driver/profile', {
        method: 'POST',
        body: JSON.stringify(dto),
      }),

    registerVehicle: (dto: RegisterVehicleDto) =>
      this.request<any>('/driver/vehicles', {
        method: 'POST',
        body: JSON.stringify(dto),
      }),

    getDocumentUploadUrl: (mediaType = 'image/jpeg') =>
      this.request<{ uploadUrl: string; key: string; expiresInSeconds: number }>(
        '/driver/documents/upload-url',
        {
          method: 'POST',
          body: JSON.stringify({ mediaType }),
        },
      ),

    submitDocument: (dto: SubmitDocumentDto) =>
      this.request<any>('/driver/documents', {
        method: 'POST',
        body: JSON.stringify(dto),
      }),

    getVerificationStatus: () => this.request<any>('/driver/verification'),

    getSubscription: () => this.request<any>('/driver/subscription'),

    getNearbyOrders: (params?: { lat?: number; lng?: number; radius?: number; cursor?: string; limit?: number }) => {
      const searchParams = new URLSearchParams();
      if (params?.lat !== undefined) searchParams.set('lat', String(params.lat));
      if (params?.lng !== undefined) searchParams.set('lng', String(params.lng));
      if (params?.radius !== undefined) searchParams.set('radius', String(params.radius));
      if (params?.cursor) searchParams.set('cursor', params.cursor);
      if (params?.limit !== undefined) searchParams.set('limit', String(params.limit));
      const qs = searchParams.toString();
      return this.request<any>(`/driver/orders/nearby${qs ? `?${qs}` : ''}`);
    },

    getOrderCard: (orderId: string) => this.request<any>(`/driver/orders/${orderId}`),

    declineOrder: (orderId: string, reason?: string) =>
      this.request<any>(`/driver/orders/${orderId}/decline`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),

    updateLocation: (dto: { points?: DriverLocationPointDto[]; location?: { latitude: number; longitude: number } }) =>
      this.request<{ success: boolean; recordedAt: string }>('/driver/location', {
        method: 'POST',
        body: JSON.stringify(dto),
      }),

    updatePresence: (dto: DriverPresenceDto) =>
      this.request<any>('/driver/presence', {
        method: 'POST',
        body: JSON.stringify(dto),
      }),
  };

  // 4. Subscriptions (Public / Captain)
  readonly subscriptions = {
    getPlans: (regionId?: string) =>
      this.request<any[]>(`/subscription-plans${regionId ? `?regionId=${regionId}` : ''}`),
  };

  // 5. Orders (Customer)
  readonly orders = {
    create: (dto: CreateOrderDto, idempotencyKey?: string) =>
      this.request<any>('/orders', {
        method: 'POST',
        body: JSON.stringify(dto),
        idempotencyKey,
      }),

    update: (orderId: string, dto: UpdateOrderDto) =>
      this.request<any>(`/orders/${orderId}`, {
        method: 'PATCH',
        body: JSON.stringify(dto),
      }),

    addStop: (orderId: string, dto: CreateOrderStopDto) =>
      this.request<any>(`/orders/${orderId}/stops`, {
        method: 'POST',
        body: JSON.stringify(dto),
      }),

    deleteStop: (orderId: string, stopId: string) =>
      this.request<{ success: boolean; message: string }>(`/orders/${orderId}/stops/${stopId}`, {
        method: 'DELETE',
      }),

    getQuote: (orderId: string) =>
      this.request<any>(`/orders/${orderId}/quote`, {
        method: 'POST',
      }),

    publish: (orderId: string, idempotencyKey?: string) =>
      this.request<any>(`/orders/${orderId}/publish`, {
        method: 'POST',
        idempotencyKey,
      }),

    cancel: (orderId: string, dto: CancelOrderDto) =>
      this.request<any>(`/orders/${orderId}/cancel`, {
        method: 'POST',
        body: JSON.stringify(dto),
      }),

    list: (query: Partial<OrderListQueryDto> = {}) => {
      const params = new URLSearchParams();
      if (query.status) params.set('status', query.status);
      if (query.limit) params.set('limit', String(query.limit));
      if (query.cursor) params.set('cursor', query.cursor);
      return this.request<any>(`/orders?${params.toString()}`);
    },

    get: (orderId: string) => this.request<any>(`/orders/${orderId}`),

    getMediaUploadUrl: (orderId: string, mediaType = 'image/jpeg') =>
      this.request<{ uploadUrl: string; key: string; expiresInSeconds: number }>(
        `/orders/${orderId}/media/upload-url`,
        {
          method: 'POST',
          body: JSON.stringify({ mediaType }),
        },
      ),
  };

  // 6. Offers & Direct Assignment
  readonly offers = {
    create: (orderId: string, dto: CreateOfferDto, idempotencyKey?: string) =>
      this.request<any>(`/orders/${orderId}/offers`, {
        method: 'POST',
        body: JSON.stringify(dto),
        idempotencyKey,
      }),

    list: (orderId: string) => this.request<any[]>(`/orders/${orderId}/offers`),

    accept: (offerId: string, idempotencyKey?: string) =>
      this.request<any>(`/offers/${offerId}/accept`, {
        method: 'POST',
        idempotencyKey,
      }),

    reject: (offerId: string) =>
      this.request<any>(`/offers/${offerId}/reject`, {
        method: 'POST',
      }),

    counter: (offerId: string, dto: CounterOfferDto) =>
      this.request<any>(`/offers/${offerId}/counter`, {
        method: 'POST',
        body: JSON.stringify(dto),
      }),

    acceptShoppingOrder: (orderId: string, idempotencyKey?: string) =>
      this.request<any>(`/orders/${orderId}/accept`, {
        method: 'POST',
        idempotencyKey,
      }),

    directAssign: (orderId: string, driverId: string, initialOfferFareMinor?: number, idempotencyKey?: string) =>
      this.request<any>(`/orders/${orderId}/assign`, {
        method: 'POST',
        body: JSON.stringify({ driverId, initialOfferFareMinor }),
        idempotencyKey,
      }),
  };

  // 7. Agreements, Amendments & Execution
  readonly agreements = {
    get: (agreementId: string) => this.request<any>(`/agreements/${agreementId}`),

    createAmendment: (agreementId: string, dto: CreateAmendmentDto, idempotencyKey?: string) =>
      this.request<any>(`/agreements/${agreementId}/amendments`, {
        method: 'POST',
        body: JSON.stringify(dto),
        idempotencyKey,
      }),

    approveAmendment: (amendmentId: string) =>
      this.request<any>(`/amendments/${amendmentId}/approve`, {
        method: 'POST',
      }),

    rejectAmendment: (amendmentId: string) =>
      this.request<any>(`/amendments/${amendmentId}/reject`, {
        method: 'POST',
      }),

    cancel: (agreementId: string, dto: CancelAgreementDto) =>
      this.request<any>(`/agreements/${agreementId}/cancel`, {
        method: 'POST',
        body: JSON.stringify(dto),
      }),

    arriveAtStop: (agreementId: string, stopId: string, dto: StopArrivalDto) =>
      this.request<any>(`/agreements/${agreementId}/stops/${stopId}/arrive`, {
        method: 'POST',
        body: JSON.stringify(dto),
      }),

    startWait: (agreementId: string, stopId: string) =>
      this.request<{ success: boolean; message: string }>(
        `/agreements/${agreementId}/stops/${stopId}/wait/start`,
        { method: 'POST' },
      ),

    endWait: (agreementId: string, stopId: string) =>
      this.request<{ success: boolean; message: string }>(
        `/agreements/${agreementId}/stops/${stopId}/wait/end`,
        { method: 'POST' },
      ),

    addInFlightStop: (agreementId: string, dto: CreateOrderStopDto) =>
      this.request<any>(`/agreements/${agreementId}/stops`, {
        method: 'POST',
        body: JSON.stringify(dto),
      }),

    issueInvoice: (stopId: string, dto: CreateInvoiceDto) =>
      this.request<any>(`/stops/${stopId}/invoice`, {
        method: 'POST',
        body: JSON.stringify(dto),
      }),

    recordPayment: (invoiceId: string, dto: RecordPaymentReceiptDto) =>
      this.request<any>(`/invoices/${invoiceId}/payment-recorded`, {
        method: 'POST',
        body: JSON.stringify(dto),
      }),

    disputeInvoice: (invoiceId: string, dto: DisputeInvoiceDto) =>
      this.request<any>(`/invoices/${invoiceId}/dispute`, {
        method: 'POST',
        body: JSON.stringify(dto),
      }),

    completeStop: (agreementId: string, stopId: string) =>
      this.request<any>(`/agreements/${agreementId}/stops/${stopId}/complete`, {
        method: 'POST',
      }),

    complete: (agreementId: string) =>
      this.request<any>(`/agreements/${agreementId}/complete`, {
        method: 'POST',
      }),
  };

  // 8. In-App Messaging
  readonly messaging = {
    list: (agreementId: string, before?: string, limit = 50) => {
      const params = new URLSearchParams();
      if (before) params.set('before', before);
      if (limit) params.set('limit', String(limit));
      return this.request<any[]>(`/agreements/${agreementId}/messages?${params.toString()}`);
    },

    send: (agreementId: string, dto: SendMessageDto) =>
      this.request<any>(`/agreements/${agreementId}/messages`, {
        method: 'POST',
        body: JSON.stringify(dto),
      }),

    markRead: (messageId: string) =>
      this.request<any>(`/messages/${messageId}/read`, {
        method: 'POST',
      }),
  };

  // 9. Ratings & Disputes
  readonly ratings = {
    create: (agreementId: string, dto: CreateRatingDto) =>
      this.request<any>(`/agreements/${agreementId}/ratings`, {
        method: 'POST',
        body: JSON.stringify(dto),
      }),

    getDriverReputation: (driverId: string) =>
      this.request<any>(`/drivers/${driverId}/reputation`),
  };

  readonly disputes = {
    create: (dto: CreateDisputeDto) =>
      this.request<any>('/disputes', {
        method: 'POST',
        body: JSON.stringify(dto),
      }),

    list: (status?: string) =>
      this.request<any[]>(`/disputes${status ? `?status=${status}` : ''}`),
  };

  // 10. Notifications
  readonly notifications = {
    list: (limit = 30) => this.request<any[]>(`/notifications?limit=${limit}`),

    markRead: (id: string) =>
      this.request<any>(`/notifications/${id}/read`, {
        method: 'POST',
      }),
  };

  // 11. Admin Console & Reference CRUD
  readonly admin = {
    getOverview: () => this.request<any>('/admin/overview'),

    updateSetting: (key: string, dto: { value: any; regionId?: string }) =>
      this.request<any>('/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({ key, ...dto }),
      }),

    getPricingRules: (regionId?: string) =>
      this.request<any[]>(`/admin/pricing-rules${regionId ? `?regionId=${regionId}` : ''}`),

    updatePricingRule: (key: string, dto: AdminPricingRuleDto) =>
      this.request<any>(`/admin/pricing-rules/${key}`, {
        method: 'PUT',
        body: JSON.stringify(dto),
      }),

    updateEscalationRule: (escalationLevel: number, dto: AdminEscalationRuleDto) =>
      this.request<any>(`/admin/escalation-rules/${escalationLevel}`, {
        method: 'PUT',
        body: JSON.stringify(dto),
      }),

    updateVehicleType: (
      id: string,
      dto: { nameAr?: string; nameEn?: string; maxWeightKg?: number; maxVolumeCbm?: number; active?: boolean; escalationRank?: number },
    ) =>
      this.request<any>(`/admin/vehicle-types/${id}`, {
        method: 'PUT',
        body: JSON.stringify(dto),
      }),

    listOrders: (query: { status?: string; limit?: number; offset?: number } = {}) => {
      const params = new URLSearchParams();
      if (query.status) params.set('status', query.status);
      if (query.limit) params.set('limit', String(query.limit));
      if (query.offset) params.set('offset', String(query.offset));
      return this.request<any>(`/admin/orders?${params.toString()}`);
    },

    listDrivers: (status?: string) =>
      this.request<any[]>(`/admin/drivers${status ? `?status=${status}` : ''}`),

    listSubscriptions: (status?: string) =>
      this.request<any[]>(`/admin/subscriptions${status ? `?status=${status}` : ''}`),

    activateSubscription: (dto: AdminGrantSubscriptionDto) =>
      this.request<any>('/admin/subscriptions', {
        method: 'POST',
        body: JSON.stringify(dto),
      }),

    recordSubscriptionPayment: (
      subscriptionId: string,
      dto: { amountMinor: number; receiptNumber?: string; notes?: string },
    ) =>
      this.request<any>(`/admin/subscriptions/${subscriptionId}/payments`, {
        method: 'POST',
        body: JSON.stringify(dto),
      }),

    listVerifications: (status?: string) =>
      this.request<any[]>(`/admin/verifications${status ? `?status=${status}` : ''}`),

    getVerificationDocumentUrl: (id: string) =>
      this.request<{ downloadUrl: string; expiresInSeconds: number }>(`/admin/verifications/${id}/document-url`),

    approveVerification: (id: string, levelId?: string) =>
      this.request<any>(`/admin/verifications/${id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ levelId }),
      }),

    rejectVerification: (id: string, reason: string) =>
      this.request<any>(`/admin/verifications/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),

    getAuditLogs: (query: { limit?: number; offset?: number; entityType?: string } = {}) => {
      const params = new URLSearchParams();
      if (query.limit) params.set('limit', String(query.limit));
      if (query.offset) params.set('offset', String(query.offset));
      if (query.entityType) params.set('entityType', query.entityType);
      return this.request<any[]>(`/admin/audit-logs?${params.toString()}`);
    },

    searchUsers: (q: string) =>
      this.request<any[]>(`/admin/users?q=${encodeURIComponent(q)}`),

    assignDispute: (disputeId: string, assignedToId: string) =>
      this.request<any>(`/admin/disputes/${disputeId}/assign`, {
        method: 'POST',
        body: JSON.stringify({ assignedToId }),
      }),

    addDisputeEvent: (disputeId: string, dto: DisputeEventDto) =>
      this.request<any>(`/admin/disputes/${disputeId}/events`, {
        method: 'POST',
        body: JSON.stringify(dto),
      }),

    resolveDispute: (disputeId: string, dto: ResolveDisputeDto) =>
      this.request<any>(`/admin/disputes/${disputeId}/resolve`, {
        method: 'POST',
        body: JSON.stringify(dto),
      }),
  };

  /**
   * Generates a short-lived (30s) single-use stream ticket for SSE connection
   */
  async getStreamTicket(): Promise<{ ticket: string; expiresIn: number }> {
    return this.request<{ ticket: string; expiresIn: number }>('/stream/ticket', {
      method: 'POST',
    });
  }

  // 12. Realtime SSE Stream with auto-reconnect and Last-Event-ID resume
  subscribeRealtime(options: SseOptions): SseSubscription {
    let isClosed = false;
    let reconnectTimeout: any;
    let currentLastEventId = options.lastEventId;
    let abortController: AbortController | null = null;

    const connect = async () => {
      if (isClosed) return;

      const token = options.token || this.getAccessToken?.();
      let ticket: string | undefined;

      if (token) {
        try {
          const res = await this.request<{ ticket: string; expiresIn: number }>('/stream/ticket', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res?.ticket) {
            ticket = res.ticket;
          }
        } catch {
          // Fallback to Bearer auth header
        }
      }

      const url = new URL(`${this.baseUrl}/v1/stream`);
      if (ticket) {
        url.searchParams.set('ticket', ticket);
      }

      abortController = new AbortController();

      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (currentLastEventId) headers['Last-Event-ID'] = currentLastEventId;

      fetch(url.toString(), {
        headers,
        signal: abortController.signal,
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`SSE stream connection failed: ${response.status}`);
          }
          options.onOpen?.();

          const reader = response.body?.getReader();
          if (!reader) return;

          const decoder = new TextDecoder();
          let buffer = '';

          while (!isClosed) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            let currentEvent = 'message';
            let currentData = '';
            let currentId: string | undefined;

            for (const line of lines) {
              if (line.startsWith(':keepalive')) {
                continue;
              }
              if (line.startsWith('event:')) {
                currentEvent = line.replace('event:', '').trim();
              } else if (line.startsWith('data:')) {
                currentData += line.replace('data:', '').trim();
              } else if (line.startsWith('id:')) {
                currentId = line.replace('id:', '').trim();
                currentLastEventId = currentId;
              } else if (line === '') {
                if (currentData) {
                  try {
                    const parsed = JSON.parse(currentData);
                    options.onEvent(currentEvent, parsed, currentId);
                  } catch {
                    options.onEvent(currentEvent, currentData, currentId);
                  }
                  currentData = '';
                  currentEvent = 'message';
                }
              }
            }
          }

          if (!isClosed && (options.autoReconnect ?? true)) {
            reconnectTimeout = setTimeout(connect, 3000);
          }
        })
        .catch((err) => {
          if (isClosed) return;
          options.onError?.(err);
          if (options.autoReconnect ?? true) {
            reconnectTimeout = setTimeout(connect, 5000);
          }
        });

    };

    connect();

    return {
      close: () => {
        isClosed = true;
        if (reconnectTimeout) clearTimeout(reconnectTimeout);
        if (abortController) abortController.abort();
      },
    };
  }
}

export function createApiClient(config: ApiClientConfig): WaselApiClient {
  return new WaselApiClient(config);
}
