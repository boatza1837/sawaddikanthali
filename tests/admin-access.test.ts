import { beforeEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({ get: vi.fn(), findSession: vi.fn(), findGrant: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ get: mocks.get })) }));
vi.mock("@/lib/db", () => ({ db: { session: { findUnique: mocks.findSession }, adminGrant: { findUnique: mocks.findGrant } } }));
vi.mock("@/modules/finance", () => ({ serial: vi.fn() }));
vi.mock("@/lib/security", async () => { const {createHash} = await import("node:crypto"); return { digest: (s: string) => createHash("sha256").update(s).digest("hex"), opaque: vi.fn(), rateLimit: vi.fn() }; });
import { requireAdmin } from "@/modules/admin";
import { digest } from "@/lib/security";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.get.mockImplementation((name: string) => name === "authjs.session-token" ? {value:"session-a"} : name === "canteen-admin-stepup" ? {value:"grant-a"} : undefined);
  mocks.findSession.mockResolvedValue({userId:"admin",expires:new Date(Date.now()+60000)});
  mocks.findGrant.mockResolvedValue({userId:"admin",sessionHash:digest("session-a"),expiresAt:new Date(Date.now()+60000)});
});
describe("independent admin MFA gate", () => {
  it("rejects ordinary members before reading a grant", async () => {
    await expect(requireAdmin({id:"admin",role:"USER"})).rejects.toThrow("ADMIN_REQUIRED");
    expect(mocks.findGrant).not.toHaveBeenCalled();
  });
  it("does not accept a role alone", async () => {
    mocks.get.mockImplementation((n: string) => n === "authjs.session-token" ? {value:"session-a"} : undefined);
    await expect(requireAdmin({id:"admin",role:"ADMIN"})).rejects.toThrow("ADMIN_MFA_REQUIRED");
  });
  it("rejects a grant copied from another session", async () => {
    mocks.findGrant.mockResolvedValue({userId:"admin",sessionHash:digest("another-session"),expiresAt:new Date(Date.now()+60000)});
    await expect(requireAdmin({id:"admin",role:"ADMIN"})).rejects.toThrow("ADMIN_MFA_REQUIRED");
  });
  it("rejects expired grants and revoked Google sessions", async () => {
    mocks.findGrant.mockResolvedValue({userId:"admin",sessionHash:digest("session-a"),expiresAt:new Date(0)});
    await expect(requireAdmin({id:"admin",role:"ADMIN"})).rejects.toThrow("ADMIN_MFA_REQUIRED");
    mocks.findSession.mockResolvedValue(null);
    await expect(requireAdmin({id:"admin",role:"ADMIN"})).rejects.toThrow("UNAUTHENTICATED");
  });
  it("accepts only an unexpired grant bound to this admin and session", async () => {
    await expect(requireAdmin({id:"admin",role:"ADMIN"})).resolves.toBeUndefined();
    mocks.findGrant.mockResolvedValue({userId:"other-admin",sessionHash:digest("session-a"),expiresAt:new Date(Date.now()+60000)});
    await expect(requireAdmin({id:"admin",role:"ADMIN"})).rejects.toThrow("ADMIN_MFA_REQUIRED");
  });
});
