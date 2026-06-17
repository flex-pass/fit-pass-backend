import { Router } from "express";
import { createGym, updateGym, toggleKillSwitch, getNearbyGyms, getGymById } from "./gym.controller";
import { validate } from "../../middleware/validate.middleware";
import { authMiddleware, requireRole } from "../../middleware/auth.middleware";
import { createGymSchema, updateGymSchema, killSwitchSchema, nearbyGymsSchema } from "./gym.validation";

const router = Router();

// Public / User routes
router.get("/nearby", validate(nearbyGymsSchema, "query"), getNearbyGyms);
router.get("/:id", getGymById);

// Protected Gym Owner routes
router.use(authMiddleware);

router.post("/", requireRole(["GYM_OWNER", "SUPER_ADMIN"]), validate(createGymSchema), createGym);
router.put("/:id", requireRole(["GYM_OWNER", "SUPER_ADMIN"]), validate(updateGymSchema), updateGym);
router.patch("/:id/kill-switch", requireRole(["GYM_OWNER", "SUPER_ADMIN"]), validate(killSwitchSchema), toggleKillSwitch);

export default router;
