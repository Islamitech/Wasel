import { z } from 'zod';

export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  RATE_LIMITED = 'RATE_LIMITED',
  OTP_INVALID = 'OTP_INVALID',
  OTP_EXPIRED = 'OTP_EXPIRED',
  OTP_COOLDOWN = 'OTP_COOLDOWN',
  OTP_MAX_ATTEMPTS = 'OTP_MAX_ATTEMPTS',
  CONFLICT = 'CONFLICT',
  IDEMPOTENCY_CONFLICT = 'IDEMPOTENCY_CONFLICT',
  BAD_REQUEST = 'BAD_REQUEST',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export const ApiErrorEnvelopeSchema = z.object({
  statusCode: z.number(),
  errorCode: z.nativeEnum(ErrorCode),
  message: z.string(),
  details: z.any().optional(),
  timestamp: z.string(),
  path: z.string(),
  requestId: z.string().optional(),
});

export type ApiErrorEnvelope = z.infer<typeof ApiErrorEnvelopeSchema>;
