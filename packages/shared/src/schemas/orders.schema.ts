import { z } from 'zod';
import { OrderStatus, WaitMode } from '../enums/index.js';

export const LocationCoordinateSchema = z.preprocess(
  (val: unknown) => {
    if (val && typeof val === 'object') {
      const obj = val as Record<string, unknown>;
      const lat = typeof obj.lat === 'number' ? obj.lat : typeof obj.latitude === 'number' ? obj.latitude : undefined;
      const lng = typeof obj.lng === 'number' ? obj.lng : typeof obj.longitude === 'number' ? obj.longitude : undefined;
      return {
        latitude: lat,
        longitude: lng,
        lat,
        lng,
      };
    }
    return val;
  },
  z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
  }),
);

export type LocationCoordinateDto = z.infer<typeof LocationCoordinateSchema>;

export const CreateOrderStopSchema = z.object({
  seq: z.number().int().positive().optional(),
  actionId: z.string().uuid('معرف إجراء الخدمة غير صحيح'),
  placeId: z.string().uuid().nullable().optional(),
  location: LocationCoordinateSchema,
  description: z.string().optional(),
  contactPhone: z.string().optional(),
  notes: z.string().optional(),
  expectedDurationMinutes: z.number().int().nonnegative().default(0),
  invoiceRequired: z.boolean().default(false),
});

export type CreateOrderStopDto = z.infer<typeof CreateOrderStopSchema>;

export const CreateOrderSchema = z.object({
  regionId: z.string().uuid().optional(),
  valueTierId: z.string().uuid('معرف شريحة القيمة مطلوب').optional(),
  loadSizeId: z.string().uuid('معرف حجم الحمولة مطلوب').optional(),
  waitMode: z.nativeEnum(WaitMode).default(WaitMode.WAIT),
  customerLocation: LocationCoordinateSchema,
  stops: z.array(CreateOrderStopSchema).min(1, 'يجب تحديد محطة واحدة على الأقل'),
});

export type CreateOrderDto = z.infer<typeof CreateOrderSchema>;

export const UpdateOrderSchema = z.object({
  valueTierId: z.string().uuid().optional(),
  loadSizeId: z.string().uuid().optional(),
  waitMode: z.nativeEnum(WaitMode).optional(),
});

export type UpdateOrderDto = z.infer<typeof UpdateOrderSchema>;

export const OrderQuoteResponseSchema = z.object({
  orderId: z.string().uuid(),
  minFareMinor: z.number(),
  billableVisits: z.number(),
  expectedWaitHours: z.number(),
  suggestedVehicleClasses: z.array(z.string()),
  breakdown: z.object({
    visitsFeeMinor: z.number(),
    waitFeeMinor: z.number(),
    goodsCommissionMinor: z.number(),
    totalFareMinor: z.number(),
    currency: z.string().default('EGP'),
    formattedFareEgp: z.string(),
  }),
});

export type OrderQuoteResponseDto = z.infer<typeof OrderQuoteResponseSchema>;

export const CancelOrderSchema = z.object({
  reason: z.string().min(3, 'سبب الإلغاء مطلوب'),
});

export type CancelOrderDto = z.infer<typeof CancelOrderSchema>;

export const OrderListQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(50).default(20),
  status: z.nativeEnum(OrderStatus).optional(),
});

export type OrderListQueryDto = z.infer<typeof OrderListQuerySchema>;

export const OrderStopResponseSchema = z.object({
  id: z.string().uuid(),
  seq: z.number(),
  actionId: z.string().uuid(),
  actionCode: z.string().optional(),
  actionNameAr: z.string().optional(),
  placeId: z.string().uuid().nullable().optional(),
  placeNameAr: z.string().nullable().optional(),
  location: LocationCoordinateSchema,
  description: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  expectedDurationMinutes: z.number(),
  invoiceRequired: z.boolean(),
  status: z.string(),
});

export type OrderStopResponseDto = z.infer<typeof OrderStopResponseSchema>;

export const OrderDetailsSchema = z.object({
  id: z.string().uuid(),
  regionId: z.string().uuid(),
  customerId: z.string().uuid(),
  customerName: z.string().optional(),
  customerPhoneMasked: z.string().optional(),
  customerPhone: z.string().optional(), // only populated if agreement exists
  status: z.nativeEnum(OrderStatus),
  valueTierId: z.string().uuid().nullable().optional(),
  valueTierNameAr: z.string().nullable().optional(),
  loadSizeId: z.string().uuid().nullable().optional(),
  loadSizeNameAr: z.string().nullable().optional(),
  waitMode: z.nativeEnum(WaitMode),
  customerLocation: LocationCoordinateSchema,
  minFareMinor: z.number(),
  pricingSnapshot: z.record(z.any()).nullable().optional(),
  publishedAt: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
  stops: z.array(OrderStopResponseSchema),
  agreement: z.any().nullable().optional(),
  invoices: z.array(z.any()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type OrderDetailsDto = z.infer<typeof OrderDetailsSchema>;

export const OrderUploadUrlRequestSchema = z.object({
  mediaType: z.enum(['image/jpeg', 'image/png', 'audio/webm', 'audio/mp4', 'audio/ogg']),
  stopId: z.string().uuid().optional(),
});

export type OrderUploadUrlRequestDto = z.infer<typeof OrderUploadUrlRequestSchema>;

export const UploadUrlResponseSchema = z.object({
  uploadUrl: z.string().url(),
  storageKey: z.string(),
  expiresInSeconds: z.number(),
});

export type UploadUrlResponseDto = z.infer<typeof UploadUrlResponseSchema>;
