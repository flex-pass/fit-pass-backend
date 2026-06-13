import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { hashPassword, comparePassword, generateToken } from "../utils/auth";

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, password, phone_number, city, role } = req.body;

    if (!name || !email || !password) {
      res.status(400).json({
        success: false,
        message: "Please provide name, email and password",
      });
      return;
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      res.status(400).json({
        success: false,
        message: "User with this email already exists",
      });
      return;
    }

    // Validate role if provided
    let userRole: "USER" | "GYM_OWNER" | "ADMIN" | "SUPERADMIN" = "USER";
    if (role) {
      const upperRole = role.toUpperCase();
      if (["USER", "GYM_OWNER", "ADMIN", "SUPERADMIN"].includes(upperRole)) {
        userRole = upperRole as any;
      } else {
        res.status(400).json({
          success: false,
          message: "Invalid role specified",
        });
        return;
      }
    }

    const hashedPassword = await hashPassword(password);

    // Initial sign-up credits: Let's give a default or zero, in PRD it's zero by default
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        phone_number: phone_number || null,
        city: city || "Noida",
        role: userRole,
        credits_balance: userRole === "USER" ? 10 : 0, // Give 10 signup bonus credits to test
      },
    });

    // Record signup transaction if user role is USER
    if (user.role === "USER") {
      await prisma.creditTransaction.create({
        data: {
          user_id: user.id,
          amount: 10,
          type: "signup_bonus",
          description: "Free welcome credits",
        },
      });
    }

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          credits_balance: user.credits_balance,
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Internal server error during registration",
    });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({
        success: false,
        message: "Please provide email and password",
      });
      return;
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.is_active) {
      res.status(401).json({
        success: false,
        message: "Invalid credentials or account is suspended",
      });
      return;
    }

    // Compare password
    const isMatch = await comparePassword(password, user.password);
    if (!isMatch) {
      res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
      return;
    }

    // Generate JWT
    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          credits_balance: user.credits_balance,
        },
        token,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Internal server error during login",
    });
  }
};
