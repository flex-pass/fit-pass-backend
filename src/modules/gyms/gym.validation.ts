import { z } from "zod";

export const createGymSchema = z.object({
  name: z.string(),
  address: z.string(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  tier: z.number().int().min(1).max(3),
  peakCreditCost: z.number().int().positive(),
  offpeakCreditCost: z.number().int().positive(),
  peakStartMorning: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid time format (HH:mm)"),
  peakEndMorning: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid time format (HH:mm)"),
  peakStartEvening: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid time format (HH:mm)"),
  peakEndEvening: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid time format (HH:mm)"),
  payoutPerCredit: z.number().positive(),
});

export const updateGymSchema = createGymSchema.partial();

export const nearbyGymsSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radius: z.coerce.number().positive().default(5000), // meters
});

export const killSwitchSchema = z.object({
  killSwitch: z.boolean(),
});
