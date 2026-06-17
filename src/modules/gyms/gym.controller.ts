import { Request, Response } from "express";
import { prisma } from "../../config/database";
import { redis } from "../../config/redis";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { getCreditCost } from "./gym.pricing";

export const createGym = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const ownerId = req.user!.id;
    const gym = await prisma.gym.create({
      data: {
        ...req.body,
        ownerId,
        isApproved: false, // Pending admin approval
      }
    });

    res.status(201).json({ success: true, data: gym });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: error.message } });
  }
};

export const updateGym = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const ownerId = req.user!.id;

    const gym = await prisma.gym.findUnique({ where: { id } });
    if (!gym) {
      res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Gym not found" } });
      return;
    }

    if (gym.ownerId !== ownerId && req.user!.role !== "SUPER_ADMIN") {
      res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Not authorized to update this gym" } });
      return;
    }

    const updatedGym = await prisma.gym.update({
      where: { id },
      data: req.body
    });

    // Invalidate detail cache
    await redis.del(`gym:${id}`);

    res.status(200).json({ success: true, data: updatedGym });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: error.message } });
  }
};

export const toggleKillSwitch = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const { killSwitch } = req.body;
    const ownerId = req.user!.id;

    const gym = await prisma.gym.findUnique({ where: { id } });
    if (!gym || (gym.ownerId !== ownerId && req.user!.role !== "SUPER_ADMIN")) {
      res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Gym not found or unauthorized" } });
      return;
    }

    const updatedGym = await prisma.gym.update({
      where: { id },
      data: { killSwitch }
    });

    await redis.del(`gym:${id}`);

    res.status(200).json({ success: true, data: { killSwitch: updatedGym.killSwitch } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: error.message } });
  }
};

export const getNearbyGyms = async (req: Request, res: Response): Promise<void> => {
  try {
    const { lat, lng, radius } = req.query as unknown as { lat: number; lng: number; radius: number };
    
    const cacheKey = `nearby:${lat}:${lng}:${radius}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      res.status(200).json({ success: true, data: JSON.parse(cached) });
      return;
    }

    const maxDistMeters = radius;
    
    const gyms = await prisma.$queryRaw<any[]>`
      WITH GymDistances AS (
        SELECT id, name, address, latitude, longitude, tier,
          "peakCreditCost", "offpeakCreditCost", "peakStartMorning", "peakEndMorning", "peakStartEvening", "peakEndEvening",
          "payoutPerCredit", "killSwitch", "isApproved",
          (
            6371000 * acos(
              cos(radians(${lat})) * cos(radians(latitude)) *
              cos(radians(longitude) - radians(${lng})) +
              sin(radians(${lat})) * sin(radians(latitude))
            )
          ) AS distance
        FROM "Gym"
        WHERE "isApproved" = true AND "killSwitch" = false
      )
      SELECT * FROM GymDistances
      WHERE distance <= ${maxDistMeters}
      ORDER BY distance ASC;
    `;

    // Process pricing
    const formattedGyms = gyms.map(gym => {
      // Mapping raw query results back to model
      const modelGym = {
        ...gym,
        peakCreditCost: Number(gym.peakCreditCost),
        offpeakCreditCost: Number(gym.offpeakCreditCost),
      };

      const currentCreditCost = getCreditCost(modelGym);

      return {
        id: gym.id,
        name: gym.name,
        address: gym.address,
        distanceMeters: Math.round(Number(gym.distance)),
        currentCreditCost,
        pricingType: currentCreditCost === gym.peakCreditCost ? "peak" : "off-peak",
        killSwitch: gym.killSwitch,
      };
    });

    await redis.setex(cacheKey, 60, JSON.stringify(formattedGyms));

    res.status(200).json({ success: true, data: formattedGyms });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: error.message } });
  }
};

export const getGymById = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const gym = await prisma.gym.findUnique({ where: { id } });
    if (!gym) {
      res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Gym not found" } });
      return;
    }
    // calculate cost
    const modelGym = {
      ...gym,
      peakCreditCost: Number(gym.peakCreditCost),
      offpeakCreditCost: Number(gym.offpeakCreditCost),
    };
    const currentCreditCost = getCreditCost(modelGym);

    res.status(200).json({ success: true, data: { ...gym, currentCreditCost } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: error.message } });
  }
};
