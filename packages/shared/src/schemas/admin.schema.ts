import { z } from 'zod';

export const AdminPricingRuleSchema = z.object({
  regionId: z.string().uuid().nullable().optional(),
  stopFeeMinor: z.number().int().nonnegative('أجرة التوقف يجب أن تكون موجبة'),
  waitFeePerHourMinor: z.number().int().nonnegative('أجرة الانتظار بالساعة يجب أن تكون موجبة'),
  goodsPercentRate: z.number().min(0).max(1, 'نسبة البضائع يجب أن تكون بين 0 و 1'),
  effectiveFrom: z.string().optional(),
});

export type AdminPricingRuleDto = z.infer<typeof AdminPricingRuleSchema>;

export const PricingRuleResponseSchema = z.object({
  id: z.string().uuid(),
  regionId: z.string().uuid().nullable().optional(),
  stopFeeMinor: z.number(),
  waitFeePerHourMinor: z.number(),
  goodsPercentRate: z.number(),
  isActive: z.boolean(),
  effectiveFrom: z.string(),
  effectiveTo: z.string().nullable().optional(),
  createdAt: z.string(),
});

export type PricingRuleResponseDto = z.infer<typeof PricingRuleResponseSchema>;

export const AdminEscalationRuleSchema = z.object({
  regionId: z.string().uuid().nullable().optional(),
  initialRadiusMeters: z.number().int().positive().default(2000),
  stepRadiusMeters: z.number().int().positive().default(1000),
  maxRadiusMeters: z.number().int().positive().default(7000),
  stepTimeoutSeconds: z.number().int().positive().default(45),
  maxSteps: z.number().int().positive().default(4),
  allowVehicleEscalation: z.boolean().default(true),
});

export type AdminEscalationRuleDto = z.infer<typeof AdminEscalationRuleSchema>;

export const AdminUserSearchQuerySchema = z.object({
  q: z.string().optional(),
  role: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type AdminUserSearchQueryDto = z.infer<typeof AdminUserSearchQuerySchema>;

export const PushDeviceRegistrationSchema = z.object({
  endpoint: z.string().url('رابط الاشتراك غير صحيح'),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  deviceInfo: z.string().optional(),
});

export type PushDeviceRegistrationDto = z.infer<typeof PushDeviceRegistrationSchema>;

export const NotificationResponseSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  titleAr: z.string(),
  titleEn: z.string().nullable().optional(),
  bodyAr: z.string(),
  bodyEn: z.string().nullable().optional(),
  category: z.string(),
  entityId: z.string().nullable().optional(),
  entityType: z.string().nullable().optional(),
  readAt: z.string().nullable().optional(),
  createdAt: z.string(),
});

export type NotificationResponseDto = z.infer<typeof NotificationResponseSchema>;
