import { Request, Response } from "express";
import { prisma } from "../../config/database";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";

export const getBalance = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { creditsBalance: true }
    });

    if (!user) {
      res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "User not found" } });
      return;
    }

    res.status(200).json({ success: true, data: { creditsBalance: user.creditsBalance } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: error.message } });
  }
};

export const getHistory = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      prisma.creditTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.creditTransaction.count({ where: { userId } })
    ]);

    res.status(200).json({
      success: true,
      data: transactions,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: error.message } });
  }
};

export const topupCredits = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      res.status(400).json({ success: false, error: { code: "INVALID_AMOUNT", message: "Amount must be greater than 0" } });
      return;
    }

    // In a real scenario, this would create an order, return it to the client, 
    // and wait for payment webhook to actually top up.
    // For now, we mock the direct top-up.

    const user = await prisma.user.update({
      where: { id: userId },
      data: { creditsBalance: { increment: amount } }
    });

    await prisma.creditTransaction.create({
      data: {
        userId,
        amount,
        type: "TOPUP",
      }
    });

    res.status(200).json({ success: true, data: { creditsBalance: user.creditsBalance } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: error.message } });
  }
};
