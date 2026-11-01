import "dotenv/config";
import { db } from "../src/lib/db";
const [email] = process.argv.slice(2);
if (!email) throw Error("Usage: tsx scripts/grant-admin.ts registered-email");
await db.$transaction(async tx => {
  const user = await tx.user.findUnique({ where: { email } });
  if (!user || user.status !== "ACTIVE") throw Error("Account must complete registration before receiving ADMIN role");
  if (user.role === "ADMIN") { console.log("Already ADMIN"); return; }
  await tx.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
  await tx.session.deleteMany({ where: { userId: user.id } });
  await tx.auditLog.create({ data: { actorId: "operator:database-cli", action: "ADMIN_ROLE_GRANTED", targetId: user.id, detail: "Authenticator enrollment required; no MFA bypass" } });
});
await db.$disconnect();
console.log("Admin role ready; sign in and enroll Authenticator at /admin.");
