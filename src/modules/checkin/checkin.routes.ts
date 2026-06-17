import { Router } from "express";
import { generateQr, validateQr, getCheckinHistory } from "./checkin.controller";
import { validate } from "../../middleware/validate.middleware";
import { authMiddleware, requireRole } from "../../middleware/auth.middleware";
import { generateQrSchema, validateQrSchema } from "./checkin.validation";

const router = Router();

router.use(authMiddleware);

router.post("/generate-qr", requireRole(["USER"]), validate(generateQrSchema), generateQr);
router.post("/validate", requireRole(["GYM_OWNER", "SUPER_ADMIN"]), validate(validateQrSchema), validateQr);
router.get("/history", getCheckinHistory);

export default router;
