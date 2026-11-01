import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const globalDb = globalThis as unknown as { db?: PrismaClient };
export const db =
  globalDb.db ??
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString:
        process.env.DATABASE_URL ??
        "postgresql://unconfigured:unconfigured@localhost:5432/unconfigured",
    }),
  });
if (process.env.NODE_ENV !== "production") globalDb.db = db;
