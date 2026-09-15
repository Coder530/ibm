import { z } from "zod";

export const LIMITS = {
  maxItems: 60,
  maxIdLength: 64,
  maxNameLength: 80,
  maxAttrLength: 40,
  maxRadiusMeters: 16000,
  minRadiusMeters: 500,
  maxListChars: 4000,
} as const;

export const geocodeRequestSchema = z.union([
  z.object({ postcode: z.string().max(12) }),
  z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
]);

export const shoppingItemSchema = z.object({
  id: z.string().max(LIMITS.maxIdLength),
  name: z.string().max(LIMITS.maxNameLength),
  quantity: z.number().int().min(1).max(99),
  unit: z.string().max(LIMITS.maxAttrLength).optional(),
  size: z.string().max(LIMITS.maxAttrLength).optional(),
  category: z.string().max(LIMITS.maxAttrLength).optional(),
});

export const preferencesSchema = z.object({
  priority: z.enum(["cheapest", "balanced", "fewest-stores", "closest"]),
  maxDistanceMeters: z.number().min(LIMITS.minRadiusMeters).max(LIMITS.maxRadiusMeters),
  maxStores: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  transport: z.enum(["walk", "bike", "bus", "car"]),
  matchMode: z.enum(["cheapest", "closest-match", "own-brand-ok"]),
});

// UK mainland/NI sanity bounds — reject coordinates far outside the UK.
const UK_LAT_MIN = 49;
const UK_LAT_MAX = 61;
const UK_LNG_MIN = -9;
const UK_LNG_MAX = 2.5;

export const compareRequestSchema = z
  .object({
    latitude: z.number(),
    longitude: z.number(),
    items: z.array(shoppingItemSchema).min(1).max(LIMITS.maxItems),
    prefs: preferencesSchema,
  })
  .refine(
    (v) =>
      v.latitude >= UK_LAT_MIN &&
      v.latitude <= UK_LAT_MAX &&
      v.longitude >= UK_LNG_MIN &&
      v.longitude <= UK_LNG_MAX,
    { message: "Coordinates must be within the UK." }
  );
