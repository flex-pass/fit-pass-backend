import crypto from "crypto";

interface QRPayload {
  userId: string;
  gymId: string;
  creditsRequired: number;
  createdAt: number;
}

// In-memory cache fallback for local development if Redis is not connected
class MemoryCache {
  private cache = new Map<string, { value: any; expiresAt: number }>();
  private dailyFlags = new Set<string>();

  set(key: string, value: any, ttlSeconds: number) {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  get(key: string): any {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }

  delete(key: string) {
    this.cache.delete(key);
  }

  setDailyFlag(userId: string, gymId: string) {
    const todayStr = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    this.dailyFlags.add(`checkin:today:${todayStr}:${userId}:${gymId}`);
  }

  hasCheckedInToday(userId: string, gymId: string): boolean {
    const todayStr = new Date().toISOString().split("T")[0];
    return this.dailyFlags.has(`checkin:today:${todayStr}:${userId}:${gymId}`);
  }
}

const memoryCache = new MemoryCache();

// Generate a cryptographically secure 64-char token
export const generateSecureToken = (): string => {
  return crypto.randomBytes(32).toString("hex");
};

// Store QR token with 15-second TTL
export const saveQRToken = async (token: string, payload: QRPayload): Promise<void> => {
  // Save in memory cache
  memoryCache.set(`qr:${token}`, payload, 15);
};

// Retrieve QR token data
export const getQRTokenPayload = async (token: string): Promise<QRPayload | null> => {
  return memoryCache.get(`qr:${token}`);
};

// Invalidate QR token after use
export const invalidateQRToken = async (token: string): Promise<void> => {
  memoryCache.delete(`qr:${token}`);
};

// Check if user already booked/checked-in to this gym today
export const checkDailyVisitLimit = async (userId: string, gymId: string): Promise<boolean> => {
  return memoryCache.hasCheckedInToday(userId, gymId);
};

// Mark check-in for the day
export const recordDailyVisit = async (userId: string, gymId: string): Promise<void> => {
  memoryCache.setDailyFlag(userId, gymId);
};
