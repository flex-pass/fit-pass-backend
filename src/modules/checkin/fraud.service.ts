import { prisma } from "../../config/database";
import { redis } from "../../config/redis";
import { logger } from "../../config/logger";

export const logFraud = async (userId: string | null, gymId: string | null, reason: string, metadata: any) => {
  try {
    await prisma.fraudLog.create({
      data: {
        userId,
        gymId,
        reason,
        metadata,
      }
    });

    if (userId) {
      const fails = await redis.incr(`fraud_fails:${userId}`);
      if (fails === 1) await redis.expire(`fraud_fails:${userId}`, 24 * 60 * 60);

      if (fails >= 3) {
        logger.warn(`User ${userId} flagged for 3+ fraud failures`);
        // We could block them here by setting a specific redis key
        await redis.setex(`blocked:${userId}`, 24 * 60 * 60, "true");
      }
    }
  } catch (error) {
    logger.error(error, "Failed to log fraud");
  }
};

export const checkIsBlocked = async (userId: string): Promise<boolean> => {
  const isBlocked = await redis.get(`blocked:${userId}`);
  return !!isBlocked;
};
