import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { rateLimit } from "../src/lib/security";
await db.$queryRaw`SELECT 1`;
const key = `operator-check:${randomUUID()}`;
await rateLimit(key, 1, 60);
let rejected = false;
try {
  await rateLimit(key, 1, 60);
} catch (e) {
  rejected = e instanceof Error && e.message === "RATE_LIMITED";
}
if (!rejected)
  throw Error("Distributed rate limiting did not reject the second request");
console.log(
  "PostgreSQL reachable; real Redis accepted first request and rejected second. Health key expires in 60 seconds.",
);
await db.$disconnect();
