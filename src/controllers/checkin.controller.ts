import { Response } from "express";
import { prisma } from "../lib/prisma";
import { AuthenticatedRequest } from "../middleware/auth.middleware";
import { calculateDistance, isPeakHour } from "../services/gym.service";
import {
  generateSecureToken,
  saveQRToken,
  getQRTokenPayload,
  invalidateQRToken,
  checkDailyVisitLimit,
  recordDailyVisit,
} from "../services/qr.service";

export const generateQR = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { gymId, userLat, userLng } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ success: false, message: "User not authenticated" });
      return;
    }

    if (!gymId || userLat === undefined || userLng === undefined) {
      res.status(400).json({
        success: false,
        message: "gymId, userLat, and userLng are required parameters",
      });
      return;
    }

    // 1. Fetch gym details
    const gym = await prisma.gym.findUnique({
      where: { id: gymId },
    });

    if (!gym) {
      res.status(404).json({ success: false, message: "Gym not found" });
      return;
    }

    // Check 4: Gym is approved and active
    if (!gym.is_approved) {
      res.status(400).json({ success: false, message: "Gym is not approved by admin" });
      return;
    }

    // Check 3: Gym kill_switch is false
    if (gym.kill_switch) {
      res.status(403).json({ success: false, message: "Gym is temporarily unavailable (kill-switch on)" });
      return;
    }

    // Check 5: User GPS is within 200m of gym coordinates
    const distanceMeters = calculateDistance(userLat, userLng, gym.latitude, gym.longitude);
    if (distanceMeters > 200) {
      res.status(403).json({
        success: false,
        message: `Not near gym. You are ${Math.round(distanceMeters)}m away. Check-in is only allowed within 200m of the gym.`,
      });
      return;
    }

    // Calculate current credit cost based on peak time
    const peak = isPeakHour(
      gym.peak_start_morning,
      gym.peak_end_morning,
      gym.peak_start_evening,
      gym.peak_end_evening
    );
    const creditsRequired = peak ? gym.peak_credit_cost : gym.offpeak_credit_cost;

    // Fetch user credit balance
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { credits_balance: true },
    });

    if (!user) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }

    // Check 1: User has enough credits
    if (user.credits_balance < creditsRequired) {
      res.status(403).json({
        success: false,
        message: `Insufficient credits. This visit requires ${creditsRequired} credits, but you only have ${user.credits_balance}.`,
      });
      return;
    }

    // Check 2: User has NOT already checked in to this gym today
    const alreadyVisited = await checkDailyVisitLimit(userId, gymId);
    if (alreadyVisited) {
      res.status(403).json({
        success: false,
        message: "Already checked in to this gym today",
      });
      return;
    }

    // All checks passed -> generate secure 64-char token
    const token = generateSecureToken();
    const expiresAt = Date.now() + 15 * 1000; // 15 seconds TTL

    await saveQRToken(token, {
      userId,
      gymId,
      creditsRequired,
      createdAt: Date.now(),
    });

    res.status(200).json({
      success: true,
      message: "QR Token generated successfully",
      data: {
        qr_token: token,
        expires_at: expiresAt,
        credits_required: creditsRequired,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to generate QR code",
    });
  }
};

export const validateQR = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { token } = req.body;
    const scannerUserRole = req.user?.role;
    const scannerUserId = req.user?.id;

    if (!token) {
      res.status(400).json({ success: false, message: "Token is required" });
      return;
    }

    // If scanner is an ADMIN, verify which gym they own/represent
    let scannerGymId: string | null = null;
    if (scannerUserRole === "ADMIN") {
      const ownedGym = await prisma.gym.findFirst({
        where: { owner_user_id: scannerUserId },
      });
      if (!ownedGym) {
        res.status(403).json({ success: false, message: "Admin is not associated with any gym" });
        return;
      }
      scannerGymId = ownedGym.id;
    }

    // Step 1: Token exists in Redis/Memory Cache
    const payload = await getQRTokenPayload(token);
    if (!payload) {
      // Log fraud or invalid attempt
      res.status(401).json({ success: false, message: "FRAUD: QR code is invalid or already used" });
      return;
    }

    // Step 4: Token not expired (15 seconds TTL check)
    if (Date.now() - payload.createdAt > 15000) {
      await invalidateQRToken(token);
      res.status(400).json({ success: false, message: "Expired: QR code expired after 15 seconds" });
      return;
    }

    // Step 3: gymId in token matches scanner gymId (unless scanned by Admin)
    if (scannerUserRole !== "ADMIN" && scannerUserRole !== "SUPERADMIN" && scannerGymId && payload.gymId !== scannerGymId) {
      res.status(401).json({ success: false, message: "FRAUD: QR code is not valid for this gym scanner" });
      return;
    }

    // Fetch user and gym details
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
    });

    const gym = await prisma.gym.findUnique({
      where: { id: payload.gymId },
    });

    if (!user || !gym) {
      res.status(404).json({ success: false, message: "User or gym not found" });
      return;
    }

    // Step 5: User still has enough credits
    if (user.credits_balance < payload.creditsRequired) {
      await invalidateQRToken(token);
      res.status(402).json({ success: false, message: "Insufficient credits: User balance went low" });
      return;
    }

    // Calculate payout
    const payoutAmount = Number(payload.creditsRequired) * Number(gym.payout_per_credit);

    // Atomically execute check-in updates using transaction
    const [updatedUser, checkinRecord] = await prisma.$transaction([
      // Deduct credits
      prisma.user.update({
        where: { id: user.id },
        data: { credits_balance: user.credits_balance - payload.creditsRequired },
      }),
      // Create CheckIn record
      prisma.checkIn.create({
        data: {
          user_id: user.id,
          gym_id: gym.id,
          credits_used: payload.creditsRequired,
          gym_payout_amount: payoutAmount,
          user_lat: gym.latitude, // Checked in successfully at the gym
          user_lng: gym.longitude,
          qr_token: token,
          status: "SUCCESS",
        },
      }),
      // Create transaction log
      prisma.creditTransaction.create({
        data: {
          user_id: user.id,
          amount: -payload.creditsRequired,
          type: "visit_deduction",
          description: `Checked in at ${gym.name}`,
        },
      }),
    ]);

    // Mark daily visit flag
    await recordDailyVisit(user.id, gym.id);

    // Invalidate the scanned token
    await invalidateQRToken(token);

    res.status(200).json({
      success: true,
      message: "Check-in successful",
      data: {
        user_name: user.name,
        credits_deducted: payload.creditsRequired,
        remaining_balance: updatedUser.credits_balance,
        checked_in_at: checkinRecord.checked_in_at,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to validate check-in",
    });
  }
};
