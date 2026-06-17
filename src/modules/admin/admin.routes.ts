import { Router } from "express";
import { getPendingGyms, approveGym, adjustCredits, getFraudLogs, getAnalyticsOverview, markPayoutPaid } from "./admin.controller";
import { authMiddleware, requireRole } from "../../middleware/auth.middleware";

const router = Router();

router.use(authMiddleware);
router.use(requireRole(["SUPER_ADMIN"]));

router.get("/gyms", getPendingGyms);
router.patch("/gyms/:id/approve", approveGym);
router.patch("/users/:id/credits", adjustCredits);
router.get("/fraud-logs", getFraudLogs);
router.get("/analytics/overview", getAnalyticsOverview);
router.patch("/payouts/:id/mark-paid", markPayoutPaid);

export default router;
