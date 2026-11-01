import "dotenv/config";
import { db } from "../src/lib/db";
const [email, role] = process.argv.slice(2);
if (!email || !["EMPLOYEE", "SUPERVISOR"].includes(role))
  throw Error(
    "Usage: pnpm exec tsx scripts/grant-staff.ts existing-email EMPLOYEE|SUPERVISOR",
  );
await db.$transaction(async (tx) => {
  const user = await tx.user.findUniqueOrThrow({ where: { email } });
  if (user.status !== "ACTIVE") throw Error("Complete registration first");
  await tx.user.update({ where: { id: user.id }, data: { role } });
  await tx.auditLog.create({
    data: {
      actorId: "operator:database-cli",
      action: "STAFF_ROLE_GRANTED",
      targetId: user.id,
      detail: role,
    },
  });
});
console.log(
  "Staff role granted and audited. Restrict this operator command to trusted database administrators.",
);
await db.$disconnect();
