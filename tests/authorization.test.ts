import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { user: { findUnique: vi.fn() } } }));
vi.mock("@/lib/security", () => ({ rateLimit: vi.fn(async () => {}) }));
import { auth } from "../src/auth";
import { db } from "../src/lib/db";
import { actor, api } from "../src/lib/http";
import { DomainError } from "../src/lib/errors";
const origin = "http://localhost:3000";
const request = (source = origin) =>
  new Request(`${origin}/api/pos/charge`, {
    method: "POST",
    headers: { origin: source },
  });
beforeEach(() => {
  vi.resetAllMocks();
  process.env.APP_ORIGIN = origin;
});
describe("session and authorization boundary", () => {
  it("rejects cross-origin state changes before authentication", async () => {
    await expect(actor(request("https://attacker.example"))).rejects.toThrow(
      "INVALID_ORIGIN",
    );
    expect(auth).not.toHaveBeenCalled();
  });
  it("rejects unauthenticated access", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    await expect(actor(request())).rejects.toThrow("UNAUTHENTICATED");
  });
  it("does not accept USER role for staff endpoints", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u" } } as never);
    vi.mocked(db.user.findUnique).mockResolvedValue({
      id: "u",
      role: "USER",
      status: "ACTIVE",
    } as never);
    await expect(actor(request(), true)).rejects.toThrow("STAFF_REQUIRED");
  });
  it("rejects suspended staff and incomplete registration", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u" } } as never);
    vi.mocked(db.user.findUnique).mockResolvedValue({
      id: "u",
      role: "SUPERVISOR",
      status: "SUSPENDED",
    } as never);
    await expect(actor(request(), true)).rejects.toThrow("FORBIDDEN");
    vi.mocked(db.user.findUnique).mockResolvedValue({
      id: "u",
      role: "USER",
      status: "PENDING",
    } as never);
    await expect(actor(request())).rejects.toThrow("REGISTRATION_REQUIRED");
  });
});

it("returns a no-store 429 and exact Retry-After so clients do not guess the OTP wait", async () => {
  const response = await api(async () => {
    throw new DomainError("RATE_LIMITED", 429, 123);
  })(request());
  expect(response.status).toBe(429);
  expect(response.headers.get("Retry-After")).toBe("123");
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toEqual({
    error: "RATE_LIMITED",
    retryAfter: 123,
  });
});
