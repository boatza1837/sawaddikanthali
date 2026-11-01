"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { Button } from "./ui/button";
import { normalizeContactPhone } from "@/lib/phone";

interface RegistrationProps {
  email?: string;
  initialStep?: "send" | "verify" | "phone";
  initialSeconds?: number;
}

export function Registration({ email, initialStep = "send", initialSeconds = 0 }: RegistrationProps = {}) {
  const [status, setStatus] = useState("");
  const [statusType, setStatusType] = useState<
    "info" | "success" | "error" | "warning"
  >("info");
  const [seconds, setSeconds] = useState(initialSeconds);
  const [busy, setBusy] = useState(false);
  const [activeStep, setActiveStep] = useState<"send" | "verify" | "phone">(
    initialStep,
  );
  const phoneRef = useRef<HTMLDivElement | null>(null);
  const inFlight = useRef(false);
  const [, startTransition] = useTransition();

  // 6-digit segmented OTP state for instant input ("โหลดรหัสก่อนถ้าเน็ตกาก")
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const otpForm = useForm<{ code: string }>();
  const phoneForm = useForm<{ phone: string }>();

  // Countdown timer
  useEffect(() => {
    if (!seconds) return;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  // Sync digits array with react-hook-form value
  useEffect(() => {
    const code = digits.join("");
    otpForm.setValue("code", code, { shouldValidate: code.length === 6 });
  }, [digits, otpForm]);

  function handleDigitChange(index: number, val: string) {
    const cleaned = val.replace(/\D/g, "");
    if (!cleaned) {
      const next = [...digits];
      next[index] = "";
      setDigits(next);
      return;
    }

    // If pasted or typed multiple digits
    if (cleaned.length > 1) {
      const chars = cleaned.slice(0, 6).split("");
      const next = [...digits];
      chars.forEach((c, idx) => {
        if (index + idx < 6) next[index + idx] = c;
      });
      setDigits(next);
      const nextFocus = Math.min(index + chars.length, 5);
      inputRefs.current[nextFocus]?.focus();
      return;
    }

    // Single digit entry
    const next = [...digits];
    next[index] = cleaned[0];
    setDigits(next);

    // Auto-advance to next input
    if (index < 5 && cleaned[0]) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 6);
    if (!pasted) return;
    const next = [...digits];
    for (let i = 0; i < 6; i++) {
      next[i] = pasted[i] || "";
    }
    setDigits(next);
    const lastFilled = Math.min(pasted.length, 5);
    inputRefs.current[lastFilled]?.focus();
  }

  async function submit(action: string, data: unknown) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setStatus("");
    try {
      const r = await fetch(`/api/registration/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await r.json();
      if (!r.ok) {
        if (Number.isFinite(result.retryAfter) && result.retryAfter > 0) {
          setSeconds(Math.ceil(result.retryAfter));
        } else if (
          action === "send" &&
          result.error === "EMAIL_DELIVERY_FAILED"
        ) {
          setSeconds(60);
        }
        throw new Error(result.error);
      }

      if (action === "send") {
        setStatus("✨ ส่งรหัส OTP ไปที่อีเมลแล้ว กรุณาตรวจกล่องจดหมาย");
        setStatusType("success");
        setSeconds(60);
        setDigits(["", "", "", "", "", ""]);
        setActiveStep("verify");
        setTimeout(() => inputRefs.current[0]?.focus(), 100);
      } else if (action === "verify") {
        setStatus(
          "🎉 ยืนยัน OTP สำเร็จแล้ว! กรุณากรอกเบอร์โทรเพื่อเปิดใช้งาน Wallet",
        );
        setStatusType("success");
        setActiveStep("phone");
        setSeconds(0);
        setTimeout(() => { phoneRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); document.getElementById("phone")?.focus(); }, 100);
      } else {
        setStatus("✨ สมัครสมาชิกสำเร็จ กำลังเข้าสู่ระบบ Wallet...");
        setStatusType("success");
        startTransition(() => {
          location.reload();
        });
      }
    } catch (e) {
      const code = e instanceof Error ? e.message : "NETWORK_ERROR";
      const messages: Record<string, string> = {
        RATE_LIMITED: "⚠️ ขอรหัสบ่อยเกินไป กรุณารอเวลาที่แสดงก่อนขอใหม่",
        OTP_COOLDOWN: "⏳ กรุณารอสักครู่ก่อนขอรหัสใหม่",
        EMAIL_DELIVERY_FAILED: "❌ ยังส่งอีเมลไม่ได้ กรุณาลองใหม่ภายหลัง",
        INVALID_OR_EXPIRED_OTP: "❌ รหัสไม่ถูกต้อง หมดอายุ หรือถูกใช้งานแล้ว",
        OTP_REQUIRED: "⚠️ กรุณายืนยัน OTP ให้เรียบร้อยก่อนเปิด Wallet",
        NETWORK_ERROR:
          "📶 การเชื่อมต่อมีปัญหา กรุณาตรวจสัญญาณอินเทอร์เน็ตแล้วลองใหม่",
      };
      setStatus(
        messages[code] ?? "❌ ไม่สามารถทำรายการได้ กรุณาลองใหม่ภายหลัง",
      );
      setStatusType(
        code === "OTP_COOLDOWN" || code === "RATE_LIMITED"
          ? "warning"
          : "error",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <section
      className="card-sparkle"
      style={{ maxWidth: 640, margin: "0 auto 32px" }}
    >
      {/* Sparkling Header Badge */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 10,
          marginBottom: 16,
        }}
      >
        <span
          className="step-badge"
          style={{
            background: "#ecfdf5",
            color: "#047857",
            border: "1px solid #a7f3d0",
          }}
        >
          <span className="sparkle-icon">✨</span> SMART CANTEEN VERIFICATION
        </span>
        {seconds > 0 && (
          <span
            className="step-badge"
            style={{
              background: "#fffbeb",
              color: "#b45309",
              border: "1px solid #fde68a",
            }}
          >
            ⏳ ขอใหม่ได้ใน {Math.floor(seconds / 60)}:
            {String(seconds % 60).padStart(2, "0")}
          </span>
        )}
      </div>

      <h1
        style={{
          fontSize: "clamp(24px, 4vw, 32px)",
          margin: "0 0 8px",
          color: "#14243b",
        }}
      >
        ยืนยันการเปิดใช้งาน Wallet 💫
      </h1>
      <p style={{ color: "#617080", margin: "0 0 20px", fontSize: 15 }}>
        ยืนยันอีเมลเพิ่มเติมหลังเข้าสู่ระบบด้วย Google ก่อนเปิดใช้งาน Wallet
      </p>

      {/* Step Indicators */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 8,
          margin: "16px 0 24px",
        }}
      >
        <div
          style={{
            padding: "8px 10px",
            borderRadius: 12,
            background: activeStep === "send" ? "#ecfdf5" : "#f8fafc",
            border:
              activeStep === "send" ? "2px solid #047857" : "1px solid #e2e8f0",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: activeStep === "send" ? "#047857" : "#94a3b8",
            }}
          >
            ขั้นตอนที่ 1
          </div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: activeStep === "send" ? "#065f46" : "#64748b",
            }}
          >
            ✉️ ขอรหัส OTP
          </div>
        </div>

        <div
          style={{
            padding: "8px 10px",
            borderRadius: 12,
            background: activeStep === "verify" ? "#ecfdf5" : "#f8fafc",
            border:
              activeStep === "verify"
                ? "2px solid #047857"
                : "1px solid #e2e8f0",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: activeStep === "verify" ? "#047857" : "#94a3b8",
            }}
          >
            ขั้นตอนที่ 2
          </div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: activeStep === "verify" ? "#065f46" : "#64748b",
            }}
          >
            🔐 ยืนยัน OTP
          </div>
        </div>

        <div
          style={{
            padding: "8px 10px",
            borderRadius: 12,
            background: activeStep === "phone" ? "#ecfdf5" : "#f8fafc",
            border:
              activeStep === "phone"
                ? "2px solid #047857"
                : "1px solid #e2e8f0",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: activeStep === "phone" ? "#047857" : "#94a3b8",
            }}
          >
            ขั้นตอนที่ 3
          </div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: activeStep === "phone" ? "#065f46" : "#64748b",
            }}
          >
            📱 เบอร์โทร
          </div>
        </div>
      </div>

      <div className="notice" role="note" style={{ background: "#f0f9f4", borderColor: "#cce5d5" }}>
        <strong>{activeStep === "send" ? "เริ่มตรงนี้: กดปุ่ม «ขอรหัส OTP ทางอีเมล» ก่อน" : activeStep === "verify" ? "ขั้นตอนถัดไป: กรอกรหัส 6 หลัก แล้วกด «ยืนยัน OTP และไปกรอกเบอร์»" : "ยืนยันอีเมลแล้ว ✓ กรอกเบอร์ติดต่อเพื่อเปิด Wallet"}</strong>
        <p style={{ marginBottom: 0, fontSize: 14 }}>{activeStep === "send" ? "ระบบยังไม่ได้ส่งรหัสอัตโนมัติ เมื่อกดขอรหัสแล้ว ให้ตรวจอีเมลรวมถึงโฟลเดอร์สแปม" : activeStep === "verify" ? "กรอกครบอย่างเดียวยังไม่ยืนยัน ต้องกดปุ่มยืนยันก่อนจึงจะกรอกเบอร์ติดต่อได้" : "เบอร์นี้ใช้สำหรับติดต่อ ยังไม่มีการส่ง SMS เพื่อยืนยัน"}</p>
      </div>
      {/* Feedback & Status Banner */}
      {status && (
        <div
          role="status"
          style={{
            padding: "14px 18px",
            borderRadius: 14,
            fontSize: 14,
            fontWeight: 500,
            lineHeight: 1.6,
            background:
              statusType === "success"
                ? "#ecfdf5"
                : statusType === "warning"
                  ? "#fffbeb"
                  : statusType === "error"
                    ? "#fef2f2"
                    : "#f0f9ff",
            color:
              statusType === "success"
                ? "#065f46"
                : statusType === "warning"
                  ? "#92400e"
                  : statusType === "error"
                    ? "#991b1b"
                    : "#0369a1",
            border: `1px solid ${
              statusType === "success"
                ? "#a7f3d0"
                : statusType === "warning"
                  ? "#fde68a"
                  : statusType === "error"
                    ? "#fecaca"
                    : "#bae6fd"
            }`,
            boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
          }}
        >
          {status}
        </div>
      )}


      {/* Network / Skeleton Feedback while busy */}
      {busy && (
        <div
          style={{
            padding: 16,
            borderRadius: 14,
            background: "linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)",
            border: "1px solid #a7f3d0",
            marginBottom: 20,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="sparkle-icon" style={{ fontSize: 18 }}>
              ✨
            </span>
            <span style={{ fontSize: 14, fontWeight: 600, color: "#065f46" }}>
              กำลังเชื่อมต่อและประมวลผลอย่างปลอดภัย...
            </span>
          </div>
          <div
            className="skeleton-shimmer"
            style={{ height: 6, marginTop: 10, borderRadius: 3 }}
          />
        </div>
      )}

      {/* Action 1: Send OTP Section */}
      <div
        style={{
          background: "#fafaf9",
          border: "1px solid #e7ebe9",
          borderRadius: 16,
          padding: "18px 20px",
          marginBottom: 20,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontWeight: 650, fontSize: 15, color: "#14243b" }}>
              1. ขอรหัส OTP ทางอีเมล
            </div>
            <div style={{ fontSize: 13, color: "#617080", marginTop: 2 }}>
              {email ? (
                <>
                  ส่งไปยัง:{" "}
                  <strong style={{ color: "#047857" }}>{email}</strong>
                </>
              ) : (
                "รหัส OTP มีอายุใช้งาน 5 นาทีต่อการขอ 1 ครั้ง"
              )}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <Button
              disabled={busy || seconds > 0 || activeStep === "phone"}
              onClick={() => submit("send", {})}
              style={{ minHeight: 44, padding: "8px 18px" }}
            >
              {seconds ? (
                `ขอรหัสใหม่ได้ใน ${seconds} วินาที`
              ) : (
                <>
                  <span className="sparkle-icon" style={{ marginRight: 6 }}>
                    ✨
                  </span>
                  {activeStep === "phone" ? "ยืนยันอีเมลแล้ว ✓" : activeStep === "send" ? "ขอรหัส OTP ทางอีเมล" : "ขอรหัส OTP ใหม่"}
                </>
              )}
            </Button>
            {activeStep !== "send" && <a
              href="https://mail.google.com"
              target="_blank"
              rel="noreferrer"
              className="button outline"
              style={{
                minHeight: 44,
                padding: "8px 14px",
                fontSize: 13,
                textDecoration: "none",
              }}
            >
              เปิด Gmail ↗
            </a>}
          </div>
        </div>
      </div>

      {/* Action 2: OTP Verification Section - Loaded directly & prioritized for slow networks ("โหลดรหัสก่อนถ้าเน็ตกาก") */}
      <div
        style={{
          background: "#ffffff",
          border: "2px solid #a7f3d0",
          borderRadius: 18,
          padding: "22px 20px",
          marginBottom: 20,
          boxShadow: "0 4px 16px rgba(16, 185, 129, 0.06)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <label
            htmlFor="otp-digit-0"
            style={{
              margin: 0,
              fontSize: 15,
              fontWeight: 700,
              color: "#065f46",
            }}
          >
            2. กรอกรหัส แล้วกดยืนยัน OTP
          </label>
          <span style={{ fontSize: 12, color: "#059669", fontWeight: 600 }}>
            (วางรหัสได้ทั้ง 6 หลัก)
          </span>
        </div>

        {activeStep === "send" && <p className="muted">🔒 กดขอรหัสในขั้นตอนที่ 1 ก่อน ช่องกรอกรหัสจึงจะเปิดให้ใช้งาน</p>}
        {activeStep === "phone" && <p style={{color:"#047857"}}>✓ ยืนยัน OTP สำเร็จแล้ว ไปกรอกเบอร์ติดต่อด้านล่างได้เลย</p>}
        {/* Fast Segmented Digit Inputs (6 boxes) */}
        <div className="otp-box-grid" onPaste={handlePaste}>
          {digits.map((digit, idx) => (
            <input
              key={idx}
              id={`otp-digit-${idx}`}
              autoComplete={idx === 0 ? "one-time-code" : "off"}
              ref={(el) => {
                inputRefs.current[idx] = el;
              }}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={digit}
              disabled={busy || activeStep !== "verify"}
              aria-label={`OTP Digit ${idx + 1}`}
              onChange={(e) => handleDigitChange(idx, e.target.value)}
              onKeyDown={(e) => handleKeyDown(idx, e)}
              className="otp-digit"
              placeholder="-"
            />
          ))}
        </div>

        {/* Fallback & Screen-Reader accessible input registered with react-hook-form */}
        <form
          onSubmit={otpForm.handleSubmit((v) =>
            submit("verify", { code: v.code || digits.join("") }),
          )}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginTop: 14,
          }}
        >
          <input
            id="code"
            type="hidden"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            {...otpForm.register("code", {
              required: true,
              pattern: /^\d{6}$/,
            })}
          />
          <Button
            disabled={busy || activeStep !== "verify" || digits.join("").length !== 6}
            style={{ width: "100%", minHeight: 46 }}
          >
            {busy ? "กำลังตรวจสอบ..." : activeStep === "phone" ? "ยืนยัน OTP แล้ว ✓" : "ยืนยัน OTP และไปกรอกเบอร์ →"}
          </Button>
        </form>
      </div>

      {/* Action 3: Phone Number Collection (Required for Wallet Opening) */}
      <div ref={phoneRef}
        style={{
          background: activeStep === "phone" ? "#ffffff" : "#fbfbfb",
          border:
            activeStep === "phone" ? "2px solid #10b981" : "1px solid #e5e7eb",
          borderRadius: 16,
          padding: "20px 20px",
          marginBottom: 20,
        }}
      >
        <div
          style={{
            fontWeight: 650,
            fontSize: 15,
            color: activeStep === "phone" ? "#065f46" : "#64748b",
            marginBottom: 6,
          }}
        >
          3. กรอกเบอร์ติดต่อ
        </div>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "#617080" }}>
          ใช้สำหรับติดต่อและยังไม่ผ่านการยืนยัน SMS (เช่น 0812345678)
        </p>
        {activeStep !== "phone" && <p className="notice" style={{fontSize:14}}>🔒 ขั้นตอนนี้ยังไม่เปิดใช้งาน กรุณากรอกรหัสแล้วกด «ยืนยัน OTP และไปกรอกเบอร์» ด้านบนก่อน</p>}
        <form
          onSubmit={phoneForm.handleSubmit((v) => {
            if (activeStep !== "phone") return;
            const phone = normalizeContactPhone(v.phone);
            if (phone) submit("complete", { phone });
          })}
        >
          <input
            id="phone"
            type="tel"
            autoComplete="tel"
            placeholder="0812345678"
            aria-label="เบอร์ติดต่อ"
            aria-describedby="phone-error"
            disabled={busy || activeStep !== "phone"}
            style={{ margin: "0 0 12px" }}
            {...phoneForm.register("phone", {
              required: true,
              validate: (value) => Boolean(normalizeContactPhone(value)) || "กรอกเบอร์ให้ถูกต้อง เช่น 0812345678",
            })}
          />
          {phoneForm.formState.errors.phone && <p id="phone-error" role="alert" style={{color:"#a12626"}}>กรอกเบอร์ให้ถูกต้อง เช่น 0812345678</p>}
          <Button
            disabled={busy || activeStep !== "phone"}
            variant={activeStep === "phone" ? "default" : "outline"}
            style={{ width: "100%", minHeight: 46 }}
          >
            เปิดใช้งาน Wallet 🎉
          </Button>
        </form>
      </div>

    </section>
  );
}
