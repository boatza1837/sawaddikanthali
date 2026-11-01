import "dotenv/config";
import { db } from "../src/lib/db";
const [id, name] = process.argv.slice(2);
if (!id || !name)
  throw new Error(
    "Usage: tsx scripts/provision-terminal.ts terminal-id display-name",
  );
await db.$transaction(async (tx) => {
  const terminal = await tx.posTerminal.upsert({
    where: { id },
    create: { id, name },
    update: { name },
  });
  await tx.auditLog.create({
    data: {
      actorId: "operator:database-cli",
      action: "TERMINAL_PROVISIONED",
      targetId: terminal.id,
    },
  });
});
console.log("Terminal provisioned and audited. No members or money created.");
await db.$disconnect();
