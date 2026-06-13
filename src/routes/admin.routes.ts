import { Router } from "express";
import { approveGym, getDashboardStats } from "../controllers/admin.controller";
import { authenticate, authorize } from "../middleware/auth.middleware";

const router = Router();

// Only ADMIN or SUPERADMIN can access admin endpoints
router.patch("/gyms/:id/approve", authenticate, authorize(["ADMIN", "SUPERADMIN"]), approveGym);
router.get("/dashboard", authenticate, authorize(["ADMIN", "SUPERADMIN"]), getDashboardStats);

export default router;
