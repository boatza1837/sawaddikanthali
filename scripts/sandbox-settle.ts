import "dotenv/config";
import { createHmac, randomUUID } from "node:crypto";
if (
  process.env.NODE_ENV === "production" ||
  process.env.PAYMENT_MODE !== "sandbox"
)
  throw Error("Sandbox only");
const [reference, amountText] = process.argv.slice(2),
  amount = Number(amountText),
  key = process.env.SANDBOX_WEBHOOK_SECRET;
if (
  !reference ||
  !Number.isSafeInteger(amount) ||
  amount <= 0 ||
  !key ||
  key.length < 32
)
  throw Error(
    "Usage: pnpm exec tsx scripts/sandbox-settle.ts intent-id amount-in-satang (configure secret first)",
  );
const body = JSON.stringify({
  eventId: randomUUID(),
  reference,
  paymentRef: randomUUID(),
  amount,
  currency: "THB",
  status: "PAID",
});
const signature = createHmac("sha256", key).update(body).digest("hex");
const response = await fetch(`${process.env.APP_ORIGIN}/api/webhooks/sandbox`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-sandbox-signature": signature,
  },
  body,
});
console.log(response.status, await response.text());
if (!response.ok) process.exitCode = 1;
