import { z } from 'zod';

export const VehicleTypeSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  nameAr: z.string(),
  maxWeightKg: z.number(),
  maxVolumeM3: z.string().or(z.number()),
  escalationRank: z.number(),
  icon: z.string().nullable().optional(),
  active: z.boolean(),
});

export type VehicleTypeDto = z.infer<typeof VehicleTypeSchema>;

export const ValueTierSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  nameAr: z.string(),
  minMinor: z.coerce.number(),
  maxMinor: z.coerce.number().nullable().optional(),
  rank: z.number(),
});

export type ValueTierDto = z.infer<typeof ValueTierSchema>;

export const ServiceActionSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  nameAr: z.string(),
  icon: z.string().nullable().optional(),
  sortOrder: z.number(),
  config: z.record(z.any()).optional(),
});

export type ServiceActionDto = z.infer<typeof ServiceActionSchema>;

export const LoadSizeSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  nameAr: z.string(),
  description: z.string().nullable().optional(),
  rank: z.number(),
});

export type LoadSizeDto = z.infer<typeof LoadSizeSchema>;

export const CatalogResponseSchema = z.object({
  vehicleTypes: z.array(VehicleTypeSchema),
  valueTiers: z.array(ValueTierSchema),
  serviceActions: z.array(ServiceActionSchema),
  loadSizes: z.array(LoadSizeSchema),
  settings: z.object({
    maxTasksPerOrder: z.number().default(8),
    searchRadiusMeters: z.number().default(10000),
    currency: z.string().default('EGP'),
  }),
});

export type CatalogResponseDto = z.infer<typeof CatalogResponseSchema>;

export const SearchPlacesQuerySchema = z.object({
  bbox: z.string().optional(), // "minLng,minLat,maxLng,maxLat"
  near: z.string().optional(), // "lat,lng"
  radius: z.coerce.number().positive().max(50000).optional().default(3000),
  q: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});

export type SearchPlacesQueryDto = z.infer<typeof SearchPlacesQuerySchema>;

export const PlaceSchema = z.object({
  id: z.string().uuid(),
  nameAr: z.string(),
  nameEn: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  addressText: z.string().nullable().optional(),
  latitude: z.number(),
  longitude: z.number(),
  isVerified: z.boolean(),
  status: z.string().optional(),
});

export type PlaceDto = z.infer<typeof PlaceSchema>;

export const SuggestPlaceSchema = z.object({
  nameAr: z.string().min(2, 'اسم المكان مطلوب'),
  nameEn: z.string().optional(),
  category: z.string().optional(),
  addressText: z.string().optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  phone: z.string().optional(),
  notes: z.string().optional(),
  regionId: z.string().uuid().optional(),
});

export type SuggestPlaceDto = z.infer<typeof SuggestPlaceSchema>;
