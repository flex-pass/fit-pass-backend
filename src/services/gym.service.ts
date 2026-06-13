/**
 * Calculates distance between two coordinates in meters using the Haversine formula.
 */
export const calculateDistance = (
  lat1: number | any,
  lng1: number | any,
  lat2: number | any,
  lng2: number | any
): number => {
  const R = 6371e3; // Earth radius in meters
  const nLat1 = Number(lat1);
  const nLng1 = Number(lng1);
  const nLat2 = Number(lat2);
  const nLng2 = Number(lng2);

  const φ1 = (nLat1 * Math.PI) / 180;
  const φ2 = (nLat2 * Math.PI) / 180;
  const Δφ = ((nLat2 - nLat1) * Math.PI) / 180;
  const Δλ = ((nLng2 - nLng1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
};

/**
 * Checks if the current time is within peak hours for a gym.
 * Peak hour configurations: e.g. morning "06:00" to "09:00", evening "18:00" to "21:00"
 */
export const isPeakHour = (
  peakStartMorning: string,
  peakEndMorning: string,
  peakStartEvening: string,
  peakEndEvening: string
): boolean => {
  // Get current local time in "HH:MM" format
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const currentTime = `${hours}:${minutes}`;

  // Helper to compare "HH:MM" strings
  const isTimeBetween = (time: string, start: string, end: string): boolean => {
    return time >= start && time <= end;
  };

  return (
    isTimeBetween(currentTime, peakStartMorning, peakEndMorning) ||
    isTimeBetween(currentTime, peakStartEvening, peakEndEvening)
  );
};
