"use client";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
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

interface WalletProps {
  phone: string | null;
  phoneVerified?: boolean;
  sandboxEnabled: boolean;
  name?: string | null;
  email?: string | null;
  onSignOut?: () => Promise<void>;
}

export function Wallet({
  phone,
  phoneVerified = false,
  sandboxEnabled,
  name,
  email,
  onSignOut,
}: WalletProps) {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState("");
  const [qr, setQr] = useState("");
  const [expires, setExpires] = useState("");
  const [qrRemaining, setQrRemaining] = useState(0);
  const [amount, setAmount] = useState("100");
  const [busy, setBusy] = useState(false);
  const [showBalance, setShowBalance] = useState(true);
  const [txFilter, setTxFilter] = useState<"ALL" | "CREDIT" | "DEBIT">("ALL");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [intent, setIntent] = useState<{
    id: string;
    status: string;
    payment?: { display: string };
  } | null>(null);

  const seenEntries = useRef<Set<string> | null>(null);
  const refreshingRef = useRef(false);
  const receiptDialog = useRef<HTMLDialogElement | null>(null);
  const [receipts, setReceipts] = useState<WalletData["entries"]>([]);
  const currentReceipt = receipts[0];
  useEffect(() => {
    const dialog = receiptDialog.current;
    if (currentReceipt && !dialog?.open) dialog?.showModal();
    if (!currentReceipt && dialog?.open) dialog.close();
  }, [currentReceipt]);
  const dismissReceipt = () => setReceipts(current => current.slice(1));

  // Refresh wallet balance & transactions
  const refresh = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    try {
      const r = await fetch("/api/wallet", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      const data = d as WalletData;
      if (data?.entries) {
        if (seenEntries.current) {
          const paid = data.entries.filter(entry => !seenEntries.current!.has(entry.id) && entry.side === "DEBIT" && entry.transaction.kind === "PURCHASE").reverse();
          if (paid.length) { setReceipts(current => [...current, ...paid]); setQr(""); setExpires(""); }
        } else seenEntries.current = new Set();
        data.entries.forEach(entry => seenEntries.current!.add(entry.id));
      }
      setWallet(data);
      setStatus("");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "NETWORK_ERROR");
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
    }
  }, []);

  // Periodic polling (pauses when tab is hidden to save mobile data)
  useEffect(() => {
    refresh();
    const t = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      refresh();
    }, qr ? 1000 : 5000);
    const visible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener("visibilitychange", visible);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", visible); };
  }, [refresh, qr]);

  // Top-up status polling
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

  // QR countdown & auto-expiry timer
  useEffect(() => {
    if (!expires) {
      setQrRemaining(0);
      return;
    }
    const updateCountdown = () => {
      const diff = Math.max(
        0,
        Math.ceil((new Date(expires).getTime() - Date.now()) / 1000),
      );
      setQrRemaining(diff);
      if (diff <= 0) {
        setQr("");
        setExpires("");
      }
    };
    updateCountdown();
    const t = setInterval(updateCountdown, 1000);
    return () => clearInterval(t);
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

  function copyToClipboard(text: string) {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedId(text);
      setTimeout(() => setCopiedId(null), 2000);
    }
  }

  const quickAmounts = ["50", "100", "200", "500"];

  const filteredEntries = wallet?.entries.filter((e) => {
    if (txFilter === "CREDIT") return e.side === "CREDIT";
    if (txFilter === "DEBIT") return e.side === "DEBIT";
    return true;
  });

  return (
    <>
      <dialog ref={receiptDialog} className="customer-receipt" aria-labelledby="receipt-title" onCancel={event => { event.preventDefault(); dismissReceipt(); }}>
        {currentReceipt && <><span className="badge">ชำระสำเร็จ</span><h2 id="receipt-title">หักเงินจาก Wallet แล้ว</h2><strong className="customer-receipt-amount">{money(currentReceipt.amount)}</strong><p>ยอดคงเหลือปัจจุบัน <strong style={{color: (wallet?.balance ?? 0) < 0 ? "#b42318" : "#047857"}}>{money(wallet?.balance ?? 0)}</strong></p>{(wallet?.balance ?? 0) < 0 && <p>ยอดติดลบคือเงินที่ยืมใช้ กรุณาชำระคืนเมื่อเติมเงิน</p>}<code>{currentReceipt.transaction.id}</code><Button onClick={dismissReceipt}>{receipts.length > 1 ? "ดูรายการถัดไป" : "รับทราบ"}</Button></>}
      </dialog>
      {/* Formal Header: User identity & Logout Button */}
      <div
        className="row"
        style={{ alignItems: "flex-start", marginBottom: 24, gap: 16 }}
      >
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <h1
              style={{
                margin: 0,
                fontSize: "clamp(26px, 4vw, 34px)",
                color: "#14243b",
              }}
            >
              Wallet ของคุณ
            </h1>
            <span
              className="badge"
              style={{
                background: "#ecfdf5",
                color: "#047857",
                borderColor: "#a7f3d0",
                fontSize: 12,
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#10b981",
                }}
              />
              บัญชีสมาชิก
            </span>
          </div>
          <p className="muted" style={{ margin: "6px 0 0", fontSize: 14 }}>
            {name ? <strong>{name}</strong> : "สมาชิก"}
            {phone
              ? ` · เบอร์ติดต่อ ${phone.slice(0, 3)}•••••${phone.slice(-3)}`
              : " · ยังไม่ยืนยันเบอร์"}
            {phone
              ? phoneVerified
                ? " · ยืนยันเบอร์แล้ว"
                : " · ยังไม่ยืนยันเบอร์"
              : ""}
            {email ? ` · ${email}` : ""}
          </p>
        </div>

        {/* Logout Button */}
        <div>
          {onSignOut ? (
            <form action={onSignOut}>
              <Button
                variant="outline"
                type="submit"
                style={{
                  minHeight: 40,
                  padding: "6px 16px",
                  fontSize: 13,
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span>🚪</span> ออกจากระบบ
              </Button>
            </form>
          ) : (
            <a
              href="/api/auth/signout"
              className="button outline"
              style={{
                minHeight: 40,
                padding: "6px 16px",
                fontSize: 13,
                fontWeight: 600,
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span>🚪</span> ออกจากระบบ
            </a>
          )}
        </div>
      </div>

      {/* Network Warning Banner */}
      {status && (
        <div
          role="status"
          style={{
            padding: "12px 18px",
            background: "#fffbeb",
            border: "1px solid #fde68a",
            borderRadius: 12,
            color: "#92400e",
            fontSize: 14,
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 10,
          }}
        >
          <div>
            <strong>📶 สัญญาณเชื่อมต่อ:</strong>{" "}
            {status === "NETWORK_ERROR"
              ? "สัญญาณอินเทอร์เน็ตอาจไม่เสถียร"
              : status}
          </div>
          <Button
            variant="outline"
            onClick={refresh}
            style={{ minHeight: 32, padding: "4px 12px", fontSize: 12 }}
          >
            ลองใหม่
          </Button>
        </div>
      )}

      {/* Main Grid: Priority Tier 1 (Balance & QR Code) + Topup Section */}
      <div className="grid">
        {/* Card 1: Balance & Member QR (Essential Data Prioritized for Slow Connections) */}
        <section className="formal-card">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: 650,
                color: "#617080",
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              ยอดคงเหลือจาก Server
            </span>
            {wallet && (
              <button
                type="button"
                onClick={() => setShowBalance(!showBalance)}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#047857",
                  padding: "2px 6px",
                }}
                aria-label={showBalance ? "ซ่อนยอดเงิน" : "แสดงยอดเงิน"}
              >
                {showBalance ? "👁️ ซ่อนยอด" : "👁️ แสดงยอด"}
              </button>
            )}
          </div>

          {/* Skeleton or Loaded Balance */}
          {wallet ? (
            <div className="balance" style={{ margin: "4px 0 16px" }}>
              {showBalance ? money(wallet.balance) : "฿ ••••••"}
            </div>
          ) : (
            <div style={{ margin: "10px 0 20px" }}>
              <div
                className="skeleton-shimmer"
                style={{ width: 220, height: 48, borderRadius: 10 }}
              />
              <div
                className="skeleton-shimmer"
                style={{
                  width: 140,
                  height: 14,
                  marginTop: 8,
                  borderRadius: 4,
                }}
              />
            </div>
          )}

          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
              marginBottom: 24,
            }}
          >
            <Button
              variant="outline"
              disabled={refreshing}
              onClick={refresh}
              style={{ minHeight: 40, padding: "8px 16px", fontSize: 13 }}
            >
              {refreshing ? "🔄 กำลังอัปเดต..." : "🔄 อัปเดตยอด"}
            </Button>
            <small style={{ color: "#8a9ba8" }}>
              {wallet ? "ระบบอัปเดตอัตโนมัติ" : "กำลังโหลดข้อมูล..."}
            </small>
          </div>

          {/* Member QR Section: Fast-loading & Interactive */}
          <div style={{ borderTop: "1px solid #edf0ee", paddingTop: 18 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                flexWrap: "wrap",
              }}
            >
              <h2 style={{ margin: "0 0 6px", fontSize: 18, color: "#14243b" }}>
                QR สมาชิกสำหรับชำระเงิน
              </h2>
              <span style={{ fontSize: 12, color: "#047857", fontWeight: 600 }}>
                🛡️ อายุ 60 วินาที
              </span>
            </div>
            <p style={{ margin: "0 0 14px", fontSize: 13, color: "#617080" }}>
              แสดง QR นี้แก่พนักงานเพื่อสแกนตัดเงินที่หน้าเคาน์เตอร์ POS
            </p>

            <Button
              disabled={busy || !wallet}
              onClick={async () => {
                const d = await post("/api/member-token", {});
                if (d) {
                  setQr(
                    await QRCode.toDataURL(d.token, { margin: 2, scale: 6 }),
                  );
                  setExpires(d.expiresAt);
                }
              }}
              style={{ width: "100%", minHeight: 44, fontSize: 14 }}
            >
              {busy
                ? "กำลังสร้าง QR..."
                : qr
                  ? "สร้าง QR ใหม่"
                  : "✨ สร้าง QR ระบุตัวสมาชิก"}
            </Button>

            {/* Active Member QR Code Display */}
            {qr && (
              <div className="qr-container">
                <img
                  className="qr"
                  src={qr}
                  alt="QR ระบุตัวสมาชิก อายุ 60 วินาที"
                  style={{ borderRadius: 12, border: "1px solid #e5e7eb" }}
                />

                {/* Live Countdown & Visual Progress Bar */}
                <div
                  style={{
                    width: "100%",
                    maxWidth: 220,
                    marginTop: 12,
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: qrRemaining <= 15 ? "#b45309" : "#047857",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                    }}
                  >
                    <span>⏱️</span>
                    <span>หมดอายุใน {qrRemaining} วินาที</span>
                  </div>

                  <div className="progress-track">
                    <div
                      className={`progress-fill ${qrRemaining <= 15 ? "warning" : ""}`}
                      style={{ width: `${(qrRemaining / 60) * 100}%` }}
                    />
                  </div>

                  <small
                    style={{
                      color: "#8a9ba8",
                      display: "block",
                      marginTop: 6,
                      fontSize: 11,
                    }}
                  >
                    ใช้ได้ครั้งเดียว · หมดอายุเมื่อชำระสำเร็จ
                  </small>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Card 2: Top-up Section */}
        <section className="formal-card">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 18, color: "#14243b" }}>
              {sandboxEnabled ? "เติมเงิน · ระบบทดสอบ Sandbox" : "เติมเงิน"}
            </h2>
            <span
              className="badge"
              style={{
                fontSize: 11,
                background: sandboxEnabled ? "#fef3c7" : "#f1f5f9",
                color: sandboxEnabled ? "#92400e" : "#64748b",
                borderColor: sandboxEnabled ? "#fde68a" : "#cbd5e1",
              }}
            >
              {sandboxEnabled ? "SANDBOX MODE" : "เร็วๆ นี้"}
            </span>
          </div>

          <div className="notice" style={{ fontSize: 13, marginBottom: 16 }}>
            {sandboxEnabled
              ? "ระบบทดสอบจำลอง: ไม่ใช่การตัดเงินจริงและไม่มี PromptPay จริง"
              : "ยังไม่เปิดให้บริการเติมเงิน กำลังเชื่อมต่อระบบผู้ให้บริการชำระเงินอย่างเป็นทางการ"}
          </div>

          <label htmlFor="amount" style={{ fontSize: 14, color: "#14243b" }}>
            จำนวนเงินที่ต้องการเติม (บาท)
          </label>
          <input
            id="amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={{ fontSize: 18, fontWeight: 700, color: "#065f46" }}
          />

          {/* Quick Amount Chips */}
          <div style={{ fontSize: 12, color: "#617080", marginTop: 4 }}>
            เลือกจำนวนด่วน:
          </div>
          <div className="chip-group">
            {quickAmounts.map((val) => (
              <button
                key={val}
                type="button"
                className={`chip ${amount === val ? "active" : ""}`}
                onClick={() => setAmount(val)}
              >
                +{val} บาท
              </button>
            ))}
          </div>

          <Button
            disabled={busy || !sandboxEnabled}
            style={{ width: "100%", minHeight: 44, marginTop: 4 }}
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
            {sandboxEnabled
              ? "สร้างรายการเติมเงินทดสอบ"
              : "ยังไม่เปิดบริการเติมเงิน"}
          </Button>

          {/* Topup Reference & Status */}
          {intent && (
            <div
              style={{
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: 12,
                padding: 14,
                marginTop: 16,
                fontSize: 13,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 6,
                }}
              >
                <strong>รหัสอ้างอิง:</strong>
                <button
                  type="button"
                  onClick={() => copyToClipboard(intent.id)}
                  style={{
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    color: "#047857",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {copiedId === intent.id ? "✔️ คัดลอกแล้ว" : "คัดลอก"}
                </button>
              </div>
              <code style={{ fontSize: 12, color: "#475569" }}>
                {intent.id}
              </code>
              <p style={{ margin: "8px 0 4px" }}>
                <strong>สถานะ:</strong>{" "}
                <span
                  style={{
                    color: intent.status === "PAID" ? "#047857" : "#b45309",
                    fontWeight: 650,
                  }}
                >
                  {intent.status}
                </span>
              </p>
              {intent.payment?.display && (
                <small style={{ color: "#64748b" }}>
                  {intent.payment.display}
                </small>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Priority Tier 2: Transaction History with Filter Tabs & Skeletons */}
      <section className="formal-card">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 10,
            marginBottom: 12,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 20, color: "#14243b" }}>
            ประวัติรายการล่าสุด
          </h2>

          {/* Filter Tabs */}
          <div className="tab-filter">
            <button
              type="button"
              className={`tab-btn ${txFilter === "ALL" ? "active" : ""}`}
              onClick={() => setTxFilter("ALL")}
            >
              ทั้งหมด
            </button>
            <button
              type="button"
              className={`tab-btn ${txFilter === "CREDIT" ? "active" : ""}`}
              onClick={() => setTxFilter("CREDIT")}
            >
              เงินเข้า (+)
            </button>
            <button
              type="button"
              className={`tab-btn ${txFilter === "DEBIT" ? "active" : ""}`}
              onClick={() => setTxFilter("DEBIT")}
            >
              เงินออก (-)
            </button>
          </div>
        </div>

        {/* Transaction Table */}
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>เวลา</th>
                <th>ประเภทรายการ</th>
                <th>จำนวนเงิน</th>
                <th>เลขอ้างอิง</th>
              </tr>
            </thead>
            <tbody>
              {/* Loaded Transactions */}
              {wallet ? (
                filteredEntries && filteredEntries.length > 0 ? (
                  filteredEntries.map((e) => (
                    <tr key={e.id}>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {new Date(e.transaction.createdAt).toLocaleString(
                          "th-TH",
                          {
                            dateStyle: "short",
                            timeStyle: "medium",
                          },
                        )}
                      </td>
                      <td>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "2px 8px",
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 600,
                            background:
                              e.side === "CREDIT" ? "#ecfdf5" : "#f1f5f9",
                            color: e.side === "CREDIT" ? "#047857" : "#475569",
                          }}
                        >
                          {e.transaction.kind}
                        </span>
                      </td>
                      <td
                        style={{
                          fontWeight: 700,
                          color: e.side === "CREDIT" ? "#047857" : "#1e293b",
                          fontSize: 15,
                        }}
                      >
                        {e.side === "CREDIT" ? "+" : "−"}
                        {money(e.amount)}
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(e.transaction.id)}
                          title="คลิกเพื่อคัดลอกรหัสอ้างอิง"
                          style={{
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                            fontFamily: "ui-monospace, monospace",
                            fontSize: 12,
                            color: "#64748b",
                            textAlign: "left",
                            padding: 0,
                          }}
                        >
                          {copiedId === e.transaction.id ? (
                            <span style={{ color: "#047857", fontWeight: 600 }}>
                              ✔️ คัดลอกแล้ว
                            </span>
                          ) : (
                            `${e.transaction.id.slice(0, 8)}…${e.transaction.id.slice(-6)}`
                          )}
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={4}
                      style={{
                        textAlign: "center",
                        padding: "28px 12px",
                        color: "#8a9ba8",
                      }}
                    >
                      ยังไม่มีรายการทำธุรกรรมในหมวดนี้
                    </td>
                  </tr>
                )
              ) : (
                /* Skeleton Rows while loading */
                [...Array(4)].map((_, i) => (
                  <tr key={i}>
                    <td>
                      <div
                        className="skeleton-shimmer"
                        style={{ width: 110, height: 16 }}
                      />
                    </td>
                    <td>
                      <div
                        className="skeleton-shimmer"
                        style={{ width: 70, height: 16 }}
                      />
                    </td>
                    <td>
                      <div
                        className="skeleton-shimmer"
                        style={{ width: 90, height: 16 }}
                      />
                    </td>
                    <td>
                      <div
                        className="skeleton-shimmer"
                        style={{ width: 130, height: 16 }}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
