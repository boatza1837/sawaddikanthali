import { Resend } from "resend";
import { ensure } from "@/lib/errors";
export function emailConfigured() {
  if (
    process.env.EMAIL_PROVIDER &&
    !["brevo", "resend"].includes(process.env.EMAIL_PROVIDER)
  )
    return false;
  if (process.env.EMAIL_PROVIDER === "brevo")
    return Boolean(process.env.BREVO_API_KEY && process.env.BREVO_SENDER_EMAIL);
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}
export async function sendVerificationEmail(to: string, code: string) {
  const subject = "Smart Canteen verification";
  const text = `รหัสยืนยัน Smart Canteen ของคุณคือ ${code} รหัสหมดอายุใน 5 นาที หากคุณไม่ได้ขอรหัสนี้ ให้ละเว้นอีเมลฉบับนี้`;
  return sendServiceEmail(to, subject, text);
}
export async function sendServiceEmail(
  to: string,
  subject: string,
  text: string,
) {
  ensure(emailConfigured(), "EMAIL_NOT_CONFIGURED", 503);
  if (process.env.EMAIL_PROVIDER === "brevo") {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": process.env.BREVO_API_KEY!,
        "Content-Type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: {
          name: "Smart Canteen",
          email: process.env.BREVO_SENDER_EMAIL,
        },
        to: [{ email: to }],
        subject,
        textContent: text,
      }),
      signal: AbortSignal.timeout(10000),
    });
    const result = await response.json().catch(() => null);
    ensure(
      response.ok && typeof result?.messageId === "string",
      "EMAIL_DELIVERY_FAILED",
      502,
    );
    return { provider: "brevo", id: result.messageId as string };
  }
  const result = await new Resend(process.env.RESEND_API_KEY).emails.send({
    from: process.env.EMAIL_FROM!,
    to,
    subject,
    text,
  });
  ensure(!result.error && result.data?.id, "EMAIL_DELIVERY_FAILED", 502);
  return { provider: "resend", id: result.data.id };
}
