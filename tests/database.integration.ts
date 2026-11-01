import "dotenv/config";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID, createHmac } from "node:crypto";
import { db } from "../src/lib/db";
import { charge, refund } from "../src/modules/finance";
import { sandboxWebhook } from "../src/modules/payments";
import { digest } from "../src/lib/security";
const enabled = process.env.RUN_DB_TESTS === "1";
const suite = enabled ? describe : describe.skip;
suite("PostgreSQL financial integration (dedicated test database only)", () => {
  const suffix = randomUUID();
  let memberId: string,
    staffId: string,
    walletId: string,
    shiftId: string,
    intentId: string;
  const secret = "test-webhook-secret-".repeat(3);
  async function token() {
    const value = randomUUID() + randomUUID();
    await db.memberToken.create({
      data: {
        userId: memberId,
        digest: digest(value),
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    return value;
  }
  async function settle(overrides: Record<string, unknown> = {}) {
    const body = JSON.stringify({
      eventId: `event-${suffix}`,
      paymentRef: `payment-${suffix}`,
      reference: intentId,
      amount: 10000,
      currency: "THB",
      status: "PAID",
      ...overrides,
    });
    return sandboxWebhook(
      body,
      createHmac("sha256", secret).update(body).digest("hex"),
    );
  }
  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.includes("canteen_test"))
      throw Error("Refuse financial tests outside canteen_test database");
    process.env.PAYMENT_MODE = "sandbox";
    process.env.SANDBOX_WEBHOOK_SECRET = secret;
    const member = await db.user.create({
      data: {
        email: `member-${suffix}@example.test`,
        status: "ACTIVE",
        wallet: { create: {} },
      },
      include: { wallet: true },
    });
    memberId = member.id;
    walletId = member.wallet!.id;
    const staff = await db.user.create({
      data: {
        email: `staff-${suffix}@example.test`,
        status: "ACTIVE",
        role: "SUPERVISOR",
      },
    });
    staffId = staff.id;
    const terminal = await db.posTerminal.create({
      data: { id: suffix, name: "Test" },
    });
    const shift = await db.staffShift.create({
      data: { userId: staffId, terminalId: terminal.id },
    });
    shiftId = shift.id;
    const intent = await db.topupIntent.create({
      data: {
        walletId,
        amount: 10000,
        key: suffix,
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    intentId = intent.id;
  });
  afterAll(async () => {
    await db.$disconnect();
  });
  it("rejects signature, amount mismatch and expired payment without credit", async () => {
    await expect(sandboxWebhook("{}", "bad")).rejects.toThrow(
      "INVALID_SIGNATURE",
    );
    await expect(settle({ amount: 9999 })).rejects.toThrow("PAYMENT_MISMATCH");
    const expired = await db.topupIntent.create({
      data: {
        walletId,
        amount: 10000,
        key: `expired-${suffix}`,
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    await expect(settle({ reference: expired.id })).rejects.toThrow(
      "PAYMENT_EXPIRED",
    );
    expect(
      (await db.wallet.findUniqueOrThrow({ where: { id: walletId } })).balance,
    ).toBe(0);
  });
  it("credits once for concurrent duplicate webhook deliveries", async () => {
    await Promise.all([settle(), settle(), settle()]);
    expect(
      (await db.wallet.findUniqueOrThrow({ where: { id: walletId } })).balance,
    ).toBe(10000);
    await settle({ eventId: `redelivery-${suffix}` });
    expect(
      (await db.wallet.findUniqueOrThrow({ where: { id: walletId } })).balance,
    ).toBe(10000);
  });
  it("prevents concurrent overspending", async () => {
    const [a, b] = await Promise.all([token(), token()]);
    const results = await Promise.allSettled([
      charge({
        actorId: staffId,
        shiftId,
        token: a,
        amount: 7000,
        key: randomUUID(),
      }),
      charge({
        actorId: staffId,
        shiftId,
        token: b,
        amount: 7000,
        key: randomUUID(),
      }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (await db.wallet.findUniqueOrThrow({ where: { id: walletId } })).balance,
    ).toBe(3000);
  });
  it("deduplicates double clicks and rejects payload changes/token reuse", async () => {
    const t = await token(),
      key = randomUUID(),
      input = { actorId: staffId, shiftId, token: t, amount: 1000, key };
    const results = await Promise.all([charge(input), charge(input)]);
    expect(results[0].transactionId).toBe(results[1].transactionId);
    await expect(charge({ ...input, amount: 900 })).rejects.toThrow(
      "IDEMPOTENCY_CONFLICT",
    );
    await expect(charge({ ...input, key: randomUUID() })).rejects.toThrow(
      "INVALID_MEMBER_TOKEN",
    );
    expect(
      (await db.wallet.findUniqueOrThrow({ where: { id: walletId } })).balance,
    ).toBe(2000);
  });
  it("refunds only approved original purchase within remaining amount", async () => {
    const purchase = await db.posTransaction.findFirstOrThrow({
      where: { memberId, amount: 1000 },
    });
    const input = {
      actorId: staffId,
      purchaseId: purchase.id,
      amount: 1000,
      reason: "Approved test refund",
      key: randomUUID(),
    };
    await refund(input);
    await refund(input);
    await expect(refund({ ...input, key: randomUUID() })).rejects.toThrow(
      "REFUND_EXCEEDS_PURCHASE",
    );
    await expect(
      refund({ ...input, actorId: memberId, key: randomUUID() }),
    ).rejects.toThrow("SUPERVISOR_REQUIRED");
    expect(
      (await db.wallet.findUniqueOrThrow({ where: { id: walletId } })).balance,
    ).toBe(3000);
  });
  it("database rejects ledger mutation, unbalanced entry and summary drift", async () => {
    const entry = await db.ledgerEntry.findFirstOrThrow({
      where: { walletId },
    });
    await expect(
      db.ledgerEntry.update({ where: { id: entry.id }, data: { amount: 1 } }),
    ).rejects.toThrow();
    await expect(
      db.ledgerEntry.delete({ where: { id: entry.id } }),
    ).rejects.toThrow();
    await expect(
      db.wallet.update({ where: { id: walletId }, data: { balance: 999999 } }),
    ).rejects.toThrow();
    await expect(
      db.ledgerTransaction.create({
        data: {
          key: randomUUID(),
          fingerprint: "bad",
          kind: "TOPUP",
          actorId: staffId,
          entries: {
            create: { account: "CLEARING", side: "DEBIT", amount: 100 },
          },
        },
      }),
    ).rejects.toThrow();
  });
  it("allows an admin to charge only through their own valid open shift", async () => {
    await db.user.update({ where: { id: staffId }, data: { role: "ADMIN" } });
    try {
      const value = await token();
      await expect(charge({ actorId: staffId, shiftId: "not-owned-or-missing", token: value, amount: 100, key: randomUUID() })).rejects.toThrow("INVALID_SHIFT");
      const before = (await db.wallet.findUniqueOrThrow({ where: { id: walletId } })).balance;
      await charge({ actorId: staffId, shiftId, token: value, amount: 100, key: randomUUID() });
      expect((await db.wallet.findUniqueOrThrow({ where: { id: walletId } })).balance).toBe(before - 100);
    } finally {
      await db.user.update({ where: { id: staffId }, data: { role: "SUPERVISOR" } });
    }
  });
  it("wallet summary exactly equals liability credits minus debits", async () => {
    const entries = await db.ledgerEntry.findMany({ where: { walletId } });
    const sum = entries.reduce(
      (a, e) => a + (e.side === "CREDIT" ? e.amount : -e.amount),
      0,
    );
    expect(sum).toBe(
      (await db.wallet.findUniqueOrThrow({ where: { id: walletId } })).balance,
    );
  });
});
