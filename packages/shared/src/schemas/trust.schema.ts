import { z } from 'zod';
import { DisputeStatus } from '../enums/index.js';

export const CreateRatingSchema = z.object({
  score: z.number().int().min(1, 'التقييم من 1 إلى 5').max(5, 'التقييم من 1 إلى 5'),
  tags: z.array(z.string()).optional(),
  comment: z.string().optional(),
});

export type CreateRatingDto = z.infer<typeof CreateRatingSchema>;

export const RatingResponseSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  reviewerId: z.string().uuid(),
  revieweeId: z.string().uuid(),
  score: z.number(),
  tags: z.array(z.string()).nullable().optional(),
  comment: z.string().nullable().optional(),
  createdAt: z.string(),
});

export type RatingResponseDto = z.infer<typeof RatingResponseSchema>;

export const DriverReputationSchema = z.object({
  driverId: z.string().uuid(),
  fullName: z.string(),
  ratingAvg: z.number(),
  ratingCount: z.number(),
  completedCount: z.number(),
  acceptanceRate: z.number().optional(),
  verificationRank: z.number(),
  verificationLevelNameAr: z.string(),
});

export type DriverReputationDto = z.infer<typeof DriverReputationSchema>;

export const CreateDisputeSchema = z.object({
  orderId: z.string().uuid('معرف الطلب مطلوب'),
  reason: z.string().min(2, 'سبب النزاع مطلوب'),
  description: z.string().min(5, 'تفاصيل النزاع مطلوبة'),
});

export type CreateDisputeDto = z.infer<typeof CreateDisputeSchema>;

export const DisputeEventSchema = z.object({
  notes: z.string().min(2, 'ملاحظات الحدث مطلوبة'),
  eventType: z.string().default('investigation_note'),
});

export type DisputeEventDto = z.infer<typeof DisputeEventSchema>;

export const ResolveDisputeSchema = z.object({
  resolution: z.enum(['resolved', 'dismissed']),
  resolutionNotes: z.string().min(5, 'ملاحظات وتفاصيل القرار مطلوبة'),
  orderOutcome: z.enum(['complete', 'cancel', 'none']).default('none'),
});

export type ResolveDisputeDto = z.infer<typeof ResolveDisputeSchema>;

export const DisputeResponseSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  filedBy: z.string().uuid(),
  reason: z.string(),
  description: z.string(),
  status: z.nativeEnum(DisputeStatus),
  assignedAdminId: z.string().uuid().nullable().optional(),
  resolvedAt: z.string().nullable().optional(),
  resolutionNotes: z.string().nullable().optional(),
  createdAt: z.string(),
});

export type DisputeResponseDto = z.infer<typeof DisputeResponseSchema>;
