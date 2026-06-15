import { Response } from "express";
import { prisma } from "../lib/prisma";
import { AuthenticatedRequest } from "../middleware/auth.middleware";

export const approveGym = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { approve } = req.body; // boolean

    if (approve === undefined) {
      res.status(400).json({ success: false, message: "approve status (true/false) is required" });
      return;
    }

    const gym = await prisma.gym.findUnique({
      where: { id },
    });

    if (!gym) {
      res.status(404).json({ success: false, message: "Gym not found" });
      return;
    }

    const updated = await prisma.gym.update({
      where: { id },
      data: { is_approved: Boolean(approve) },
    });

    res.status(200).json({
      success: true,
      message: `Gym approved status set to ${updated.is_approved}`,
      data: updated,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to update gym approval",
    });
  }
};

export const getDashboardStats = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const totalUsers = await prisma.user.count({ where: { role: "USER" } });
    const totalGyms = await prisma.gym.count();
    const approvedGyms = await prisma.gym.count({ where: { is_approved: true } });
    const totalCheckins = await prisma.checkIn.count();
    const checkinsByStatus = await prisma.checkIn.groupBy({
      by: ["status"],
      _count: { id: true },
    });

    const sumPayout = await prisma.checkIn.aggregate({
      _sum: { gym_payout_amount: true },
      where: { status: "SUCCESS" },
    });

    res.status(200).json({
      success: true,
      data: {
        users: { total: totalUsers },
        gyms: { total: totalGyms, approved: approvedGyms },
        checkins: {
          total: totalCheckins,
          by_status: checkinsByStatus,
        },
        payouts: {
          total_paid_out: sumPayout._sum.gym_payout_amount || 0,
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to retrieve dashboard stats",
    });
  }
};

export const getAllUsers = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const users = await prisma.user.findMany({
      where: { role: "USER" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone_number: true,
        city: true,
        credits_balance: true,
        plan_type: true,
        plan_expiry_date: true,
        is_active: true,
        created_at: true,
      },
      orderBy: { created_at: "desc" },
    });

    res.status(200).json({
      success: true,
      data: users,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch users",
    });
  }
};

export const getUserById = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone_number: true,
        city: true,
        credits_balance: true,
        plan_type: true,
        plan_expiry_date: true,
        is_active: true,
        created_at: true,
      },
    });

    if (!user) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch user detail",
    });
  }
};

export const getAllAdmins = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone_number: true,
        city: true,
        credits_balance: true,
        is_active: true,
        created_at: true,
      },
      orderBy: { created_at: "desc" },
    });

    res.status(200).json({
      success: true,
      data: admins,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch admins",
    });
  }
};

export const getAdminById = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const admin = await prisma.user.findFirst({
      where: { id, role: "ADMIN" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone_number: true,
        city: true,
        credits_balance: true,
        is_active: true,
        created_at: true,
      },
    });

    if (!admin) {
      res.status(404).json({ success: false, message: "Admin not found" });
      return;
    }

    res.status(200).json({
      success: true,
      data: admin,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch admin detail",
    });
  }
};
