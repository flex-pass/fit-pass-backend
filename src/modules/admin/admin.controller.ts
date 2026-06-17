import { Request, Response } from "express";
import { prisma } from "../../config/database";

export const getPendingGyms = async (req: Request, res: Response): Promise<void> => {
  try {
    const gyms = await prisma.gym.findMany({
      where: { isApproved: false }
    });
    res.status(200).json({ success: true, data: gyms });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: error.message } });
  }
};

export const approveGym = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const gym = await prisma.gym.update({
      where: { id },
      data: { isApproved: true }
    });
    res.status(200).json({ success: true, data: gym });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: error.message } });
  }
};

export const adjustCredits = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const { amount, reason } = req.body; // positive to add, negative to deduct

    const user = await prisma.user.update({
      where: { id },
      data: { creditsBalance: { increment: amount } }
    });

    await prisma.creditTransaction.create({
      data: {
        userId: id,
        amount,
        type: "TOPUP", // or maybe a new type like MANUAL_ADJUST
        referenceId: `admin_adjust: ${reason}`
      }
    });

    res.status(200).json({ success: true, data: { creditsBalance: user.creditsBalance } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: error.message } });
  }
};

export const getFraudLogs = async (req: Request, res: Response): Promise<void> => {
  try {
    const logs = await prisma.fraudLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 100
    });
    res.status(200).json({ success: true, data: logs });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: error.message } });
  }
};

export const getAnalyticsOverview = async (req: Request, res: Response): Promise<void> => {
  try {
    const [totalUsers, totalGyms, totalCheckins] = await Promise.all([
      prisma.user.count(),
      prisma.gym.count(),
      prisma.checkin.count()
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalUsers,
        totalGyms,
        totalCheckins
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: error.message } });
  }
};

export const markPayoutPaid = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const payout = await prisma.payout.update({
      where: { id },
      data: { status: "PAID", paidAt: new Date() }
    });
    res.status(200).json({ success: true, data: payout });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: error.message } });
  }
};
