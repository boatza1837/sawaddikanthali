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

export function renderOtpEmailHtml(code: string): string {
  ensure(/^\d{6}$/.test(code), "INVALID_OTP_FORMAT");
  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Smart Canteen Verification</title>
  <style>
    @keyframes skeleton-shimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
    @keyframes sparkle-pulse {
      0%, 100% { transform: scale(1); opacity: 0.92; }
      50% { transform: scale(1.08); opacity: 1; }
    }
    .shimmer-skeleton {
      background: linear-gradient(90deg, #f0fdf4 25%, #dcfce7 50%, #f0fdf4 75%);
      background-size: 200% 100%;
      animation: skeleton-shimmer 2s ease-in-out infinite;
    }
    .sparkle-icon {
      display: inline-block;
      animation: sparkle-pulse 2s ease-in-out infinite;
    }
    @media only screen and (max-width: 600px) {
      .otp-display {
        font-size: 32px !important;
        letter-spacing: 8px !important;
      }
      .card-wrap {
        padding: 20px 16px !important;
        border-radius: 16px !important;
      }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #fafaf7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans Thai', Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #14243b;">
  <!-- Fast text-first preview: Immediate display even before styles render -->
  <div style="display: none; max-height: 0px; overflow: hidden; opacity: 0; font-size: 1px; line-height: 1px;">
    ✨ รหัสยืนยัน Smart Canteen ของคุณคือ ${code} (รหัสหมดอายุใน 5 นาที)
  </div>

  <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #fafaf7; padding: 32px 12px;">
    <tr>
      <td align="center">
        <!-- Main Aesthetic Card -->
        <table role="presentation" class="card-wrap" width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width: 520px; background: #ffffff; border-radius: 24px; border: 1px solid #d5e2da; box-shadow: 0 8px 30px rgba(4, 120, 87, 0.08); overflow: hidden;">

          <!-- Sparkling Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #047857 0%, #10b981 60%, #06b6d4 100%); padding: 28px 24px 24px; text-align: center;">
              <div style="display: inline-block; padding: 5px 14px; background: rgba(255, 255, 255, 0.22); border-radius: 9999px; border: 1px solid rgba(255, 255, 255, 0.4); margin-bottom: 8px;">
                <span class="sparkle-icon" style="font-size: 13px; font-weight: 700; color: #ffffff; letter-spacing: 1px; text-transform: uppercase;">
                  ✨ SMART CANTEEN ✨
                </span>
              </div>
              <h1 style="margin: 6px 0 0; color: #ffffff; font-size: 22px; font-weight: 700; text-shadow: 0 1px 2px rgba(0,0,0,0.15);">
                ระบบร้านค้าสวัสดิการ
              </h1>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 32px 28px 24px;">
              <div style="text-align: center; margin-bottom: 22px;">
                <h2 style="margin: 0 0 8px; color: #14243b; font-size: 20px; font-weight: 700;">
                  รหัสยืนยันการเปิดใช้งาน 💫
                </h2>
                <p style="margin: 0; color: #617080; font-size: 14px; line-height: 1.6;">
                  นำรหัส OTP 6 หลักด้านล่างไปกรอกบนหน้าเว็บเพื่อยืนยันตัวตนและเริ่มใช้งาน Wallet
                </p>
              </div>

              <!-- OTP Hero Section: Zero-delay pure text rendering + skeleton fallback -->
              <div class="shimmer-skeleton" style="background-color: #ecfdf5; border: 2px dashed #047857; border-radius: 18px; padding: 22px 16px; margin: 20px 0 24px; text-align: center;">
                <div style="font-size: 12px; font-weight: 700; color: #047857; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 8px;">
                  ✨ รหัส OTP ยืนยันตัวตน ✨
                </div>
                <!-- 6-digit OTP code loaded instantaneously -->
                <div class="otp-display" style="font-family: ui-monospace, 'SF Mono', Menlo, Monaco, Consolas, monospace; font-size: 42px; font-weight: 800; letter-spacing: 12px; text-indent: 12px; color: #065f46; margin: 10px 0; user-select: all; line-height: 1.2;">
                  ${code}
                </div>
                <div style="display: inline-block; margin-top: 8px; padding: 4px 12px; background: #ffffff; border: 1px solid #a7f3d0; border-radius: 9999px;">
                  <span style="font-size: 13px; font-weight: 600; color: #047857;">
                    ⏳ รหัสหมดอายุใน 5 นาที
                  </span>
                </div>
              </div>

              <!-- Security Information -->
              <div style="background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; padding: 14px 16px; margin-bottom: 20px; text-align: left;">
                <p style="margin: 0; color: #475569; font-size: 13px; line-height: 1.6;">
                  🔒 <strong>เพื่อความปลอดภัย:</strong> รหัสนี้ใช้งานได้เพียงครั้งเดียว และระบบจะไม่มีการขอรหัสผ่านหรือ OTP จากท่านผ่านทางข้อความส่วนตัวเด็ดขาด
                </p>
              </div>

              <p style="margin: 0; color: #94a3b8; font-size: 12px; line-height: 1.5; text-align: center;">
                หากคุณไม่ได้ส่งคำขอนี้ สามารถเพิกเฉยอีเมลฉบับนี้ได้อย่างปลอดภัย
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background: #fafaf7; border-top: 1px solid #e5e7eb; padding: 18px 24px; text-align: center;">
              <p style="margin: 0; color: #617080; font-size: 12px;">
                ✨ Smart Canteen • ร้านสวัสดิการ ใช้จ่ายสะดวก ปลอดภัย
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendVerificationEmail(to: string, code: string) {
  const subject = "Smart Canteen verification";
  const text = `รหัสยืนยัน Smart Canteen ของคุณคือ ${code} รหัสหมดอายุใน 5 นาที หากคุณไม่ได้ขอรหัสนี้ ให้ละเว้นอีเมลฉบับนี้`;
  const html = renderOtpEmailHtml(code);
  return sendServiceEmail(to, subject, text, html);
}

export async function sendServiceEmail(
  to: string,
  subject: string,
  text: string,
  html?: string,
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
        ...(html ? { htmlContent: html } : {}),
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
    ...(html ? { html } : {}),
  });
  ensure(!result.error && result.data?.id, "EMAIL_DELIVERY_FAILED", 502);
  return { provider: "resend", id: result.data.id };
}
