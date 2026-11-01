import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ensure } from "@/lib/errors";
import { digest } from "@/lib/security";
export type Tx = Prisma.TransactionClient;
export async function serial<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        ["P2034", "P2002"].includes(e.code) &&
        attempt < 3
      )
        continue;
      throw e;
    }
  }
}
export function fingerprint(parts: unknown[]) {
  return digest(JSON.stringify(parts));
}
export async function replay(tx: Tx, key: string, hash: string) {
  const prior = await tx.ledgerTransaction.findUnique({
    where: { key },
    include: { pos: true },
  });
  if (prior) ensure(prior.fingerprint === hash, "IDEMPOTENCY_CONFLICT", 409);
  return prior;
}
export async function post(
  tx: Tx,
  input: {
    key: string;
    hash: string;
    kind: string;
    actorId: string;
    walletId: string;
    amount: number;
    debit: string;
    credit: string;
    reference?: string;
  },
) {
  ensure(
    Number.isSafeInteger(input.amount) && input.amount > 0,
    "INVALID_AMOUNT",
  );
  return tx.ledgerTransaction.create({
    data: {
      key: input.key,
      fingerprint: input.hash,
      kind: input.kind,
      actorId: input.actorId,
      reference: input.reference,
      entries: {
        create: [
          {
            account: input.debit,
            side: "DEBIT",
            amount: input.amount,
            walletId:
              input.debit === "WALLET_LIABILITY" ? input.walletId : null,
          },
          {
            account: input.credit,
            side: "CREDIT",
            amount: input.amount,
            walletId:
              input.credit === "WALLET_LIABILITY" ? input.walletId : null,
          },
        ],
      },
    },
  });
}
export async function charge(input: {
  actorId: string;
  token: string;
  amount: number;
  key: string;
  shiftId: string;
}) {
  const key = `purchase:${input.actorId}:${input.key}`;
  const hash = fingerprint([
    input.actorId,
    digest(input.token),
    input.amount,
    input.shiftId,
  ]);
  return serial(async (tx) => {
    const previous = await replay(tx, key, hash);
    if (previous) return { transactionId: previous.id, replayed: true };
    const staff = await tx.user.findUnique({ where: { id: input.actorId } });
    ensure(
      staff?.status === "ACTIVE" &&
        ["EMPLOYEE", "SUPERVISOR", "ADMIN"].includes(staff.role),
      "STAFF_REQUIRED",
      403,
    );
    const shift = await tx.staffShift.findUnique({
      where: { id: input.shiftId },
      include: { terminal: true },
    });
    ensure(
      shift &&
        shift.userId === input.actorId &&
        !shift.closedAt &&
        shift.terminal.active &&
        !shift.terminal.locked,
      "INVALID_SHIFT",
      409,
    );
    const token = await tx.memberToken.findUnique({
      where: { digest: digest(input.token) },
      include: { user: { include: { wallet: true } } },
    });
    ensure(
      token && !token.usedAt && token.expiresAt > new Date(),
      "INVALID_MEMBER_TOKEN",
      409,
    );
    ensure(
      token.user.status === "ACTIVE" && token.user.wallet,
      "MEMBER_UNAVAILABLE",
      409,
    );
    const amount = input.amount;
    ensure(
      Number.isSafeInteger(amount) && amount > 0 && amount <= 1_000_000,
      "INVALID_AMOUNT",
    );
    const wallet = token.user.wallet;
    const consumed = await tx.memberToken.updateMany({
      where: { id: token.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    ensure(consumed.count === 1, "TOKEN_USED", 409);
    const debit = await tx.wallet.updateMany({
      where: { id: wallet.id, balance: { gte: amount } },
      data: { balance: { decrement: amount } },
    });
    ensure(debit.count === 1, "INSUFFICIENT_BALANCE", 409);
    const ledger = await post(tx, {
      key,
      hash,
      kind: "PURCHASE",
      actorId: input.actorId,
      walletId: wallet.id,
      amount,
      debit: "WALLET_LIABILITY",
      credit: "SALES",
    });
    await tx.posTransaction.create({
      data: {
        ledgerId: ledger.id,
        shiftId: shift.id,
        memberId: token.userId,
        amount,
      },
    });
    await tx.auditLog.create({
      data: { actorId: input.actorId, action: "PURCHASE", targetId: ledger.id },
    });
    return {
      transactionId: ledger.id,
      amount,
      balance: wallet.balance - amount,
      memberName: token.user.name,
      createdAt: ledger.createdAt,
      replayed: false,
    };
  });
}
export async function refund(input: {
  actorId: string;
  purchaseId: string;
  amount: number;
  reason: string;
  key: string;
}) {
  const key = `refund:${input.actorId}:${input.key}`,
    hash = fingerprint([
      input.actorId,
      input.purchaseId,
      input.amount,
      input.reason,
    ]);
  return serial(async (tx) => {
    const prior = await replay(tx, key, hash);
    if (prior) return prior;
    const supervisor = await tx.user.findUnique({
      where: { id: input.actorId },
    });
    ensure(
      supervisor?.status === "ACTIVE" && supervisor.role === "SUPERVISOR",
      "SUPERVISOR_REQUIRED",
      403,
    );
    ensure(
      input.reason.trim().length >= 5 &&
        Number.isSafeInteger(input.amount) &&
        input.amount > 0,
      "INVALID_REFUND",
    );
    const sale = await tx.posTransaction.findUnique({
      where: { id: input.purchaseId },
    });
    ensure(sale, "PURCHASE_NOT_FOUND", 404);
    ensure(
      sale.refunded + input.amount <= sale.amount,
      "REFUND_EXCEEDS_PURCHASE",
      409,
    );
    await tx.posTransaction.update({
      where: { id: sale.id },
      data: { refunded: { increment: input.amount } },
    });
    const wallet = await tx.wallet.findUniqueOrThrow({
      where: { userId: sale.memberId },
    });
    await tx.wallet.update({
      where: { id: wallet.id },
      data: { balance: { increment: input.amount } },
    });
    const result = await post(tx, {
      key,
      hash,
      kind: "REFUND",
      actorId: input.actorId,
      walletId: wallet.id,
      amount: input.amount,
      debit: "SALES",
      credit: "WALLET_LIABILITY",
      reference: sale.ledgerId,
    });
    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "REFUND_APPROVED",
        targetId: result.id,
        detail: input.reason,
      },
    });
    return result;
  });
}
