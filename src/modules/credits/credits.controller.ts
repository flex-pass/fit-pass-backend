import { Request, Response } from "express";
import { prisma } from "../../config/database";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { razorpay } from "../../config/razorpay";
import crypto from "crypto";

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

export const createOrder = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { amount, currency = "INR", receipt } = req.body;

    if (!amount || amount < 100) {
      res.status(400).json({ success: false, error: { code: "INVALID_AMOUNT", message: "Amount must be at least 100 paise" } });
      return;
    }

    const order = await razorpay.orders.create({
      amount,
      currency,
      receipt: receipt || `receipt_${req.user!.id}_${Date.now()}`,
      notes: {
        userId: req.user!.id,
        type: "TOPUP"
      }
    });

    res.status(200).json({ success: true, data: { order_id: order.id, amount: order.amount, currency: order.currency } });
  } catch (error: any) {
    if (error.statusCode === 401) {
      res.status(401).json({ success: false, error: { code: "UNAUTHORIZED", message: "Razorpay Auth Failed" } });
    } else {
      res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: error.message || "Failed to create order" } });
    }
  }
};

export const verifyPayment = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      res.status(400).json({ success: false, error: { code: "MISSING_FIELDS", message: "Missing payment fields" } });
      return;
    }

    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) {
      res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: "Razorpay secret not configured" } });
      return;
    }

    const generated_signature = crypto
      .createHmac("sha256", secret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (generated_signature !== razorpay_signature) {
      res.status(400).json({ success: false, error: { code: "INVALID_SIGNATURE", message: "Signature mismatch" } });
      return;
    }

    if (amount) {
      const creditsToAdd = Math.floor(amount / 100);

      // Check if this payment was already processed (e.g. via webhook first)
      const existingTxn = await prisma.creditTransaction.findFirst({
        where: { referenceId: razorpay_payment_id }
      });

      if (!existingTxn) {
        await prisma.$transaction([
          prisma.user.update({
            where: { id: userId },
            data: { creditsBalance: { increment: creditsToAdd } }
          }),
          prisma.creditTransaction.create({
            data: {
              userId,
              amount: creditsToAdd,
              type: "TOPUP",
              referenceId: razorpay_payment_id
            }
          })
        ]);
      }
    }

    res.status(200).json({ success: true, message: "Payment verified successfully" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: error.message || "Failed to verify payment" } });
  }
};

export const razorpayWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET;
    const signature = req.headers["x-razorpay-signature"] as string;

    if (!secret || !signature) {
      res.status(400).send("Missing secret or signature");
      return;
    }

    // Note: For perfect reliability, raw body should be used (e.g. via express.raw())
    // but JSON.stringify works as long as the payload structure hasn't been mutated.
    const body = JSON.stringify(req.body);

    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(body)
      .digest("hex");

    if (expectedSignature !== signature) {
      res.status(400).send("Invalid signature");
      return;
    }

    const event = req.body.event;

    if (event === "payment.captured" || event === "order.paid") {
      const paymentEntity = req.body.payload?.payment?.entity;
      const orderEntity = req.body.payload?.order?.entity;

      const userId = paymentEntity?.notes?.userId || orderEntity?.notes?.userId;
      const amountPaise = paymentEntity?.amount || orderEntity?.amount;
      const referenceId = paymentEntity?.id;

      if (userId && amountPaise && referenceId) {
        const creditsToAdd = Math.floor(amountPaise / 100);

        const existingTxn = await prisma.creditTransaction.findFirst({
          where: { referenceId }
        });

        if (!existingTxn) {
          await prisma.$transaction([
            prisma.user.update({
              where: { id: userId },
              data: { creditsBalance: { increment: creditsToAdd } }
            }),
            prisma.creditTransaction.create({
              data: {
                userId,
                amount: creditsToAdd,
                type: "TOPUP",
                referenceId
              }
            })
          ]);
          console.log(`Razorpay Webhook: Successfully processed ${creditsToAdd} credits for user ${userId}. Reference: ${referenceId}`);
        } else {
          console.log(`Razorpay Webhook: Payment ${referenceId} already processed.`);
        }
      }
    }

    res.status(200).send("OK");
  } catch (error: any) {
    console.error("Razorpay Webhook Error:", error);
    res.status(500).send("Webhook failed");
  }
};
