import { z } from 'zod';
import { UserRole } from '../enums/index.js';

export function normalizeEgyptianPhone(input: string): string {
  if (!input) return '';
  const cleaned = input.replace(/[\s\-\(\)]/g, '').trim();

  // Already E.164 Egypt (+201012345678)
  if (/^\+201[0125][0-9]{8}$/.test(cleaned)) {
    return cleaned;
  }

  // 00201012345678
  if (/^00201[0125][0-9]{8}$/.test(cleaned)) {
    return '+' + cleaned.slice(2);
  }

  // 201012345678
  if (/^201[0125][0-9]{8}$/.test(cleaned)) {
    return '+' + cleaned;
  }

  // Local Egyptian 01012345678
  if (/^01[0125][0-9]{8}$/.test(cleaned)) {
    return '+20' + cleaned.slice(1);
  }

  // If already generic E.164 with another country code
  if (/^\+[1-9]\d{6,14}$/.test(cleaned)) {
    return cleaned;
  }

  return cleaned;
}

export const PhoneSchema = z
  .string()
  .min(9, 'رقم الهاتف قصير جداً')
  .max(16, 'رقم الهاتف طويل جداً')
  .transform((val) => normalizeEgyptianPhone(val))
  .refine((val) => /^\+201[0125][0-9]{8}$/.test(val) || /^\+[1-9]\d{6,14}$/.test(val), {
    message: 'رقم الهاتف يجب أن يكون رقم مصري صحيح (مثال: 01012345678)',
  });

export const RequestOtpSchema = z.object({
  phone: PhoneSchema,
  role: z.nativeEnum(UserRole).default(UserRole.CUSTOMER),
});

export type RequestOtpDto = z.infer<typeof RequestOtpSchema>;

export const VerifyOtpSchema = z.object({
  phone: PhoneSchema,
  code: z.string().length(6, 'رمز التحقق يجب أن يتكون من 6 أرقام'),
  deviceInfo: z.string().optional().default('Web Browser'),
  role: z.nativeEnum(UserRole).default(UserRole.CUSTOMER),
});

export type VerifyOtpDto = z.infer<typeof VerifyOtpSchema>;

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'رمز التحديث مطلوب'),
});

export type RefreshTokenDto = z.infer<typeof RefreshTokenSchema>;

export const AdminLoginSchema = z.object({
  email: z.string().email('صيغة البريد الإلكتروني غير صحيحة'),
  password: z.string().min(8, 'كلمة المرور يجب أن لا تقل عن 8 أحرف'),
  deviceInfo: z.string().optional().default('Admin Console'),
});

export type AdminLoginDto = z.infer<typeof AdminLoginSchema>;

export const LogoutSchema = z.object({
  refreshToken: z.string().optional(),
  allDevices: z.boolean().optional().default(false),
});

export type LogoutDto = z.infer<typeof LogoutSchema>;

export const CursorPaginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
  direction: z.enum(['forward', 'backward']).default('forward'),
});

export type CursorPaginationDto = z.infer<typeof CursorPaginationSchema>;

export const SettingUpdateSchema = z.object({
  key: z.string().min(1),
  value: z.record(z.any()),
  regionId: z.string().uuid().optional(),
});

export type SettingUpdateDto = z.infer<typeof SettingUpdateSchema>;

export * from './catalog.schema.js';
export * from './orders.schema.js';
export * from './offers.schema.js';
export * from './execution.schema.js';
export * from './verification.schema.js';
export * from './subscriptions.schema.js';
export * from './messaging.schema.js';
export * from './trust.schema.js';
export * from './admin.schema.js';

