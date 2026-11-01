import { createHmac, createCipheriv, createDecipheriv, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import { ensure } from "./errors";
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function base32(bytes: Buffer) {
  let bits = 0, value = 0, result = "";
  for (const byte of bytes) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { result += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits) result += alphabet[(value << (5 - bits)) & 31];
  return result;
}
export function totp(secret: Buffer, counter: number, digits = 6) {
  const buffer = Buffer.alloc(8); buffer.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", secret).update(buffer).digest(), offset = h[19] & 15;
  return ((h.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits).toString().padStart(digits, "0");
}
export function matchCounter(secret: Buffer, code: string, last: number, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return null;
  const current = Math.floor(now / 30000);
  for (const counter of [current, current - 1, current + 1])
    if (counter > last && timingSafeEqual(Buffer.from(totp(secret, counter)), Buffer.from(code))) return counter;
  return null;
}
function encryptionKey() {
  ensure(process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 32, "MFA_CONFIG_REQUIRED", 503);
  return Buffer.from(hkdfSync("sha256", process.env.AUTH_SECRET, "smart-canteen", "admin-totp-v1", 32));
}
export function seal(secret: Buffer, userId: string) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(userId));
  const ciphertext = Buffer.concat([cipher.update(secret), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}
export function unseal(encoded: string, userId: string) {
  const data = Buffer.from(encoded, "base64"), decipher = createDecipheriv("aes-256-gcm", encryptionKey(), data.subarray(0, 12));
  decipher.setAAD(Buffer.from(userId)); decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]);
}
