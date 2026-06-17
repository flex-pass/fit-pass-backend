import Redis from "ioredis";
import { logger } from "./logger";

export const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

redis.on("error", (err) => {
  logger.error(err, "Redis error");
});

redis.on("connect", () => {
  logger.info("Connected to Redis");
});
