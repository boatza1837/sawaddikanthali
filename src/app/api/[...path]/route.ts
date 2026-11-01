import { z } from "zod";
import { db } from "@/lib/db";
import { api, actor } from "@/lib/http";
import { ensure } from "@/lib/errors";
import { digest, opaque } from "@/lib/security";
import { charge, refund, serial } from "@/modules/finance";
import { createTopup, sandboxWebhook } from "@/modules/payments";
import {
  sendOtp,
  verifyOtp,
  completeRegistration,
} from "@/modules/registration";
const amount = z.number().int().positive().max(1_000_000),
  key = z.string().uuid();
export const dynamic = "force-dynamic";
export const GET = api(async (req) => {
  const path = new URL(req.url).pathname;
  const user = await actor(req);
  if (path === "/api/wallet")
    return db.wallet.findUnique({
      where: { userId: user.id },
      include: {
        entries: {
          take: 30,
          orderBy: { transaction: { createdAt: "desc" } },
          include: { transaction: true },
        },
      },
    });
  if (path.startsWith("/api/topups/")) {
    const intent = await db.topupIntent.findFirst({
      where: { id: path.split("/").pop(), wallet: { userId: user.id } },
    });
    ensure(intent, "NOT_FOUND", 404);
    return {
      ...intent,
      status:
        intent.status === "PENDING" && intent.expiresAt < new Date()
          ? "EXPIRED"
          : intent.status,
    };
  }
  if (path === "/api/pos/history") {
    ensure(["EMPLOYEE", "SUPERVISOR"].includes(user.role), "FORBIDDEN", 403);
    return db.posTransaction.findMany({
      where: { shift: { userId: user.id } },
      take: 30,
      orderBy: { ledger: { createdAt: "desc" } },
      include: { ledger: true },
    });
  }
  if (path === "/api/admin/overview") {
    ensure(false, "ADMIN_INDEPENDENT_MFA_REQUIRED", 403);
  }
  ensure(false, "NOT_FOUND", 404);
});
export const POST = api(async (req) => {
  const path = new URL(req.url).pathname;
  if (path === "/api/webhooks/sandbox") {
    ensure(
      Number(req.headers.get("content-length") ?? 0) < 16384,
      "BODY_TOO_LARGE",
      413,
    );
    const body = await req.text();
    ensure(body.length < 16384, "BODY_TOO_LARGE", 413);
    return sandboxWebhook(body, req.headers.get("x-sandbox-signature"));
  }
  const registration = path.startsWith("/api/registration/");
  const staff = path.startsWith("/api/pos/");
  const user = await actor(req, staff, registration);
  const body = await req.json();
  if (path === "/api/registration/send") return sendOtp(user.id);
  if (path === "/api/registration/verify")
    return verifyOtp(
      user.id,
      z
        .object({ code: z.string().regex(/^\d{6}$/) })
        .strict()
        .parse(body).code,
    );
  if (path === "/api/registration/complete")
    return completeRegistration(
      user.id,
      z
        .object({ phone: z.string().regex(/^\+[1-9]\d{7,14}$/) })
        .strict()
        .parse(body).phone,
    );
  if (path === "/api/member-token") {
    const token = opaque();
    const expiresAt = new Date(Date.now() + 60_000);
    await serial(async (tx) => {
      await tx.memberToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.memberToken.create({
        data: { userId: user.id, digest: digest(token), expiresAt },
      });
    });
    return { token, expiresAt };
  }
  if (path === "/api/topups") {
    const data = z.object({ amount, key }).strict().parse(body);
    return createTopup(user.id, data.amount, data.key);
  }
  if (path === "/api/pos/identify") {
    const { token } = z
      .object({ token: z.string().min(20).max(100) })
      .strict()
      .parse(body);
    const found = await db.memberToken.findUnique({
      where: { digest: digest(token) },
      include: { user: { include: { wallet: true } } },
    });
    ensure(
      found &&
        !found.usedAt &&
        found.expiresAt > new Date() &&
        found.user.status === "ACTIVE",
      "INVALID_MEMBER_TOKEN",
      409,
    );
    return {
      name: found.user.name,
      memberId: found.userId,
      balance: found.user.wallet?.balance,
    };
  }
  if (path === "/api/pos/charge") {
    const data = z
      .object({
        token: z.string().min(20).max(100),
        amount,
        key,
        shiftId: z.string().min(1),
      })
      .strict()
      .parse(body);
    return charge({ ...data, actorId: user.id });
  }
  if (path === "/api/pos/refund") {
    const data = z
      .object({
        purchaseId: z.string().min(1),
        amount,
        key,
        reason: z.string().min(5).max(500),
      })
      .strict()
      .parse(body);
    return refund({ ...data, actorId: user.id });
  }
  if (path === "/api/pos/shift") {
    const data = z
      .object({
        terminalId: z.string().min(1).max(100),
        action: z.enum(["open", "close"]),
      })
      .strict()
      .parse(body);
    return serial(async (tx) => {
      const terminal = await tx.posTerminal.findUnique({
        where: { id: data.terminalId },
      });
      ensure(terminal?.active && !terminal.locked, "TERMINAL_UNAVAILABLE", 409);
      const open = await tx.staffShift.findFirst({
        where: { terminalId: terminal.id, closedAt: null },
      });
      if (data.action === "close") {
        ensure(open?.userId === user.id, "INVALID_SHIFT", 409);
        await tx.staffShift.update({
          where: { id: open.id },
          data: { closedAt: new Date() },
        });
        await tx.auditLog.create({
          data: { actorId: user.id, action: "SHIFT_CLOSE", targetId: open.id },
        });
        return { closed: true };
      }
      if (open) {
        ensure(open.userId === user.id, "TERMINAL_IN_USE", 409);
        return open;
      }
      const shift = await tx.staffShift.create({
        data: { userId: user.id, terminalId: terminal.id },
      });
      await tx.auditLog.create({
        data: { actorId: user.id, action: "SHIFT_OPEN", targetId: shift.id },
      });
      return shift;
    });
  }
  if (path === "/api/pos/lock") {
    const { shiftId } = z
      .object({ shiftId: z.string().min(1) })
      .strict()
      .parse(body);
    return serial(async (tx) => {
      const shift = await tx.staffShift.findUnique({ where: { id: shiftId } });
      ensure(
        shift?.userId === user.id && !shift.closedAt,
        "INVALID_SHIFT",
        409,
      );
      await tx.staffShift.update({
        where: { id: shift.id },
        data: { closedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "TERMINAL_LOCK",
          targetId: shift.terminalId,
        },
      });
      return { locked: true };
    });
  }
  ensure(false, "NOT_FOUND", 404);
});
