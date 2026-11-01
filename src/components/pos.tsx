"use client";
import { Refund } from "./refund";
import { QrScanner } from "./qr-scanner";
import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { money, satang } from "@/lib/money";
type Member = { name: string; memberId: string; balance: number };
export function Pos({ userId, name, role }: { userId: string; name: string; role: string }) {
  const [amount, setAmount] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [token, setToken] = useState(""),
    [member, setMember] = useState<Member | null>(null),
    [shift, setShift] = useState(""),
    [terminal, setTerminal] = useState("counter-1"),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [history, setHistory] = useState<
      { id: string; amount: number; ledger: { createdAt: string } }[]
    >([]);
  const requestKey = useRef<string | null>(null),
    inFlight = useRef(false);
  const storageKey = `canteen:pending:${userId}`;
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw);
        setAmount(saved.amount);
        setToken(saved.token);
        setMember(saved.member);
        setShift(saved.shift);
        setTerminal(saved.terminal);
        requestKey.current = saved.key;
        setConfirmed(true);
        setUncertain(true);
        setStatus(
          "มีรายการที่ยังไม่ทราบผลจากก่อนรีเฟรช ตรวจสอบด้วย key เดิมก่อนเริ่มรายการใหม่",
        );
      }
    } catch {
      setStatus(
        "อ่านรายการค้างไม่ได้ กรุณาตรวจประวัติกับผู้ดูแลก่อนทำรายการใหม่",
      );
    } finally {
      setReady(true);
    }
  }, [storageKey]);
  async function api(path: string, data: unknown) {
    const r = await fetch(`/api/pos/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const value = await r.json();
    if (!r.ok) throw Error(value.error);
    return value;
  }
  function identifyMember(value: string) {
    if (!confirmed || busy || uncertain || !shift) return;
    setToken(value);
    setMember(null);
    setStatus("กำลังตรวจสอบ QR กับระบบ…");
    requestKey.current = null;
    run(async () => {
      const found = await api("identify", { token: value });
      setMember(found);
      requestKey.current = crypto.randomUUID();
      setStatus("ตรวจสอบชื่อสมาชิกและยอดเงิน แล้วกดยืนยันรับชำระ");
    });
  }
  async function run(fn: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      const code = e instanceof Error ? e.message : "NETWORK_ERROR";
      setStatus(code === "INVALID_MEMBER_TOKEN" ? "QR หมดอายุ ถูกใช้แล้ว หรือสมาชิกยังไม่พร้อมใช้งาน ให้สมาชิกกดสร้าง QR ใหม่แล้วสแกนอีกครั้ง" : code);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  function reset() {
    sessionStorage.removeItem(storageKey);
    setAmount("");
    setConfirmed(false);
    setToken("");
    setMember(null);
    requestKey.current = null;
    setUncertain(false);
  }
  function tone(success: boolean) {
    try {
      const c = new AudioContext(),
        o = c.createOscillator(),
        g = c.createGain();
      o.connect(g);
      g.connect(c.destination);
      o.frequency.value = success ? 880 : 220;
      g.gain.value = 0.04;
      o.start();
      o.stop(c.currentTime + 0.12);
      o.onended = () => c.close();
    } catch {}
  }
  useEffect(() => {
    fetch("/api/pos/state", { cache: "no-store" }).then(async r => { const data = await r.json(); if (!r.ok) throw Error(data.error); if (!sessionStorage.getItem(storageKey) && data.shift) { setShift(data.shift.id); setTerminal(data.shift.terminalId); } setHistory(data.history); }).catch(e => setStatus(e.message));
  }, [storageKey]);
  if (!ready) return <p role="status">กำลังตรวจรายการค้าง…</p>;
  return (
    <div className="workspace pos-workspace">
      <div className="workspace-heading">
        <div>
          <span className="badge">SMART CANTEEN · STAFF COUNTER</span>
          <h1>รับชำระอย่างคล่องตัว</h1><p className="muted">สวัสดี {name} · {role === "SUPERVISOR" ? "หัวหน้างาน" : "พนักงาน"} · {shift ? "กำลังเปิดกะ" : "เปิดกะเพื่อเริ่มรับชำระ"}</p>
        </div>
        <form action="/api/auth/signout">
          <Button variant="outline">ออกจากระบบ</Button>
        </form>
      </div>
      <div className="pos-grid">
        <section className="formal-card">
          <h2>จุดรับชำระของคุณ</h2><label htmlFor="terminal">รหัสจุดขาย</label>
          <input
            id="terminal"
            disabled={Boolean(shift)}
            value={terminal}
            onChange={(e) => setTerminal(e.target.value)}
          />
          <Button
            disabled={busy || Boolean(shift)}
            onClick={() =>
              run(async () => {
                const s = await api("shift", {
                  terminalId: terminal,
                  action: "open",
                });
                setShift(s.id);
                setStatus("เปิดกะแล้ว");
              })
            }
          >
            เปิดกะ
          </Button>
          <Button
            disabled={busy || !shift || uncertain}
            variant="outline"
            onClick={() =>
              run(async () => {
                await api("shift", { terminalId: terminal, action: "close" });
                setShift("");
                reset();
                setStatus("ปิดกะแล้ว");
              })
            }
          >
            ปิดกะ
          </Button>
          <Button
            disabled={busy || !shift || uncertain}
            variant="outline"
            onClick={() =>
              run(async () => {
                await api("lock", { shiftId: shift });
                setShift("");
                reset();
                setStatus("ล็อก POS แล้ว เปิดกะเพื่อใช้งานอีกครั้ง");
              })
            }
          >
            ล็อก POS
          </Button>
          <h2 className="step-title" style={{ marginTop: 24 }}><span>1</span> กรอกยอดรวม</h2>
          <output className="balance pos-total" aria-live="polite">
            ฿{amount || "0"}
          </output>
          <div className="keypad">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"].map(
              (k) => (
                <Button
                  key={k}
                  variant="outline"
                  disabled={busy || confirmed}
                  onClick={() => {
                    setAmount((a) => { if (k === "⌫") return a.slice(0, -1); const next = a + k; return /^\d{0,5}(\.\d{0,2})?$/.test(next) ? next : a; });
                  }}
                >
                  {k}
                </Button>
              ),
            )}
          </div>
          <Button
            disabled={busy || uncertain}
            variant="outline"
            onClick={reset}
          >
            Clear / ยกเลิก
          </Button>
          <Button
            disabled={busy || confirmed || !shift}
            onClick={() => {
              try {
                satang(amount);
                setConfirmed(true);
                setStatus("");
              } catch {
                setStatus("จำนวนเงินไม่ถูกต้อง");
              }
            }}
          >
            ยืนยันยอด
          </Button>
        </section>
        <section className="formal-card">
          <h2 className="step-title"><span>2</span> สแกน QR สมาชิก</h2>
          <p className="muted">
            เปิดกล้องแล้วเล็ง QR จากหน้า Wallet สมาชิก หรือใช้เครื่องสแกน USB และช่องกรอกรหัสด้านล่าง
          </p>
          <QrScanner disabled={!confirmed || busy || uncertain || !shift} onScan={identifyMember} />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              identifyMember(token);
            }}
          >
            <label htmlFor="token">รหัสจาก QR สมาชิก</label>
            <input
              id="token"
              autoComplete="off"
              disabled={!confirmed || busy || uncertain}
              value={token}
              onChange={(e) => {
                setToken(e.target.value);
                setMember(null);
              }}
            />
            <Button disabled={!confirmed || busy || uncertain}>
              ค้นหาสมาชิก
            </Button>
          </form>
          {member && (
            <div className="member-preview">
              <h2 className="step-title"><span>3</span> ตรวจสอบและยืนยัน</h2>
              <p>
                {member.name} · {member.memberId}
              </p>
              <p>ยอดปัจจุบัน {money(member.balance)}</p>
              <p>เรียกเก็บ {money(satang(amount))}</p>
              <p>คงเหลือหลังชำระ {money(member.balance - satang(amount))}</p>
              {member.balance < satang(amount) && (
                <div className="notice">
                  ยอดไม่เพียงพอ ขาด {money(satang(amount) - member.balance)}
                </div>
              )}
              <Button
                disabled={busy || member.balance < satang(amount)}
                onClick={() =>
                  run(async () => {
                    sessionStorage.setItem(
                      storageKey,
                      JSON.stringify({
                        amount,
                        token,
                        member,
                        shift,
                        terminal,
                        key: requestKey.current,
                      }),
                    );
                    setUncertain(true);
                    try {
                      const r = await api("charge", {
                        token,
                        amount: satang(amount),
                        shiftId: shift,
                        key: requestKey.current,
                      });
                      tone(true);
                      setStatus(
                        r.replayed
                          ? `ยืนยันรายการเดิมแล้ว ${r.transactionId} กรุณาตรวจประวัติ`
                          : `ชำระสำเร็จ ${money(r.amount)}\n${r.memberName}\nคงเหลือ ${money(r.balance)}\n${r.transactionId}\n${new Date(r.createdAt).toLocaleString("th-TH")}`,
                      );
                      reset();
                    } catch (e) {
                      tone(false);
                      if (
                        e instanceof Error &&
                        [
                          "INVALID_MEMBER_TOKEN",
                          "TOKEN_USED",
                          "INSUFFICIENT_BALANCE",
                          "INVALID_SHIFT",
                          "STAFF_REQUIRED",
                          "MEMBER_UNAVAILABLE",
                          "INVALID_AMOUNT",
                        ].includes(e.message)
                      ) {
                        setUncertain(false);
                        sessionStorage.removeItem(storageKey);
                      }
                      throw e;
                    }
                  })
                }
              >
                {uncertain ? "ตรวจสอบ/ส่งซ้ำด้วย key เดิม" : "ยืนยันรับชำระเงิน"}
              </Button>
            </div>
          )}
          <p className="status" role="status">
            {status}
          </p>
          {uncertain && (
            <div className="notice">
              หากการเชื่อมต่อขัดข้อง ห้ามเริ่มรายการใหม่
              ตรวจสอบรายการเดิมด้วยปุ่มด้านบนซึ่งใช้ key เดิม
            </div>
          )}
        </section>
      </div>
      <section className="formal-card">
        <h2>รายการรับชำระของฉัน</h2><p className="muted">ล่าสุด 30 รายการ · ใบเสร็จจะแสดงหลังเซิร์ฟเวอร์ยืนยันยอดเท่านั้น</p>
        <Button
          variant="outline"
          onClick={() =>
            run(async () => {
              const r = await fetch("/api/pos/history", { cache: "no-store" });
              const data = await r.json();
              if (!r.ok) throw Error(data.error);
              setHistory(data);
            })
          }
        >
          โหลดประวัติ
        </Button>
        {!history.length && <p className="empty-state">ยังไม่มีรายการรับชำระ</p>}
        {history.map((h) => (
          <p key={h.id}>
            {new Date(h.ledger.createdAt).toLocaleString("th-TH")} ·{" "}
            {money(h.amount)} · {h.id}
          </p>
        ))}
      </section>
      {role === "SUPERVISOR" && <Refund userId={userId} />}
    </div>
  );
}
