import { Router } from "express";
import { getBalance, getHistory, topupCredits, createOrder, verifyPayment, razorpayWebhook } from "./credits.controller";
import { authMiddleware, requireRole } from "../../middleware/auth.middleware";

const router = Router();

// Webhook route - unauthenticated
router.post("/webhook", razorpayWebhook);

router.use(authMiddleware);
router.use(requireRole(["USER", "SUPER_ADMIN"]));

router.get("/balance", getBalance);
router.get("/history", getHistory);
router.post("/topup", topupCredits);
router.post("/create-order", createOrder);
router.post("/verify-payment", verifyPayment);

export default router;
