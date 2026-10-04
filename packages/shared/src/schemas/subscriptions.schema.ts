import { z } from 'zod';

export const SubscriptionPlanSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  nameAr: z.string(),
  nameEn: z.string().nullable().optional(),
  priceMinor: z.number(),
  formattedPriceEgp: z.string().optional(),
  durationDays: z.number(),
  isActive: z.boolean(),
});

export type SubscriptionPlanDto = z.infer<typeof SubscriptionPlanSchema>;

export const DriverSubscriptionResponseSchema = z.object({
  hasSubscription: z.boolean(),
  id: z.string().uuid().nullable().optional(),
  status: z.string().optional(),
  isTrial: z.boolean().optional(),
  planCode: z.string().optional(),
  planNameAr: z.string().optional(),
  startsAt: z.string().nullable().optional(),
  endsAt: z.string().nullable().optional(),
  isActiveNow: z.boolean(),
  daysRemaining: z.number().default(0),
});

export type DriverSubscriptionResponseDto = z.infer<typeof DriverSubscriptionResponseSchema>;

export const AdminGrantSubscriptionSchema = z.object({
  driverId: z.string().uuid('معرف الكابتن مطلوب'),
  planId: z.string().uuid('معرف الخطة مطلوب'),
  durationDays: z.number().int().positive().optional(),
  isTrial: z.boolean().default(false),
  reason: z.string().optional(),
});

export type AdminGrantSubscriptionDto = z.infer<typeof AdminGrantSubscriptionSchema>;

export const AdminRecordSubPaymentSchema = z.object({
  amountMinor: z.number().int().nonnegative('المبلغ يجب أن يكون موجباً'),
  paymentMethod: z.string().default('manual_admin'),
  paymentRef: z.string().optional(),
});

export type AdminRecordSubPaymentDto = z.infer<typeof AdminRecordSubPaymentSchema>;
