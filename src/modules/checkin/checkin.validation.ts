import { z } from "zod";

export const generateQrSchema = z.object({
  gymId: z.string().uuid(),
  userLat: z.number().min(-90).max(90),
  userLng: z.number().min(-180).max(180),
});

export const validateQrSchema = z.object({
  qrToken: z.string(),
  scannerLat: z.number().min(-90).max(90),
  scannerLng: z.number().min(-180).max(180),
});
