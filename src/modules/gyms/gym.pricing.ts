import { Gym } from "@prisma/client";
import { format, parse } from "date-fns";

/**
 * Checks if a current time (HH:mm) is within a start and end time.
 */
const isWithinRange = (currentTime: string, start: string, end: string): boolean => {
  const current = parse(currentTime, "HH:mm", new Date());
  const startTime = parse(start, "HH:mm", new Date());
  const endTime = parse(end, "HH:mm", new Date());

  return current >= startTime && current <= endTime;
};

export const getCreditCost = (gym: Gym, date: Date = new Date()): number => {
  const currentTime = format(date, "HH:mm");

  const isPeakMorning = isWithinRange(currentTime, gym.peakStartMorning, gym.peakEndMorning);
  const isPeakEvening = isWithinRange(currentTime, gym.peakStartEvening, gym.peakEndEvening);

  if (isPeakMorning || isPeakEvening) {
    return gym.peakCreditCost;
  }

  return gym.offpeakCreditCost;
};
