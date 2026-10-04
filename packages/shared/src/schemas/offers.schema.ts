import { z } from 'zod';
import { AgreementStatus } from '../enums/index.js';
import { CreateOrderStopSchema } from './orders.schema.js';

export const CreateOfferSchema = z.object({
  offeredFareMinor: z.number().int().nonnegative('قيمة العرض يجب أن تكون موجبة'),
  notes: z.string().optional(),
});

export type CreateOfferDto = z.infer<typeof CreateOfferSchema>;

export const CounterOfferSchema = z.object({
  counterFareMinor: z.number().int().nonnegative('قيمة العرض المقابل يجب أن تكون موجبة'),
  notes: z.string().optional(),
});

export type CounterOfferDto = z.infer<typeof CounterOfferSchema>;

export const DirectAssignSchema = z.object({
  driverId: z.string().uuid('معرف الكابتن مطلوب'),
});

export type DirectAssignDto = z.infer<typeof DirectAssignSchema>;

export const OfferResponseSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  driverId: z.string().uuid(),
  driverName: z.string().optional(),
  driverRatingAvg: z.number().optional(),
  driverVehicleType: z.string().optional(),
  offeredFareMinor: z.number(),
  formattedFareEgp: z.string().optional(),
  status: z.string(),
  notes: z.string().nullable().optional(),
  expiresAt: z.string(),
  createdAt: z.string(),
});

export type OfferResponseDto = z.infer<typeof OfferResponseSchema>;

export const AgreementResponseSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  customerId: z.string().uuid(),
  driverId: z.string().uuid(),
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  driverName: z.string().optional(),
  driverPhone: z.string().optional(),
  agreedFareMinor: z.number(),
  formattedAgreedFareEgp: z.string().optional(),
  agreementSnapshot: z.record(z.any()),
  status: z.nativeEnum(AgreementStatus),
  lockedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type AgreementResponseDto = z.infer<typeof AgreementResponseSchema>;

export const CreateAmendmentSchema = z.object({
  newFareMinor: z.number().int().nonnegative().optional(),
  addedStops: z.array(CreateOrderStopSchema).optional(),
  reason: z.string().min(3, 'سبب التعديل مطلوب'),
});

export type CreateAmendmentDto = z.infer<typeof CreateAmendmentSchema>;

export const AmendmentResponseSchema = z.object({
  id: z.string().uuid(),
  agreementId: z.string().uuid(),
  proposedBy: z.string().uuid(),
  newFareMinor: z.number().nullable().optional(),
  addedStops: z.array(z.any()).nullable().optional(),
  status: z.string(),
  reason: z.string().nullable().optional(),
  resolvedAt: z.string().nullable().optional(),
  createdAt: z.string(),
});

export type AmendmentResponseDto = z.infer<typeof AmendmentResponseSchema>;

export const CancelAgreementSchema = z.object({
  reason: z.string().min(3, 'سبب إلغاء الاتفاق مطلوب'),
});

export type CancelAgreementDto = z.infer<typeof CancelAgreementSchema>;
