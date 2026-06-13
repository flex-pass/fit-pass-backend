import { Router } from "express";
import { getBalance, getHistory, purchaseTopup } from "../controllers/credits.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = Router();

router.get("/balance", authenticate, getBalance);
router.get("/history", authenticate, getHistory);
router.post("/topup", authenticate, purchaseTopup);

export default router;
