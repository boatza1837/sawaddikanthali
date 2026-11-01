import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { satang } from "../src/lib/money";
import { validSignature, otpDigest } from "../src/lib/security";
process.env.OTP_PEPPER = "test-only-".repeat(5);
describe("money boundaries", () => {
  it("uses exact integer satang", () => {
    expect(satang("45.50")).toBe(4550);
    expect(satang("0.01")).toBe(1);
    expect(satang("10000")).toBe(1000000);
  });
  it.each([
    "-1",
    "0",
    "1.001",
    "1e3",
    "Infinity",
    "NaN",
    "10000.01",
    " 5",
    "5 ",
    ".5",
  ])("rejects %s", (v) => expect(() => satang(v)).toThrow());
});
describe("cryptography", () => {
  it("verifies exact raw body and rejects tamper/malformed signatures", () => {
    const key = "x".repeat(32),
      body = '{"a":1}',
      signature = createHmac("sha256", key).update(body).digest("hex");
    expect(validSignature(body, signature, key)).toBe(true);
    expect(validSignature(body + " ", signature, key)).toBe(false);
    expect(validSignature(body, "xyz", key)).toBe(false);
    expect(validSignature(body, null, key)).toBe(false);
  });
  it("binds OTP hash to challenge", () => {
    expect(otpDigest("a", "123456")).not.toBe(otpDigest("b", "123456"));
    expect(otpDigest("a", "123456")).not.toContain("123456");
  });
});
