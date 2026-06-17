import { Router } from "express";
import { getBalance, getHistory, topupCredits } from "./credits.controller";
import { authMiddleware, requireRole } from "../../middleware/auth.middleware";

const router = Router();

router.use(authMiddleware);
router.use(requireRole(["USER", "SUPER_ADMIN"]));

router.get("/balance", getBalance);
router.get("/history", getHistory);
router.post("/topup", topupCredits);

export default router;
