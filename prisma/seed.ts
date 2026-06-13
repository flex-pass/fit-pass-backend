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
  await prisma.checkIn.deleteMany();
  await prisma.gym.deleteMany();
  await prisma.user.deleteMany();
  await prisma.corporate.deleteMany();

  const hashedPassword = await bcrypt.hash("password123", 12);

  // 1. Create Corporate
  const corp = await prisma.corporate.create({
    data: {
      name: "Google India",
      domain: "google.com",
    },
  });
  console.log("✅ Corporate created");

  // 2. Create Users
  const superadmin = await prisma.user.create({
    data: {
      name: "Super Admin",
      email: "superadmin@gmail.com",
      password: hashedPassword,
      role: "SUPERADMIN",
      city: "Noida",
    },
  });

  const admin = await prisma.user.create({
    data: {
      name: "Admin User",
      email: "admin@gmail.com",
      password: hashedPassword,
      role: "ADMIN",
      city: "Noida",
    },
  });

  const owner = await prisma.user.create({
    data: {
      name: "Gym Owner",
      email: "owner@gmail.com",
      password: hashedPassword,
      role: "GYM_OWNER",
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
      credits_balance: 100, // Starts with 100 credits for testing
      plan_type: "PREMIUM",
      plan_expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days expiry
    },
  });

  const corpUser = await prisma.user.create({
    data: {
      name: "Employee User",
      email: "employee@google.com",
      password: hashedPassword,
      role: "USER",
      city: "Noida",
      credits_balance: 30,
      plan_type: "CORPORATE_BASIC",
      plan_expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      corporate_id: corp.id,
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
      owner_user_id: owner.id,
      address: "B-23, Sector 62, Noida, Uttar Pradesh 201301",
      latitude: 28.62500000,
      longitude: 77.37300000,
      tier: 1, // Premium
      peak_credit_cost: 10,
      offpeak_credit_cost: 8,
      peak_start_morning: "06:00",
      peak_end_morning: "09:00",
      peak_start_evening: "18:00",
      peak_end_evening: "21:00",
      payout_per_credit: 40.00,
      is_approved: true,
      kill_switch: false,
    },
  });

  // Cult Fit Sector 18 (Tier 2 Mid)
  const gym2 = await prisma.gym.create({
    data: {
      name: "Cult Fit - Sector 18",
      owner_user_id: owner.id,
      address: "Wave Silver Tower, Sector 18, Noida, Uttar Pradesh 201301",
      latitude: 28.57000000,
      longitude: 77.32500000,
      tier: 2, // Mid
      peak_credit_cost: 6,
      offpeak_credit_cost: 4,
      peak_start_morning: "06:00",
      peak_end_morning: "09:00",
      peak_start_evening: "18:00",
      peak_end_evening: "21:00",
      payout_per_credit: 30.00,
      is_approved: true,
      kill_switch: false,
    },
  });

  // Fit & Fine Budget Gym (Tier 3 Budget)
  const gym3 = await prisma.gym.create({
    data: {
      name: "Fit & Fine Gym - Sector 12",
      owner_user_id: owner.id,
      address: "Z-12, Sector 12, Noida, Uttar Pradesh 201301",
      latitude: 28.59000000,
      longitude: 77.34000000,
      tier: 3, // Budget
      peak_credit_cost: 4,
      offpeak_credit_cost: 2,
      peak_start_morning: "06:00",
      peak_end_morning: "09:00",
      peak_start_evening: "18:00",
      peak_end_evening: "21:00",
      payout_per_credit: 20.00,
      is_approved: true,
      kill_switch: false,
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
