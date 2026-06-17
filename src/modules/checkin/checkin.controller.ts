import { Request, Response } from "express";
import crypto from "crypto";
import { prisma } from "../../config/database";
import { redis } from "../../config/redis";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { getCreditCost } from "../gyms/gym.pricing";
import { logFraud, checkIsBlocked } from "./fraud.service";

// Utility for haversine
const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371e3; // metres
  const φ1 = lat1 * Math.PI / 180; // φ, λ in radians
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; 
};

export const generateQr = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { gymId, userLat, userLng } = req.body;

    if (await checkIsBlocked(userId)) {
      res.status(403).json({ success: false, error: { code: "ACCOUNT_BLOCKED", message: "Account restricted due to suspicious activity." } });
      return;
    }

    const [user, gym] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.gym.findUnique({ where: { id: gymId } })
    ]);

    if (!user) {
      res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "User not found" } });
      return;
    }
    if (!gym || !gym.isApproved || gym.killSwitch) {
      res.status(400).json({ success: false, error: { code: "GYM_UNAVAILABLE", message: "Gym is not available for check-in" } });
      return;
    }

    const creditsRequired = getCreditCost(gym);
    if (user.creditsBalance < creditsRequired) {
      res.status(402).json({ success: false, error: { code: "INSUFFICIENT_CREDITS", message: "Not enough credits" } });
      return;
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const hasCheckedInToday = await redis.get(`checkin:today:${userId}:${gymId}`);
    if (hasCheckedInToday) {
      res.status(409).json({ success: false, error: { code: "ALREADY_CHECKED_IN", message: "Already checked in today" } });
      return;
    }

    const distance = getDistance(userLat, userLng, Number(gym.latitude), Number(gym.longitude));
    if (distance > 200) {
      res.status(400).json({ success: false, error: { code: "TOO_FAR", message: "You are too far from the gym" } });
      return;
    }

    const qrToken = crypto.randomBytes(32).toString("hex");
    
    // TTL 15 seconds
    await redis.setex(`qr:${qrToken}`, 15, JSON.stringify({
      userId,
      gymId,
      creditsRequired,
      userLat,
      userLng
    }));

    res.status(200).json({
      success: true,
      data: {
        qrToken,
        expiresInSeconds: 15,
        creditsRequired
      }
    });

  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: error.message } });
  }
};

export const validateQr = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const scannerGymId = req.user!.id; // assuming the scanner auth token is tied to the gym owner for now, wait, PRD says validate is called by Gym Owner Scanner.
    // Let's lookup the gyms owned by this user
    const { qrToken, scannerLat, scannerLng } = req.body;

    // Get QR from Redis first before any DB query
    const qrDataStr = await redis.get(`qr:${qrToken}`);
    if (!qrDataStr) {
      // 401 as per PRD
      await logFraud(null, null, "TOKEN_NOT_FOUND_OR_EXPIRED", { qrToken });
      res.status(401).json({ success: false, error: { code: "INVALID_TOKEN", message: "QR token expired or invalid" } });
      return;
    }

    const qrData = JSON.parse(qrDataStr);

    const gymsOwnedByScanner = await prisma.gym.findMany({ where: { ownerId: req.user!.id } });
    const isOwner = gymsOwnedByScanner.some(g => g.id === qrData.gymId);

    if (!isOwner && req.user!.role !== "SUPER_ADMIN") {
      await logFraud(qrData.userId, qrData.gymId, "GYM_MISMATCH", { scannerUserId: req.user!.id });
      res.status(401).json({ success: false, error: { code: "GYM_MISMATCH", message: "QR token does not belong to your gym" } });
      return;
    }

    // Atomic delete
    const deleted = await redis.del(`qr:${qrToken}`);
    if (deleted === 0) {
      await logFraud(qrData.userId, qrData.gymId, "TOKEN_REUSE_RACE_CONDITION", { qrToken });
      res.status(401).json({ success: false, error: { code: "INVALID_TOKEN", message: "Token already consumed" } });
      return;
    }

    const gym = gymsOwnedByScanner.find(g => g.id === qrData.gymId)!;
    const user = await prisma.user.findUnique({ where: { id: qrData.userId } });

    if (!user || user.creditsBalance < qrData.creditsRequired) {
      res.status(402).json({ success: false, error: { code: "INSUFFICIENT_CREDITS", message: "Insufficient credits at time of scan" } });
      return;
    }

    // Single Atomic Transaction
    const gymPayoutAmount = qrData.creditsRequired * Number(gym.payoutPerCredit);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { creditsBalance: { decrement: qrData.creditsRequired } }
      });

      await tx.checkin.create({
        data: {
          userId: user.id,
          gymId: gym.id,
          creditsUsed: qrData.creditsRequired,
          gymPayoutAmount,
          userLat: qrData.userLat,
          userLng: qrData.userLng,
          qrToken,
          status: "SUCCESS"
        }
      });

      await tx.creditTransaction.create({
        data: {
          userId: user.id,
          amount: -qrData.creditsRequired,
          type: "CHECKIN",
          referenceId: qrToken
        }
      });
    });

    // End of day IST logic for TTL
    const now = new Date();
    const eod = new Date();
    eod.setHours(23, 59, 59, 999);
    const ttlSeconds = Math.floor((eod.getTime() - now.getTime()) / 1000);
    
    await redis.setex(`checkin:today:${user.id}:${gym.id}`, ttlSeconds, "1");

    res.status(200).json({
      success: true,
      data: {
        userName: user.name,
        creditsDeducted: qrData.creditsRequired,
        gymEarning: gymPayoutAmount
      }
    });

  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: error.message } });
  }
};

export const getCheckinHistory = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const role = req.user!.role;
    let whereClause = {};

    if (role === "USER") {
      whereClause = { userId };
    } else if (role === "GYM_OWNER") {
      const gyms = await prisma.gym.findMany({ where: { ownerId: userId }, select: { id: true } });
      const gymIds = gyms.map(g => g.id);
      whereClause = { gymId: { in: gymIds } };
    } else if (role === "SUPER_ADMIN") {
      whereClause = {};
    }

    const checkins = await prisma.checkin.findMany({
      where: whereClause,
      include: {
        gym: { select: { name: true, address: true } },
        user: { select: { name: true, email: true } }
      },
      orderBy: { checkedInAt: "desc" },
      take: 50
    });

    const formatted = checkins.map((c: any) => ({
      id: c.id,
      userName: c.user.name,
      gymName: c.gym.name,
      time: c.checkedInAt.toLocaleString(), // Convert properly in frontend but sending string or Date
      checkedInAt: c.checkedInAt,
      creditsUsed: c.creditsUsed,
      earnings: c.gymPayoutAmount,
      status: c.status.toLowerCase(), // 'success' etc
    }));

    res.status(200).json({ success: true, data: formatted });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: error.message } });
  }
};
