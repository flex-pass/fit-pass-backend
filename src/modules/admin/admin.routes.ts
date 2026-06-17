import { Router } from "express";
import { getPendingGyms, approveGym, adjustCredits, getFraudLogs, getAnalyticsOverview, markPayoutPaid, getUsers, getAdmins, getTransactions } from "./admin.controller";
import { authMiddleware, requireRole } from "../../middleware/auth.middleware";

const router = Router();

router.use(authMiddleware);
// Operational routes (accessible to both ADMIN and SUPER_ADMIN)
router.get("/gyms", requireRole(["SUPER_ADMIN", "ADMIN"]), getPendingGyms);
router.patch("/gyms/:id/approve", requireRole(["SUPER_ADMIN", "ADMIN"]), approveGym);
router.get("/fraud-logs", requireRole(["SUPER_ADMIN", "ADMIN"]), getFraudLogs);

// Financial and God-mode routes (accessible ONLY to SUPER_ADMIN)
router.patch("/users/:id/credits", requireRole(["SUPER_ADMIN"]), adjustCredits);
router.get("/analytics/overview", requireRole(["SUPER_ADMIN"]), getAnalyticsOverview);
router.patch("/payouts/:id/mark-paid", requireRole(["SUPER_ADMIN"]), markPayoutPaid);
router.get("/users", requireRole(["SUPER_ADMIN"]), getUsers);
router.get("/admins", requireRole(["SUPER_ADMIN"]), getAdmins);
router.get("/transactions", requireRole(["SUPER_ADMIN"]), getTransactions);

export default router;
