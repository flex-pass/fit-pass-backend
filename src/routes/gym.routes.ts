import { Router } from "express";
import {
  createGym,
  updateGym,
  getNearbyGyms,
  getGymById,
  toggleKillSwitch,
  getCreditCost,
} from "../controllers/gym.controller";
import { authenticate, authorize } from "../middleware/auth.middleware";

const router = Router();

// Public routes
router.get("/nearby", getNearbyGyms);
router.get("/:id", getGymById);
router.get("/:id/credit-cost", getCreditCost);

// Protected routes (owner / admin)
router.post("/", authenticate, authorize(["GYM_OWNER", "ADMIN", "SUPERADMIN"]), createGym);
router.put("/:id", authenticate, updateGym);
router.patch("/:id/kill-switch", authenticate, toggleKillSwitch);

export default router;
