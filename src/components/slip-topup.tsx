"use client";
import { useState } from "react";
import { money, satang } from "@/lib/money";
import { Button } from "./ui/button";

type Intent = {
  id: string;
  amount: number;
  status: string;
  expiresAt: string;
  accountName: string;
  promptpay: string;
  qr: string;
};

const messages: Record<string, string> = {
  SLIP_RESPONSE_FORMAT: "รูปแบบข้อมูลจากผู้ตรวจสลิปไม่ตรงกับที่ระบบรองรับ กรุณาติดต่อผู้ดูแล ห้ามโอนซ้ำ",
  SLIP_PROVIDER_200401: "ผู้ตรวจสลิประบุว่าบัญชีหรือชื่อผู้รับไม่ตรง กรุณาติดต่อผู้ดูแล ห้ามโอนซ้ำ",
  SLIP_PROVIDER_200402: "ผู้ตรวจสลิประบุว่ายอดเงินไม่ตรง ห้ามโอนซ้ำ",
  SLIP_PROVIDER_200403: "ผู้ตรวจสลิประบุว่าเวลาโอนไม่ตรงกับรายการ ห้ามโอนซ้ำ",
  SLIP_PROVIDER_200404: "ธนาคารยังไม่พบสลิปนี้ กรุณาตรวจสอบกับผู้ดูแล",
  SLIP_PROVIDER_200501: "ผู้ตรวจสลิประบุว่าสลิปถูกตรวจซ้ำแล้ว กรุณาตรวจประวัติ",
  SLIP_UNVERIFIED: "ยังยืนยันสลิปไม่ได้ กรุณาตรวจสลิปหรือให้พนักงานช่วยตรวจเงินเข้า",
  SLIP_AMOUNT_MISMATCH: "ยอดโอนไม่ตรงกับรายการ กรุณาติดต่อพนักงาน ห้ามโอนซ้ำ",
  SLIP_RECEIVER_MISMATCH: "ข้อมูลบัญชีผู้รับไม่ตรง กรุณาติดต่อพนักงาน",
  SLIP_DATE_MISMATCH: "เวลาบนสลิปไม่อยู่ในช่วงรายการนี้ กรุณาติดต่อพนักงาน",
  SLIP_ALREADY_USED: "สลิปนี้ใช้เติมเงินแล้ว กรุณาตรวจประวัติ",
  SLIP_ALREADY_SUBMITTED: "สลิปนี้ผูกกับรายการอื่นแล้ว กรุณาติดต่อพนักงาน",
  SLIP_CHECK_IN_PROGRESS: "กำลังตรวจสลิป กรุณารอสักครู่แล้วตรวจประวัติก่อนส่งใหม่",
  SLIP_FILE_TYPE: "เลือกภาพสลิป JPG หรือ PNG เท่านั้น",
  SLIP_FILE_TOO_LARGE: "ภาพต้องไม่เกิน 3 MB",
  PAYMENT_EXPIRED: "รายการหมดเวลา หากโอนแล้วกรุณาติดต่อพนักงาน ห้ามโอนซ้ำ",
  RATE_LIMITED: "ครบจำนวนตรวจที่กำหนดชั่วคราว กรุณาติดต่อพนักงาน ห้ามโอนซ้ำ",
  TOPUP_NOT_CONFIGURED: "กำลังตั้งค่าระบบเติมเงิน",
};

