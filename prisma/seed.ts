import "dotenv/config";
import { db } from "../src/lib/db";
if (process.env.NODE_ENV === "production")
  throw new Error("Development seed forbidden in production");
await db.posTerminal.upsert({
  where: { id: "counter-1" },
  create: { id: "counter-1", name: "Development counter" },
  update: {},
});
console.log(
  "Development terminal ready. No mock wallets, accounts or money were created.",
);
await db.$disconnect();
