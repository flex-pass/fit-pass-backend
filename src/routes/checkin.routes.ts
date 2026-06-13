import { Router } from "express";
import { generateQR, validateQR } from "../controllers/checkin.controller";
import { authenticate, authorize } from "../middleware/auth.middleware";

const router = Router();

// Users generate QR codes (with location validation)
router.post("/generate-qr", authenticate, authorize(["USER", "ADMIN", "SUPERADMIN"]), generateQR);

// Gym owners (admins) validate scanned QR codes
router.post("/validate", authenticate, authorize(["ADMIN", "SUPERADMIN"]), validateQR);

export default router;
