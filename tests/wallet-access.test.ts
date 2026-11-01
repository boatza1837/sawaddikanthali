import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: vi.fn() },
    wallet: { findUnique: vi.fn() },
    topupIntent: { findFirst: vi.fn() },
  },
}));
vi.mock("@/lib/security", () => ({
  rateLimit: vi.fn(async () => {}),
  digest: vi.fn(),
  opaque: vi.fn(),
  secret: vi.fn(),
  validSignature: vi.fn(),
}));
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { GET } from "@/app/api/[...path]/route";
import { sandboxOnly } from "@/modules/payments";
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(auth).mockResolvedValue({ user: { id: "member-a" } } as never);
  vi.mocked(db.user.findUnique).mockResolvedValue({
    id: "member-a",
    status: "ACTIVE",
    role: "USER",
  } as never);
});
afterEach(() => vi.unstubAllEnvs());
describe("wallet API security after UI restyling", () => {
  it("ignores another member ID supplied by the browser", async () => {
    vi.mocked(db.wallet.findUnique).mockResolvedValue({
      id: "wallet-a",
      balance: 0,
      entries: [],
    } as never);
    const response = await GET(
      new Request("https://canteen.example/api/wallet?userId=member-b"),
    );
    expect(response.status).toBe(200);
    expect(db.wallet.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "member-a" } }),
    );
    expect((await response.json()).id).toBe("wallet-a");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it("does not expose another member topup by guessing its reference", async () => {
    vi.mocked(db.topupIntent.findFirst).mockResolvedValue(null);
    const response = await GET(
      new Request("https://canteen.example/api/topups/intent-owned-by-b"),
    );
    expect(response.status).toBe(404);
    expect(db.topupIntent.findFirst).toHaveBeenCalledWith({
      where: { id: "intent-owned-by-b", wallet: { userId: "member-a" } },
    });
  });
  it("does not read balances without a session", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const response = await GET(
      new Request("https://canteen.example/api/wallet"),
    );
    expect(response.status).toBe(401);
    expect(db.wallet.findUnique).not.toHaveBeenCalled();
  });
  it("requires server-side completion of registration", async () => {
    vi.mocked(db.user.findUnique).mockResolvedValue({
      id: "member-a",
      status: "PENDING",
      role: "USER",
    } as never);
    const response = await GET(
      new Request("https://canteen.example/api/wallet"),
    );
    expect(response.status).toBe(403);
    expect(db.wallet.findUnique).not.toHaveBeenCalled();
  });
  it("rejects sandbox payment in production even if the mode flag says sandbox", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PAYMENT_MODE", "sandbox");
    expect(() => sandboxOnly()).toThrow("SANDBOX_DISABLED");
  });
});
