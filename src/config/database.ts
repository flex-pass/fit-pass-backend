import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

declare global {
  var prisma: PrismaClient | undefined;
}

const connectionString = process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/fitpass";
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

export const prisma = global.prisma || new PrismaClient({
  adapter,
  log: ['error', 'warn']
});

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}
