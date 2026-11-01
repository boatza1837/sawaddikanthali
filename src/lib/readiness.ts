import { emailConfigured } from "@/modules/email";
import { redisConfigured } from "./redis";
export function registrationReady() {
  return Boolean(
    process.env.AUTH_SECRET &&
    process.env.AUTH_GOOGLE_ID &&
    process.env.AUTH_GOOGLE_SECRET &&
    process.env.DATABASE_URL &&
    emailConfigured() &&
    process.env.OTP_PEPPER &&
    redisConfigured(),
  );
}
export function sandboxAvailable() {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.PAYMENT_MODE === "sandbox"
  );
}
