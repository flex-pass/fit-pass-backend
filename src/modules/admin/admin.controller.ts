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
    const [totalUsers, totalAdmins, pendingOnboardings, topups] = await Promise.all([
      prisma.user.count({ where: { role: "USER" } }),
      prisma.user.count({ where: { role: "GYM_OWNER" } }),
      prisma.gym.count({ where: { isApproved: false } }),
      prisma.creditTransaction.aggregate({
        _sum: { amount: true },
        where: { type: "TOPUP" } // Sum all positive topup transactions
      })
    ]);

    const totalRechargeAmount = topups._sum.amount || 0;

    res.status(200).json({
      success: true,
      data: {
        totalUsers,
        totalAdmins,
        pendingOnboardings,
        totalRechargeAmount
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

export const getUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const users = await prisma.user.findMany({
      where: { role: "USER" },
      select: { id: true, name: true, email: true, phoneNumber: true, city: true, creditsBalance: true, planType: true, isActive: true, createdAt: true },
      orderBy: { createdAt: 'desc' }
    });
    res.status(200).json({ success: true, data: users });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: error.message } });
  }
};

export const getAdmins = async (req: Request, res: Response): Promise<void> => {
  try {
    const admins = await prisma.user.findMany({
      where: { role: "GYM_OWNER" },
      select: { id: true, name: true, email: true, phoneNumber: true, city: true, isActive: true, createdAt: true },
      orderBy: { createdAt: 'desc' }
    });
    res.status(200).json({ success: true, data: admins });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: error.message } });
  }
};

export const getTransactions = async (req: Request, res: Response): Promise<void> => {
  try {
    const transactions = await prisma.creditTransaction.findMany({
      include: {
        user: { select: { name: true, email: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    res.status(200).json({ success: true, data: transactions });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: error.message } });
  }
};

export const getAllGyms = async (req: Request, res: Response): Promise<void> => {
  try {
    const gyms = await prisma.gym.findMany({
      include: { owner: { select: { name: true } } },
      orderBy: { createdAt: 'desc' }
    });
    res.status(200).json({ success: true, data: gyms });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: error.message } });
  }
};

export const getAllCheckins = async (req: Request, res: Response): Promise<void> => {
  try {
    const checkins = await prisma.checkin.findMany({
      include: { 
        user: { select: { name: true, email: true } },
        gym: { select: { name: true } }
      },
      orderBy: { checkedInAt: 'desc' },
      take: 200
    });
    res.status(200).json({ success: true, data: checkins });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: error.message } });
  }
};

export const getAllPayouts = async (req: Request, res: Response): Promise<void> => {
  try {
    const payouts = await prisma.payout.findMany({
      include: { gym: { select: { name: true } } },
      orderBy: { periodStart: 'desc' }
    });
    res.status(200).json({ success: true, data: payouts });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: error.message } });
  }
};

export const getAllPlans = async (req: Request, res: Response): Promise<void> => {
  try {
    const plans = await prisma.subscriptionPlan.findMany({
      orderBy: { price: 'asc' }
    });
    res.status(200).json({ success: true, data: plans });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: error.message } });
  }
};

export const getAllTickets = async (req: Request, res: Response): Promise<void> => {
  try {
    const tickets = await prisma.supportTicket.findMany({
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'desc' }
    });
    res.status(200).json({ success: true, data: tickets });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: error.message } });
  }
};

export const getAllNotifications = async (req: Request, res: Response): Promise<void> => {
  try {
    const notifications = await prisma.notification.findMany({
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    res.status(200).json({ success: true, data: notifications });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: error.message } });
  }
};

export const getAllRefunds = async (req: Request, res: Response): Promise<void> => {
  try {
    const refunds = await prisma.refund.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.status(200).json({ success: true, data: refunds });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: error.message } });
  }
};
