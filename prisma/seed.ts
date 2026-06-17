import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import bcrypt from "bcrypt";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Starting database seeding...");

  // Clean existing data
  await prisma.creditTransaction.deleteMany();
  await prisma.checkin.deleteMany();
  await prisma.gym.deleteMany();
  await prisma.user.deleteMany();
  await prisma.corporate.deleteMany();

  const hashedPassword = await bcrypt.hash("password123", 12);

  // 1. Create Corporate
  const corp = await prisma.corporate.create({
    data: {
      companyName: "TechCorp India",
      hrName: "Tech HR",
      hrEmail: "hr@google.com",
      employeeCount: 500,
      monthlyFee: 50000.00,
    },
  });
  console.log("✅ Corporate created");

  // 2. Create Users
  const superadmin = await prisma.user.create({
    data: {
      name: "Super Admin",
      email: "superadmin@gmail.com",
      password: hashedPassword,
      role: "SUPER_ADMIN",
      city: "Noida",
    },
  });

  const admin = await prisma.user.create({
    data: {
      name: "Admin User",
      email: "admin@gmail.com",
      password: hashedPassword,
      role: "SUPER_ADMIN",
      city: "Noida",
    },
  });

  const owner = await prisma.user.create({
    data: {
      name: "Gym Owner",
      email: "owner@gmail.com",
      password: hashedPassword,
      role: "SUPER_ADMIN",
      city: "Noida",
    },
  });

  const user = await prisma.user.create({
    data: {
      name: "Nipun Dixit",
      email: "nipun@gmail.com",
      password: hashedPassword,
      role: "USER",
      city: "Noida",
      creditsBalance: 5000, // Starts with 100 credits for testing
      planType: "PREMIUM",
      planExpiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days expiry
    },
  });

  const corpUser = await prisma.user.create({
    data: {
      name: "Employee User",
      email: "employee@google.com",
      password: hashedPassword,
      role: "USER",
      city: "Noida",
      creditsBalance: 30,
      planType: "CORPORATE",
      planExpiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      corporateId: corp.id,
    },
  });

  console.log("✅ Users created:");
  console.log(` - Superadmin: ${superadmin.email}`);
  console.log(` - Admin: ${admin.email}`);
  console.log(` - Gym Owner: ${owner.email}`);
  console.log(` - Regular User: ${user.email} (100 credits)`);
  console.log(` - Corporate User: ${corpUser.email} (30 credits)`);

  // 3. Create Gyms
  // Gold's Gym Noida Sector 62 (Tier 1 Premium)
  const gym1 = await prisma.gym.create({
    data: {
      name: "Gold's Gym - Sector 62",
      ownerId: owner.id,
      address: "B-23, Sector 62, Noida, Uttar Pradesh 201301",
      latitude: 28.62500000,
      longitude: 77.37300000,
      tier: 1, // Premium
      peakCreditCost: 10,
      offpeakCreditCost: 8,
      peakStartMorning: "06:00",
      peakEndMorning: "09:00",
      peakStartEvening: "18:00",
      peakEndEvening: "21:00",
      payoutPerCredit: 40.00,
      isApproved: true,
      killSwitch: false,
    },
  });

  // Cult Fit Sector 18 (Tier 2 Mid)
  const gym2 = await prisma.gym.create({
    data: {
      name: "Cult Fit - Sector 18",
      ownerId: owner.id,
      address: "Wave Silver Tower, Sector 18, Noida, Uttar Pradesh 201301",
      latitude: 28.57000000,
      longitude: 77.32500000,
      tier: 2, // Mid
      peakCreditCost: 6,
      offpeakCreditCost: 4,
      peakStartMorning: "06:00",
      peakEndMorning: "09:00",
      peakStartEvening: "18:00",
      peakEndEvening: "21:00",
      payoutPerCredit: 30.00,
      isApproved: true,
      killSwitch: false,
    },
  });

  // Fit & Fine Budget Gym (Tier 3 Budget)
  const gym3 = await prisma.gym.create({
    data: {
      name: "Fit & Fine Gym - Sector 12",
      ownerId: owner.id,
      address: "Z-12, Sector 12, Noida, Uttar Pradesh 201301",
      latitude: 28.59000000,
      longitude: 77.34000000,
      tier: 3, // Budget
      peakCreditCost: 4,
      offpeakCreditCost: 2,
      peakStartMorning: "06:00",
      peakEndMorning: "09:00",
      peakStartEvening: "18:00",
      peakEndEvening: "21:00",
      payoutPerCredit: 20.00,
      isApproved: true,
      killSwitch: false,
    },
  });

  console.log("✅ Gyms created:");
  console.log(` - Premium Gym: ${gym1.name} (Location: 28.6250, 77.3730)`);
  console.log(` - Mid Gym: ${gym2.name} (Location: 28.5700, 77.3250)`);
  console.log(` - Budget Gym: ${gym3.name} (Location: 28.5900, 77.3400)`);

  console.log("🌱 Seeding completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
