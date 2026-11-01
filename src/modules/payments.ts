import { z } from "zod";
import { db } from "@/lib/db";
import { ensure } from "@/lib/errors";
import { digest, secret, validSignature } from "@/lib/security";
import { fingerprint, post, serial } from "./finance";
export interface PaymentProvider {
  name: string;
  create(
    reference: string,
    amount: number,
    expiresAt: Date,
  ): Promise<{ reference: string; display: string; expiresAt: Date }>;
}
export class SandboxProvider implements PaymentProvider {
  name = "sandbox";
  async create(reference: string, amount: number, expiresAt: Date) {
    sandboxOnly();
    return {
      reference,
      display: `SANDBOX ONLY — ${reference} — ${amount} satang — not a bank QR`,
      expiresAt,
    };
  }
}
export function sandboxOnly() {
  ensure(
    process.env.PAYMENT_MODE === "sandbox" &&
      process.env.NODE_ENV !== "production",
    "SANDBOX_DISABLED",
    503,
  );
}
export async function createTopup(userId: string, amount: number, key: string) {
  sandboxOnly();
  const wallet = await db.wallet.findUniqueOrThrow({ where: { userId } });
  const scoped = `topup:${userId}:${key}`;
  const intent = await serial(async (tx) => {
    const old = await tx.topupIntent.findUnique({ where: { key: scoped } });
    if (old) {
      ensure(
        old.walletId === wallet.id && old.amount === amount,
        "IDEMPOTENCY_CONFLICT",
        409,
      );
      return old;
    }
    return tx.topupIntent.create({
      data: {
        key: scoped,
        walletId: wallet.id,
        amount,
        expiresAt: new Date(Date.now() + 15 * 60_000),
      },
    });
  });
  return {
    ...intent,
    payment: await new SandboxProvider().create(
      intent.id,
      intent.amount,
      intent.expiresAt,
    ),
  };
}
const eventSchema = z
  .object({
    eventId: z.string().min(8).max(100),
    reference: z.string().min(1),
    paymentRef: z.string().min(8).max(100),
    amount: z.number().int().positive().max(1_000_000),
    currency: z.literal("THB"),
    status: z.literal("PAID"),
  })
  .strict();
export async function sandboxWebhook(body: string, signature: string | null) {
  sandboxOnly();
  ensure(
    validSignature(body, signature, secret("SANDBOX_WEBHOOK_SECRET")),
    "INVALID_SIGNATURE",
    401,
  );
  const event = eventSchema.parse(JSON.parse(body)),
    bodyDigest = digest(body);
  return serial(async (tx) => {
    const old = await tx.paymentWebhook.findUnique({
      where: { id: `sandbox:${event.eventId}` },
    });
    if (old) {
      ensure(old.digest === bodyDigest, "EVENT_CONFLICT", 409);
      return { accepted: true, duplicate: true };
    }
    const intent = await tx.topupIntent.findUnique({
      where: { id: event.reference },
      include: { wallet: { include: { user: true } } },
    });
    ensure(intent && intent.provider === "sandbox", "UNKNOWN_REFERENCE", 404);
    ensure(
      intent.amount === event.amount && intent.currency === event.currency,
      "PAYMENT_MISMATCH",
      409,
    );
    if (intent.status === "PAID") {
      ensure(intent.paymentRef === event.paymentRef, "PAYMENT_CONFLICT", 409);
      await tx.paymentWebhook.create({
        data: {
          id: `sandbox:${event.eventId}`,
          intentId: intent.id,
          digest: bodyDigest,
        },
      });
      return { accepted: true, duplicate: true };
    }
    ensure(
      intent.status === "PENDING" && intent.expiresAt > new Date(),
      "PAYMENT_EXPIRED",
      409,
    );
    // Credit settled money even if member is suspended: spending remains prohibited.
    await tx.topupIntent.update({
      where: { id: intent.id },
      data: { status: "PAID", paymentRef: event.paymentRef },
    });
    await tx.paymentWebhook.create({
      data: {
        id: `sandbox:${event.eventId}`,
        intentId: intent.id,
        digest: bodyDigest,
      },
    });
    await tx.wallet.update({
      where: { id: intent.walletId },
      data: { balance: { increment: event.amount } },
    });
    const ledger = await post(tx, {
      key: `settlement:${intent.id}`,
      hash: fingerprint([intent.id, event.amount, event.paymentRef]),
      kind: "TOPUP",
      actorId: "provider:sandbox",
      walletId: intent.walletId,
      amount: event.amount,
      debit: "CLEARING",
      credit: "WALLET_LIABILITY",
      reference: intent.id,
    });
    await tx.auditLog.create({
      data: {
        actorId: "provider:sandbox",
        action: "TOPUP_SETTLED",
        targetId: ledger.id,
      },
    });
    return { accepted: true, duplicate: false };
  });
}
