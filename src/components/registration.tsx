"use client";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "./ui/button";
export function Registration() {
  const [status, setStatus] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const otpForm = useForm<{ code: string }>();
  const phoneForm = useForm<{ phone: string }>();
  useEffect(() => {
    if (!seconds) return;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);
  async function submit(action: string, data: unknown) {
    setBusy(true);
    try {
      const r = await fetch(`/api/registration/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await r.json();
      if (!r.ok) {
        if (Number.isFinite(result.retryAfter) && result.retryAfter > 0)
          setSeconds(Math.ceil(result.retryAfter));
        else if (action === "send" && result.error === "EMAIL_DELIVERY_FAILED")
          setSeconds(60);
        throw new Error(result.error);
      }
      setStatus(
        action === "send"
          ? "ส่งคำขออีเมลแล้ว กรุณาตรวจกล่องจดหมาย"
          : action === "verify"
            ? "ยืนยัน OTP แล้ว กรุณากรอกเบอร์โทร"
            : "สมัครสำเร็จ",
      );
      if (action === "send") setSeconds(60);
      if (action === "complete") location.reload();
    } catch (e) {
      const code = e instanceof Error ? e.message : "NETWORK_ERROR";
      const messages: Record<string, string> = {
        RATE_LIMITED: "ขอรหัสบ่อยเกินไป กรุณารอเวลาที่แสดงก่อนขอใหม่",
        OTP_COOLDOWN: "กรุณารอก่อนขอรหัสใหม่",
        EMAIL_DELIVERY_FAILED: "ยังส่งอีเมลไม่ได้ กรุณาลองใหม่ภายหลัง",
        INVALID_OR_EXPIRED_OTP: "รหัสไม่ถูกต้อง หมดอายุ หรือถูกใช้แล้ว",
        OTP_REQUIRED: "กรุณายืนยัน OTP ก่อนเปิด Wallet",
        NETWORK_ERROR: "เชื่อมต่อไม่ได้ กรุณาตรวจอินเทอร์เน็ต",
      };
      setStatus(messages[code] ?? "ไม่สามารถทำรายการได้ กรุณาลองใหม่ภายหลัง");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card">
      <h1>ยืนยันการสมัครสมาชิก</h1>
      <p>
        OTP ใช้ครั้งเดียวภายใน 5 นาที
        เบอร์โทรที่กรอกเป็นข้อมูลติดต่อและยังไม่ผ่านการยืนยัน
      </p>
      <Button disabled={busy || seconds > 0} onClick={() => submit("send", {})}>
        {seconds
          ? `ขอใหม่ได้ใน ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
          : "ส่ง OTP ไปอีเมล Google"}
      </Button>
      <form
        onSubmit={otpForm.handleSubmit((v) =>
          submit("verify", { code: v.code }),
        )}
      >
        <label htmlFor="code">OTP 6 หลัก</label>
        <input
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          {...otpForm.register("code", { required: true, pattern: /^\d{6}$/ })}
        />
        <Button disabled={busy}>ยืนยัน OTP</Button>
      </form>
      <form
        onSubmit={phoneForm.handleSubmit((v) =>
          submit("complete", { phone: v.phone }),
        )}
      >
        <label htmlFor="phone">เบอร์โทร E.164 เช่น +66812345678</label>
        <input
          id="phone"
          type="tel"
          autoComplete="tel"
          {...phoneForm.register("phone", {
            required: true,
            pattern: /^\+[1-9]\d{7,14}$/,
          })}
        />
        <Button disabled={busy}>เปิด Wallet</Button>
      </form>
      <p className="status" role="status">
        {status}
      </p>
    </section>
  );
}
