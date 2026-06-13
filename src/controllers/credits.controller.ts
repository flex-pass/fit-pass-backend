import { Response } from "express";
import { prisma } from "../lib/prisma";
import { AuthenticatedRequest } from "../middleware/auth.middleware";

export const getBalance = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { credits_balance: true, plan_type: true },
    });

    if (!user) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        credits_balance: user.credits_balance,
        plan_type: user.plan_type,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch credit balance",
    });
  }
};

export const getHistory = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;

    const history = await prisma.creditTransaction.findMany({
      where: { user_id: userId },
      orderBy: { created_at: "desc" },
    });

    res.status(200).json({
      success: true,
      data: history,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch credit history",
    });
  }
};

export const purchaseTopup = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { pack } = req.body; // '10_credits', '25_credits', '50_credits'

    let creditsToAdd = 0;
    let price = 0;

    if (pack === "10_credits") {
      creditsToAdd = 10;
      price = 600;
    } else if (pack === "25_credits") {
      creditsToAdd = 25;
      price = 1375;
    } else if (pack === "50_credits") {
      creditsToAdd = 50;
      price = 2500;
    } else {
      res.status(400).json({
        success: false,
        message: "Invalid top-up pack. Choose: 10_credits, 25_credits, or 50_credits",
      });
      return;
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        credits_balance: {
          increment: creditsToAdd,
        },
      },
    });

    await prisma.creditTransaction.create({
      data: {
        user_id: userId!,
        amount: creditsToAdd,
        type: "topup",
        description: `Purchased top-up pack: ${creditsToAdd} credits for Rs. ${price}`,
      },
    });

    res.status(200).json({
      success: true,
      message: `Top-up successful! Added ${creditsToAdd} credits.`,
      data: {
        new_balance: updatedUser.credits_balance,
        pack,
        price_paid: price,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to process top-up",
    });
  }
};
