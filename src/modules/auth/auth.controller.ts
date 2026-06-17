import { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { prisma } from "../../config/database";
import { redis } from "../../config/redis";

const generateTokens = (userId: string, role: string) => {
  const accessToken = jwt.sign(
    { id: userId, role },
    process.env.JWT_SECRET || "super-secret",
    { expiresIn: "1h" }
  );

  const refreshToken = crypto.randomBytes(32).toString("hex");
  return { accessToken, refreshToken };
};

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, name, phoneNumber } = req.body;

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email },
          ...(phoneNumber ? [{ phoneNumber }] : [])
        ]
      }
    });

    if (existingUser) {
      res.status(409).json({ success: false, error: { code: "CONFLICT", message: "User with this email or phone already exists" } });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        phoneNumber,
      }
    });

    const { accessToken, refreshToken } = generateTokens(user.id, user.role);
    
    // Store refresh token in redis for 30 days
    await redis.setex(`session:${refreshToken}`, 30 * 24 * 60 * 60, user.id);

    res.status(201).json({
      success: true,
      data: {
        accessToken,
        refreshToken,
        user: { id: user.id, email: user.email, name: user.name, role: user.role }
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: error.message } });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findFirst({ 
      where: { 
        OR: [
          { email: email },
          { name: email }
        ]
      } 
    });
    console.log("Login attempt for:", email, "User found:", user ? user.email : "none", "isActive:", user?.isActive);
    if (!user || !user.isActive) {
      res.status(401).json({ success: false, error: { code: "UNAUTHORIZED", message: "Invalid credentials or inactive account" } });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.password);
    console.log("Password match:", isMatch);
    if (!isMatch) {
      res.status(401).json({ success: false, error: { code: "UNAUTHORIZED", message: "Invalid credentials" } });
      return;
    }

    const { accessToken, refreshToken } = generateTokens(user.id, user.role);
    await redis.setex(`session:${refreshToken}`, 30 * 24 * 60 * 60, user.id);

    res.status(200).json({
      success: true,
      data: {
        accessToken,
        refreshToken,
        user: { id: user.id, email: user.email, name: user.name, role: user.role, creditsBalance: user.creditsBalance }
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: error.message } });
  }
};

export const logout = async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await redis.del(`session:${refreshToken}`);
    }
    res.status(200).json({ success: true, data: { loggedOut: true } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: error.message } });
  }
};
