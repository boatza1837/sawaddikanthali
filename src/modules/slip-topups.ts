import { createHash, randomUUID } from "node:crypto";
import QRCode from "qrcode";
import { db } from "@/lib/db";
import { ensure } from "@/lib/errors";
import { rateLimit } from "@/lib/security";
import { fingerprint, post, serial } from "./finance";
import { slipConfig, validateSlip, verifySlip } from "./slip2go";

// Thai PromptPay phone/national-ID proxy, CRC16/CCITT-FALSE. QR creation confirms no payment.
export function promptpayPayload(phone: string, amount: number) {
  ensure(/^(?:0\d{9}|\d{13})$/.test(phone) && Number.isInteger(amount) && amount > 0 && amount <= 1000000, "INVALID_AMOUNT");
  const field = (tag: string, value: string) => tag + String(value.length).padStart(2, "0") + value;
  const proxy = field("00", "A000000677010111") + (phone.length === 13 ? field("02", phone) : field("01", "0066" + phone.slice(1)));
  const payload = "000201010212" + field("29", proxy) + "5802TH5303764" + field("54", (amount / 100).toFixed(2)) + "6304";
  let crc = 0xffff;
  for (const char of payload) { crc ^= char.charCodeAt(0) << 8; for (let bit = 0; bit < 8; bit++) crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1; crc &= 0xffff; }
  return payload + crc.toString(16).toUpperCase().padStart(4, "0");
}

export async function createSlipTopup(userId: string, amount: number, key: string) {
  const config = slipConfig();
  ensure(config, "TOPUP_NOT_CONFIGURED", 503);
  const intent = await serial(async tx => {
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
    const scoped = `slip:${userId}:${key}`;
    const old = await tx.topupIntent.findUnique({ where: { key: scoped } });
    if (old) { ensure(old.walletId === wallet.id && old.amount === amount, "IDEMPOTENCY_CONFLICT", 409); return old; }
    return tx.topupIntent.create({ data: { key: scoped, walletId: wallet.id, amount, provider: "slip2go", expiresAt: new Date(Date.now() + 30 * 60000) } });
  });
  return { id: intent.id, amount: intent.amount, status: intent.status, expiresAt: intent.expiresAt, accountName: config.name, promptpay: config.promptpay, qr: await QRCode.toDataURL(promptpayPayload(config.promptpay, amount), { width: 360, margin: 2 }) };
}

export async function submitSlip(userId: string, intentId: string, file: File) {
  const config = slipConfig();
  ensure(config, "TOPUP_NOT_CONFIGURED", 503);
  ensure(file.size > 0 && file.size <= 3 * 1024 * 1024, "SLIP_FILE_TOO_LARGE", 413);
  const bytes = Buffer.from(await file.arrayBuffer());
  const png = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  ensure((png && file.type === "image/png") || (jpg && file.type === "image/jpeg"), "SLIP_FILE_TYPE", 400);
  const imageHash = createHash("sha256").update(bytes).digest("hex");
  const lease = randomUUID();
  const intent = await serial(async tx => {
    const found = await tx.topupIntent.findFirst({ where: { id: intentId, provider: { in: ["slip2go", "connext"] }, wallet: { userId } } });
    ensure(found, "NOT_FOUND", 404);
    if (found.status === "PAID") return found;
    if(found.provider === "connext") ensure(Date.now()-found.createdAt.getTime()>=20000,"SLIP_FALLBACK_WAIT",409);
    ensure(found.status === "PENDING" && found.expiresAt > new Date(), "PAYMENT_EXPIRED", 409);
    const prior = await tx.slipUpload.findUnique({ where: { imageHash } });
    ensure(!prior || prior.intentId === found.id, "SLIP_ALREADY_SUBMITTED", 409);
    const active = await tx.slipUpload.findFirst({ where: { intentId: found.id, leaseUntil: { gt: new Date() } } });
    ensure(!active, "SLIP_CHECK_IN_PROGRESS", 409);
    await tx.slipUpload.upsert({ where: { imageHash }, create: { imageHash, intentId: found.id, lease, leaseUntil: new Date(Date.now() + 60000) }, update: { lease, leaseUntil: new Date(Date.now() + 60000) } });
    return found;
  });
  if (intent.status === "PAID") return { id: intent.id, status: "PAID", amount: intent.amount, replayed: true };
  try {
    // Deliberate, bounded provider calls only. No automatic retry or polling.
    await rateLimit(`slip-user:${userId}`, 5, 3600);
    await rateLimit(`slip-budget:${new Date().toISOString().slice(0,10)}`, 50, 86400);
    const raw = await verifySlip(file, config, intent.amount, intent.createdAt);
    const verified = validateSlip(raw, config, intent.amount, intent.createdAt, intent.expiresAt);
    return await serial(async tx => {
      const current = await tx.topupIntent.findUniqueOrThrow({ where: { id: intent.id } });
      if (current.status === "PAID") return { id: current.id, status: "PAID", amount: current.amount, replayed: true };
      const upload = await tx.slipUpload.findUniqueOrThrow({ where: { imageHash } });
      ensure(upload.lease === lease, "SLIP_CHECK_IN_PROGRESS", 409);
      const used = await tx.topupIntent.findUnique({ where: { paymentRef: verified.paymentRef } });
      ensure(!used, "SLIP_ALREADY_USED", 409);
      // A notification has no bank transRef. Prevent its slip from crediting a
      // second intent after notification settlement, even across different users.
      const notificationPaid = await tx.topupIntent.findFirst({where:{provider:"connext",status:"PAID",amount:current.amount,createdAt:{lte:verified.paidAt},expiresAt:{gte:verified.paidAt}}});
      ensure(!notificationPaid,"SLIP_ALREADY_USED",409);
      const changed = await tx.topupIntent.updateMany({ where: { id: current.id, status: "PENDING" }, data: { status: "PAID", paymentRef: verified.paymentRef } });
      ensure(changed.count === 1, "PAYMENT_CONFLICT", 409);
      await tx.wallet.update({ where: { id: current.walletId }, data: { balance: { increment: current.amount } } });
      const ledger = await post(tx, { key: `settlement:${current.id}`, hash: fingerprint([current.id, current.amount, verified.paymentRef]), kind: "TOPUP", actorId: "provider:slip2go", walletId: current.walletId, amount: current.amount, debit: "CLEARING", credit: "WALLET_LIABILITY", reference: current.id });
      await tx.paymentWebhook.create({ data: { id: verified.paymentRef, intentId: current.id, digest: imageHash } });
      await tx.auditLog.create({ data: { actorId: userId, action: "SLIP_TOPUP_SETTLED", targetId: ledger.id, detail: JSON.stringify({ provider: "slip2go", paymentRef: verified.paymentRef, paidAt: verified.paidAt, amount: current.amount }) } });
      return { id: current.id, status: "PAID", amount: current.amount, replayed: false };
    });
  } finally {
    await db.slipUpload.updateMany({ where: { imageHash, lease }, data: { leaseUntil: new Date(0) } });
  }
}
