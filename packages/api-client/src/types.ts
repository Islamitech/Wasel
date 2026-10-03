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
  regionId: string;
  code: string;
  nameAr: string;
  nameEn: string;
  maxWeightKg: number;
  maxVolumeCbm: number;
  isActive: boolean;
  displayOrder: number;
}

export interface ServiceActionDto {
  id: string;
  regionId: string;
  code: string;
  nameAr: string;
  nameEn: string;
  baseFeeCents: number;
  isActive: boolean;
}

export interface ValueTierDto {
  id: string;
  regionId: string;
  code: string;
  nameAr: string;
  minValueCents: number;
  maxValueCents: number;
  requiredVehicleClasses: string[];
  isActive: boolean;
}

export interface ApiClientError {
  statusCode: number;
  errorCode: ErrorCode;
  message: string;
  details?: any;
  timestamp?: string;
  path?: string;
}
