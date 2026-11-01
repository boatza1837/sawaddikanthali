import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { Redis } from "@upstash/redis";
import { ensure } from "./errors";
import { redisConnection } from "./redis";
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const opaque = () => randomBytes(32).toString("base64url");
export function secret(name: string) {
  const value = process.env[name];
  ensure(value && value.length >= 32, `CONFIG_${name}`, 503);
  return value;
}
export function otpDigest(id: string, code: string) {
  return createHmac("sha256", secret("OTP_PEPPER"))
    .update(`${id}:${code}`)
    .digest("hex");
}
export function validSignature(
  body: string,
  signature: string | null,
  key: string,
) {
  if (!signature || !/^[a-f0-9]{64}$/.test(signature)) return false;
  const expected = createHmac("sha256", key).update(body).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}
export async function rateLimit(key: string, limit = 20, seconds = 60) {
  const redis = new Redis(redisConnection());
  const count = Number(
    await redis.eval(
      "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n",
      [`canteen:${key}`],
      [seconds],
    ),
  );
  ensure(count <= limit, "RATE_LIMITED", 429);
}
