export * from '@wasel/shared';

import { ErrorCode } from '@wasel/shared';

export interface UserDto {
  id: string;
  phone?: string | null;
  email?: string | null;
  fullName?: string | null;
  regionId?: string | null;
  roles: string[];
  permissions: string[];
}

export interface AuthTokensDto {
  accessToken: string;
  refreshToken: string;
  user: UserDto;
}

export interface RequestOtpResponse {
  success: boolean;
  message: string;
  resendCooldownSeconds: number;
}

export interface RefreshTokenResponse {
  accessToken: string;
  refreshToken: string;
}

export interface RegionDto {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  polygonGeojson?: any;
  isActive: boolean;
  createdAt: string;
}

export interface VehicleTypeDto {
  id: string;
  regionId?: string;
  code: string;
  nameAr: string;
  nameEn?: string;
  maxWeightKg?: number;
  maxVolumeCbm?: number;
  active?: boolean;
  escalationRank?: number;
}

export interface ServiceActionDto {
  id: string;
  regionId?: string;
  code: string;
  nameAr: string;
  nameEn?: string;
  baseFeeMinor?: number;
  sortOrder?: number;
  requiresInvoice?: boolean;
}

export interface ValueTierDto {
  id: string;
  regionId?: string;
  code: string;
  nameAr: string;
  minAmountMinor: number;
  maxAmountMinor: number | null;
  rank: number;
}

export interface ApiClientError {
  statusCode: number;
  errorCode: ErrorCode | string;
  message: string;
  i18nKey?: string;
  details?: any;
  timestamp?: string;
  path?: string;
}

export interface SseOptions {
  token?: string;
  lastEventId?: string;
  onEvent: (event: string, data: any, id?: string) => void;
  onError?: (error: any) => void;
  onOpen?: () => void;
  autoReconnect?: boolean;
}

export interface SseSubscription {
  close: () => void;
}