export function SlipTopup({
  enabled,
  onPaid,
}: {
  enabled: boolean;
  onPaid: () => Promise<void>;
}) {
  const [amount, setAmount] = useState("100");
  const [intent, setIntent] = useState<Intent | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [creationKey, setCreationKey] = useState<string | null>(null);

  async function send(body: BodyInit, json = false) {
    const response = await fetch("/api/slip-topups", {
      method: "POST",
      ...(json ? { headers: { "Content-Type": "application/json" } } : {}),
      body,
    });
    const data = await response.json();
    if (!response.ok) throw Error(data.error ?? "NETWORK_ERROR");
    return data;
  }

  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await fn();
    } catch (e) {
      const code = e instanceof Error ? e.message : "NETWORK_ERROR";
      setMessage(
        messages[code] ??
          "ยังยืนยันผลไม่ได้ หากโอนแล้วอย่าโอนซ้ำ ตรวจประวัติหรือติดต่อพนักงาน",
      );
    } finally {
      setBusy(false);
    }
  }

  function handleFileChange(selectedFile: File | null) {
    setFile(selectedFile);
    if (selectedFile) {
      const url = URL.createObjectURL(selectedFile);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }
  }

  return (
    <section className="formal-card" style={{ minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h2 style={{ fontSize: 18, margin: 0, color: "#14243b" }}>
          เติมเงินผ่าน PromptPay
        </h2>
        <span
          className="badge"
          style={{
            fontSize: 11,
            background: enabled ? "#ecfdf5" : "#f1f5f9",
            color: enabled ? "#047857" : "#64748b",
            borderColor: enabled ? "#a7f3d0" : "#cbd5e1",
            fontWeight: 600,
          }}
        >
          {enabled ? "พร้อมรับโอน" : "เร็วๆ นี้"}
        </span>
      </div>

      {!enabled ? (
        <p className="notice" style={{ fontSize: 13, margin: "10px 0" }}>
          กำลังตั้งค่าบัญชีรับเงินและระบบตรวจสลิป ยังไม่เปิดรับโอน
        </p>
      ) : !intent ? (
        <>
          <p style={{ fontSize: 13, color: "#617080", margin: "0 0 14px" }}>
            เลือกยอดเงิน สแกนจ่ายผ่านแอปธนาคาร และแนบสลิปเพื่อเพิ่มยอดเงินใน Wallet อัตโนมัติ
          </p>

          <label htmlFor="slip-amount" style={{ fontSize: 13, color: "#14243b" }}>
            จำนวนเงินที่ต้องการเติม (บาท)
          </label>
          <input
            id="slip-amount"
            inputMode="decimal"
            value={amount}
            disabled={busy}
            onChange={(e) => {
              setAmount(e.target.value);
              setCreationKey(null);
            }}
            style={{ fontSize: 18, fontWeight: 700, color: "#065f46", margin: "6px 0 10px" }}
          />

          <div style={{ fontSize: 12, color: "#617080", marginBottom: 6 }}>
            เลือกจำนวนเงินด่วน:
          </div>
          <div className="chip-group" style={{ margin: "0 0 16px" }}>
            {[50, 100, 200, 300, 500, 1000].map((value) => (
              <button
                key={value}
                type="button"
                className={`chip ${amount === String(value) ? "active" : ""}`}
                disabled={busy}
                onClick={() => {
                  setAmount(String(value));
                  setCreationKey(null);
                }}
              >
                +{value} บาท
              </button>
            ))}
          </div>

          <Button
            disabled={busy}
            style={{ width: "100%", minHeight: 44 }}
            onClick={() =>
              void run(async () => {
                const value = satang(amount);
                const key = creationKey ?? crypto.randomUUID();
                setCreationKey(key);
                const data = await send(JSON.stringify({ amount: value, key }), true);
                setIntent(data);
                try {
                  sessionStorage.setItem("canteen:slip-intent", JSON.stringify(data));
                } catch {}
              })
            }
          >
            {busy ? "กำลังสร้างรายการ…" : "แสดง PromptPay QR เพื่อโอนเงิน"}
          </Button>

          <Button
            variant="outline"
            disabled={busy}
            style={{ width: "100%", minHeight: 40, marginTop: 8, fontSize: 13 }}
            onClick={() => {
              try {
                const stored = sessionStorage.getItem("canteen:slip-intent");
                if (stored) {
                  setIntent(JSON.parse(stored));
                  setMessage(
                    "ตรวจประวัติก่อนส่งสลิปซ้ำ หากรายการหมดเวลาหรือโอนแล้วกรุณาติดต่อพนักงาน",
                  );
                } else {
                  setMessage("ไม่มีรายการที่บันทึกไว้ในเครื่องนี้");
                }
              } catch {
                setMessage("เรียกรายการเดิมไม่ได้ กรุณาติดต่อพนักงาน");
              }
            }}
          >
            เปิดรายการล่าสุดในเครื่องนี้
          </Button>
        </>
      ) : (
        <>
          <div
            style={{
              background: "#f0fdf4",
              border: "1px solid #bbf7d0",
              borderRadius: 14,
              padding: "12px 16px",
              marginBottom: 16,
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 12, color: "#166534", fontWeight: 600 }}>ยอดที่ต้องโอนตรงตามจำนวน</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#14532d", margin: "2px 0" }}>
              {money(intent.amount)}
            </div>
            <div style={{ fontSize: 13, color: "#15803d" }}>
              ชื่อบัญชีผู้รับ: <strong>{intent.accountName}</strong>
            </div>
            <div style={{ fontSize: 12, color: "#166534" }}>
              PromptPay: ••••••{intent.promptpay.slice(-4)}
            </div>
          </div>

          <div
            style={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: 16,
              padding: 16,
              display: "flex",
              justifyContent: "center",
              marginBottom: 14,
            }}
          >
            <img
              src={intent.qr}
              alt={`PromptPay QR เติมเงิน ${money(intent.amount)}`}
              width={260}
              height={260}
              style={{ maxWidth: "100%", height: "auto", display: "block" }}
            />
          </div>

          <p style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5, margin: "0 0 14px" }}>
            💡 <strong>คำแนะนำ:</strong> สแกนโอนเงินตามยอดที่ระบุ และอัปโหลดสลิปภายใน 30 นาที ใช้เฉพาะสลิปของท่านที่โอนตามรายการนี้ (ห้ามโอนซ้ำ)
          </p>

          {intent.status === "PAID" ? (
            <div
              role="status"
              style={{
                background: "#ecfdf5",
                border: "1px solid #a7f3d0",
                borderRadius: 12,
                padding: "14px 16px",
                color: "#047857",
                fontWeight: 700,
                textAlign: "center",
                marginBottom: 14,
              }}
            >
              🎉 เติมเงินสำเร็จ {money(intent.amount)} เข้า Wallet เรียบร้อยแล้ว
            </div>
          ) : (
            <div style={{ marginBottom: 14 }}>
              <label htmlFor="topup-slip" style={{ fontSize: 13, fontWeight: 650, color: "#14243b", display: "block", marginBottom: 6 }}>
                📎 เลือกภาพสลิปโอนเงิน (JPG / PNG ไม่เกิน 3 MB)
              </label>
              <input
                id="topup-slip"
                type="file"
                accept="image/jpeg,image/png"
                disabled={busy}
                onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
                style={{
                  maxWidth: "100%",
                  minWidth: 0,
                  boxSizing: "border-box",
                  margin: "0 0 10px",
                  padding: 8,
                }}
              />

              {previewUrl && (
                <div style={{ marginBottom: 12, textAlign: "center" }}>
                  <img
                    src={previewUrl}
                    alt="ตัวอย่างสลิป"
                    style={{ maxHeight: 160, borderRadius: 8, border: "1px solid #cbd5e1" }}
                  />
                </div>
              )}

              <Button
                disabled={busy || !file}
                style={{ width: "100%", minHeight: 46 }}
                onClick={() =>
                  void run(async () => {
                    const form = new FormData();
                    form.set("intentId", intent.id);
                    form.set("file", file!);
                    const data = await send(form);
                    setIntent({ ...intent, status: data.status });
                    await onPaid();
                  })
                }
              >
                {busy ? "กำลังตรวจสลิปกับธนาคาร อย่าปิดหน้านี้…" : "🚀 ยืนยันสลิปและเติมเงินเข้า Wallet"}
              </Button>
            </div>
          )}

          <div style={{ fontSize: 11, color: "#94a3b8", overflowWrap: "anywhere", marginBottom: 10 }}>
            รหัสรายการ: {intent.id}
          </div>

          <Button
            variant="outline"
            disabled={busy}
            style={{ width: "100%", minHeight: 40, fontSize: 13 }}
            onClick={() => {
              setIntent(null);
              setFile(null);
              setPreviewUrl(null);
              setCreationKey(null);
              setMessage("");
            }}
          >
            ← กลับไปเลือกยอดใหม่
          </Button>
        </>
      )}

      {message && (
        <p role="status" className="notice" style={{ marginTop: 14, fontSize: 13 }}>
          {message}
        </p>
      )}
    </section>
  );
}
