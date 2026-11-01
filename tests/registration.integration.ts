import "dotenv/config";
import { describe, it, expect, vi, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
vi.mock("../src/lib/security", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/security")>();
  return { ...actual, rateLimit: vi.fn(async () => {}) };
});
import { db } from "../src/lib/db";
import { otpDigest } from "../src/lib/security";
import { verifyOtp, completeRegistration } from "../src/modules/registration";
const suite = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;
suite("OTP/registration with real PostgreSQL (Redis boundary mocked)", () => {
  async function setup(overrides: Record<string, unknown> = {}) {
    if (!process.env.DATABASE_URL?.includes("canteen_test"))
      throw Error("Test database required");
    const user = await db.user.create({
      data: { email: `otp-${randomUUID()}@example.test` },
    });
    const id = randomUUID();
    const challenge = await db.otpChallenge.create({
      data: {
        id,
        userId: user.id,
        digest: otpDigest(id, "123456"),
        expiresAt: new Date(Date.now() + 300000),
        ...overrides,
      },
    });
    return { user, challenge };
  }
  afterAll(() => db.$disconnect());
  it("persists incorrect attempts and blocks after five attempts", async () => {
    const { user, challenge } = await setup();
    for (let i = 0; i < 5; i++)
      await expect(verifyOtp(user.id, "000000")).rejects.toThrow(
        "INVALID_OR_EXPIRED_OTP",
      );
    expect(
      (await db.otpChallenge.findUniqueOrThrow({ where: { id: challenge.id } }))
        .attempts,
    ).toBe(5);
    await expect(verifyOtp(user.id, "123456")).rejects.toThrow();
  });
  it("rejects expired and consumed OTP", async () => {
    const expired = await setup({ expiresAt: new Date(Date.now() - 1000) });
    await expect(verifyOtp(expired.user.id, "123456")).rejects.toThrow();
    const consumed = await setup({ consumedAt: new Date() });
    await expect(verifyOtp(consumed.user.id, "123456")).rejects.toThrow();
  });
  it("accepts only one of two concurrent verification requests", async () => {
    const { user } = await setup();
    const results = await Promise.allSettled([
      verifyOtp(user.id, "123456"),
      verifyOtp(user.id, "123456"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });
  it("requires OTP and creates exactly one wallet on duplicate completion", async () => {
    const { user } = await setup();
    await expect(completeRegistration(user.id, "+66812345678")).rejects.toThrow(
      "OTP_REQUIRED",
    );
    await verifyOtp(user.id, "123456");
    await Promise.all([
      completeRegistration(user.id, "+66812345678"),
      completeRegistration(user.id, "+66812345678"),
    ]);
    const stored = await db.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { wallet: true },
    });
    expect(stored.role).toBe("USER");
    expect(stored.phoneVerified).toBe(false);
    expect(stored.wallet?.balance).toBe(0);
    expect(await db.wallet.count({ where: { userId: user.id } })).toBe(1);
  });
  it("database rejects duplicate email and Google provider subject", async () => {
    const { user } = await setup();
    await expect(
      db.user.create({ data: { email: user.email } }),
    ).rejects.toThrow();
    await db.account.create({
      data: {
        userId: user.id,
        type: "oauth",
        provider: "google",
        providerAccountId: user.id,
      },
    });
    await expect(
      db.account.create({
        data: {
          userId: user.id,
          type: "oauth",
          provider: "google",
          providerAccountId: user.id,
        },
      }),
    ).rejects.toThrow();
  });
});
