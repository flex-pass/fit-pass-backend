import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

// Routes
import authRoutes from "./routes/auth.routes";
import gymRoutes from "./routes/gym.routes";
import checkinRoutes from "./routes/checkin.routes";
import creditsRoutes from "./routes/credits.routes";
import adminRoutes from "./routes/admin.routes";

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet());
app.use(cors({
  origin: "*", // Adjust origins based on requirements
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
    message: "API Route not found"
  });
});

// Start Server
app.listen(PORT, () => {
  console.log(`=========================================`);
  console.log(`🚀 FlexPass Backend Server Running!`);
  console.log(`📡 Port: ${PORT}`);
  console.log(`🔗 Health Check: http://localhost:${PORT}/health`);
  console.log(`=========================================`);
});
