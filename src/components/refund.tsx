"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { satang, money } from "@/lib/money";
type Pending = { purchaseId: string; amount: number; reason: string; key: string };
export function Refund({ userId }: { userId: string }) {
  const [id, setId] = useState(""), [amount, setAmount] = useState(""), [reason, setReason] = useState("");
  const [pending, setPending] = useState<Pending | null>(null), [busy, setBusy] = useState(false), [ready, setReady] = useState(false), [status, setStatus] = useState("");
  const lock = useRef(false), storageKey = "canteen:refund:" + userId;
  useEffect(() => {
    try { const raw = sessionStorage.getItem(storageKey); if (raw) { const data = JSON.parse(raw) as Pending; setPending(data); setId(data.purchaseId); setAmount((data.amount / 100).toFixed(2)); setReason(data.reason); } }
    catch { setStatus("อ่านรายการค้างไม่ได้ โปรดติดต่อผู้ดูแลก่อนคืนเงิน"); }
    setReady(true);
  }, [storageKey]);
  async function submit() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setStatus("");
    try {
      const data = pending ?? { purchaseId: id.trim(), amount: satang(amount), reason: reason.trim(), key: crypto.randomUUID() };
      if (data.reason.length < 5 || !data.purchaseId) throw Error("กรอกเลขรายการและเหตุผลอย่างน้อย 5 ตัวอักษร");
      sessionStorage.setItem(storageKey, JSON.stringify(data)); setPending(data);
      const response = await fetch("/api/pos/refund", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const value = await response.json();
      if (!response.ok) {
        if (["PURCHASE_NOT_FOUND", "REFUND_EXCEEDS_PURCHASE", "INVALID_REFUND", "INVALID_INPUT", "SUPERVISOR_REQUIRED"].includes(value.error)) { sessionStorage.removeItem(storageKey); setPending(null); }
        throw Error(value.error);
      }
      sessionStorage.removeItem(storageKey); setPending(null); setId(""); setAmount(""); setReason("");
      setStatus("ยืนยันคืนเงิน " + money(data.amount) + " แล้ว · " + value.id);
    } catch(e) { setStatus(e instanceof Error ? e.message : "เชื่อมต่อไม่สำเร็จ"); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section className="formal-card"><span className="badge">สำหรับหัวหน้างาน</span><h2 style={{marginTop:14}}>อนุมัติคืนเงิน</h2><p className="muted">คืนเข้ากระเป๋าสมาชิกเจ้าของรายการเดิมเท่านั้น ระบบตรวจยอดที่ยังคืนได้และเก็บเหตุผลทุกครั้ง</p>
    <form onSubmit={e => { e.preventDefault(); submit(); }}>
      <label>เลขรายการรับชำระ (จากประวัติพนักงาน)<input required value={id} disabled={busy || !!pending} onChange={e => setId(e.target.value)} /></label>
      <label>ยอดที่คืน (บาท)<input required inputMode="decimal" value={amount} disabled={busy || !!pending} onChange={e => setAmount(e.target.value)} /></label>
      <label>เหตุผล<input required minLength={5} maxLength={500} value={reason} disabled={busy || !!pending} onChange={e => setReason(e.target.value)} /></label>
      {pending && <p className="notice">รายการนี้ยังไม่ทราบผล กดตรวจสอบรายการเดิมเพื่อป้องกันการคืนซ้ำ</p>}
      <Button disabled={busy || !ready}>{busy ? "กำลังตรวจสอบ…" : pending ? "ตรวจสอบรายการคืนเงินเดิม" : "ยืนยันคืนเข้ากระเป๋าสมาชิก"}</Button>
    </form><p role="status" className="status">{status}</p>
  </section>;
}
