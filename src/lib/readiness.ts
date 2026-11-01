export function registrationReady() {
  return Boolean(
    process.env.AUTH_SECRET &&
    process.env.AUTH_GOOGLE_ID &&
    process.env.AUTH_GOOGLE_SECRET &&
    process.env.DATABASE_URL &&
    process.env.RESEND_API_KEY &&
    process.env.EMAIL_FROM &&
    process.env.OTP_PEPPER &&
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN,
  );
}
export function sandboxAvailable() {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.PAYMENT_MODE === "sandbox"
  );
}
