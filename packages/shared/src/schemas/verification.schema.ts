import { z } from 'zod';

export const DriverProfileCreateSchema = z.object({
  regionId: z.string().uuid().optional(),
});

export type DriverProfileCreateDto = z.infer<typeof DriverProfileCreateSchema>;

export const RegisterVehicleSchema = z.object({
  vehicleTypeId: z.string().uuid('نوع المركبة مطلوب'),
  plate: z.string().min(2, 'رقم اللوحة مطلوب').max(64),
  photoKey: z.string().optional(),
});

export type RegisterVehicleDto = z.infer<typeof RegisterVehicleSchema>;

export const SubmitDocumentSchema = z.object({
  type: z.string().min(2, 'نوع المستند مطلوب'),
  storageKey: z.string().min(1, 'مسار الملف مطلوب'),
  encryptedMetadata: z.string().optional(),
});

export type SubmitDocumentDto = z.infer<typeof SubmitDocumentSchema>;

export const VerificationStatusResponseSchema = z.object({
  status: z.string(),
  verificationLevelRank: z.number(),
  verificationLevelNameAr: z.string(),
  missingDocumentTypes: z.array(z.string()),
  submittedDocuments: z.array(
    z.object({
      id: z.string().uuid(),
      type: z.string(),
      status: z.string(),
      rejectReason: z.string().nullable().optional(),
      createdAt: z.string(),
    }),
  ),
});

export type VerificationStatusResponseDto = z.infer<typeof VerificationStatusResponseSchema>;

export const AdminReviewVerificationSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  rejectReason: z.string().optional(),
  levelId: z.string().uuid().optional(),
});

export type AdminReviewVerificationDto = z.infer<typeof AdminReviewVerificationSchema>;
