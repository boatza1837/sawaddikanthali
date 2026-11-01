"use client";
import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { Button } from "./ui/button";
import { money, satang } from "@/lib/money";
type WalletData = {
  balance: number;
  entries: {
    id: string;
    amount: number;
    side: string;
    transaction: { id: string; kind: string; createdAt: string };
  }[];
};
export function Wallet({
  phone,
  sandboxEnabled,
}: {
  phone: string | null;
  sandboxEnabled: boolean;
}) {
  const [wallet, setWallet] = useState<WalletData | null>(null),
    [status, setStatus] = useState(""),
    [qr, setQr] = useState(""),
    [expires, setExpires] = useState(""),
    [amount, setAmount] = useState("100"),
    [busy, setBusy] = useState(false),
    [intent, setIntent] = useState<{
      id: string;
      status: string;
      payment?: { display: string };
    } | null>(null);
  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/wallet", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setWallet(d);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "NETWORK_ERROR");
    }
  }, []);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh]);
  useEffect(() => {
    if (!intent || intent.status !== "PENDING") return;
    const t = setInterval(async () => {
      try {
        const r = await fetch(`/api/topups/${intent.id}`, {
          cache: "no-store",
        });
        const d = await r.json();
        if (r.ok) {
          setIntent((old) => ({ ...old!, ...d }));
          if (d.status === "PAID") refresh();
        }
      } catch {
        setStatus("ตรวจสอบสถานะไม่ได้ กรุณาตรวจประวัติก่อนทำรายการใหม่");
      }
    }, 3000);
    return () => clearInterval(t);
  }, [intent, refresh]);
  useEffect(() => {
    if (!expires) return;
    const t = setTimeout(
      () => {
        setQr("");
        setExpires("");
      },
      Math.max(0, new Date(expires).getTime() - Date.now()),
    );
    return () => clearTimeout(t);
  }, [expires]);
  async function post(path: string, body: unknown) {
    setBusy(true);
    setStatus("");
    try {
      const r = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      return d;
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "NETWORK_ERROR");
      return null;
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h1>Wallet ของคุณ</h1>
      <p className="muted">
        เบอร์ติดต่อ{" "}
        {phone ? `${phone.slice(0, 3)}•••••${phone.slice(-3)}` : "—"} ·
        ยังไม่ยืนยันเบอร์
      </p>
      <div className="grid">
        <section className="card">
          <p>ยอดคงเหลือจาก Server</p>
          <div className="balance">
            {wallet ? money(wallet.balance) : "กำลังโหลด…"}
          </div>
          <Button variant="outline" onClick={refresh}>
            อัปเดตยอด
          </Button>
          <h2 style={{ marginTop: 20 }}>QR สมาชิก</h2>
          <p>ใช้ระบุตัวสมาชิกเพื่อชำระเงิน อายุ 60 วินาที ใช้ได้หนึ่งครั้ง</p>
          <Button
            disabled={busy}
            onClick={async () => {
              const d = await post("/api/member-token", {});
              if (d) {
                setQr(await QRCode.toDataURL(d.token));
                setExpires(d.expiresAt);
              }
            }}
          >
            สร้าง QR ใหม่
          </Button>
          {qr && (
            <>
              <img
                className="qr"
                src={qr}
                alt="QR ระบุตัวสมาชิก อายุ 60 วินาที"
              />
              <p>
                <small>
                  หมดอายุ {new Date(expires).toLocaleTimeString("th-TH")}
                </small>
              </p>
            </>
          )}
        </section>
        <section className="card">
          <h2>{sandboxEnabled ? "เติมเงิน · Sandbox" : "เติมเงิน"}</h2>
          <div className="notice">
            ทดสอบเท่านั้น ไม่ใช่ QR ชำระเงินจริง การเพิ่มยอดต้องผ่าน webhook
            ที่ตรวจลายเซ็น
          </div>
          <label htmlFor="amount">จำนวนเงิน (บาท)</label>
          <input
            id="amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <Button
            disabled={busy}
            onClick={async () => {
              try {
                const value = satang(amount);
                const d = await post("/api/topups", {
                  amount: value,
                  key: crypto.randomUUID(),
                });
                if (d) setIntent(d);
              } catch {
                setStatus("กรุณากรอกจำนวนเงินให้ถูกต้อง");
              }
            }}
          >
            {sandboxEnabled ? "สร้างรายการทดสอบ" : "ยังไม่เปิดบริการเติมเงิน"}
          </Button>
          {intent && (
            <div className="status">
              <p>Reference: {intent.id}</p>
              <p>สถานะ: {intent.status}</p>
              <small>{intent.payment?.display}</small>
            </div>
          )}
        </section>
      </div>
      <p className="status" role="status">
        {status}
      </p>
      <section className="card">
        <h2>ประวัติรายการล่าสุด</h2>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>เวลา</th>
                <th>ประเภท</th>
                <th>จำนวนเงิน</th>
                <th>อ้างอิง</th>
              </tr>
            </thead>
            <tbody>
              {wallet?.entries.map((e) => (
                <tr key={e.id}>
                  <td>
                    {new Date(e.transaction.createdAt).toLocaleString("th-TH")}
                  </td>
                  <td>{e.transaction.kind}</td>
                  <td>
                    {e.side === "CREDIT" ? "+" : "−"}
                    {money(e.amount)}
                  </td>
                  <td>{e.transaction.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {wallet?.entries.length === 0 && <p>ยังไม่มีธุรกรรม</p>}
      </section>
    </>
  );
}
