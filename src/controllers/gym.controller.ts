import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { calculateDistance, isPeakHour } from "../services/gym.service";
import { AuthenticatedRequest } from "../middleware/auth.middleware";

export const createGym = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const {
      name,
      address,
      latitude,
      longitude,
      tier,
      peak_credit_cost,
      offpeak_credit_cost,
      peak_start_morning,
      peak_end_morning,
      peak_start_evening,
      peak_end_evening,
      payout_per_credit,
      monthly_guarantee,
      owner_user_id,
    } = req.body;

    if (!name || !address || latitude === undefined || longitude === undefined || !tier) {
      res.status(400).json({
        success: false,
        message: "Missing required gym parameters",
      });
      return;
    }

    // Determine owner
    const finalOwnerId = req.user?.role === "ADMIN" || req.user?.role === "SUPERADMIN"
      ? (owner_user_id || req.user.id)
      : req.user?.id;

    if (!finalOwnerId) {
      res.status(400).json({ success: false, message: "Owner ID is required" });
      return;
    }

    const gym = await prisma.gym.create({
      data: {
        name,
        address,
        latitude,
        longitude,
        tier: Number(tier),
        peak_credit_cost: Number(peak_credit_cost ?? 6),
        offpeak_credit_cost: Number(offpeak_credit_cost ?? 4),
        peak_start_morning: peak_start_morning || "06:00",
        peak_end_morning: peak_end_morning || "09:00",
        peak_start_evening: peak_start_evening || "18:00",
        peak_end_evening: peak_end_evening || "21:00",
        payout_per_credit: Number(payout_per_credit ?? 30),
        monthly_guarantee: Number(monthly_guarantee ?? 0),
        owner_user_id: finalOwnerId,
        is_approved: req.user?.role === "ADMIN" || req.user?.role === "SUPERADMIN", // Auto-approved if created by admin
      },
    });

    res.status(201).json({
      success: true,
      message: "Gym registered successfully",
      data: gym,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to register gym",
    });
  }
};

export const updateGym = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const updateData = req.body;

    const gym = await prisma.gym.findUnique({
      where: { id },
    });

    if (!gym) {
      res.status(404).json({ success: false, message: "Gym not found" });
      return;
    }

    // Authorization: only Owner or Admin
    if (req.user?.role !== "ADMIN" && req.user?.role !== "SUPERADMIN" && gym.owner_user_id !== req.user?.id) {
      res.status(403).json({ success: false, message: "Not authorized to update this gym" });
      return;
    }

    const updated = await prisma.gym.update({
      where: { id },
      data: {
        ...updateData,
        // Ensure numbers are converted
        latitude: updateData.latitude !== undefined ? Number(updateData.latitude) : undefined,
        longitude: updateData.longitude !== undefined ? Number(updateData.longitude) : undefined,
        tier: updateData.tier !== undefined ? Number(updateData.tier) : undefined,
        peak_credit_cost: updateData.peak_credit_cost !== undefined ? Number(updateData.peak_credit_cost) : undefined,
        offpeak_credit_cost: updateData.offpeak_credit_cost !== undefined ? Number(updateData.offpeak_credit_cost) : undefined,
        payout_per_credit: updateData.payout_per_credit !== undefined ? Number(updateData.payout_per_credit) : undefined,
        monthly_guarantee: updateData.monthly_guarantee !== undefined ? Number(updateData.monthly_guarantee) : undefined,
      },
    });

    res.status(200).json({
      success: true,
      message: "Gym updated successfully",
      data: updated,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to update gym",
    });
  }
};

export const getNearbyGyms = async (req: Request, res: Response): Promise<void> => {
  try {
    const { lat, lng, radius = 50000 } = req.query; // default 50km

    if (!lat || !lng) {
      res.status(400).json({
        success: false,
        message: "Latitude (lat) and longitude (lng) are required query parameters",
      });
      return;
    }

    const userLat = Number(lat);
    const userLng = Number(lng);

    // Fetch all active/approved gyms
    const gyms = await prisma.gym.findMany({
      where: { is_approved: true },
      include: { owner: { select: { name: true, email: true } } },
    });

    const nearbyGyms = gyms
      .map((gym: any) => {
        const distance = calculateDistance(userLat, userLng, gym.latitude, gym.longitude);
        const peak = isPeakHour(
          gym.peak_start_morning,
          gym.peak_end_morning,
          gym.peak_start_evening,
          gym.peak_end_evening
        );
        const current_credit_cost = peak ? gym.peak_credit_cost : gym.offpeak_credit_cost;

        return {
          ...gym,
          distance_meters: Math.round(distance),
          is_peak: peak,
          current_credit_cost,
        };
      })
      .filter((gym: any) => gym.distance_meters <= Number(radius))
      .sort((a: any, b: any) => a.distance_meters - b.distance_meters);

    res.status(200).json({
      success: true,
      data: nearbyGyms,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch nearby gyms",
    });
  }
};

export const getGymById = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;

    const gym = await prisma.gym.findUnique({
      where: { id },
      include: { owner: { select: { name: true, email: true } } },
    });

    if (!gym) {
      res.status(404).json({ success: false, message: "Gym not found" });
      return;
    }

    const peak = isPeakHour(
      gym.peak_start_morning,
      gym.peak_end_morning,
      gym.peak_start_evening,
      gym.peak_end_evening
    );
    const current_credit_cost = peak ? gym.peak_credit_cost : gym.offpeak_credit_cost;

    res.status(200).json({
      success: true,
      data: {
        ...gym,
        is_peak: peak,
        current_credit_cost,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch gym details",
    });
  }
};

export const toggleKillSwitch = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { kill_switch } = req.body;

    if (kill_switch === undefined) {
      res.status(400).json({ success: false, message: "kill_switch value is required" });
      return;
    }

    const gym = await prisma.gym.findUnique({
      where: { id },
    });

    if (!gym) {
      res.status(404).json({ success: false, message: "Gym not found" });
      return;
    }

    // Authorization: only Owner or Admin
    if (req.user?.role !== "ADMIN" && req.user?.role !== "SUPERADMIN" && gym.owner_user_id !== req.user?.id) {
      res.status(403).json({ success: false, message: "Not authorized to change status" });
      return;
    }

    const updated = await prisma.gym.update({
      where: { id },
      data: { kill_switch: Boolean(kill_switch) },
    });

    res.status(200).json({
      success: true,
      message: `Aggregator traffic turned ${updated.kill_switch ? "OFF" : "ON"}`,
      data: updated,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to toggle kill switch",
    });
  }
};

export const getCreditCost = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;

    const gym = await prisma.gym.findUnique({
      where: { id },
      select: {
        peak_credit_cost: true,
        offpeak_credit_cost: true,
        peak_start_morning: true,
        peak_end_morning: true,
        peak_start_evening: true,
        peak_end_evening: true,
      },
    });

    if (!gym) {
      res.status(404).json({ success: false, message: "Gym not found" });
      return;
    }

    const peak = isPeakHour(
      gym.peak_start_morning,
      gym.peak_end_morning,
      gym.peak_start_evening,
      gym.peak_end_evening
    );
    const cost = peak ? gym.peak_credit_cost : gym.offpeak_credit_cost;

    res.status(200).json({
      success: true,
      data: {
        gymId: id,
        isPeak: peak,
        creditCost: cost,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to get credit cost",
    });
  }
};
