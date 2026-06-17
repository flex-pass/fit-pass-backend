import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import helmet from "helmet";
import { logger } from "./config/logger";
import { errorHandler } from "./middleware/errorHandler.middleware";

// Routes
import authRoutes from "./modules/auth/auth.routes";
import gymRoutes from "./modules/gyms/gym.routes";
import checkinRoutes from "./modules/checkin/checkin.routes";
import creditsRoutes from "./modules/credits/credits.routes";
import adminRoutes from "./modules/admin/admin.routes";

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || "*",
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// HTTP Request Logging
app.use((req, res, next) => {
  logger.info({ method: req.method, url: req.url }, "Incoming request");
  next();
});

// Health Check
app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "FlexPass Backend API is active and healthy",
    timestamp: new Date()
  });
});

// Mount Routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/gyms", gymRoutes);
app.use("/api/v1/checkin", checkinRoutes);
app.use("/api/v1/credits", creditsRoutes);
app.use("/api/v1/admin", adminRoutes);

// 404 Route handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: "NOT_FOUND",
      message: "API Route not found"
    }
  });
});

// Global Error Handler
app.use(errorHandler);

// Start Server
app.listen(PORT, () => {
  logger.info(`=========================================`);
  logger.info(`🚀 FlexPass Backend Server Running!`);
  logger.info(`📡 Port: ${PORT}`);
  logger.info(`🔗 Health Check: http://localhost:${PORT}/health`);
  logger.info(`=========================================`);
});
