import { z } from 'zod';
import { LocationCoordinateSchema } from './orders.schema.js';

export const StopArrivalSchema = z.object({
  location: LocationCoordinateSchema,
});

export type StopArrivalDto = z.infer<typeof StopArrivalSchema>;

export const StopArrivalResponseSchema = z.object({
  stopVisitId: z.string().uuid(),
  stopId: z.string().uuid(),
  arrivedAt: z.string(),
  distanceMeters: z.number(),
  isLocationMismatch: z.boolean(),
});

export type StopArrivalResponseDto = z.infer<typeof StopArrivalResponseSchema>;

export const CreateInvoiceSchema = z.object({
  invoiceNumber: z.string().optional(),
  amountMinor: z.number().int().nonnegative('مبلغ الفاتورة يجب أن يكون موجباً'),
  photoKey: z.string().optional(),
  customerNote: z.string().optional(),
});

export type CreateInvoiceDto = z.infer<typeof CreateInvoiceSchema>;

export const InvoiceResponseSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  stopId: z.string().uuid().nullable().optional(),
  invoiceNumber: z.string().nullable().optional(),
  amountMinor: z.number(),
  formattedAmountEgp: z.string().optional(),
  photoKey: z.string().nullable().optional(),
  verifiedByCustomer: z.boolean(),
  customerNote: z.string().nullable().optional(),
  createdAt: z.string(),
});

export type InvoiceResponseDto = z.infer<typeof InvoiceResponseSchema>;

export const RecordPaymentReceiptSchema = z.object({
  collectedAmountMinor: z.number().int().nonnegative('المبلغ المحصل يجب أن يكون موجباً'),
  receiptType: z.enum(['cash', 'proof']).default('cash'),
  notes: z.string().optional(),
});

export type RecordPaymentReceiptDto = z.infer<typeof RecordPaymentReceiptSchema>;

export const DisputeInvoiceSchema = z.object({
  reason: z.string().min(3, 'سبب الاعتراض مطلوب'),
});

export type DisputeInvoiceDto = z.infer<typeof DisputeInvoiceSchema>;

export const SettlementBreakdownSchema = z.object({
  agreementId: z.string().uuid(),
  orderId: z.string().uuid(),
  visits: z.number(),
  stopFeeUnitMinor: z.number(),
  stopFeesTotalMinor: z.number(),
  waitHours: z.number(),
  waitFeeUnitMinor: z.number(),
  waitFeesTotalMinor: z.number(),
  totalInvoicesMinor: z.number(),
  goodsPercentRate: z.number(),
  goodsFeesTotalMinor: z.number(),
  calculatedFareMinor: z.number(),
  formattedFareEgp: z.string(),
  currency: z.string().default('EGP'),
});

export type SettlementBreakdownDto = z.infer<typeof SettlementBreakdownSchema>;

export const DriverLocationPointSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  speed: z.number().optional(),
  heading: z.number().optional(),
  recordedAt: z.string().optional(),
});

export type DriverLocationPointDto = z.infer<typeof DriverLocationPointSchema>;

export const DriverLocationBatchSchema = z.object({
  points: z.array(DriverLocationPointSchema).min(1),
});

export type DriverLocationBatchDto = z.infer<typeof DriverLocationBatchSchema>;

export const DriverPresenceSchema = z.object({
  isOnline: z.boolean(),
});

export type DriverPresenceDto = z.infer<typeof DriverPresenceSchema>;

export const NearbyOrderCardSchema = z.object({
  orderId: z.string().uuid(),
  minFareMinor: z.number(),
  formattedFareEgp: z.string(),
  distanceMeters: z.number(),
  billableVisits: z.number(),
  valueTierNameAr: z.string().optional(),
  loadSizeNameAr: z.string().optional(),
  stopsCount: z.number(),
  firstStopSummary: z.string().optional(),
  createdAt: z.string(),
});

export type NearbyOrderCardDto = z.infer<typeof NearbyOrderCardSchema>;
