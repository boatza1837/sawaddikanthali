import { randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { emailConfigured, sendVerificationEmail } from "./email";
import { db } from "@/lib/db";
import { ensure } from "@/lib/errors";
import { otpDigest, rateLimit } from "@/lib/security";
import { serial } from "./finance";
export async function sendOtp(userId: string) {
  await rateLimit(`otp-send:${userId}`, 3, 900);
  ensure(emailConfigured(), "EMAIL_NOT_CONFIGURED", 503);
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  ensure(user.status === "PENDING" && user.email, "INVALID_REGISTRATION", 409);
  const id = randomUUID(),
    code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  await serial(async (tx) => {
    const latest = await tx.otpChallenge.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    ensure(
      !latest || Date.now() - latest.createdAt.getTime() >= 60_000,
      "OTP_COOLDOWN",
      429,
    );
    await tx.otpChallenge.updateMany({
      where: { userId, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    await tx.otpChallenge.create({
      data: {
        id,
        userId,
        digest: otpDigest(id, code),
        expiresAt: new Date(Date.now() + 300_000),
      },
    });
  });
  try {
    await sendVerificationEmail(user.email!, code);
  } catch {
    await db.otpChallenge.update({
      where: { id },
      data: { consumedAt: new Date() },
    });
    ensure(false, "EMAIL_DELIVERY_FAILED", 502);
  }
  return { sent: true, retryAfter: 60 };
}
export async function verifyOtp(userId: string, code: string) {
  await rateLimit(`otp-verify:${userId}`, 10, 300);
  // Return a result inside the transaction so failed attempts persist.
  const valid = await serial(async (tx) => {
    const item = await tx.otpChallenge.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    if (
      !item ||
      item.consumedAt ||
      item.expiresAt <= new Date() ||
      item.attempts >= 5
    )
      return false;
    const equal = timingSafeEqual(
      Buffer.from(item.digest, "hex"),
      Buffer.from(otpDigest(item.id, code), "hex"),
    );
    await tx.otpChallenge.update({
      where: { id: item.id },
      data: {
        attempts: { increment: 1 },
        ...(equal ? { consumedAt: new Date() } : {}),
      },
    });
    if (equal)
      await tx.user.update({
        where: { id: userId },
        data: { otpVerifiedAt: new Date() },
      });
    return equal;
  });
  ensure(valid, "INVALID_OR_EXPIRED_OTP", 400);
  return { verified: true };
}
export async function completeRegistration(userId: string, phone: string) {
  return serial(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.status === "ACTIVE") return { active: true };
    ensure(
      user.status === "PENDING" && user.otpVerifiedAt,
      "OTP_REQUIRED",
      403,
    );
    await tx.user.update({
      where: { id: userId },
      data: { phone, phoneVerified: false, status: "ACTIVE", role: "USER" },
    });
    await tx.wallet.create({ data: { userId } });
    await tx.auditLog.create({
      data: {
        actorId: userId,
        action: "REGISTRATION_COMPLETED",
        targetId: userId,
      },
    });
    return { active: true };
  });
}
