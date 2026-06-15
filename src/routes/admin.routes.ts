import { Router } from "express";
import { approveGym, getDashboardStats, getAllUsers, getUserById, getAllAdmins, getAdminById } from "../controllers/admin.controller";
import { authenticate, authorize } from "../middleware/auth.middleware";

const router = Router();

// Only ADMIN or SUPERADMIN can access admin endpoints
router.patch("/gyms/:id/approve", authenticate, authorize(["ADMIN", "SUPERADMIN"]), approveGym);
router.get("/dashboard", authenticate, authorize(["ADMIN", "SUPERADMIN"]), getDashboardStats);
router.get("/users", authenticate, authorize(["ADMIN", "SUPERADMIN"]), getAllUsers);
router.get("/users/:id", authenticate, authorize(["ADMIN", "SUPERADMIN"]), getUserById);
router.get("/admins", authenticate, authorize(["SUPERADMIN"]), getAllAdmins);
router.get("/admins/:id", authenticate, authorize(["SUPERADMIN"]), getAdminById);

export default router;
