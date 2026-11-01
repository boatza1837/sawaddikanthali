import { describe, it, expect, vi, afterEach } from "vitest";
import { base32, totp, matchCounter, seal, unseal } from "@/lib/totp";
afterEach(() => vi.unstubAllEnvs());
describe("TOTP RFC 6238 SHA1 reference vectors", () => {
  const secret = Buffer.from("12345678901234567890");
  it.each([[59,"94287082"],[1111111109,"07081804"],[1111111111,"14050471"],[1234567890,"89005924"],[2000000000,"69279037"],[20000000000,"65353130"]])("matches reference at %i seconds", (time, expected) => {
    expect(totp(secret, Math.floor(Number(time) / 30), 8)).toBe(expected);
  });
  it("rejects reused, old, malformed and incorrect codes", () => {
    const now = 1234567890000, counter = Math.floor(now / 30000), code = totp(secret, counter);
    expect(matchCounter(secret, code, counter - 1, now)).toBe(counter);
    expect(matchCounter(secret, code, counter, now)).toBeNull();
    expect(matchCounter(secret, totp(secret, counter - 2), -1, now)).toBeNull();
    expect(matchCounter(secret, "12345", -1, now)).toBeNull();
    expect(matchCounter(secret, "abcdef", -1, now)).toBeNull();
  });
  it("encodes a standard base32 provisioning secret", () => { expect(base32(Buffer.from("foobar"))).toBe("MZXW6YTBOI"); });
  it("encrypts secrets with user-bound authenticated encryption", () => {
    vi.stubEnv("AUTH_SECRET", "x".repeat(48));
    const encrypted = seal(secret, "admin-a");
    expect(unseal(encrypted, "admin-a")).toEqual(secret);
    expect(() => unseal(encrypted, "admin-b")).toThrow();
    const corrupted = Buffer.from(encrypted, "base64"); corrupted[30] ^= 1;
    expect(() => unseal(corrupted.toString("base64"), "admin-a")).toThrow();
    vi.stubEnv("AUTH_SECRET", "y".repeat(48));
    expect(() => unseal(encrypted, "admin-a")).toThrow();
  });
});
